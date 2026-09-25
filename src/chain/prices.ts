// The price ticker's read: every listed stock token, in ETH, off Uniswap.
//
// WHERE A PRICE COMES FROM. There is no price API and there will not be one —
// the CSP lets the site talk to itself and to the manifest's RPC, and that is
// all. So every figure on the band is a chain read: the pool's own
// `sqrtPriceX96`, turned into ETH per token with the pair's order and both
// tokens' decimals taken from the chain too. A mid-price, no fee, no size — a
// figure to watch, not a quote to act on.
//
// WHICH POOL. The Treasury names the venue (`V3_FACTORY`, `WETH`) and, per
// reward token, the route the owner set: `v3RouteOf(NATIVE, token)` is a list
// of hops whose one hop, for every token the runbook configures, IS the pool.
// No route, or a route that does not end in one WETH pool: the factory is
// asked for the 0.05% pool, then the 0.3% one, and the first with liquidity
// behind it is taken.
//
// THE V4 FALLBACK (2026-09-22). A listed token with no v3 pool at all — no
// venue (the testnet Treasury's factory and WETH are zero), or every tier
// empty — is priced through the Treasury's v4 route instead: `routeOf(NATIVE,
// token)` with one hop `{currencyOut: token, fee, tickSpacing, hooks}` names
// the pool key `{currency0: ETH, currency1: token, fee, tickSpacing, hooks}`
// (ETH, the zero address, is always the lower currency), whose id is the
// keccak256 of the encoded key, and `StateView.getSlot0(id)` gives the same
// `sqrtPriceX96` with the token as currency1 and 18 decimals on the ETH side.
// A route of more than one hop is not priced; a deployment whose third-party
// set is null has no StateView and no fallback. Nothing here is written down
// as an address.
//
// THE DOLLAR SOURCE (2026-09-22). One v3 pool, WETH against the dollar
// stablecoin the manifest names, resolved once like a stock token's (the
// 0.01%, 0.05% and 0.3% pools asked for, the one with the most liquidity
// taken), then read per refresh. A missing or empty pool is no dollars for
// that refresh: never stale, never made up.
//
// ONE BATCH PER TICK. Resolving the pools is done once per deployment; after
// that a refresh is one pin and ONE multicall — the listing, then the price
// reads per source — at that block. Each item may fail on its own
// (`allowFailure`), and a token whose pool did not answer, is empty, or has no
// price is left OUT of that refresh. It is never shown as zero. The flywheel
// snapshot borrows the same reads (`priceReads` / `decodePrices`, `usdReads` /
// `decodeUsd`) so its one multicall carries them too.

import type { Abi, Hex } from 'viem';
import { pin, readMany, readOne, tryReadMany, type At } from './client';
import { contracts, manifest, thirdParty } from './manifest';
import { stateViewAbi, theNestAbi, treasuryAbi, uniswapV3FactoryAbi, uniswapV3PoolAbi } from './abis.generated';
import { guard, tokenMeta } from './reads';
import { poolIdOf } from '../lib/pool-id';
import type { Address, Amount, PriceBoard, TokenPrice } from '../mock/types';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address;
const Q192 = 1n << 192n;
const WAD = 10n ** 18n;

/** Uniswap's two tiers the stock tokens trade at on 4663, in the order tried. */
const FEE_TIERS = [500, 3000];
/** The dollar pool's candidates: today the 0.01% pool holds most of it. */
const USD_FEE_TIERS = [100, 500, 3000];

/**
 * A v3 pool's price is `sqrtPriceX96² / 2^192`: token1 per token0, in raw
 * units. Which of the pair is WETH decides which way to read it, and the two
 * tokens' decimals scale it to "ETH per one whole token", as 18-decimal units.
 *
 *   token is token1 (WETH is token0):  1e18 · 10^dt · 2^192 / (s² · 10^dw)
 *   token is token0 (WETH is token1):  1e18 · s² · 10^dt / (2^192 · 10^dw)
 *
 * BigInt throughout: `s²` is a 320-bit number, and nothing here may pass
 * through a double. The inverse of the runbook's own `spotPerEth`
 * (contracts/script/RewardsRunbook.sol), with the decimals made explicit. A
 * v4 pool's `sqrtPriceX96` reads the same way, with ETH as currency0.
 */
