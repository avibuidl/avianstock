// The shapes the UI reads. This file is the contract between this mock and
// whatever replaces it: a component that needs a new field asks for it here,
// not by reaching around the layer.

import type { TraitIndices } from '../art/render';

export type { TraitIndices };

export type Address = `0x${string}`;
export type Hex = `0x${string}`;
export type TokenId = number;                                  // 1..5555
export type CategoryId = 0 | 1 | 2 | 3 | 4 | 5;                // bg…headwear
export type Combo = bigint;                                    // packed uint48
export type Tier = 1 | 2 | 3;
export type UnixSeconds = number;

/** Every amount is base units, 18 decimals. There is no `number` amount. */
export type Amount = bigint;

/**
 * The chain the MOCK deployment pretends to be. Nothing real reads this: the
 * live chain id, the RPC URLs and the explorer all come from the active
 * deployment manifest, which is the only source for them, and `NETWORK` is
 * served from there. See `chain/manifest.ts`.
 */
export const CHAIN_ID = 4663;

export type NetworkDescription = {
  chainId: number;
  chainIdHex: `0x${string}`;
  chainName: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  rpcUrls: readonly string[];
  blockExplorerUrls: readonly string[];
};

// ─────────────────────────────────────────────────────── wallet and network

export type WalletInfo = { rdns: string; name: string; icon: string };

export type Connection =
  | { status: 'no-wallet' }
  | { status: 'disconnected'; wallets: WalletInfo[] }
  | { status: 'connecting'; wallet: WalletInfo }
  | { status: 'wrong-network'; wallet: WalletInfo; address: Address; chainId: number }
  | { status: 'unknown-network'; wallet: WalletInfo; address: Address; chainId: number }
  // `chainId` is whatever the manifest says. There is no literal type here any
  // more: the same build serves a local fork, the testnet and mainnet.
  | { status: 'connected'; wallet: WalletInfo; address: Address; chainId: number };

// ────────────────────────────────────────────────────────────── collection

export type CollectionState = {
  name: string;
  symbol: string;
  maxSupply: number;
  totalMinted: number;
  walletLimit: number;
  mintOpen: boolean;
  price: Amount;
  minPrice: Amount;
  paidRemaining: number;
  freeMintOpen: boolean;
  freeAllocation: number;
  freeMinted: number;
  reservedFree: number;
  freeAllocationReleased: boolean;
  freeReleaseAvailableAt: UnixSeconds | null;
  freeOpenSeconds: number;
  requiredBacking: Amount;
  /**
   * Burnt by the Perch, one per hundred deposits. `totalMinted` does not move
   * when one burns and ids are never reused, so `totalSupply` is
   * `totalMinted - burned` — anything comparing the two needs both.
   */
  burned: number;
  /**
   * ERC-2981, in basis points, from `royaltyInfo(0, 10_000)` — with that sale
   * price the answer IS the numerator. The owner can set it to anything up to
   * 100% and can delete it, so no page may state it as a constant.
   */
  royaltyBps: number;
};

export type Approvals = {
  aviansToCollection: Amount;
  aviansToNest: Amount;
  /**
   * BUYING from the perch is a `transferFrom` of AVIAN, so it needs an
   * allowance exactly as the mint does — a separate one, to a different
   * contract. Selling does not: that moves birds, which is `birdsToPerch`.
   */
  aviansToPerch: Amount;
  /**
   * The ONE bird approval, and it is to the perch: the batch sell pulls with
   * `transferFrom`. There is no bird approval to the Nest (2026-09-11) — a
   * bird broods where it is, and the Nest moves nothing.
   */
  birdsToPerch: boolean;
};

export type WalletState = {
  address: Address;
  eth: Amount;
  avians: Amount;
  mintedBy: number;
  freeClaimed: boolean;
  isAllowlisted: boolean;
  proof: Hex[] | null;
  /** null = `mintFree` would succeed right now. */
  freeMintStatus: ErrorName | null;
  approvals: Approvals;
};

// ──────────────────────────────────────────────────────────────────── birds

export type BirdLocation =
  | { where: 'wallet'; owner: Address }
  | { where: 'perch' }
  | { where: 'satchel'; hostId: TokenId }
  /**
   * Burnt by the Perch as the hundredth deposit. Not an error state and not a
   * missing bird: the id existed, its six choices are still taken forever, and
   * `tokenCombo` still answers — which is the only reason a page for one can
   * be drawn at all, since `ownerOf`, `tokenURI` and `traitsOf` all revert.
   */
  | { where: 'burnt' };

export type SatchelHolding =
  | { kind: 'eth'; amount: Amount }
  | { kind: 'erc20'; symbol: string; decimals: number; amount: Amount }
  | { kind: 'avian'; id: TokenId }
  | { kind: 'nft'; collection: string; id: string };

/** Where a brood's rewards are delivered on every settle. */
export type Delivery = {
  /** The satchel, or the activator's wallet. */
  to: Address;
  toWallet: boolean;
};

/**
 * A bird's brood, as `broodOf` + `isBrooding` + `deliveryOf` describe it.
 *
 * BROODING IS NOT CUSTODIAL (2026-09-11): the bird stays in its holder's
 * wallet, so this is a fact ABOUT a bird rather than a place it is. `live` is
 * the contract's own `isBrooding`, which also covers the documented fallback —
 * a bird no longer with its activator that the hook somehow missed is expired
 * in the contract's eyes whether or not `expiredAt` was stamped — so every
 * decision reads `live`, never the stamp.
 */
export type BroodSummary = {
  activator: Address;
  tier: Tier;
  activatedAt: UnixSeconds;
  /** The second the bird changed hands, or 0. A stamp, not the verdict. */
  expiredAt: UnixSeconds;
  live: boolean;
  delivery: Delivery;
};

export type Bird = {
  id: TokenId;
  traits: TraitIndices;
  combo: Combo;
  location: BirdLocation;
  satchel: { address: Address; deployed: boolean; holds: SatchelHolding[] };
  /** Null for no brood. Read from the Nest in the same block as the rest. */
  brood: BroodSummary | null;
  /**
   * The brood's per-token lines — unsettled, settled, pending. Filled by the
   * single-bird read (`getBird`) for the bird page; the gallery and My Birds
   * leave it out (My Birds gets them from `getBrood` instead).
   */
  broodLines?: BroodTokenLine[];
  /**
   * TWO ANSWERS TO TWO QUESTIONS (2026-09-21), listed after the six traits
   * wherever the site lists them, in the chain's order. `isMintCombo`: the
   * traits are exactly what the bird was minted with, right now.
   * `recomposed`: a trait-market swap has touched the bird at some point,
   * for good. A never-swapped bird is Yes / No; a swapped one No / Yes; one
   * swapped and later restored is Yes / Yes; No / No cannot happen. Filled by
   * the single-bird read, in the same pinned batch as the traits; absent for
   * a burnt bird, whose reads revert.
   */
  isMintCombo?: boolean;
  recomposed?: boolean;
};

