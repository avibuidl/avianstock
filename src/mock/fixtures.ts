// The fake world, derived from the scenario — plus a small mutable overlay so
// that what you do in a session sticks: an approval you grant stays granted, a
// bird you mint appears in your birds, a bird you brood starts earning.
//
// Every constant here that a contract owns is marked. The wiring agent deletes
// the file; the constants come back from the chain.

import type {
  Address, Amount, Bird, BroodSummary, RewardStream, RewardToken, SatchelHolding, Tier, TokenId,
  TraitIndices,
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
/** The Nest's own constants: 10,000 / 30,000 / 50,000 since 2026-09-22 (tiers 2 and 3 doubled). */
export const TIER_COST: Record<Tier, Amount> = { 1: e18(10_000), 2: e18(30_000), 3: e18(50_000) };
export const TIER_WEIGHT: Record<Tier, bigint> = { 1: 1n, 2: 2n, 3: 3n };
/** When this page loaded: the chain's unsettled figures grow from here at the streams' rates, so a read lands where the screen's estimate is. */
const EPOCH = Math.floor(Date.now() / 1000);
export const WINDOW_SECONDS = 300;
export const FEE_BPS = 100;
/** The opening fee's extra, on top of FEE_BPS: 90% in total at the first second (2026-09-21; was 25%). */
export const MAX_EXTRA_FEE_BPS = 8900;
export const MAX_BUY_PER_TX = e18(50_000_000);
/** `ThePerch.BURN_EVERY`: one bird in this many deposits is burnt. */
export const BURN_EVERY = 100;
/** `BURN_FLOOR`: the real deployment's 2,222. The burn stops at this many living birds. */
export const BURN_FLOOR = 2222;
/** Somebody else: the previous holder of a bird whose brood expired when you bought it. */
export const NOT_YOU: Address = '0x00000000000000000000000000000000000000A1';
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
  Sweeper: '0x0c19E4f0A28d7b3C6e5aF21b9D843e07c5B16A92',
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

/** The stock tokens: the Treasury's conversion targets, and the ticker's band. */
export const STOCK_REWARD_TOKENS: RewardToken[] = [
  { address: '0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC', symbol: 'NVDA', decimals: 18 },
  { address: '0x117cc2133c37B721F49dE2A7a74833232B3B4C0C', symbol: 'SPY', decimals: 18 },
  { address: '0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa', symbol: 'SPCX', decimals: 18 },
  { address: '0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9', symbol: 'AAPL', decimals: 18 },
];
/**
 * AVIAN is a listed reward token on the Nest since 2026-09-18: the Roost
 * streams 30% of every fee to brooding birds through it. Not a Treasury
 * target (nothing converts into it — the Roost delivers it), and not on the
 * ticker. The Nest's listing is the five, in this order.
 */
export const AVIANS_REWARD: RewardToken = { address: ADDRESSES.Avians, symbol: 'AVIAN', decimals: 18 };
export const REWARD_TOKENS: RewardToken[] = [...STOCK_REWARD_TOKENS, AVIANS_REWARD];

/**
 * The Treasury's conversion split, in basis points, one per REWARD_TOKENS entry.
 *
 * On chain this is `Treasury.targets()` — owner-set, and NOT equal parts. It
 * lives beside the tokens rather than inside `admin.ts` because two surfaces
 * read it now, the owner's targets table and the Docs reference row, and a mock
 * that disagrees with itself teaches the wrong thing twice.
 */
// Equal weights, as Deploy.s.sol sets them since 2026-09-24.
export const REWARD_TARGET_BPS = [2500, 2500, 2500, 2500];

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
    aviansToCollection: Amount; aviansToNest: Amount; aviansToPerch: Amount;
    birdsToPerch: boolean;
  }>;
  minted: TokenId[];
  freeClaimed: boolean;
  spent: Amount;
  /**
   * Broods this session set, changed, expired or cleared. A key with a null
   * value is a brood the session CLOSED (settled after expiry), overriding the
   * scenario's plan for that id.
   */
  broods: Map<TokenId, MockBrood | null>;
  /**
   * Reward delivered this session, by destination address then token symbol.
   * A settle moves a bird's unsettled accrual here; the panel reads it back as
   * the destination's balance.
   */
  delivered: Map<string, Map<string, Amount>>;
  /** Unsettled accrual paid down by a settle this session, per bird per token. */
  settledUpTo: Map<TokenId, Map<string, Amount>>;
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
  /** The Roost's tenth spent and bought in this session (2026-09-22). */
  roostSpent: Amount;
  roostBought: Amount | null;
  /** AVIAN -> Permit2, granted in this session. Step one of a sell. */
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
  /** Satchels `prepare` deployed this session. */
  satchelsDeployed: Set<TokenId>;
  /** The Sweeper's grant, made or revoked this session, per bird. */
  sweeperGrants: Map<TokenId, boolean>;
  /** Reward a sweep moved OUT of a satchel this session, by satchel then symbol. */
  sweptFrom: Map<string, Map<string, Amount>>;
};