export function ethPerToken(o: {
  sqrtPriceX96: bigint; tokenIsToken1: boolean; tokenDecimals: number; wethDecimals: number;
}): Amount {
  const dt = 10n ** BigInt(o.tokenDecimals);
  const dw = 10n ** BigInt(o.wethDecimals);
  const s2 = o.sqrtPriceX96 * o.sqrtPriceX96;
  if (s2 === 0n) throw new Error('an uninitialised pool has no price');
  return o.tokenIsToken1
    ? (WAD * dt * Q192) / (s2 * dw)
    : (WAD * s2 * dt) / (Q192 * dw);
}

/**
 * Dollars per one whole ETH, as 18-decimal units, from the dollar pool's
 * price: the same arithmetic the other way round.
 *
 *   dollar is token1 (WETH is token0):  1e18 · s² · 10^dw / (2^192 · 10^du)
 *   dollar is token0 (WETH is token1):  1e18 · 2^192 · 10^dw / (s² · 10^du)
 */
export function usdPerEthFrom(o: {
  sqrtPriceX96: bigint; usdIsToken1: boolean; usdDecimals: number; wethDecimals: number;
}): Amount {
  const du = 10n ** BigInt(o.usdDecimals);
  const dw = 10n ** BigInt(o.wethDecimals);
  const s2 = o.sqrtPriceX96 * o.sqrtPriceX96;
  if (s2 === 0n) throw new Error('an uninitialised pool has no price');
  return o.usdIsToken1
    ? (WAD * s2 * dw) / (Q192 * du)
    : (WAD * Q192 * dw) / (s2 * du);
}

// ── resolving: which pool, for each token ─────────────────────────────────

type Source = {
  token: Address; symbol: string; decimals: number;
} & (
  | { venue: 'v3'; pool: Address; fee: number; tokenIsToken1: boolean }
  | { venue: 'v4'; poolId: Hex; fee: number; stateView: Address }
);

export type Resolved = {
  id: string;
  /** The listing this was resolved for, lowercased and joined — the change detector. */
  listed: string;
  wethDecimals: number;
  sources: Source[];
  /** Tokens on the list with no usable pool at resolve time. Looked for again, slowly. */
  unresolved: number;
  ticks: number;
};

let cache: Resolved | null = null;

/** Every read of the prices starts from nothing after this. */
export function invalidatePrices() { cache = null; usdCache = null; }

const listingKey = (listed: readonly Address[]) => listed.map((a) => a.toLowerCase()).join(',');

/**
 * AVIAN is a listed reward token on the Nest since 2026-09-18 — the Roost
 * streams it to brooding birds — but it is NOT on the band: the founder's
 * call. Dropped before any pool is looked for, so the resolver never asks
 * about it.
 */
export const onTheBand = (listed: readonly Address[]): Address[] => {
  const avians = contracts().Avians.toLowerCase();
  return listed.filter((a) => a.toLowerCase() !== avians);
};

type V3Hop = { pool: Address; tokenOut: Address } | readonly [Address, Address];
const v3HopOf = (h: V3Hop) => (Array.isArray(h)
  ? { pool: h[0] as Address, tokenOut: h[1] as Address }
  : h as { pool: Address; tokenOut: Address });

type V4Hop = { currencyOut: Address; fee: number | bigint; tickSpacing: number | bigint; hooks: Address }
  | readonly [Address, number | bigint, number | bigint, Address];