// ──────────────────────────────────────────────────────────────── the perch

export type PerchState = {
  base: Amount;
  sell: Amount;                    // 90,000
  buyNext: Amount;                 // 110,000
  buyNamed: Amount;                // 115,000
  poolSize: number;
  lowestId: TokenId | null;
  heldIds: TokenId[];
  backingRequired: Amount;
  aviansHeld: Amount;
  /** false ⇒ the batch route is refused and the site falls back to the push route. */
  operatorWhitelisted: boolean;
  /** `BURN_EVERY`: one bird in this many deposits is burnt. 100. */
  burnEvery: number;
  /**
   * `BURN_FLOOR`: the burn stops at this many living birds (2,222 on the
   * real deployment). While `burnsActive` is false, `depositsUntilNextBurn`
   * reads 0 — "no burns until the flock passes the floor", NEVER "the next
   * sale burns" — and a hundredth arriving is withheld, not burnt.
   */
  burnFloor: number;
  burnsActive: boolean;
  /** Paid deposits so far — pull and push, resales included, never a register. */
  deposits: number;
  /**
   * How many more paid deposits until one burns. The sell card's countdown, and
   * a number that anyone else's sale can move between reading it and signing —
   * which is why the warning built on it says "likely", not "will".
   */
  depositsUntilNextBurn: number;
};

// ──────────────────────────────────────────────────────────────── the roost

export type RewardToken = { address: Address; symbol: string; decimals: number };

/**
 * WHICH TOKENS EARN, AND IN WHAT PROPORTION — two facts, from two contracts.
 *
 * `listed` is TheNest's `listedRewardTokens()`: the tokens it will accept a
 * stream in at all. `parts` is the Treasury's `targets()`: how a conversion
 * splits its output between them. Neither is a constant — both are owner-set,
 * and they are not the same list. A token can be listed and hold no share (it
 * simply never receives), and a target can be retired out of the listing, which
 * makes EVERY conversion revert with `TargetNotListed` until the owner fixes
 * one side or the other.
 *
 * The site said "equal parts" for months. It was never read from anywhere.
 */
export type RewardSplitPart = { address: Address; weightBps: number };

export type RewardSplit = {
  listed: RewardToken[];
  /** Empty ⇒ `NoTargets()`: nothing can convert until the owner sets them. */
  parts: RewardSplitPart[];
};

/**
 * ONE STOCK TOKEN'S PRICE, IN ETH, off its Uniswap v3 pool against WETH.
 *
 * A mid-price — the pool's own `sqrtPriceX96` turned into ETH per whole token,
 * no fee, no size — which is why it is a figure to watch and not a quote to
 * act on. Never USD: nothing the site is allowed to reach knows what ETH is
 * worth in dollars, and a made-up figure would be worse than none.
 */
export type TokenPrice = {
  address: Address;
  symbol: string;
  decimals: number;
  /** ETH per one whole token, as 18-decimal base units. */
  ethPerToken: Amount;
  /** The pool it was read from — a v3 pool's address, or a v4 pool's id — and its fee tier: for the log, not the screen. */
  pool: string;
  fee: number;
  /** Where it was read: a v3 pool of the Treasury's venue, or (2026-09-22) the v4 pool the Treasury's route names. */
  venue: 'v3' | 'v4';
};

/**
 * The ticker's one read: every listed reward token that had a pool with
 * something in it at that block. A token whose pool is missing, empty, or
 * would not answer is simply not in the list — never in it as zero.
 */
export type PriceBoard = {
  blockNumber: bigint;
  /** The block's own clock, so "N seconds ago" is the chain's word. */
  timestamp: UnixSeconds;
  prices: TokenPrice[];
};

/** One listed reward token's stream, as the Nest stores it. Per token, not per wallet. */
export type RewardStream = {
  token: RewardToken;
  rate: Amount;
  periodFinish: UnixSeconds;
  escrowed: Amount;
  totalPaid: Amount;
  totalReturned: Amount;
};

/** One reward token's line on one brooding bird. */
export type BroodTokenLine = {
  token: RewardToken;
  /** `earned(id, t)`: accrued and not yet delivered. Costs no gas to show. */
  unsettled: Amount;
  /**
   * `balanceOf(delivery.to)`: what has been delivered and sits there. The
   * satchel's balance for a satchel brood; the holder's own wallet balance
   * for a wallet brood — which is everything that wallet holds in the token,
   * not only what brooding put there. Read this block, never remembered.
   */
  settled: Amount;
  /** `pending(id, t)`: where a settle would send `unsettled` right now. */
  pending: { toDestination: Amount; toActivator: Amount; returned: Amount };
};

/** A held bird with whatever brood it carries, and its reward lines. */
export type BroodEntry = {
  bird: Bird;
  brood: BroodSummary | null;
  /** Empty when nothing is listed, or the bird has no brood. */
  lines: BroodTokenLine[];
};

/** One thing a settle would move, from `pending` — the receipt in advance. */
export type SettleMove = {
  id: TokenId;
  token: RewardToken;
  amount: Amount;
  /** A brooding bird's accrual to its destination; an expired brood's split. */
  kind: 'to-satchel' | 'to-wallet' | 'to-activator' | 'returned';
  to: Address;
};

export type SettlePreview = {
  /** The ids that have a brood at all; the rest of the list is skipped. */
  ids: TokenId[];
  moves: SettleMove[];
};

/** What the Nest said, read off a receipt. The same reader serves every write. */
export type NestEvents = {
  brooded: { id: TokenId; tier: Tier; paid: Amount; toWallet: boolean }[];
  upgraded: { id: TokenId; fromTier: Tier; toTier: Tier; paid: Amount }[];
  redirected: { id: TokenId; toWallet: boolean }[];
  /** The hook fired: a brooding bird changed hands and its brood ended. */
  expired: { id: TokenId; activator: Address; at: number }[];
  /** A brooding bird's accrual, delivered to its destination. */
  settled: { id: TokenId; token: Address; to: Address; amount: Amount }[];
  /** An expired brood's split: to the activator's wallet, and back to the stream. */
  expirySettled: { id: TokenId; activator: Address; token: Address; toActivator: Amount; returned: Amount }[];
  /** A post-expiry share going back. `folded` ⇒ into the running stream; else released as surplus. */
  returned: { token: Address; amount: Amount; folded: boolean }[];
  /**
   * A delivery the token refused. TWO SHAPES: `id === 0` is an activator's
   * pre-sale share, now in `claimable` — "held for you; claim it". `id !== 0`
   * is a brooding bird's delivery (to its satchel, or to its holder's wallet)
   * — still owed to the bird, delivered on a later settle. Nothing is lost
   * either way.
   */
  held: { id: TokenId; beneficiary: Address; token: Address; amount: Amount }[];
  /** A `claim`, or an expired brood's share paid straight to the activator. */
  paid: { user: Address; token: Address; amount: Amount }[];
  /** The collection's hook into the Nest failed. Should never appear. */
  hookFailed: TokenId[];
};

