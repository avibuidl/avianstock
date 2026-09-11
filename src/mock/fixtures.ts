// The fake world, derived from the scenario — plus a small mutable overlay so
// that what you do in a session sticks: an approval you grant stays granted, a
// bird you mint appears in your birds, a bird you roost moves.
//
// Every constant here that a contract owns is marked. The wiring agent deletes
// the file; the constants come back from the chain.

import type {
  Address, Amount, Bird, RewardStream, RewardToken, SatchelHolding, Tier, TokenId, TraitIndices,
} from './types';
import { packCombo } from '../art/render';
import { COUNTS } from '../art/traits';
import { scenario, subscribeScenario, type Scenario } from './scenario';

const e18 = (n: number | bigint) => BigInt(n) * 10n ** 18n;

// ── contract constants, all of them read live once wired ──────────────────
export const MAX_SUPPLY = 5555;
export const FREE_ALLOCATION = 2000;
export const PAID_CEILING = MAX_SUPPLY - FREE_ALLOCATION;        // 3,555
export const PRICE = e18(100_000);
export const MIN_PRICE = e18(100_000);
export const WALLET_LIMIT = MAX_SUPPLY;                           // does not bind at launch
export const PERCH_BASE = e18(100_000);
export const PERCH_SELL = e18(90_000);
export const PERCH_BUY_NEXT = e18(110_000);
export const PERCH_BUY_NAMED = e18(115_000);
export const TIER_COST: Record<Tier, Amount> = { 1: e18(5_000), 2: e18(15_000), 3: e18(25_000) };
export const TIER_WEIGHT: Record<Tier, bigint> = { 1: 1n, 2: 2n, 3: 3n };
export const WINDOW_SECONDS = 300;
export const FEE_BPS = 100;
export const MAX_EXTRA_FEE_BPS = 2400;
export const MAX_BUY_PER_TX = e18(50_000_000);
/** `ThePerch.BURN_EVERY`: one bird in this many deposits is burnt. */
export const BURN_EVERY = 100;
export const LOCK_SECONDS = 365 * 86400;
export const AVIANS_SUPPLY = e18(1_000_000_000);
export const POOL_AVIANS = e18(800_000_000);
export const FREE_RESERVE = e18(200_000_000);

export const YOU: Address = '0x8F3C4b2e9A7d15C0f8B36eA2d904C71bE5A19D3a';

export const ADDRESSES: Record<string, Address> = {
  Avians: '0x4a1F7bE0c8D31596aA20e4B71cF03d8a5E9b2C41',
  TraitRegistry: '0x9c02Ee4b1A73dF085C6e91Bb4370aD52fE18c907',
  BirdRenderer: '0x27fB5aC1e04D9836bB1e0A45C7fD3928e6b04A15',
  TheNest: '0xb3E9017C4a52Fd8106e42B0dA71C935fE0847bC6',
  Treasury: '0x61aD3c0f9E27B45810cA7e3b0D25FC48a19e07B2',
  ThePerch: '0xE05b71cA4930fD8267e1B04a3C6f9812dE5A0374',
  AvianStock: '0x1d8Ae5F3b0C74921eA36Bd07fC5148e9036aB2E7',
  Launcher: '0x77c2b0Ae4519dF3c8a2e6104Bb95Dd7e1f09b415',
  AviansHook: '0x3fA1e08C25B7d94610eF3a02Dc8B7159e4a0Cc88',
  LiquidityVault: '0x5B2e91Df0aC48317eE6a05Bd91cF7a4038e12b60',
};

/** Measured on chain 4663 — HANDOVER section 10. These are real. */
export const THIRD_PARTY: Record<string, Address> = {
  'ERC-6551 registry': '0x000000006551c19487814612e58FE06813775758',
  'Tokenbound AccountV3': '0x41C8f39463A868d3A88af00cd0fe7102F30E44eC',
  'Transfer validator': '0x721C002B0059009a671D00aD1700c9748146cd1B',
  'Seaport 1.6': '0x0000000000000068F116a894984e2DB1123eB395',
  'Uniswap v4 PoolManager': '0x8366a39CC670B4001A1121B8F6A443A643e40951',
  'Uniswap v4 PositionManager': '0x58daec3116aae6D93017bAAea7749052E8a04fA7',
  UniversalRouter: '0x8876789976dEcBfCbBbe364623C63652db8C0904',
  Permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
};