const v4HopOf = (h: V4Hop) => (Array.isArray(h)
  ? { currencyOut: h[0] as Address, fee: Number(h[1]), tickSpacing: Number(h[2]), hooks: h[3] as Address }
  : { currencyOut: (h as { currencyOut: Address }).currencyOut, fee: Number((h as { fee: number | bigint }).fee), tickSpacing: Number((h as { tickSpacing: number | bigint }).tickSpacing), hooks: (h as { hooks: Address }).hooks });

/** viem hands `slot0` back as a tuple or as an object, by how the ABI names its outputs. Read it either way. */
const sqrtOf = (v: unknown): bigint | null => {
  const sqrt = Array.isArray(v) ? v[0] : (v as { sqrtPriceX96?: bigint })?.sqrtPriceX96;
  return typeof sqrt === 'bigint' && sqrt > 0n ? sqrt : null;
};

async function resolve(listed: Address[], at: At): Promise<Resolved> {
  const c = contracts();
  const t = (functionName: string, args: readonly unknown[] = []) =>
    ({ address: c.Treasury, abi: treasuryAbi as unknown as Abi, functionName, args });

  const [native, weth, factory] = await readMany<Address>([t('NATIVE'), t('WETH'), t('V3_FACTORY')], at);
  const base = { id: manifest().id, listed: listingKey(listed), ticks: 0 };
  if (listed.length === 0) return { ...base, wethDecimals: 18, sources: [], unresolved: 0 };

  const hasV3 = factory.toLowerCase() !== ZERO_ADDRESS && weth.toLowerCase() !== ZERO_ADDRESS;
  const meta = await tokenMeta(hasV3 ? [...listed, weth] : listed, at);
  const wethDecimals = hasV3 ? (meta.get(weth.toLowerCase())?.decimals ?? 18) /* count */ : 18;

  // The owner's routes and the factory's pools, asked together: neither
  // depends on the other, and one of them is usually enough. The v4 routes
  // ride along for the tokens v3 cannot price.
  const routeCalls = hasV3 ? listed.map((token) => t('v3RouteOf', [native, token])) : [];
  const poolCalls = hasV3 ? listed.flatMap((token) => FEE_TIERS.map((fee) => ({
    address: factory, abi: uniswapV3FactoryAbi as unknown as Abi, functionName: 'getPool', args: [token, weth, fee],
  }))) : [];
  const v4RouteCalls = listed.map((token) => t('routeOf', [native, token]));
  const answers = await tryReadMany<unknown>([...routeCalls, ...poolCalls, ...v4RouteCalls], at);
  const v4At = routeCalls.length + poolCalls.length;

  // Candidates per token, in the order they are trusted: the route's pool
  // first, then the factory's by fee tier. Deduplicated, zeros dropped.
  const candidates = listed.map((token, i) => {
    const out: Address[] = [];
    if (!hasV3) return out;
    const route = answers[i];
    if (route.ok && Array.isArray(route.value) && route.value.length === 1) {
      const hop = v3HopOf(route.value[0] as V3Hop);
      if (hop.tokenOut.toLowerCase() === token.toLowerCase()) out.push(hop.pool);
    }
    FEE_TIERS.forEach((_, j) => {
      const p = answers[listed.length + i * FEE_TIERS.length + j];
      if (p.ok && typeof p.value === 'string' && p.value.toLowerCase() !== ZERO_ADDRESS) out.push(p.value as Address);
    });
    return [...new Map(out.map((p) => [p.toLowerCase(), p])).values()];
  });

  // What is behind each v3 candidate: liquidity, orientation, fee tier.
  const flat = candidates.flatMap((ps, i) => ps.map((pool) => ({ i, pool })));
  const p = (pool: Address, functionName: string) =>
    ({ address: pool, abi: uniswapV3PoolAbi as unknown as Abi, functionName });
  const facts = flat.length
    ? await tryReadMany<unknown>(flat.flatMap(({ pool }) => [p(pool, 'liquidity'), p(pool, 'token0'), p(pool, 'fee')]), at)
    : [];

  // The v4 fallback's candidates: one-hop routes, their keys, their ids.
  const stateView = thirdParty()?.StateView ?? null;
  const v4 = listed.map((token, i) => {
    if (!stateView) return null;
    const route = answers[v4At + i];
    if (!route.ok || !Array.isArray(route.value) || route.value.length !== 1) return null;
    const hop = v4HopOf(route.value[0] as V4Hop);
    if (hop.currencyOut.toLowerCase() !== token.toLowerCase()) return null;
    const poolId = poolIdOf({ currency0: ZERO_ADDRESS, currency1: token, fee: hop.fee, tickSpacing: hop.tickSpacing, hooks: hop.hooks });
    return { poolId, fee: hop.fee };
  });
  // A v4 pool counts once it is initialised (a price). Not its in-range
  // liquidity: every pool here is seeded one-sided with the position ending
  // at the opening tick, so `getLiquidity` reads 0 until the first buy moves
  // the price into it, and gating on it would hide exactly these pools.
  const v4Facts = stateView
    ? await tryReadMany<unknown>(v4.flatMap((x) => (x ? [
      { address: stateView, abi: stateViewAbi as unknown as Abi, functionName: 'getSlot0', args: [x.poolId] },
    ] : [])), at)
    : [];

  const sources: Source[] = [];
  let unresolved = 0; /* count */
  let v4Index = 0; /* count */
  listed.forEach((token, i) => {
    const m = meta.get(token.toLowerCase());
    const mine = flat.map((f, k) => ({ ...f, k })).filter((f) => f.i === i);
    const found = mine.find((f) => {
      const liq = facts[f.k * 3];
      return liq.ok && typeof liq.value === 'bigint' && liq.value > 0n;
    });
    const fallback = v4[i];
    const v4Slot = fallback ? v4Facts[v4Index++] : undefined;
    if (!m) { unresolved += 1; return; }
    if (found) {
      const token0 = facts[found.k * 3 + 1];
      const fee = facts[found.k * 3 + 2];
      if (!token0.ok || typeof token0.value !== 'string') { unresolved += 1; return; }
      sources.push({
        token, symbol: m.symbol, decimals: m.decimals, venue: 'v3',
        pool: found.pool,
        fee: fee.ok ? Number(fee.value) /* count */ : 0,
        tokenIsToken1: (token0.value as string).toLowerCase() === weth.toLowerCase(),
      });
      return;
    }
    if (fallback && stateView && v4Slot?.ok && sqrtOf(v4Slot.value) !== null) {
      sources.push({ token, symbol: m.symbol, decimals: m.decimals, venue: 'v4', poolId: fallback.poolId, fee: fallback.fee, stateView });
      return;
    }
    unresolved += 1;
  });

  return { ...base, wethDecimals, sources, unresolved };
}