export type BroodState = {
  tierCost: Record<Tier, Amount>;  // 10,000 / 30,000 / 50,000 (2026-09-22)
  totalWeight: bigint;
  /** Broods on the books, expired-unsettled included. */
  totalBrooding: number;
  /** AVIAN paid on to the Roost by tier purchases and upgrades, ever (`totalForwarded`). */
  totalForwarded: Amount;
  listed: RewardToken[];           // [] ⇒ nothing streams, and that is not a bug
  streams: RewardStream[];
  /** The block's own clock at the read; the screen carries it forward. */
  chainNow: UnixSeconds;
  /** Every bird the connected wallet holds, brooding or not. */
  yours: BroodEntry[];
  /**
   * `claimable(you, t)` — an expired brood's pre-sale share that your wallet
   * refused when it was settled. Nonzero entries only. Collected with
   * `claim(t)`.
   */
  claimable: { token: RewardToken; amount: Amount }[];
};

// ────────────────────────────────────────────────────────────── the sweeper
//
// HANDOVER section 5, "Collecting from many birds at once". A satchel obeys
// only the bird's owner, so nothing can move its stock out for them. The
// Sweeper is the one exception a holder can choose to make, satchel by
// satchel, and from then on one call moves every listed reward token out of
// every granted satchel into their own wallet. The grant is keyed by the
// bird's CURRENT owner, so it dies with a sale.

/**
 * One held bird's standing with the Sweeper: `status(id)`, and what
 * `sweepable` read of its satchel. `amounts` is index-aligned with
 * `SweepState.tokens` and is read whether or not the bird is granted — a
 * satchel with stock in it and no grant is exactly the bird the panel is for.
 */
export type SweepBird = {
  id: TokenId;
  satchel: Address;
  deployed: boolean;
  /** The CURRENT holder's grant. False whenever the satchel is not deployed. */
  granted: boolean;
  amounts: Amount[];
};

export type SweepState = {
  /** The listed reward tokens, then any the holder added by address. */
  tokens: RewardToken[];
  /** Every bird the wallet holds, in id order. */
  birds: SweepBird[];
  /**
   * Whether the panel is worth drawing at all: a granted bird, or a satchel
   * holding something in a LISTED token. A holder whose broods all deliver
   * to the wallet has neither and should see no wall of setup.
   */
  relevant: boolean;
};

/** A sweep's receipt, read off `Swept` and `SweepSkipped`. */
export type SweepResult = {
  swept: { id: TokenId; token: Address; to: Address; amount: Amount }[];
  /**
   * `token` null: the whole bird was passed over — its satchel is not
   * deployed or has not granted. Otherwise that token would not move for
   * that bird (paused, or the wallet is on its blocklist); `reason` is the
   * revert data, empty when there was none. Never a failure: the stock is
   * still in the bird.
   */
  skipped: { id: TokenId; token: Address | null; reason: Hex }[];
  /** Per token, what reached the wallet: the `Swept` rows summed. */
  totals: { token: Address; amount: Amount }[];
  hash: Hex;
};

// ────────────────────────────────────────────────────────────── first light

export type LaunchState = {
  launchAt: UnixSeconds;
  isLaunched: boolean;
  windowSeconds: number;
  windowEndsAt: UnixSeconds;
  currentBuyFeeBps: number;
  sellFeeBps: number;
  maxBuyPerTx: Amount;
  feeBps: number;
  maxExtraFeeBps: number;
};

export type VaultState = {
  tokenId: number;
  unlockAt: UnixSeconds;
  isLocked: boolean;
  positionLiquidity: bigint;
  lockSeconds: number;
};

export type TreasuryRow = {
  currency: Address | null;        // null = native ETH
  symbol: string;
  decimals: number;
  /**
   * `cumulativeIn` — everything that has EVER arrived. The contract derives it
   * as `balance + adminClaimed + convertedOut`, so this and `balance` differ by
   * exactly what has been claimed or converted, which is what the card says
   * under the table. (`convertedOut` itself is not read: nothing renders it.)
   */
  cumulativeIn: Amount;
  /** What is actually here right now: `eth_getBalance`, or `balanceOf`. */
  balance: Amount;
  /** The admin's outstanding claim. Shown to the owner only, as an AMOUNT. */
  claimable: Amount;
  /**
   * What a conversion may touch: the balance less the admin's outstanding
   * claim, capped per call. Already net of everything the admin is owed, so it
   * needs no share language to be truthful — and it is the ONLY thing that
   * decides whether a convert button appears on this row.
   */
  convertible: Amount;
};

/**
 * The card needs more than rows: whether a conversion can run at all is
 * Treasury-wide, not per currency, and the first five of the contract's seven
 * guards are answered by these figures rather than by a simulation.
 */
/**
 * THE ROOST'S TENTH (2026-09-22). The third share of the Treasury's ETH:
 * anyone may spend it on AVIAN from the launch pool and the whole of what it
 * buys goes to the Roost. Its own daily clock, under the same configuration
 * as a conversion. Null on a deployment whose Treasury predates it: the card
 * then shows the two shares it has, and says which deployment it is reading.
 */
export type RoostBuy = {
  /** ETH the next `buyForRoost()` spends: the tenth less what buys spent, capped as a conversion is. */
  buyable: Amount;
  /** ETH ever spent on this leg, and the AVIAN it ever delivered to the Roost. */
  everSpent: Amount;
  everBought: Amount;
  /** This leg's own clock. 0 before the first buy, and then no cooldown to wait out. */
  lastBuyAt: UnixSeconds;
  nextAllowedAt: UnixSeconds;
  /** The three shares as the contract states them: 2000 / 7000 / 1000. */
  sharesBps: { admin: number; rewards: number; roost: number };
};

/**
 * The AVIAN pool's history as the Treasury keeps it (2026-09-24): the two
 * readings, the window a buy averages over, how long a reading stays usable,
 * and what `roostMeanTick()` answered when it was tried. `refusal` is the
 * name of its revert, or null when it answered — which is the one thing that
 * decides whether the Roost's buy can be priced at all. Null on a Treasury
 * that predates the readings.
 */
