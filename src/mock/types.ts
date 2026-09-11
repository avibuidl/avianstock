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
  aviansToStaking: Amount;
  /**
   * BUYING from the perch is a `transferFrom` of AVIANS, so it needs an
   * allowance exactly as the mint does — a separate one, to a different
   * contract. Selling does not: that moves birds, which is `birdsToPerch`.
   */
  aviansToPerch: Amount;
  birdsToPerch: boolean;
  birdsToRoost: boolean;
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
  | { where: 'roost'; staker: Address; tier: Tier; since: UnixSeconds }
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

export type Bird = {
  id: TokenId;
  traits: TraitIndices;
  combo: Combo;
  location: BirdLocation;
  satchel: { address: Address; deployed: boolean; holds: SatchelHolding[] };
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

export type RewardStream = {
  token: RewardToken;
  earned: Amount;
  rate: Amount;
  periodFinish: UnixSeconds;
  claimedByYou: Amount;
  totalPaid: Amount;
  /** false ⇒ `claim` throws TransferFailed. The accrual is safe either way. */
  transferable: boolean;
};

export type RoostState = {
  tierCost: Record<Tier, Amount>;  // 5,000 / 15,000 / 25,000
  totalWeight: bigint;
  yourWeight: bigint;
  totalStaked: number;
  totalBurned: Amount;
  staked: Bird[];
  listed: RewardToken[];           // [] ⇒ nothing is streaming yet
  streams: RewardStream[];
  /**
   * Tokens that were listed once and are not any more. They do not stream, but
   * a wallet can still be owed in one — which is why `claimAll` can pay out
   * more tokens than `listedRewardTokens()` returns.
   */
  retired: RewardStream[];
  operatorWhitelisted: boolean;
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
export type TreasuryState = {
  rows: TreasuryRow[];
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
   * `requiredBacking()` in AVIANS behind the free mint, so only the excess is
   * sweepable — and the panel shows all three figures rather than one.
   */
  aviansHeld: Amount;
  requiredBacking: Amount;
  ethHeld: Amount;
};

export type AdminPerch = { feeRecipient: Address };

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
  snapshotCount: number | null;
  maxRewardTokens: number;
  minDuration: number;
  maxDuration: number;
  totalWeight: bigint;
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
  floorPriceE18: Amount;
  floorSetAt: UnixSeconds;
};

export type V4Hop = { currencyOut: Address; fee: number; tickSpacing: number; hooks: Address };
export type V3Hop = { pool: Address; tokenOut: Address };
export type AdminRoute = { venue: number; v4: V4Hop[]; v3: V3Hop[] };

export type AdminTreasury = {
  rows: TreasuryRow[];
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
  /** Every currency crossed with every target: the venue and the floor price. */
  pairs: AdminPairRow[];
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

// ─────────────────────────────────────────────────────── trading AVIANS

/**
 * The pool, before anything is typed into the form.
 *
 * Every figure comes off the hook or a balance; nothing here is a constant in
 * the front end. `buyFeeBps` in particular is a moving number inside the
 * launch window and has to be re-read, not remembered.
 */
export type SwapState = {
  launchAt: UnixSeconds;
  isLaunched: boolean;
  windowSeconds: number;
  windowEndsAt: UnixSeconds;
  /** `FEE_BPS` plus the decaying launch extra. Falls every second in the window. */
  buyFeeBps: number;
  /** `FEE_BPS` alone. Never decays, never changes. */
  sellFeeBps: number;
  /** The LP's cut, converted from Uniswap's hundredths-of-a-bip into bps. */
  poolFeeBps: number;
  /** In AVIANS OUT, and only inside the window. */
  maxBuyPerTx: Amount;
  ethBalance: Amount;
  aviansBalance: Amount;
  /** AVIANS -> Permit2, the ordinary ERC-20 allowance. Step one of a sell. */
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
 * `claimAll()` exactly as the contract returns it: three parallel arrays in
 * listing order. The array can be LONGER than `listedRewardTokens()`, because
 * a retired token the wallet still has a balance in is paid too — so nothing
 * may index one against the other.
 */
export type ClaimAllResult = {
  tokens: Address[];
  paid: Amount[];
  skipped: boolean[];
};

/**
 * One row of the above, zipped and read. Two of the three cases look alike in
 * the raw arrays and mean entirely different things, so which one it is is
 * decided once, in `readClaimAll`, and never again at a call site:
 *
 *   paid > 0                      → 'paid'
 *   paid === 0, skipped === false → 'nothing-owed'  nothing was owed. Not a failure.
 *   skipped === true              → 'skipped'       the token refused. The accrual is safe.
 */
export type ClaimOutcome = {
  token: Address;
  symbol: string;
  decimals: number;
  paid: Amount;
  skipped: boolean;
  kind: 'paid' | 'nothing-owed' | 'skipped';
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
  | 'NoFloorPrice' | 'FloorPriceStale' | 'FloorPriceTooFresh' | 'FloorPriceDropTooLarge' | 'SlippageTooHigh'
  | 'MinOutIsZero' | 'NoRoute' | 'ConversionProducedNothing' | 'OwnableUnauthorizedAccount'
  // the roost
  | 'LengthMismatch' | 'InvalidTier' | 'AlreadyStaked' | 'NotStaked' | 'NotTheStaker'
  | 'NeverListed' | 'NotListed' | 'NoLiveStream' | 'DonationIsZero' | 'NothingStaked'
  | 'NotAFunder' | 'PushMustComeFromTheHolder' | 'BadStakeData' | 'MintIsNotAStake'
  | 'NotOwnedByStaking'
  // shared, Solady
  | 'TransferFailed' | 'TransferFromFailed'
  // the token
  | 'InsufficientBalance' | 'InsufficientAllowance' | 'InvalidPermit' | 'PermitExpired'
  // moving a bird
  | 'TransferToOwnAccount' | 'CallerMustBeWhitelisted'
  | 'ERC721InsufficientApproval' | 'ERC721IncorrectOwner' | 'ERC721NonexistentToken'
  // the pool
  | 'NotLaunched' | 'BuyTooLarge' | 'PartialFill' | 'NothingTraded'
  | 'OnlyThePerch' | 'NotHeldByThePerch'
  | 'WrongPool' | 'NotThePoolManager' | 'ExecutionFailed' | 'V4TooLittleReceived'
  | 'DeadlinePassed' | 'NoPool'
  // the owner surface — the refusals only the admin panel can provoke
  | 'ZeroAddress' | 'ZeroValue' | 'NotAContract' | 'NothingToRescue' | 'RescueFailed'
  | 'CannotRescue' | 'NotStranded'
  | 'RendererLocked' | 'RendererMismatch' | 'RendererNotAContract' | 'RendererRendersNothing'
  | 'TransferValidatorLocked' | 'TransferValidatorMismatch' | 'TransferValidatorNotAContract'
  | 'TransferValidatorIsAvians' | 'TransferValidatorIsMintSink' | 'TransferValidatorIsThisContract'
  | 'NoTransferValidator' | 'ConfigureDataTooShort' | 'SelectorNotAllowed'
  | 'PriceBelowFloor' | 'FreeAllocationAlreadyReleased' | 'FreeAllocationReleaseTooEarly'
  | 'FreeMintNeverOpened' | 'OwnableInvalidOwner' | 'OwnershipRenounceDisabled'
  | 'InvalidFeeRecipient'
  | 'AlreadyListed' | 'InvalidRewardToken' | 'TooManyRewardTokens' | 'ZeroProbe'
  | 'TransferAmountMismatch' | 'NoSurplusToRestream' | 'DurationOutOfRange' | 'RewardRateZero'
  | 'IntervalTooShort' | 'MaxPerCallTooHigh' | 'SlippageBpsTooHigh' | 'PriceAgeOutOfRange'
  | 'StreamDurationOutOfRange' | 'KeeperDropBpsTooHigh' | 'NotThePriceKeeper'
  | 'TooManyTargets' | 'DuplicateTarget' | 'WeightsMustSumToBps'
  | 'RouteTooLong' | 'HopGoesNowhere' | 'RouteDoesNotReachTarget' | 'NotAV3Pool'
  | 'NoPosition' | 'StillLocked' | 'UnlockNotLater' | 'AlreadyHoldsAPosition'
  // not the chain's
  | 'UserRejected' | 'WrongNetwork' | 'NoWallet' | 'SatchelCycle' | 'ReadFailed'
  // Broadcast, receipt unseen. The one outcome that is neither a success nor a
  // refusal, and the only one where the drawer must not say nothing was taken.
  | 'ReceiptUnseen' | 'Unknown';