const emptyOverlay = (): Overlay => ({
  approvals: {}, minted: [], freeClaimed: false, spent: 0n,
  broods: new Map(), delivered: new Map(), settledUpTo: new Map(),
  soldToPerch: [], boughtFromPerch: [],
  claimed: new Set(), transferredAway: new Set(),
  price: null, royaltyBps: null, conversionMinInterval: null,
  roostSpent: 0n, roostBought: null,
  permit2Approved: null, permit2Router: null,
  swappedAvians: 0n, swappedEth: 0n, deposits: 0, burnt: [],
  feesCollected: false,
  satchelsDeployed: new Set(), sweeperGrants: new Map(), sweptFrom: new Map(),
});

/**
 * A brood as the mock keeps it. `unsettled` is per token symbol and is what
 * `earned` answers; a settle moves it to `overlay.delivered`.
 */
export type MockBrood = {
  activator: Address;
  tier: Tier;
  activatedAt: number;
  /** 0 while live. */
  expiredAt: number;
  toWallet: boolean;
};

export let overlay: Overlay = emptyOverlay();

/** A scenario change is a different world; the session's edits do not carry. */
subscribeScenario(() => { overlay = emptyOverlay(); });

/** When the scene was chosen: the 'imminent' launch is twenty seconds after it. */
let chosenAt = Math.floor(Date.now() / 1000);
subscribeScenario(() => { chosenAt = Math.floor(Date.now() / 1000); });

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
  // 'below-floor' keeps the count running (deposits still count) with nothing
  // to count down to, which is exactly the contract's reading of it.
  const deposits = 300 - untilBurn + overlay.deposits;

  const avians = afterSpending + overlay.swappedAvians > 0n
    ? afterSpending + overlay.swappedAvians : 0n;

  const approvals = {
    aviansToCollection: overlay.approvals.aviansToCollection
      ?? { none: 0n, partial: e18(50_000), sufficient: PRICE }[s.approvals],
    aviansToNest: overlay.approvals.aviansToNest
      ?? { none: 0n, partial: 0n, sufficient: e18(200_000) }[s.approvals],
    // The perch's BUY price is 110,000 and the named price 115,000, so
    // "sufficient" has to cover the dearer of the two or the ready state is
    // not actually ready.
    aviansToPerch: overlay.approvals.aviansToPerch
      ?? { none: 0n, partial: e18(50_000), sufficient: e18(115_000) }[s.approvals],
    birdsToPerch: overlay.approvals.birdsToPerch ?? s.approvals === 'sufficient',
  };

  // ── your birds, and their broods ────────────────────────────────────
  //
  // NOTHING LEAVES THE WALLET TO BROOD. Every bird below is held by YOU; the
  // scenario decides which of them carry a brood, and of what kind. An
  // "expired" brood is one whose activator is somebody else — the bird was
  // bought after its previous holder brooded it, and the split is theirs.
  const heldIdsBase = blank ? []
    // My Nest's holder (2026-09-27): the seven, and five more.
    : s.brood === 'twelve' || s.brood === 'twelve-quiet' ? [902, 1118, 1204, 1377, 1447, 1562, 1588, 211, 486, 733, 1019, 1305]
      : [902, 1118, 1204, 1377, 1447, 1562, 1588];
  const walletIds = [
    ...heldIdsBase,
    ...overlay.minted,
    ...overlay.boughtFromPerch,
  ]
    .filter((id) => !overlay.soldToPerch.includes(id))
    .filter((id) => !overlay.transferredAway.has(id));

  const now = Math.floor(Date.now() / 1000);
  const since: Record<number, number> = { 902: now - 14 * 86400, 1118: now - 6 * 86400, 1447: now - 2 * 86400, 1377: now - 21 * 86400, 1562: now - 9 * 86400 };
  const live = (id: TokenId, tier: Tier, toWallet = false): [TokenId, MockBrood] =>
    [id, { activator: YOU, tier, activatedAt: since[id] ?? now - 3600, expiredAt: 0, toWallet }];
  const expiredOf = (id: TokenId, tier: Tier): [TokenId, MockBrood] =>
    [id, { activator: NOT_YOU, tier, activatedAt: now - 9 * 86400, expiredAt: now - 2 * 86400, toWallet: false }];

  const broodPlan: [TokenId, MockBrood][] = blank ? [] : {
    none: [] as [TokenId, MockBrood][],
    brooding: [live(902, 3), live(1118, 2)],
    'brooding-to-wallet': [live(902, 3, true), live(1118, 2)],
    'expired-unsettled': [live(902, 3), expiredOf(1118, 2)],
    'settled-claimable': [live(902, 3)],
    mixed: [live(902, 3), live(1118, 2, true), expiredOf(1447, 1)],
    // Four brooding at mixed tiers, one of them to the wallet; the rest resting.
    twelve: [live(902, 3), live(1118, 2, true), live(1377, 1), live(1562, 2)],
    'twelve-quiet': [live(902, 3), live(1118, 2, true), live(1377, 1), live(1562, 2)],
    // Three at mixed tiers, one to the wallet: the Earning now panel's holder.
    three: [live(902, 3), live(1118, 2, true), live(1377, 1)],
  }[s.brood];

  const broods = new Map<TokenId, MockBrood>(broodPlan);
  for (const [id, b] of overlay.broods) {
    if (b === null) broods.delete(id);
    else broods.set(id, b);
  }
  // A bird that left the wallet this session took its brood with it, expired.
  for (const id of [...overlay.soldToPerch, ...overlay.transferredAway]) broods.delete(id);

  // The flywheel's first-day scene (2026-09-22) is launch day: no reward
  // token listed yet, so nothing streams and the landing page says so.
  const listed = s.rewards === 'none-listed' || s.flywheel === 'first-day' ? []
    // Earning now (2026-09-28): two streams only, a stock and AVIAN.
    : s.rewards === 'two-streams' || s.rewards === 'snap' ? REWARD_TOKENS.filter((t) => t.symbol === 'NVDA' || t.symbol === 'AVIAN')
      // Part 19: the Nest without AVIAN, while the staking contract still pays it.
      : s.stakers === 'unlisted' ? REWARD_TOKENS.filter((t) => t.symbol !== 'AVIAN')
        : REWARD_TOKENS;
  /** A token's place among all five, so its figures do not move when one is unlisted. */
  const place = (token: { symbol: string }) => REWARD_TOKENS.findIndex((t) => t.symbol === token.symbol);
  const pausedSymbols = s.rewards === 'all-paused' ? ['NVDA', 'SPY', 'SPCX', 'AAPL']
    : s.rewards === 'one-paused' ? ['AAPL'] : [];
  // Per-token accrual per unit of weight since a brood's last settle. Small,
  // so the split reads as figures rather than as noise.
  const perWeight = [41_200_000_000_000_00n, 118_300_000_000_000_00n, 6_700_000_000_000_00n, 93_100_000_000_000_00n, 2_750_000_000_000_000_000n];

  // The 1204 fixture: two birds and some ETH inside. Its NVDA is a reward
  // balance now, and comes from `satchelBalanceOf` with everything else's.
  const satchelHolds: SatchelHolding[] = blank || s.satchel === 'empty' ? []
    : s.satchel === 'holds-tokens'
      ? [{ kind: 'eth', amount: 31000000000000000n }]
      : [{ kind: 'avian', id: 311 }, { kind: 'avian', id: 977 },
        { kind: 'eth', amount: 31000000000000000n }];

  /** What a settle has delivered to an address, this session, in a token. */
  const deliveredTo = (address: Address, symbol: string): Amount =>
    overlay.delivered.get(address.toLowerCase())?.get(symbol) ?? 0n;

  // ── the sweeper ─────────────────────────────────────────────────────
  //
  // Which satchels are deployed, which have granted, and what each holds.
  // A grant needs a deployed satchel, so the scenario's grants deploy theirs.
  const grantPlan: TokenId[] = blank ? [] : {
    'none-granted': [] as TokenId[],
    'some-granted': [902, 1204],
    'all-granted': walletIds,
    'all-swept': walletIds,
    'read-fails': [] as TokenId[],
  }[s.sweeper];
  const satchelDeployed = (id: TokenId): boolean =>
    id === 1204 || id % 3 === 0 || grantPlan.includes(id) || overlay.satchelsDeployed.has(id);
  /** The CURRENT holder's grant: this session's word, else the scenario's. Never without a deployment. */
  const sweeperGranted = (id: TokenId): boolean =>
    satchelDeployed(id) && (overlay.sweeperGrants.get(id) ?? grantPlan.includes(id));

  /**
   * A satchel's balance in a reward token: what earlier settles left there
   * (the fixture — two settles' worth for a satchel-delivery brood, plus the
   * 1204 fixture's NVDA), plus this session's settles, less what a sweep
   * moved out. 'all-swept' is the fixture with the satchels emptied.
   */
  function satchelBalanceOf(id: TokenId, symbol: string): Amount {
    const satchel = satchelAddressOf(id);
    const i = REWARD_TOKENS.findIndex((t) => t.symbol === symbol);
    let base = 0n;
    if (!blank && s.sweeper !== 'all-swept' && i >= 0 && listed.length) {
      const b = broods.get(id);
      if (b && !b.toWallet) base += perWeight[i] * TIER_WEIGHT[b.tier] * 2n;
      if (id === 1204 && s.satchel !== 'empty' && symbol === 'NVDA') base += 12408800000000000000n;
    }
    const gross = base + deliveredTo(satchel, symbol);
    const out = overlay.sweptFrom.get(satchel.toLowerCase())?.get(symbol) ?? 0n;
    return gross > out ? gross - out : 0n;
  }

  /** Your own wallet's balance in a reward token: a fixture's NVDA, plus what settles and sweeps delivered. */
  const walletRewardBalanceOf = (symbol: string): Amount =>
    (symbol === 'NVDA' && !blank ? 3_100_000_000_000_000_000n : 0n) + deliveredTo(YOU, symbol);

  function broodSummary(id: TokenId): BroodSummary | null {
    const b = broods.get(id);
    if (!b) return null;
    return {
      activator: b.activator, tier: b.tier, activatedAt: b.activatedAt, expiredAt: b.expiredAt,
      live: b.expiredAt === 0,
      delivery: { to: b.toWallet ? b.activator : satchelAddressOf(id), toWallet: b.toWallet },
    };
  }

  function makeBird(id: TokenId, where: Bird['location']): Bird {
    // Bird #1204 is the one the 'recompose' axis touches: a swap changed its
    // headwear ('swapped'), or changed it and changed it back ('restored').
    const minted = traitsForId(id);
    const swapped = id === 1204 && s.recompose === 'swapped';
    const traits = swapped
      ? [minted[0], minted[1], minted[2], minted[3], minted[4], (minted[5] + 1) % COUNTS[5]] as unknown as TraitIndices
      : minted;
    const rows = id === 1204 && s.recompose !== 'as-minted'
      ? { isMintCombo: !swapped, recomposed: true }
      : { isMintCombo: true, recomposed: false };
    const nested = id === 1204 ? satchelHolds : [];
    const satchel = satchelAddressOf(id);
    // Settled reward sits in the satchel like anything else in it.
    const settledHere: SatchelHolding[] = REWARD_TOKENS
      .map((t) => ({ kind: 'erc20' as const, symbol: t.symbol, decimals: t.decimals, amount: satchelBalanceOf(id, t.symbol) }))
      .filter((h) => h.amount > 0n);
    return {
      id, traits, combo: packCombo(traits), location: where,
      satchel: { address: satchel, deployed: satchelDeployed(id), holds: [...nested, ...settledHere] },
      brood: broodSummary(id),
      ...rows,
    };
  }

  const yourBirds = walletIds.map((id) => makeBird(id, { where: 'wallet', owner: YOU }));

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

  // ── the nest ────────────────────────────────────────────────────────────
  const yourWeight = [...broods.values()]
    .filter((b) => b.activator === YOU && b.expiredAt === 0)
    .reduce((a, b) => a + TIER_WEIGHT[b.tier], 0n);
  const totalWeight = blank ? 0n : 4182n + [...broods.values()].reduce((a, b) => a + TIER_WEIGHT[b.tier], 0n);
  const totalBrooding = blank ? 0 : 611 + broods.size;

  // A live stream of 2,000 tokens a day per token, three days in, as the
  // chain keeps it: base units per second scaled by 1e18. A bird's share
  // (weight / totalWeight) visibly ticks between reads on the brood screen.
  // 'not-funded': listed, never funded, so nothing streams; 'one-ended':
  // SPY's stream two days past its end while the rest run.
  const unfunded = s.rewards === 'not-funded';
  // The Earning now scenes (2026-09-28): a fast AVIAN stream and a slow NVDA
  // one, so the wallet's AVIAN figure moves every second and its NVDA every
  // few. Everywhere else, 2,000 a day per token.
  const watching = s.rewards === 'two-streams' || s.rewards === 'one-ended' || s.rewards === 'not-funded' || s.rewards === 'snap';
  const perDayOf = (symbol: string) => (watching ? (symbol === 'AVIAN' ? 12_000 : symbol === 'NVDA' ? 18 : 2_000) : 2_000);
  const streams: RewardStream[] = listed.map((token) => ({
    token,
    rate: unfunded ? 0n : (e18(perDayOf(token.symbol)) * e18(1)) / 86400n,
    periodFinish: unfunded ? 0 : s.rewards === 'one-ended' && token.symbol === 'SPY' ? now - 2 * 86400 : now + 4 * 86400,
    escrowed: unfunded ? 0n : perWeight[place(token)] * 12_000n,
    totalPaid: unfunded ? 0n : perWeight[place(token)] * 3200n,
    totalReturned: perWeight[place(token)] * 140n,
  }));

  /**
   * What the stream has added to a live brood since the page loaded: the
   * chain's word grows as the screen's estimate does, so a read lands where
   * the estimate is. In 'snap' the chain says three times as much, so each
   * read visibly corrects the figure.
   */
  function accruedSince(b: MockBrood, symbol: string): Amount {
    if (b.expiredAt !== 0) return 0n;
    const st = streams.find((x) => x.token.symbol === symbol);
    if (!st || st.periodFinish === 0 || totalWeight === 0n) return 0n;
    const until = Math.min(now, st.periodFinish);
    if (until <= EPOCH) return 0n;
    const perSec = (st.rate * TIER_WEIGHT[b.tier]) / totalWeight / e18(1);
    return perSec * BigInt(until - EPOCH) * (s.rewards === 'snap' ? 3n : 1n);
  }

  /** `earned(id, token)` — what a settle would move for this bird, in total. */
  function unsettledOf(id: TokenId, symbol: string): Amount {
    const b = broods.get(id);
    if (!b || listed.length === 0) return 0n;
    if (!listed.some((t) => t.symbol === symbol)) return 0n;
    const gross = perWeight[place({ symbol })] * TIER_WEIGHT[b.tier] + accruedSince(b, symbol);
    const paid = overlay.settledUpTo.get(id)?.get(symbol) ?? 0n;
    return gross > paid ? gross - paid : 0n;
  }

  // An expired brood's split: the pre-expiry share is, in this mock, two
  // thirds of the accrual — the chain reads the curve; the mock reads a ratio.
  function pendingOf(id: TokenId, symbol: string): { toDestination: Amount; toActivator: Amount; returned: Amount } {
    const b = broods.get(id);
    const total = unsettledOf(id, symbol);
    if (!b || total === 0n) return { toDestination: 0n, toActivator: 0n, returned: 0n };
    if (b.expiredAt === 0) return { toDestination: total, toActivator: 0n, returned: 0n };
    const pre = (total * 2n) / 3n;
    return { toDestination: 0n, toActivator: pre, returned: total - pre };
  }

  // A held-back share: the wallet refused a delivery at an earlier settle.
  const claimable = new Map<string, Amount>();
  if (!blank && (s.brood === 'settled-claimable' || s.brood === 'mixed' || s.brood === 'twelve') && listed.length) {
    const sym = s.brood === 'mixed' ? 'AAPL' : 'NVDA';
    if (!overlay.claimed.has(sym)) claimable.set(sym, perWeight[listed.findIndex((t) => t.symbol === sym)] * 5n);
  }

  // ── First Light ─────────────────────────────────────────────────────────
  const launchAt = s.launch === 'before' ? now + 11560
    : s.launch === 'imminent' ? chosenAt + 20
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
      mintedBy: (s.paidMint === 'wallet-cap' ? WALLET_LIMIT : heldIdsBase.length)
        + overlay.minted.length,
      freeClaimed, isAllowlisted,
      proof: isAllowlisted ? (Array.from({ length: 12 }, (_, i) =>
        ('0x' + (i + 3).toString(16).padStart(2, '0').repeat(32)) as `0x${string}`)) : null,
      approvals,
    },
    yourBirds, broods, listed, pausedSymbols,
    unsettledOf, pendingOf, deliveredTo, claimable,
    satchelDeployed, sweeperGranted, satchelBalanceOf, walletRewardBalanceOf,
    perch: {
      base: PERCH_BASE, sell: PERCH_SELL, buyNext: PERCH_BUY_NEXT, buyNamed: PERCH_BUY_NAMED,
      poolSize: poolIds.length, lowestId: poolIds[0] ?? null, heldIds: poolIds,
      backingRequired, aviansHeld,
      operatorWhitelisted: s.operatorWhitelist === 'applied',
      burnEvery: BURN_EVERY,
      burnFloor: BURN_FLOOR,
      // Below the floor the burn is off: the countdown reads 0 and a
      // hundredth deposit is withheld. Derived exactly as the contract does.
      burnsActive: s.burnClock !== 'below-floor',
      deposits,
      depositsUntilNextBurn: s.burnClock === 'below-floor' ? 0 : BURN_EVERY - (deposits % BURN_EVERY),
    },
    nest: {
      tierCost: TIER_COST, totalWeight, yourWeight, totalBrooding,
      totalForwarded: e18(8_415_000), listed, streams,
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
 * The total buy fee in bps at a moment. 9000 at the first second, decaying
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