export type Readings = {
  /** `TWAP_WINDOW()`: 1,800 seconds. A reading is usable once it is this old. */
  window: number;
  /** `READING_MAX_AGE()`: a week. Past it the readings have expired. */
  maxAge: number;
  /** `lastReading().at` and `prevReading().at`; 0 when never taken. */
  lastAt: UnixSeconds;
  prevAt: UnixSeconds;
  /** The name `roostMeanTick()` reverted with, or null when it answered. */
  refusal: string | null;
};

/**
 * When the two permissionless buttons open (2026-09-24): `conversionsOpenAt()`
 * and the owner's flag, which is a pause now rather than a switch. Null on a
 * Treasury that predates the clock, where `enabled` still means "switched on".
 */
export type Opening = {
  /** The second both buttons open; 0 while the Treasury does not know the launch time. */
  openAt: UnixSeconds;
  /** `conversionConfig().enabled`: true unless the owner has paused. */
  enabled: boolean;
  /** `conversionsOpen()` at the block read: the chain's own answer. */
  open: boolean;
};

export type TreasuryState = {
  rows: TreasuryRow[];
  /**
   * The block's own clock. Both cooldowns are chain timestamps, so the card
   * counts down from this carried forward by the wall clock rather than from
   * the machine's own time: on a fork an hour ahead the old arithmetic said
   * "ready in 25 hours" for ever.
   */
  chainNow: UnixSeconds;
  /** The Roost's tenth, or null on a Treasury that predates it. */
  roost: RoostBuy | null;
  /** The AVIAN pool's readings, or null on a Treasury that predates them. */
  readings: Readings | null;
  /** When both buttons open, or null on a Treasury that predates the clock. */
  opening: Opening | null;
  conversion: {
    enabled: boolean;
    /** Seconds between conversions of ANY currency — one clock, shared. */
    minInterval: number;
    lastConversionAt: UnixSeconds;
    /** `lastConversionAt + minInterval`, or 0 when nothing has converted yet. */
    nextAllowedAt: UnixSeconds;
    maxPerCallBps: number;
  };
  /** Guard 3: a stream cannot start while nobody has staked. */
  totalWeight: bigint;
  /** Guard 4. */
  rewardTokenCount: number;
  /** Guard 5. */
  targetCount: number;
};

// ────────────────────────────────────────────────────────────── the owner

/**
 * The five contracts the panel may write to. There is no sixth, and the type
 * is what says so: every admin write names one of these and takes its address
 * from the manifest.
 */
export type AdminContract =
  | 'AvianStock' | 'ThePerch' | 'TheNest' | 'Treasury' | 'LiquidityVault';

export type OwnershipRow = {
  contract: AdminContract;
  address: Address;
  owner: Address;
  /** `address(0)` means nothing is pending, and arrives here as null. */
  pendingOwner: Address | null;
};

export type AdminCollection = {
  mintOpen: boolean;
  freeMintOpen: boolean;
  price: Amount;
  minPrice: Amount;
  allowlistRoot: Hex;
  royalty: { receiver: Address; bps: number };
  renderer: Address;
  rendererLocked: boolean;
  transferValidator: Address | null;
  transferValidatorLocked: boolean;
  freeMinted: number;
  freeAllocation: number;
  freeAllocationReleased: boolean;
  /** 0 while the free mint has never opened, so there is no clock yet. */
  freeReleaseAvailableAt: UnixSeconds;
  freeReleaseDelay: number;
  /**
   * What `rescue` will not let out. The collection must keep
   * `requiredBacking()` in AVIAN behind the free mint, so only the excess is
   * sweepable — and the panel shows all three figures rather than one.
   */
  aviansHeld: Amount;
  requiredBacking: Amount;
  ethHeld: Amount;
};

export type AdminPerch = { feeRecipient: Address };

/**
 * THE ROOST, on the owner's panel (2026-09-18). The two addresses that must
 * both be the Roost — the Perch's fee recipient and the Nest's cost sink — and
 * the admin's tenth, claimable by the Nest's owner.
 */
export type AdminRoost = {
  roost: Address;
  /** `nest.costSink()`. Bound at construction; owner-settable only to a Roost for this Nest. */
  costSink: Address;
  /** The admin's 10%, allocated and unclaimed. */
  adminClaimable: Amount;
  adminClaimed: Amount;
  /** `roost.admin()`: the Nest's owner, read live. */
  admin: Address;
};

/** One reward token, as the owner has to see it: listed, escrowed, spare. */
export type AdminRewardToken = {
  token: RewardToken;
  listed: boolean;
  everListed: boolean;
  /** Promised to stakers. Untouchable. */
  escrowed: Amount;
  /** Actually in the contract. */
  held: Amount;
  /** `held - escrowed`, and the only thing `restream` can re-schedule. */
  surplus: Amount;
  periodFinish: UnixSeconds;
};

export type AdminNest = {
  rewards: AdminRewardToken[];
  /**
   * The length of `_snapshotTokens` — what the cap actually counts, and the
   * one figure on this panel with no getter of its own. Read by simulating
   * `claimAll`, whose first return value IS that array. Null when the
   * simulation could not be made, and never a zero.
   */
  /** `rewardTokenCount()`. The cap counts ever-listed, which nothing returns. */
  listedCount: number;
  maxRewardTokens: number;
  minDuration: number;
  maxDuration: number;
  totalWeight: bigint;
  /** Broods on the books, expired-unsettled included. */
  totalBrooding: number;
};

export type AdminTargetRow = { token: Address; weightBps: number };

/**
 * One currency-to-target pair, as the conversion sees it. `venue` is the
 * contract's own `routeVenue`: 0 none, 1 a v4 route, 2 a v3 route. A v3 route
 * takes precedence over a v4 one, which is not obvious from either setter, so
 * the panel shows which is actually in effect rather than which was set last.
 */
export type AdminPairRow = {
  currency: Address | null;
  currencySymbol: string;
  target: Address;
  targetSymbol: string;
  venue: number;
  /**
   * `priceSource`: 0 no route, 1 a written floor, 2 the v3 pool's
   * thirty-minute mean, 3 the AVIAN pool's readings (2026-09-24). Only a 1
   * consults a floor, so only a 1 is offered the floor form.
   */
  source: number;
  floorPriceE18: Amount;
  floorSetAt: UnixSeconds;
};

export type V4Hop = { currencyOut: Address; fee: number; tickSpacing: number; hooks: Address };
export type V3Hop = { pool: Address; tokenOut: Address };
export type AdminRoute = { venue: number; v4: V4Hop[]; v3: V3Hop[] };