export const REWARD_TOKENS: RewardToken[] = [
  { address: '0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC', symbol: 'NVDA', decimals: 18 },
  { address: '0x117cc2133c37B721F49dE2A7a74833232B3B4C0C', symbol: 'SPY', decimals: 18 },
  { address: '0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa', symbol: 'SPCX', decimals: 18 },
  { address: '0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9', symbol: 'AAPL', decimals: 18 },
];

/**
 * The Treasury's conversion split, in basis points, one per REWARD_TOKENS entry.
 *
 * On chain this is `Treasury.targets()` — owner-set, and NOT equal parts. It
 * lives beside the tokens rather than inside `admin.ts` because two surfaces
 * read it now, the owner's targets table and the Docs reference row, and a mock
 * that disagrees with itself teaches the wrong thing twice.
 */
export const REWARD_TARGET_BPS = [4000, 3000, 2000, 1000];

/**
 * Listed once, not any more. It does not stream, but a wallet that earned in
 * it before it was retired is still owed — and `claimAll` pays it. Eight
 * tokens ever, so the site can simply keep the list.
 */
export const RETIRED_REWARD_TOKENS: RewardToken[] = [
  { address: '0x6B9c5A0Ee1B7c0D1F42a3E8b6C7d4A19F0e2B35C', symbol: 'TSLA', decimals: 18 },
];

/**
 * `claimAll` returns bare addresses and a row has to say a symbol. Once wired,
 * either keep a registry like this one or read `symbol()`/`decimals()` off each
 * address once and cache it; never assume the returned order matches the
 * listed order.
 */
export function rewardTokenMeta(a: Address): RewardToken {
  const known = [...REWARD_TOKENS, ...RETIRED_REWARD_TOKENS]
    .find((t) => t.address.toLowerCase() === a.toLowerCase());
  return known ?? { address: a, symbol: `${a.slice(0, 6)}…${a.slice(-4)}`, decimals: 18 };
}

export const WALLETS = [
  { rdns: 'io.metamask', name: 'MetaMask', icon: 'MM' },
  { rdns: 'io.rabby', name: 'Rabby', icon: 'RB' },
  { rdns: 'com.coinbase.wallet', name: 'Coinbase Wallet', icon: 'CB' },
];

export const ALLOWLIST_ROOT =
  '0x9c4f2ab8e70d1e5c3f8a01d64b2e9c7a5f30e18b4d6c92af1305be74c821ab09' as const;

// ── deterministic birds ───────────────────────────────────────────────────

function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A token id always has the same six traits, so every screen agrees. */
export function traitsForId(id: TokenId): TraitIndices {
  const r = prng(id * 2654435761);
  return COUNTS.map((n) => Math.floor(r() * n)) as unknown as TraitIndices;
}

/** ERC-6551 accounts are a deterministic function of the token id. */
export function satchelAddressOf(id: TokenId): Address {
  const r = prng(id * 40503 + 7);
  let hex = '';
  for (let i = 0; i < 40; i++) hex += Math.floor(r() * 16).toString(16);
  return ('0x' + hex) as Address;
}

// ── the session overlay ───────────────────────────────────────────────────

