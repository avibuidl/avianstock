// The price ticker's read: every listed stock token, in ETH, off Uniswap v3.
//
// WHERE A PRICE COMES FROM. There is no price API and there will not be one —
// the CSP lets the site talk to itself and to the manifest's RPC, and that is
// all. So every figure on the band is a chain read: the pool's own
// `slot0().sqrtPriceX96`, turned into ETH per token with the pair's order and
// both tokens' decimals taken from the chain too. A mid-price, no fee, no
// size — a figure to watch, not a quote to act on.
//
// WHICH POOL. The Treasury names the venue (`V3_FACTORY`, `WETH`) and, per
// reward token, the route the owner set: `v3RouteOf(NATIVE, token)` is a list
// of hops whose one hop, for every token the runbook configures, IS the pool.
// No route, or a route that does not end in one WETH pool: the factory is
// asked for the 0.05% pool, then the 0.3% one, and the first with liquidity
// behind it is taken. Nothing here is written down as an address.
//
// ONE BATCH PER TICK. Resolving the pools is done once per deployment; after
// that a refresh is one pin and ONE multicall — the listing, then slot0 and
// liquidity per pool — at that block. Each item may fail on its own
// (`allowFailure`), and a token whose pool did not answer, is empty, or has no
// price is left OUT of that refresh. It is never shown as zero.

import type { Abi } from 'viem';
import { pin, readMany, readOne, tryReadMany, type At } from './client';
import { contracts, manifest } from './manifest';
import { theNestAbi, treasuryAbi, uniswapV3FactoryAbi, uniswapV3PoolAbi } from './abis.generated';
import { guard, tokenMeta } from './reads';
import type { Address, Amount, PriceBoard, TokenPrice } from '../mock/types';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address;
const Q192 = 1n << 192n;
const WAD = 10n ** 18n;

/** Uniswap's two tiers the stock tokens trade at on 4663, in the order tried. */
const FEE_TIERS = [500, 3000];

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
 * (contracts/script/RewardsRunbook.sol), with the decimals made explicit.
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

// ── resolving: which pool, for each token ─────────────────────────────────

type Source = {
  token: Address; symbol: string; decimals: number;
  pool: Address; fee: number; tokenIsToken1: boolean;
};