export type AdminTreasury = {
  rows: TreasuryRow[];
  /** The Roost's tenth (2026-09-22), or null on a Treasury that predates it. */
  roost: RoostBuy | null;
  conversion: {
    enabled: boolean;
    minInterval: number;
    maxPerCallBps: number;
    slippageBps: number;
    streamDuration: number;
    maxPriceAge: number;
  };
  /** Every bound the contract publishes, so no field validates against a literal. */
  bounds: {
    minIntervalFloor: number;
    maxPerCallBpsCap: number;
    slippageBpsCap: number;
    minPriceAge: number;
    maxPriceAge: number;
    maxTargets: number;
    maxHops: number;
    minStreamDuration: number;
    maxStreamDuration: number;
  };
  targets: AdminTargetRow[];
  /** Every currency crossed with every target: the venue, the source and the floor price. */
  pairs: AdminPairRow[];
  /** The AVIAN pool's readings, or null on a Treasury that predates them. */
  readings: Readings | null;
  /** When both buttons open, or null on a Treasury that predates the clock. */
  opening: Opening | null;
  priceKeeper: Address | null;
  maxKeeperDropBps: number;
};

export type AdminVault = {
  tokenId: number;
  unlockAt: UnixSeconds;
  isLocked: boolean;
  positionLiquidity: bigint;
  lockSeconds: number;
  /**
   * Accrued by the position and not yet collected, per currency, as
   * `collectFees` will pay them. Derived from the chain's own fee-growth
   * accounting, not from events: the difference between the pool's current
   * fee growth inside the position's range and the value the position last
   * recorded, times the position's liquidity. Both zero ⇒ nothing to collect.
   */
  pendingFees: { eth: Amount; avians: Amount };
};

/** What the admin's membership check says about one address. */
export type AllowlistCheck = {
  address: Address;
  /** The proof used — from the deployment's proofs file, or empty. */
  proofLength: number;
  verdict: 'manual' | 'merkle' | 'not-listed' | 'claimed';
  /**
   * `freeMintStatus` decoded, or null when it is zero — exactly what the
   * collector would be refused with at the free door right now.
   */
  freeMintStatus: ErrorName | null;
};

/**
 * Everything the panel reads, at one block.
 *
 * `isOwner` and `isPendingOwner` are here because the screen needs them to
 * decide what to draw, not because they decide anything else: hiding a control
 * is presentation, and `onlyOwner` on each contract is what refuses a stranger.
 */
export type AdminState = {
  you: Address | null;
  ownership: OwnershipRow[];
  /** False when the five do not name the same owner — a banner, not a row. */
  ownersAgree: boolean;
  isOwner: boolean;
  isPendingOwner: boolean;
  collection: AdminCollection;
  perch: AdminPerch;
  nest: AdminNest;
  treasury: AdminTreasury;
  roost: AdminRoost;
  /** Null when this deployment has no pool yet, which a manifest may say. */
  vault: AdminVault | null;
};

/**
 * Whether one address is the owner, or an incoming one, of any of the five.
 *
 * Ten calls in one multicall, and the ONLY thing the header needs to decide
 * whether to draw the owner's link. Reading the whole panel to answer that
 * would make every visitor on every page pay for a screen almost none of them
 * can use.
 */
export type OwnerStatus = { isOwner: boolean; isPendingOwner: boolean };

/**
 * A token nobody vetted, looked up on demand for the sweeps.
 *
 * Everything in here came from a contract that is not ours, so: the symbol is
 * clamped and rendered as a text node, and `decimals` is null when it could
 * not be read — never defaulted to 18, because a wrong scale makes a large
 * sweep look small. When it is not 18 the panel shows the raw base units beside
 * the formatted figure and says which is which.
 */
export type ForeignToken = {
  address: Address;
  symbol: string;
  decimals: number | null;
  holdings: {
    holder: AdminContract;
    balance: Amount;
    /** Why this holder would refuse to sweep it, in a sentence, or null. */
    refusal: string | null;
  }[];
  /** What `claimAdmin` would pay out in it, or null where it is not a currency. */
  treasuryClaimable: Amount | null;
};

/**
 * One composed `configureTransferValidator` call, before it is encoded.
 *
 * A closed union rather than a bytes field: the panel builds the calldata from
 * named inputs and shows it read-only before anything is signed. There is no
 * free-text hex anywhere, for two reasons — hex gives the owner no preview of
 * what they are about to do, and "paste this hex into your admin panel" is the
 * most reusable phishing instruction this site could ship.
 */
export type ValidatorOperation =
  | { kind: 'createList'; name: string }
  | { kind: 'applyListToCollection'; listId: bigint }
  | { kind: 'setSecurityLevel'; level: number }
  | { kind: 'setTokenType' }
  | { kind: 'addToWhitelist'; listId: bigint; accounts: Address[] }
  | { kind: 'removeFromWhitelist'; listId: bigint; accounts: Address[] }
  | { kind: 'addToAuthorizers'; listId: bigint; accounts: Address[] }
  | { kind: 'removeFromAuthorizers'; listId: bigint; accounts: Address[] };

// ─────────────────────────────────────────────────────── trading AVIAN

/**
 * The pool, before anything is typed into the form.
 *
 * Every figure comes off the hook or a balance; nothing here is a constant in
 * the front end. `buyFeeBps` in particular is a moving number inside the
 * launch window and has to be re-read, not remembered.
 */
export type SwapState = {
  /**
   * The chain's clock at the read — the block the rest of this was pinned
   * to. The window, the fee and the countdown are all functions of the
   * CHAIN's time, and a machine whose clock is off (or a chain that runs
   * ahead of it, as a fork does) would otherwise show the wrong second.
   */
  chainNow: UnixSeconds;
  launchAt: UnixSeconds;
  isLaunched: boolean;
  windowSeconds: number;
  windowEndsAt: UnixSeconds;
  /** `FEE_BPS` plus the decaying launch extra. Falls every second in the window: 9000 at its first second (2026-09-21). */
  buyFeeBps: number;
  /** `FEE_BPS`: the buy fee's floor, what a buy pays after the window. Never changes. */
  feeBps: number;
  /** `SELL_FEE_BPS`: 2% since 2026-09-17. Never decays, never changes. */
  sellFeeBps: number;
  /** The LP's cut, converted from Uniswap's hundredths-of-a-bip into bps. */
  poolFeeBps: number;
  /** In AVIAN OUT, and only inside the window. */
  maxBuyPerTx: Amount;
  ethBalance: Amount;
  aviansBalance: Amount;
  /** AVIAN -> Permit2, the ordinary ERC-20 allowance. Step one of a sell. */
  allowanceToPermit2: Amount;
  /** Permit2 -> the router. Step two. */
  permit2ToRouter: Amount;
  /** An expired Permit2 allowance behaves like none at all, so it is shown. */
  permit2Expiration: UnixSeconds;
};