// ── the reads, shared with the flywheel snapshot ──────────────────────────

/** A token that had no pool is looked for again this often, in ticks. */
const RETRY_UNRESOLVED_EVERY = 4;

/** The resolved sources for a listing, from the cache when it still fits. */
export async function ensureResolved(listedOnBand: Address[], a: At): Promise<Resolved> {
  const m = manifest();
  if (cache && cache.id === m.id && cache.unresolved > 0 && cache.ticks >= RETRY_UNRESOLVED_EVERY) cache = null;
  if (!cache || cache.id !== m.id || cache.listed !== listingKey(listedOnBand)) cache = await resolve(listedOnBand, a);
  return cache;
}

/** Two calls per source, in order: the price and the liquidity behind it (a gate for v3, a log for v4). */
export function priceReads(r: Resolved) {
  return r.sources.flatMap((s) => (s.venue === 'v3'
    ? [
      { address: s.pool, abi: uniswapV3PoolAbi as unknown as Abi, functionName: 'slot0', args: [] as readonly unknown[] },
      { address: s.pool, abi: uniswapV3PoolAbi as unknown as Abi, functionName: 'liquidity', args: [] as readonly unknown[] },
    ]
    : [
      { address: s.stateView, abi: stateViewAbi as unknown as Abi, functionName: 'getSlot0', args: [s.poolId] as readonly unknown[] },
      // The second slot keeps the pairs aligned; a v4 pool's in-range
      // liquidity is not a gate (see resolve), so it is read for the log only.
      { address: s.stateView, abi: stateViewAbi as unknown as Abi, functionName: 'getLiquidity', args: [s.poolId] as readonly unknown[] },
    ]));
}