type Overlay = {
  approvals: Partial<{
    aviansToCollection: Amount; aviansToStaking: Amount; aviansToPerch: Amount;
    birdsToPerch: boolean; birdsToRoost: boolean;
  }>;
  minted: TokenId[];
  freeClaimed: boolean;
  spent: Amount;
  staked: Map<TokenId, Tier>;
  unstaked: Set<TokenId>;
  soldToPerch: TokenId[];
  boughtFromPerch: TokenId[];
  claimed: Set<string>;
  transferredAway: Set<TokenId>;
  /**
   * What the owner has set the price to in this session, or null for the
   * deployed one. The admin panel's `setPrice` used to report success and
   * change nothing, which made it impossible to see that the hero's MINT PRICE
   * is a read rather than a literal — the one thing about that stat worth
   * being able to check.
   */
  price: Amount | null;
  /** The same, for the royalty the Docs page states. */
  royaltyBps: number | null;
  /** And for the conversion interval the Treasury card states. */
  conversionMinInterval: number | null;
  /** AVIANS -> Permit2, granted in this session. Step one of a sell. */
  permit2Approved: Amount | null;
  /** Permit2 -> the router. Step two. */
  permit2Router: Amount | null;
  /**
   * What trading has done to this wallet in this session. Signed, because a buy
   * and a sell move both balances in opposite directions — and the point of
   * keeping them is that "the compose page re-reads after a swap settles" is
   * something you can watch happen rather than take on trust.
   */
  swappedAvians: Amount;
  swappedEth: Amount;
  /** Paid deposits made in this session, so a sale moves the burn countdown. */
  deposits: number;
  /** Ids the perch burnt in this session, so their pages can be walked. */
  burnt: TokenId[];
  /** The vault's fees were collected this session, so nothing is pending. */
  feesCollected: boolean;
};

const emptyOverlay = (): Overlay => ({
  approvals: {}, minted: [], freeClaimed: false, spent: 0n,
  staked: new Map(), unstaked: new Set(), soldToPerch: [], boughtFromPerch: [],
  claimed: new Set(), transferredAway: new Set(),
  price: null, royaltyBps: null, conversionMinInterval: null,
  permit2Approved: null, permit2Router: null,
  swappedAvians: 0n, swappedEth: 0n, deposits: 0, burnt: [],
  feesCollected: false,
});

export let overlay: Overlay = emptyOverlay();

/** A scenario change is a different world; the session's edits do not carry. */
subscribeScenario(() => { overlay = emptyOverlay(); });

export function resetOverlay() { overlay = emptyOverlay(); }

// ── the world ─────────────────────────────────────────────────────────────

export type World = ReturnType<typeof world>;