/**
 * One quote, and where the difference went.
 *
 * `amountOut` is NET of every fee below — the quoter runs the real swap, hook
 * included. The fee fields explain the gap between what goes in and what comes
 * out; they are not further deductions from `amountOut`, and any copy that
 * implies they are is wrong.
 */
export type SwapQuote = {
  direction: 'buy' | 'sell';
  amountIn: Amount;
  /** An estimate. The price moves and, in the window, so does the fee. */
  amountOut: Amount;
  /** `amountOut` less slippage — what the transaction will actually accept. */
  minOut: Amount;
  slippageBps: number;
  /** The hook's total, in bps: 1% plus the launch extra on a buy. */
  hookBps: number;
  /** That total, in ETH. Exact — it is a pure function of the ETH side. */
  hookFeeEth: Amount;
  poolFeeBps: number;
  poolFee: Amount;
  /** The decaying part alone, for the line that has to be shown live. */
  launchExtraBps: number;
  at: UnixSeconds;
};

export type Deployment = {
  addresses: Record<string, Address>;
  thirdParty: Record<string, Address>;
};

/*
  `crossChecks` used to be the third field, and the Contracts screen drew it.
  Nothing renders it now, and the checks themselves did not go anywhere:
  `runStartupChecks` still runs them and `main.tsx` still refuses to mount the
  app on a single failure, which is a stronger place for them than a panel.

  It is deleted rather than kept unread. The mock's copy was eleven claims typed
  out by hand to match the chain's, and it silently went stale through a rename
  — a list nobody can see could never be caught doing that again.
*/

// ──────────────────────────────────────────────────────── writes and errors

export type TxPhase = 'signing' | 'pending' | 'confirmed';
export type OnPhase = (phase: TxPhase, hash?: Hex) => void;

export type PermitSignature = {
  deadline: UnixSeconds; v: number; r: Hex; s: Hex; value: Amount;
};

/**
 * The receipt for a sale, read off the logs rather than predicted.
 *
 * `burnt` is empty on almost every sale. When it is not, the birds in it were
 * the hundredth deposit and were burnt in the same transaction — the seller was
 * still paid in full for them, which is why this is a result and not an error.
 */
export type SellResult = {
  paid: Amount;
  burnt: TokenId[];
  /**
   * Hundredth deposits that arrived at or below the burn floor and were kept
   * (`BurnWithheld`): the bird stays in the pool and the seller is paid the
   * same. Reported beside `burnt` as "kept", never as an error.
   */
  withheld: TokenId[];
  /** The broods this sale ended (`Expired`, from the collection's hook). */
  expired: TokenId[];
  /** The hook failed for these ids — a brood that should have expired did not. Never expected. */
  hookFailed: TokenId[];
};

export type TransferSafety =
  | { ok: true }
  | { ok: false; reason: 'own-account' | 'cycle' | 'collection-address' | 'depth-cap'; path: TokenId[] };

export type ErrorName =
  // mint
  | 'MintClosed' | 'InsufficientPayment' | 'SoldOut' | 'WalletCapReached'
  | 'InvalidTrait' | 'ComboTaken' | 'EmptyBatch' | 'ERC721InvalidReceiver'
  // free mint
  | 'FreeMintClosed' | 'FreeMintAlreadyClaimed' | 'NotAllowlisted'
  | 'FreeAllocationExhausted' | 'FreeMintUnbacked'
  // the perch
  | 'EmptyList' | 'InsufficientPool' | 'NotHeld' | 'AlreadyHeld' | 'NotOwnedByPool'
  | 'MintIsNotASale' | 'NotTheCollection' | 'PoolCorrupt' | 'Reentrancy'
  // the treasury
  | 'ConversionDisabled' | 'CoolingDown' | 'NoRewardTokens' | 'NoTargets'
  | 'NothingToConvert' | 'NothingClaimable' | 'TargetNotListed' | 'ZeroSplitPart'
  // the Roost's tenth (2026-09-22)
  | 'NothingToBuyForRoost' | 'NoRoost'
  | 'NoFloorPrice' | 'FloorPriceStale' | 'FloorPriceTooFresh' | 'FloorPriceDropTooLarge' | 'SlippageTooHigh'
  // priced by the pools' own history (2026-09-24)
  | 'PriceUnsettled' | 'NoUsableReading' | 'ReadingTooYoung' | 'NoTickOracle'
  // open by the clock (2026-09-24)
  | 'LaunchUnknown' | 'ConversionsNotOpen'
  // the council (2026-09-24)
  | 'NotCouncil'
  // the owner's seat, two paths (part 18)
  | 'AcceptOwnershipDisabled' | 'NotTheOwnersProposal' | 'OwnerNotSilent'
  | 'MinOutIsZero' | 'NoRoute' | 'ConversionProducedNothing' | 'OwnableUnauthorizedAccount'
  // the nest (brooding, 2026-09-11). NotTheCollection is the perch's too.
  | 'LengthMismatch' | 'InvalidTier' | 'NotTheOwner' | 'AlreadyBrooding' | 'NotBrooding'
  | 'BroodExpired' | 'TierNotHigher' | 'SameDelivery' | 'NotHeldHere'
  | 'NeverListed' | 'NotListed' | 'NoLiveStream' | 'DonationIsZero' | 'NothingBrooding'
  | 'NotAFunder'
  // shared, Solady
  | 'TransferFailed' | 'TransferFromFailed'
  // the token
  | 'InsufficientBalance' | 'InsufficientAllowance' | 'InvalidPermit' | 'PermitExpired'
  // moving a bird
  | 'TransferToOwnAccount' | 'CallerMustBeWhitelisted'
  /** AccountV3's: `setPermissions` on a satchel by someone who is not the bird's holder. */
  | 'NotAuthorized'
  | 'ERC721InsufficientApproval' | 'ERC721IncorrectOwner' | 'ERC721NonexistentToken'
  // the pool
  | 'NotLaunched' | 'BuyTooLarge' | 'PartialFill' | 'NothingTraded'
  | 'OnlyThePerch' | 'NotHeldByThePerch'
  | 'WrongPool' | 'NotThePoolManager' | 'ExecutionFailed' | 'V4TooLittleReceived'
  | 'TransactionDeadlinePassed' | 'NoPool'
  // the Roost and AVIAN staking (2026-09-18)
  | 'TooSoon' | 'NothingToDistribute' | 'NotTheAdmin' | 'NothingToClaim' | 'NothingHeld' | 'NothingDeliverable'
  | 'ZeroAmount' | 'InsufficientStake' | 'NotTheRoost' | 'NothingStaked' | 'InvalidCostSink'
  // the owner surface — the refusals only the admin panel can provoke
  | 'ZeroAddress' | 'ZeroValue' | 'NotAContract' | 'NothingToRescue' | 'RescueFailed'
  | 'CannotRescue'
  | 'RendererLocked' | 'RendererMismatch' | 'RendererNotAContract' | 'RendererRendersNothing'
  | 'TransferValidatorLocked' | 'TransferValidatorMismatch' | 'TransferValidatorNotAContract'
  | 'TransferValidatorIsAvians' | 'TransferValidatorIsMintSink' | 'TransferValidatorIsThisContract'
  | 'NoTransferValidator' | 'ConfigureDataTooShort' | 'SelectorNotAllowed'
  | 'PriceBelowFloor' | 'FreeAllocationAlreadyReleased' | 'FreeAllocationReleaseTooEarly'
  | 'FreeMintNeverOpened' | 'OwnableInvalidOwner' | 'OwnershipRenounceDisabled'
  | 'InvalidFeeRecipient'
  | 'AlreadyListed' | 'InvalidRewardToken' | 'TooManyRewardTokens' | 'ZeroProbe'
  | 'TransferAmountMismatch' | 'NoSurplusToRestream' | 'DurationOutOfRange' | 'RewardRateOutOfRange'
  | 'IntervalTooShort' | 'MaxPerCallTooHigh' | 'SlippageBpsTooHigh' | 'PriceAgeOutOfRange'
  | 'StreamDurationOutOfRange' | 'KeeperDropBpsTooHigh' | 'NotThePriceKeeper'
  | 'TooManyTargets' | 'DuplicateTarget' | 'WeightsMustSumToBps'
  | 'RouteTooLong' | 'HopGoesNowhere' | 'RouteDoesNotReachTarget' | 'NotAV3Pool'
  | 'NoPosition' | 'StillLocked' | 'UnlockNotLater' | 'AlreadyHoldsAPosition'
  // not the chain's
  | 'UserRejected' | 'InsufficientFunds' | 'WrongNetwork' | 'NoWallet' | 'SatchelCycle' | 'ReadFailed'
  // Broadcast, receipt unseen. The one outcome that is neither a success nor a
  // refusal, and the only one where the drawer must not say nothing was taken.
  | 'ReceiptUnseen' | 'Unknown';