type Answer = { ok: true; value: unknown } | { ok: false; error: unknown };

/** The prices from the answers to `priceReads(r)`, in the same order. A source that did not answer, or is empty, is left out. */
export function decodePrices(r: Resolved, answers: readonly Answer[]): TokenPrice[] {
  const prices: TokenPrice[] = [];
  r.sources.forEach((s, i) => {
    const slot = answers[i * 2];
    const liq = answers[i * 2 + 1];
    if (!slot || !liq || !slot.ok) return;
    if (s.venue === 'v3' && (!liq.ok || typeof liq.value !== 'bigint' || liq.value === 0n)) return;
    const sqrt = sqrtOf(slot.value);
    if (sqrt === null) return;
    prices.push({
      address: s.token, symbol: s.symbol, decimals: s.decimals,
      ethPerToken: ethPerToken({
        sqrtPriceX96: sqrt,
        tokenIsToken1: s.venue === 'v3' ? s.tokenIsToken1 : true,
        tokenDecimals: s.decimals, wethDecimals: s.venue === 'v3' ? r.wethDecimals : 18,
      }),
      pool: s.venue === 'v3' ? s.pool : s.poolId, fee: s.fee, venue: s.venue,
    });
  });
  return prices;
}

// ── the dollar source ─────────────────────────────────────────────────────

export type UsdSource = { id: string; pool: Address; fee: number; usdIsToken1: boolean; usdDecimals: number; wethDecimals: number };
let usdCache: UsdSource | null | undefined;

/**
 * The dollar pool, resolved once per deployment: null when the manifest names
 * no stablecoin, or the venue has no pool of it against WETH with anything in
 * it. `undefined` in the cache means "not looked yet".
 */
export async function usdSource(a: At): Promise<UsdSource | null> {
  const m = manifest();
  if (usdCache !== undefined && (usdCache === null || usdCache.id === m.id)) return usdCache;
  usdCache = await resolveUsd(a);
  return usdCache;
}

async function resolveUsd(a: At): Promise<UsdSource | null> {
  const m = manifest();
  if (!m.usd) return null;
  const c = contracts();
  const t = (functionName: string) => ({ address: c.Treasury, abi: treasuryAbi as unknown as Abi, functionName });
  const [weth, factory] = await readMany<Address>([t('WETH'), t('V3_FACTORY')], a);
  if (factory.toLowerCase() === ZERO_ADDRESS || weth.toLowerCase() === ZERO_ADDRESS) return null;
  const token = m.usd.token;
  const meta = await tokenMeta([token, weth], a);
  const usdDecimals = meta.get(token.toLowerCase())?.decimals;
  if (usdDecimals === undefined) return null;
  const wethDecimals = meta.get(weth.toLowerCase())?.decimals ?? 18; /* count */
  const pools = await tryReadMany<unknown>(USD_FEE_TIERS.map((fee) => ({
    address: factory, abi: uniswapV3FactoryAbi as unknown as Abi, functionName: 'getPool', args: [weth, token, fee],
  })), a);
  const found = pools
    .map((p, i) => ({ fee: USD_FEE_TIERS[i], pool: p.ok && typeof p.value === 'string' ? p.value as Address : ZERO_ADDRESS }))
    .filter((x) => x.pool.toLowerCase() !== ZERO_ADDRESS);
  if (found.length === 0) return null;
  const facts = await tryReadMany<unknown>(found.flatMap((x) => [
    { address: x.pool, abi: uniswapV3PoolAbi as unknown as Abi, functionName: 'liquidity' },
    { address: x.pool, abi: uniswapV3PoolAbi as unknown as Abi, functionName: 'token0' },
  ]), a);
  // The deepest pool wins: a thin one is a price somebody can move.
  let best: { pool: Address; fee: number; liquidity: bigint; token0: string } | null = null;
  found.forEach((x, i) => {
    const liq = facts[i * 2];
    const token0 = facts[i * 2 + 1];
    if (!liq.ok || typeof liq.value !== 'bigint' || liq.value === 0n) return;
    if (!token0.ok || typeof token0.value !== 'string') return;
    if (!best || liq.value > best.liquidity) best = { pool: x.pool, fee: x.fee, liquidity: liq.value, token0: token0.value };
  });
  if (!best) return null;
  const b = best as { pool: Address; fee: number; liquidity: bigint; token0: string };
  return { id: m.id, pool: b.pool, fee: b.fee, usdIsToken1: b.token0.toLowerCase() === weth.toLowerCase(), usdDecimals, wethDecimals };
}