type Resolved = {
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
export function invalidatePrices() { cache = null; }

const listingKey = (listed: readonly Address[]) => listed.map((a) => a.toLowerCase()).join(',');

/**
 * AVIANS is a listed reward token on the Nest since 2026-09-18 — the Roost
 * streams it to brooding birds — but it is NOT on the band: the founder's
 * call, and it has no v3 pool to read anyway (the project's own pool is v4).
 * Dropped before any pool is looked for, so the resolver never asks the
 * factory about it.
 */
const onTheBand = (listed: readonly Address[]): Address[] => {
  const avians = contracts().Avians.toLowerCase();
  return listed.filter((a) => a.toLowerCase() !== avians);
};

type Hop = { pool: Address; tokenOut: Address } | readonly [Address, Address];
const hopOf = (h: Hop) => (Array.isArray(h)
  ? { pool: h[0] as Address, tokenOut: h[1] as Address }
  : h as { pool: Address; tokenOut: Address });

async function resolve(listed: Address[], at: At): Promise<Resolved> {
  const c = contracts();
  const t = (functionName: string, args: readonly unknown[] = []) =>
    ({ address: c.Treasury, abi: treasuryAbi as unknown as Abi, functionName, args });

  const [native, weth, factory] = await readMany<Address>([t('NATIVE'), t('WETH'), t('V3_FACTORY')], at);
  const base = { id: manifest().id, listed: listingKey(listed), ticks: 0 };

  // A deployment without v3 (the Treasury says so with a zero factory) has no
  // stock-token prices to show, and says nothing rather than guessing a venue.
  if (factory.toLowerCase() === ZERO_ADDRESS || weth.toLowerCase() === ZERO_ADDRESS || listed.length === 0) {
    return { ...base, wethDecimals: 18, sources: [], unresolved: 0 };
  }

  const meta = await tokenMeta([...listed, weth], at);
  const wethDecimals = meta.get(weth.toLowerCase())?.decimals ?? 18; /* count */

  // The owner's routes and the factory's pools, asked together: neither
  // depends on the other, and one of them is usually enough.
  const routeCalls = listed.map((token) => t('v3RouteOf', [native, token]));
  const poolCalls = listed.flatMap((token) => FEE_TIERS.map((fee) => ({
    address: factory, abi: uniswapV3FactoryAbi as unknown as Abi, functionName: 'getPool', args: [token, weth, fee],
  })));
  const answers = await tryReadMany<unknown>([...routeCalls, ...poolCalls], at);

  // Candidates per token, in the order they are trusted: the route's pool
  // first, then the factory's by fee tier. Deduplicated, zeros dropped.
  const candidates = listed.map((token, i) => {
    const out: Address[] = [];
    const route = answers[i];
    if (route.ok && Array.isArray(route.value) && route.value.length === 1) {
      const hop = hopOf(route.value[0] as Hop);
      if (hop.tokenOut.toLowerCase() === token.toLowerCase()) out.push(hop.pool);
    }
    FEE_TIERS.forEach((_, j) => {
      const p = answers[listed.length + i * FEE_TIERS.length + j];
      if (p.ok && typeof p.value === 'string' && p.value.toLowerCase() !== ZERO_ADDRESS) out.push(p.value as Address);
    });
    return [...new Map(out.map((p) => [p.toLowerCase(), p])).values()];
  });

  // What is behind each candidate: liquidity, orientation, fee tier.
  const flat = candidates.flatMap((ps, i) => ps.map((pool) => ({ i, pool })));
  const p = (pool: Address, functionName: string) =>
    ({ address: pool, abi: uniswapV3PoolAbi as unknown as Abi, functionName });
  const facts = await tryReadMany<unknown>(
    flat.flatMap(({ pool }) => [p(pool, 'liquidity'), p(pool, 'token0'), p(pool, 'fee')]),
    at,
  );

  const sources: Source[] = [];
  let unresolved = 0; /* count */
  listed.forEach((token, i) => {
    const m = meta.get(token.toLowerCase());
    const mine = flat.map((f, k) => ({ ...f, k })).filter((f) => f.i === i);
    const found = mine.find((f) => {
      const liq = facts[f.k * 3];
      return liq.ok && typeof liq.value === 'bigint' && liq.value > 0n;
    });
    if (!m || !found) { unresolved += 1; return; }
    const token0 = facts[found.k * 3 + 1];
    const fee = facts[found.k * 3 + 2];
    if (!token0.ok || typeof token0.value !== 'string') { unresolved += 1; return; }
    sources.push({
      token, symbol: m.symbol, decimals: m.decimals,
      pool: found.pool,
      fee: fee.ok ? Number(fee.value) /* count */ : 0,
      tokenIsToken1: (token0.value as string).toLowerCase() === weth.toLowerCase(),
    });
  });

  return { ...base, wethDecimals, sources, unresolved };
}

// ── the tick ──────────────────────────────────────────────────────────────

/** A token that had no pool is looked for again this often, in ticks. */
const RETRY_UNRESOLVED_EVERY = 4;

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
    const m = manifest();
    const listedCall = { address: c.TheNest, abi: theNestAbi as unknown as Abi, functionName: 'listedRewardTokens' };

    if (cache && cache.id === m.id && cache.unresolved > 0 && cache.ticks >= RETRY_UNRESOLVED_EVERY) cache = null;
    if (!cache || cache.id !== m.id) {
      const listed = await readOne<readonly Address[]>(listedCall, a);
      cache = await resolve(onTheBand(listed), a);
    }

    // Once resolved, at most one re-resolve per tick — when the listing moved
    // under us — and then the read proper. The loop bounds it.
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = cache;
      const pool = (address: Address, functionName: string) =>
        ({ address, abi: uniswapV3PoolAbi as unknown as Abi, functionName });
      const answers = await tryReadMany<unknown>([
        listedCall,
        ...r.sources.flatMap((s) => [pool(s.pool, 'slot0'), pool(s.pool, 'liquidity')]),
      ], a);

      const listedNow = answers[0];
      if (!listedNow.ok || !Array.isArray(listedNow.value)) throw listedNow.ok ? new Error('the listing did not read') : listedNow.error;
      const nowOnBand = onTheBand(listedNow.value as Address[]);
      if (listingKey(nowOnBand) !== r.listed) {
        cache = await resolve(nowOnBand, a);
        continue;
      }
      r.ticks += 1;

      const prices: TokenPrice[] = [];
      r.sources.forEach((s, i) => {
        const slot = answers[1 + i * 2];
        const liq = answers[2 + i * 2];
        if (!slot.ok || !liq.ok) return;
        if (typeof liq.value !== 'bigint' || liq.value === 0n) return;
        // viem hands `slot0` back as a tuple or as an object, by how the ABI
        // names its outputs. Read it either way.
        const v = slot.value as unknown;
        const sqrt = Array.isArray(v) ? v[0] : (v as { sqrtPriceX96?: bigint })?.sqrtPriceX96;
        if (typeof sqrt !== 'bigint' || sqrt === 0n) return;
        prices.push({
          address: s.token, symbol: s.symbol, decimals: s.decimals,
          ethPerToken: ethPerToken({
            sqrtPriceX96: sqrt, tokenIsToken1: s.tokenIsToken1,
            tokenDecimals: s.decimals, wethDecimals: r.wethDecimals,
          }),
          pool: s.pool, fee: s.fee,
        });
      });
      return { blockNumber: a.blockNumber, timestamp: a.timestamp, prices };
    }
    throw new Error('the reward listing kept changing between reads');
  });
}