// ──────────────────────────────────────────── the Roost and AVIAN staking
//
// THE ROOST (2026-09-18). Where every AVIAN fee lands — the whole of every
// Perch fee and every brooding tier cost — and is split by a rule nobody can
// change. Since 2026-09-20: three figures, 35 / 30 / 20, rotating weekly
// between AVIAN stakers, brooding birds through the Nest and the users of the
// vault products through the lockers' distributor; 10% the admin's, 5%
// burnt. Anyone may turn it, at most once a day. HANDOVER section 9, "the
// Roost".

export type RoostLeg = {
  /** Allocated to this leg and not yet deliverable (nobody staked / nothing brooding). */
  held: Amount;
  /** `stakingReady()` / `nestReady()`: would the leg move right now, and if not, why not — verbatim. */
  ready: boolean;
  reason: string;
};

/** The Roost's three rotating legs (2026-09-20). Leg ids 0, 1, 2 on chain. */
export type RoostLegName = 'staking' | 'nest' | 'lockers';

/** This week's three figures, in bps. One of 3500/3000/2000, 3000/2000/3500, 2000/3500/3000. */
export type RotatingSplit = { staking: number; nest: number; lockers: number };

export type RoostState = {
  /** Every unit of AVIAN that ever arrived. */
  cumulativeIn: Amount;
  /** Arrived and not yet split: what the next distribute allocates. */
  unallocated: Amount;
  /** The five outflows, ever. */
  toStaking: Amount;
  toNest: Amount;
  toLockers: Amount;
  burned: Amount;
  adminClaimed: Amount;
  /** The admin's tenth, allocated and unclaimed. */
  adminClaimable: Amount;
  staking: RoostLeg;
  nest: RoostLeg;
  /** The lockers' leg: held at the Roost until the vault products exist. */
  lockers: RoostLeg;
  /** When anyone may call `distribute()` again. 0 before the first turn. */
  nextDistributionAt: UnixSeconds;
  /** The block's own clock, so "too soon" is judged on the chain's time. */
  chainNow: UnixSeconds;
  /**
   * THE SPLIT (2026-09-20). Three figures that rotate weekly between the
   * stakers, the brooding birds and the vault users on a fixed three-week
   * cycle from `GENESIS`, and two constants: 1000 to the admin, 500 burnt.
   * All read, none assumed; nobody can change any of it.
   */
  splitBps: RotatingSplit & { burn: number; admin: number };
  /** The second the three figures next move one place. */
  nextRotationAt: UnixSeconds;
  /** The figures from that second: `splitAt(nextRotationAt)`. */
  nextSplitBps: RotatingSplit;
  /** The Nest's owner, read live. */
  admin: Address;
};

/** What `distribute` did: the five-way split, each leg's fate, and the burn. */
export type DistributeResult = {
  allocated: { inflow: Amount; toStaking: Amount; toNest: Amount; toLockers: Amount; toBurn: Amount; toAdmin: Amount } | null;
  delivered: { leg: RoostLegName; amount: Amount }[];
  held: { leg: RoostLegName; amount: Amount; reason: string }[];
  burned: Amount;
};

/**
 * What `deliverHeld` did (2026-09-19): a held leg sent on the moment its
 * destination could take it. Splits nothing; the day's clock is untouched.
 */
export type DeliverResult = {
  delivered: { leg: RoostLegName; amount: Amount }[];
  held: { leg: RoostLegName; amount: Amount; reason: string }[];
};

/**
 * AVIAN STAKING. Stake AVIAN, earn AVIAN, by amount, streamed over a week
 * from each of the Roost's deliveries. No lock, no cooldown, no fee, no owner.
 */
export type StakingState = {
  /** The connected wallet's, or zero when none is connected. */
  staked: Amount;
  earned: Amount;
  aviansBalance: Amount;
  /** AVIAN approved to the staking contract, for `stake`. */
  allowance: Amount;
  totalStaked: Amount;
  /** The contract's `rewardRate`: base units per second, scaled by 1e18 — raw, like the Nest's. Zero when no stream is running. */
  rewardRate: Amount;
  periodFinish: UnixSeconds;
  /** Still to stream from the current delivery. */
  remainingReward: Amount;
  /**
   * Delivered and not yet credited to anyone: the running remainder plus any
   * seconds nobody was staked for. Streamed again with the next delivery —
   * never lost, and not a bonus for staking first.
   */
  undelivered: Amount;
  /** Seconds each delivery streams over. 604,800. */
  streamSeconds: number;
  chainNow: UnixSeconds;
};