/** Two calls: the dollar pool's price and its liquidity. */
export function usdReads(u: UsdSource) {
  return [
    { address: u.pool, abi: uniswapV3PoolAbi as unknown as Abi, functionName: 'slot0', args: [] as readonly unknown[] },
    { address: u.pool, abi: uniswapV3PoolAbi as unknown as Abi, functionName: 'liquidity', args: [] as readonly unknown[] },
  ];
}

/** Dollars per ETH from the answers to `usdReads(u)`, or null when the pool did not answer or is empty. */
export function decodeUsd(u: UsdSource, answers: readonly Answer[]): Amount | null {
  const [slot, liq] = answers;
  if (!slot || !liq || !slot.ok || !liq.ok) return null;
  if (typeof liq.value !== 'bigint' || liq.value === 0n) return null;
  const sqrt = sqrtOf(slot.value);
  if (sqrt === null) return null;
  return usdPerEthFrom({ sqrtPriceX96: sqrt, usdIsToken1: u.usdIsToken1, usdDecimals: u.usdDecimals, wethDecimals: u.wethDecimals });
}

// ── the tick ──────────────────────────────────────────────────────────────

/**
 * Every listed token's price at one block. The listing is re-read on every
 * tick alongside the prices, so a token the owner lists appears on the next
 * refresh and one they retire leaves on it — without a second request in the
 * steady state.
 */
export async function getPrices(): Promise<PriceBoard> {
  return guard('reading the prices', async () => {
    const a = await pin();
    const c = contracts();
    const listedCall = { address: c.TheNest, abi: theNestAbi as unknown as Abi, functionName: 'listedRewardTokens' };

    let r = cache && cache.id === manifest().id ? cache : null;
    if (!r) {
      const listed = await readOne<readonly Address[]>(listedCall, a);
      r = await ensureResolved(onTheBand(listed), a);
    }

    // Once resolved, at most one re-resolve per tick — when the listing moved
    // under us — and then the read proper. The loop bounds it.
    for (let attempt = 0; attempt < 2; attempt++) {
      const answers = await tryReadMany<unknown>([listedCall, ...priceReads(r)], a);
      const listedNow = answers[0];
      if (!listedNow.ok || !Array.isArray(listedNow.value)) throw listedNow.ok ? new Error('the listing did not read') : listedNow.error;
      const nowOnBand = onTheBand(listedNow.value as Address[]);
      if (listingKey(nowOnBand) !== r.listed) {
        r = await ensureResolved(nowOnBand, a);
        continue;
      }
      r.ticks += 1;
      return { blockNumber: a.blockNumber, timestamp: a.timestamp, prices: decodePrices(r, answers.slice(1) as Answer[]) };
    }
    throw new Error('the reward listing kept changing between reads');
  });
}