export function world(s: Scenario = scenario()) {
  const blank = s.data === 'empty';

  const released = s.freeMint === 'released' || s.paidMint === 'sold-out';
  const soldOut = s.paidMint === 'sold-out';

  const freeMinted = blank ? 0 : soldOut ? FREE_ALLOCATION
    : s.freeMint === 'exhausted' ? FREE_ALLOCATION : 1204;
  const paidMinted = blank ? 0 : soldOut ? MAX_SUPPLY - FREE_ALLOCATION
    : 428 + overlay.minted.length;
  const totalMinted = freeMinted + paidMinted;

  const reservedFree = released ? 0 : FREE_ALLOCATION - freeMinted;
  const paidRemaining = released ? MAX_SUPPLY - totalMinted : PAID_CEILING - paidMinted;

  const freeMintOpen = !blank
    && (s.freeMint === 'open-allowlisted' || s.freeMint === 'open-not-allowlisted'
      || s.freeMint === 'already-claimed' || s.freeMint === 'exhausted');
  // Sold out is an open door with nothing behind it, not a closed one — the
  // contract still answers, it just answers SoldOut.
  const mintOpen = !blank && (s.paidMint === 'open' || s.paidMint === 'wallet-cap' || s.paidMint === 'sold-out');

  const isAllowlisted = s.freeMint === 'open-allowlisted' || s.freeMint === 'already-claimed'
    || s.freeMint === 'exhausted';
  const freeClaimed = s.freeMint === 'already-claimed' || overlay.freeClaimed;

  // Balances the copy leans on: "You've got 41,200."
  const baseBalance = { none: 0n, short: e18(41_200), enough: e18(412_500), plenty: e18(12_400_000) }[s.balance];
  const afterSpending = baseBalance > overlay.spent ? baseBalance - overlay.spent : 0n;
  // The Perch's paid-deposit count. `depositsUntilNextBurn` is derived from it
  // rather than stored, exactly as the contract derives it, so the two cannot
  // drift and "one away" means one away.
  const untilBurn = s.burnClock === 'one-away' ? 1 : s.burnClock === 'near' ? 3 : 42;
  const deposits = 300 - untilBurn + overlay.deposits;

  const avians = afterSpending + overlay.swappedAvians > 0n
    ? afterSpending + overlay.swappedAvians : 0n;

  const approvals = {
    aviansToCollection: overlay.approvals.aviansToCollection
      ?? { none: 0n, partial: e18(50_000), sufficient: PRICE }[s.approvals],
    aviansToStaking: overlay.approvals.aviansToStaking
      ?? { none: 0n, partial: 0n, sufficient: e18(200_000) }[s.approvals],
    // The perch's BUY price is 110,000 and the named price 115,000, so
    // "sufficient" has to cover the dearer of the two or the ready state is
    // not actually ready.
    aviansToPerch: overlay.approvals.aviansToPerch
      ?? { none: 0n, partial: e18(50_000), sufficient: e18(115_000) }[s.approvals],
    birdsToPerch: overlay.approvals.birdsToPerch ?? s.approvals === 'sufficient',
    birdsToRoost: overlay.approvals.birdsToRoost ?? s.approvals === 'sufficient',
  };

  // ── your birds ──────────────────────────────────────────────────────────
  const roostPlan: [TokenId, Tier][] = blank ? [] : {
    'nothing-staked': [] as [TokenId, Tier][],
    'tier-1': [[902, 1]] as [TokenId, Tier][],
    'tier-2': [[902, 2], [1118, 2]] as [TokenId, Tier][],
    'tier-3': [[902, 3], [1118, 3], [1447, 3]] as [TokenId, Tier][],
    mixed: [[902, 3], [1118, 2], [1447, 1]] as [TokenId, Tier][],
  }[s.roost];

  const staked = new Map<TokenId, Tier>(roostPlan);
  for (const id of overlay.unstaked) staked.delete(id);
  for (const [id, tier] of overlay.staked) staked.set(id, tier);

  const heldIdsBase = blank ? [] : [1204, 1377, 1562, 1588];
  const walletIds = [
    ...heldIdsBase,
    ...overlay.minted,
    ...overlay.boughtFromPerch,
    ...[...overlay.unstaked],
  ]
    .filter((id) => !staked.has(id))
    .filter((id) => !overlay.soldToPerch.includes(id))
    .filter((id) => !overlay.transferredAway.has(id));

  const satchelHolds: SatchelHolding[] = blank || s.satchel === 'empty' ? []
    : s.satchel === 'holds-tokens'
      ? [{ kind: 'erc20', symbol: 'NVDA', decimals: 18, amount: 12408800000000000000n },
        { kind: 'eth', amount: 31000000000000000n }]
      : [{ kind: 'avian', id: 311 }, { kind: 'avian', id: 977 },
        { kind: 'erc20', symbol: 'NVDA', decimals: 18, amount: 12408800000000000000n },
        { kind: 'eth', amount: 31000000000000000n }];

  const now = Math.floor(Date.now() / 1000);
  const since: Record<number, number> = { 902: now - 14 * 86400, 1118: now - 6 * 86400, 1447: now - 2 * 86400 };

  function makeBird(id: TokenId, where: Bird['location']): Bird {
    const traits = traitsForId(id);
    const nested = id === 1204 ? satchelHolds : [];
    return {
      id, traits, combo: packCombo(traits), location: where,
      satchel: { address: satchelAddressOf(id), deployed: id === 1204 || id % 3 === 0, holds: nested },
    };
  }

  const yourBirds = walletIds.map((id) => makeBird(id, { where: 'wallet', owner: YOU }));
  const roosting = [...staked].map(([id, tier]) =>
    makeBird(id, { where: 'roost', staker: YOU, tier, since: since[id] ?? now - 3600 }));

  // ── the perch ───────────────────────────────────────────────────────────
  const poolCount = blank ? 0 : { empty: 0, some: 37, full: 214 }[s.perch];
  const poolIds = Array.from({ length: poolCount }, (_, i) => 214 + i * 5)
    .filter((id) => id <= totalMinted || totalMinted === 0)
    .concat(overlay.soldToPerch)
    .filter((id) => !overlay.burnt.includes(id))
    .filter((id) => !overlay.boughtFromPerch.includes(id));
  poolIds.sort((a, b) => a - b);

  const outsideThePool = Math.max(0, totalMinted - poolIds.length);
  // ThePerch.backingRequired() reserves BASE — 100,000 — for every bird not in
  // the pool, while buying one back costs SELL_PAYOUT, 90,000. The reserve is
  // deliberately the larger number. This mock had it at 90,000, which made the
  // solvency panel understate the requirement.
  const backingRequired = PERCH_BASE * BigInt(outsideThePool);
  // A property of the contract: never less than what it must hold.
  const aviansHeld = backingRequired + e18(5_562_400);

  // ── the roost ───────────────────────────────────────────────────────────
  const yourWeight = [...staked.values()].reduce((a, t) => a + TIER_WEIGHT[t], 0n);
  const totalWeight = blank ? 0n : 4182n + yourWeight;
  const totalStaked = blank ? 0 : 611 + staked.size;

  const listed = s.rewards === 'none-listed' ? [] : REWARD_TOKENS;
  const pausedSymbols = s.rewards === 'all-paused' ? ['NVDA', 'SPY', 'SPCX', 'AAPL']
    : s.rewards === 'one-paused' ? ['AAPL'] : [];
  const earnedBase = [41_200_000_000_000_00n, 118_300_000_000_000_00n, 6_700_000_000_000_00n, 93_100_000_000_000_00n];
  const streams = listed.map((token, i) => ({
    token,
    earned: overlay.claimed.has(token.symbol) ? 0n
      : yourWeight === 0n ? 0n : earnedBase[i] * yourWeight,
    rate: e18(1) / 86400n,
    periodFinish: now + 5 * 86400,
    claimedByYou: overlay.claimed.has(token.symbol) ? earnedBase[i] * yourWeight : 0n,
    totalPaid: earnedBase[i] * 3200n,
    transferable: !pausedSymbols.includes(token.symbol),
  }));

  // The whole point of the batch's third array: this token is not in `listed`,
  // so `claimAll` returns one more row than the panel streams.
  const retiredBase = 27_400_000_000_000_00n;
  const retiredClaimed = overlay.claimed.has(RETIRED_REWARD_TOKENS[0].symbol);
  const retired: RewardStream[] = (blank || listed.length === 0 || yourWeight === 0n) ? [] : [{
    token: RETIRED_REWARD_TOKENS[0],
    earned: retiredClaimed ? 0n : retiredBase * yourWeight,
    rate: 0n,
    periodFinish: now - 21 * 86400,
    claimedByYou: retiredClaimed ? retiredBase * yourWeight : 0n,
    totalPaid: retiredBase * 1900n,
    transferable: s.rewards !== 'all-paused',
  }];

  // ── First Light ─────────────────────────────────────────────────────────
  const launchAt = s.launch === 'before' ? now + 11560
    : s.launch === 'window' ? now - s.windowElapsed
      : now - 9 * 86400;

  return {
    scenario: s, now, blank,
    collection: {
      name: 'Avian Stock', symbol: 'AVISTOCK',
      maxSupply: MAX_SUPPLY, totalMinted, walletLimit: WALLET_LIMIT,
      mintOpen, price: overlay.price ?? PRICE, minPrice: MIN_PRICE, paidRemaining,
      freeMintOpen, freeAllocation: FREE_ALLOCATION, freeMinted,
      reservedFree, freeAllocationReleased: released,
      freeReleaseAvailableAt: freeMintOpen ? now + 6 * 3600 : null,
      freeOpenSeconds: freeMintOpen ? 18 * 3600 : 0,
      requiredBacking: PERCH_BASE * BigInt(reservedFree),
      royaltyBps: overlay.royaltyBps ?? 500,
      burned: Math.floor(deposits / BURN_EVERY),
    },
    wallet: {
      address: YOU,
      eth: 148_000_000_000_000_000n + overlay.swappedEth > 0n
        ? 148_000_000_000_000_000n + overlay.swappedEth : 0n,
      avians,
      mintedBy: (s.paidMint === 'wallet-cap' ? WALLET_LIMIT : heldIdsBase.length + roostPlan.length)
        + overlay.minted.length,
      freeClaimed, isAllowlisted,
      proof: isAllowlisted ? (Array.from({ length: 12 }, (_, i) =>
        ('0x' + (i + 3).toString(16).padStart(2, '0').repeat(32)) as `0x${string}`)) : null,
      approvals,
    },
    yourBirds, roosting, staked,
    perch: {
      base: PERCH_BASE, sell: PERCH_SELL, buyNext: PERCH_BUY_NEXT, buyNamed: PERCH_BUY_NAMED,
      poolSize: poolIds.length, lowestId: poolIds[0] ?? null, heldIds: poolIds,
      backingRequired, aviansHeld,
      operatorWhitelisted: s.operatorWhitelist === 'applied',
      burnEvery: BURN_EVERY,
      deposits,
      // Derived, exactly as the contract derives it, so the countdown and the
      // count can never disagree.
      depositsUntilNextBurn: BURN_EVERY - (deposits % BURN_EVERY),
    },
    roost: {
      tierCost: TIER_COST, totalWeight, yourWeight, totalStaked,
      totalBurned: e18(8_415_000), staked: roosting, listed, streams, retired,
      operatorWhitelisted: s.operatorWhitelist === 'applied',
    },
    launch: {
      launchAt, isLaunched: now >= launchAt,
      windowSeconds: WINDOW_SECONDS, windowEndsAt: launchAt + WINDOW_SECONDS,
      currentBuyFeeBps: buyFeeBpsAt(now, launchAt),
      sellFeeBps: FEE_BPS, maxBuyPerTx: MAX_BUY_PER_TX,
      feeBps: FEE_BPS, maxExtraFeeBps: MAX_EXTRA_FEE_BPS,
    },
    makeBird,
  };
}