/**
 * THE FLYWHEEL SNAPSHOT (2026-09-22): the landing page's live figures, read
 * from the chain at one block. Every figure a visitor checks before minting,
 * staking or buying a bird, and nothing the wiring cannot read. Dollar
 * figures are never stored: the view derives each from `usd.usdPerEth`, and
 * when `usd` is null (no dollar source on this deployment) the dollar half of
 * every figure is simply absent. A null `ethPerAvian` or `ethValue` (no
 * price this refresh) hides that value the same way: not "$0", not a dash.
 */
export type FlywheelSnapshot = {
  /** The block's own clock, and the block: the "at one block" of the footnote. */
  readAt: UnixSeconds;
  blockNumber: number;
  birds: {
    minted: number;
    maxSupply: number;
    /** The collection's `burned()`: birds the perch has burnt, a count. */
    burned: number;
    brooding: number;
    onPerch: number;
    /** What the perch pays for one bird right now: the sell quote. */
    perchBuysAt: Amount;
  };
  avian: {
    /** ETH per one AVIAN, 18 decimals; null on a deployment with no pool, or with no price this refresh. */
    ethPerAvian: Amount | null;
    /** AVIAN the Treasury has ever bought for the Roost (2026-09-22). Zero on a Treasury that predates the leg. */
    boughtForRoost: Amount;
    totalSupply: Amount;
    burned: Amount;
    originalSupply: Amount;
    staked: Amount;
  };
  roost: {
    /** Everything the fees have ever sent through it and it has split. */
    allocated: Amount;
    toStaking: Amount;
    toNest: Amount;
    burned: Amount;
    /** Null before the Roost has ever turned. */
    nextDistributeAt: UnixSeconds | null;
  };
  /** Dollars per ETH, 18 decimals like every Amount here; null when the deployment has no dollar source. */
  usd: { usdPerEth: Amount } | null;
  /** AVIAN first (brooding birds' and stakers' together), then by `ethValue` descending, unpriced last. */
  paid: PaidOut[];
  /**
   * THE STAKERS' STREAM (part 19): the staking contract's own AVIAN stream,
   * which the Nest's listing never shows. `periodFinish` is 0 until the
   * Roost first funds it; `totalPaid` is what stakers have ever been paid.
   */
  stakers: { periodFinish: UnixSeconds; totalPaid: Amount };
};

/** One reward token the Nest has ever paid: the total ever paid to holders, and its value today. */
export type PaidOut = {
  token: Address;
  symbol: string;
  decimals: number;
  amount: Amount;
  /** The amount at today's pool price, in ETH; null when there is no price this refresh. */
  ethValue: Amount | null;
};

/**
 * THE COUNCIL (2026-09-24). The protocol's second key: a timelock contract
 * only the founder's multisig may propose to. It holds the structural
 * pointers (which contract is the Treasury, the Perch, the Nest, the Roost),
 * the royalty, and the rescue that moves the admin seat to a fresh key.
 * Nothing else, and every call waits in public first.
 *
 * The site never sends a council call: the multisig sends them, and this is
 * read-only everywhere it appears.
 */
export type CouncilChange = {
  /** The Council's own id for the scheduled call. */
  id: Hex;
  /** Its place in a batch: one id may carry several calls, one sentence each. */
  index: number;
  /** One plain sentence: "The hook's Treasury moves to 0x12…89ab". */
  says: string;
  /** `council.getTimestamp(id)`: when it may be executed. */
  readyAt: UnixSeconds;
  /**
   * The rescue after the owner's silence is the one a holder should notice,
   * and draws in the stronger tone; everything else, the owner's own
   * proposal included, is a replacement (part 18).
   */
  kind: 'structural' | 'rescue';
};

export type CouncilState = {
  /** The Council timelock, or null when no seat is named on this deployment. */
  council: Address | null;
  /**
   * The seats that answer `council() == 0`, by name ("the Nest"): nothing
   * structural can move on them, and the card says so for each. Empty when
   * every seat names the council.
   */
  unnamedOn: string[];
  /** `council.MULTISIG()`: the only address that may propose. Null with no council. */
  multisig: Address | null;
  /** `STRUCTURAL_DELAY` and `RESCUE_DELAY`, in seconds. */
  structuralDelay: number;
  rescueDelay: number;
  /** The block's own clock, so a countdown runs on the chain's time and not this machine's. */
  chainNow: UnixSeconds;
  /** Scheduled, not executed and not cancelled; soonest first. */
  pending: CouncilChange[];
};

/**
 * THE OWNER'S SEAT (2026-09-24). The seat moves in two ways only: the owner
 * proposes a fresh key on each owned seat and the council seats it a day
 * later, or, after thirty days without a word from the owner, the council
 * seats one of its own choosing. Each owned seat keeps its own clock.
 */
export type OwnedSeat = {
  /** A stable key for the seat, for the senders and for React. */
  id: 'collection' | 'perch' | 'nest' | 'treasury' | 'vault' | 'traitMarket';
  /** "the collection", "the Perch": how a sentence names it. */
  name: string;
  /** Behind the veil until the founder unveils it: the control does not name it until then. */
  veil?: 'vaults' | 'traitMarket';
  /** `lastSeenAt()`: the owner's last sign of life on this seat. */
  lastSeenAt: UnixSeconds;
  /** `silentAt()`: lastSeenAt + SILENCE, when the council may act alone here. */
  silentAt: UnixSeconds;
  /** `pendingOwner()`: the latest proposal, or null when there is none. */
  proposed: Address | null;
  /**
   * `owner()` on this seat (part 18). Each seat has its own: halfway through
   * a council reseat they differ, and the control refuses before the first
   * signature if the wallet asking does not hold every seat it would send to.
   */
  owner: Address;
};

export type SeatState = {
  /** The six owned seats the manifest knows, in the order the control lists them. */
  seats: OwnedSeat[];
  /** `SILENCE()`, in seconds: 2,592,000, thirty days. */
  silence: number;
  /** The block's own clock, so "today" and the warning are the chain's and not this machine's. */
  chainNow: UnixSeconds;
};

/**
 * One of the seat control's two six-step sends, mid-way: how many seats have
 * confirmed, of how many it is sending to, and where the current one stands.
 */
export type SeatRun = {
  kind: 'still' | 'propose';
  done: number;
  of: number;
  /** The seat being sent to now, by name. */
  at: string;
  phase: TxPhase;
};