/**
 * The total buy fee in bps at a moment. 2500 at the first second, decaying
 * linearly to 100 at the last. Before the launch it returns the opening
 * number, not zero — same as the contract.
 */
export function buyFeeBpsAt(t: number, launchAt: number): number {
  if (t < launchAt) return FEE_BPS + MAX_EXTRA_FEE_BPS;
  const elapsed = t - launchAt;
  if (elapsed >= WINDOW_SECONDS) return FEE_BPS;
  return Math.round(FEE_BPS + MAX_EXTRA_FEE_BPS * (1 - elapsed / WINDOW_SECONDS));
}

// ── the register ──────────────────────────────────────────────────────────

let takenCache: { key: string; set: Set<string> } | null = null;

/** Every combination already minted. On chain this is `comboTaken(uint48)`. */
export function takenCombos(w: World): Set<string> {
  const key = `${w.collection.totalMinted}`;
  if (takenCache?.key === key) return takenCache.set;
  const set = new Set<string>();
  for (let id = 1; id <= w.collection.totalMinted; id++) set.add(traitsForId(id).join(','));
  takenCache = { key, set };
  return set;
}

export function idForCombo(w: World, t: TraitIndices): TokenId | undefined {
  const key = t.join(',');
  for (let id = 1; id <= w.collection.totalMinted; id++) {
    if (traitsForId(id).join(',') === key) return id;
  }
  return undefined;
}
