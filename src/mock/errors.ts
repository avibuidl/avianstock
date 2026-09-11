// The closed error vocabulary, and the one place a message is written.
//
// Selectors are swept from HANDOVER section 7 — the first four bytes of the
// revert data. A decoder built from the compiled ABIs will name a revert
// instead of showing a hex blob, and this table turns the name into the
// sentence a person reads. Nothing on screen is ever a hex code.

import type { Address, Amount, ErrorName, Hex, TokenId } from './types';
import { avians, formatCount } from '../lib/format';

export const SELECTORS: Record<ErrorName, Hex | null> = {
  // mint — the closed vocabulary, checked in this order
  MintClosed: '0x589ed34b',
  InsufficientPayment: '0xbd4f29e3',
  SoldOut: '0x52df9fe5',
  WalletCapReached: '0xc2c77a0e',
  InvalidTrait: '0xdca1603a',
  ComboTaken: '0xf68aef51',
  EmptyBatch: '0xc2e5347d',
  ERC721InvalidReceiver: '0x64a0ae92',
  // free mint
  FreeMintClosed: '0x39e6a196',
  FreeMintAlreadyClaimed: '0x876305dc',
  NotAllowlisted: '0x06fb10a9',
  FreeAllocationExhausted: '0xd2f28957',
  FreeMintUnbacked: '0xf45eadba',
  // the perch
  EmptyList: '0x615fd3c0',
  InsufficientPool: '0xb9b3b6b9',
  NotHeld: '0x1890e3f1',
  AlreadyHeld: '0xce361e57',
  NotOwnedByPool: '0x5ace9841',
  MintIsNotASale: '0x116bae71',
  NotTheCollection: '0x7f2a13b4',
  PoolCorrupt: '0x94824491',
  Reentrancy: '0xab143c06',
  // the treasury — the seven guards on `convertAndStream`, in the contract's
  // own order, plus the one on `claimAdmin`
  ConversionDisabled: '0x2efe214b',
  CoolingDown: '0xc2d842bf',
  NoRewardTokens: '0xbba55638',
  NoTargets: '0x3b821cc0',
  NothingToConvert: '0x9da6f2bd',
  NothingClaimable: '0x9837a149',
  // guard 7: the per-target floor-price checks, which only a simulation settles
  TargetNotListed: '0xf6167aa1',
  ZeroSplitPart: '0x7dcfb5c6',
  NoFloorPrice: '0x90be9828',
  FloorPriceStale: '0x734adc72',
  FloorPriceTooFresh: '0xbd2dee28',
  FloorPriceDropTooLarge: '0xc5842270',
  SlippageTooHigh: '0x8c4d55ec',
  MinOutIsZero: '0xff170a29',
  NoRoute: '0x81fff07f',
  ConversionProducedNothing: '0x0fc4ccd9',
  OwnableUnauthorizedAccount: '0x118cdaa7',
  // the roost
  LengthMismatch: '0xab8b67c6',
  InvalidTier: '0xbca1a956',
  AlreadyStaked: '0x9a077ff1',
  NotStaked: '0x7148839c',
  NotTheStaker: '0xea179c1c',
  NeverListed: '0x60ed58fa',
  NotListed: '0x5d35c429',
  NoLiveStream: '0xdf098a09',
  DonationIsZero: '0x8fa1a1fe',
  NothingStaked: '0x9fe7bfd9',
  NotAFunder: '0x1eaf226f',
  PushMustComeFromTheHolder: '0xd8db2dcb',
  BadStakeData: '0xf8e2cc5e',
  MintIsNotAStake: '0x977fa84a',
  NotOwnedByStaking: '0x4ddaafc4',
  // shared, Solady
  TransferFailed: '0x90b8ec18',
  TransferFromFailed: '0x7939f424',
  // the token
  InsufficientBalance: '0xf4d678b8',
  InsufficientAllowance: '0x13be252b',
  InvalidPermit: '0xddafbaef',
  PermitExpired: '0x1a15a3cc',
  // moving a bird
  TransferToOwnAccount: '0x589f4f38',
  CallerMustBeWhitelisted: '0xef28f901',
  ERC721InsufficientApproval: '0x177e802f',
  ERC721IncorrectOwner: '0x64283d7b',
  ERC721NonexistentToken: '0x7e273289',
  // the pool
  NotLaunched: '0x8d4799be',
  BuyTooLarge: '0xc888aaa1',
  PartialFill: '0xe7db0ee4',
  NothingTraded: '0x374eb812',
  // The burn path. Neither can reach a collector — the Perch is the only caller
  // of `burn` and it only ever burns a bird it already holds — but a decoder
  // that cannot name them would show a hex blob if one ever did.
  OnlyThePerch: '0xda9c3382',
  NotHeldByThePerch: '0xb9bdd572',
  // Refusals that only a swap can produce: the router's own wrapper, the
  // V4Router's slippage check, and the deadline.
  WrongPool: null,
  NotThePoolManager: null,
  ExecutionFailed: null,
  V4TooLittleReceived: null,
  DeadlinePassed: null,
  // Ours, not the chain's: this deployment has no pool to trade in.
  NoPool: null,
  // the owner surface — every refusal the admin panel can provoke. Typed here
  // like the rest of the table, and checked against the compiled ABIs by
  // tests/selectors.test.ts, which fails if a contract ever moves one.
  ZeroAddress: '0xd92e233d',
  ZeroValue: '0x7c946ed7',
  NotAContract: '0x8a8b41ec',
  NothingToRescue: '0x00f6b210',
  RescueFailed: '0xb8eaf7a1',
  CannotRescue: '0x8daa1b2c',
  NotStranded: '0x48f11ed9',
  RendererLocked: '0x4a7b75a1',
  RendererMismatch: '0xfc7b572c',
  RendererNotAContract: '0x2dc086ac',
  RendererRendersNothing: '0xb26960e4',
  TransferValidatorLocked: '0xf7ec5b7f',
  TransferValidatorMismatch: '0xcd00c028',
  TransferValidatorNotAContract: '0x4e67a6a1',
  TransferValidatorIsAvians: '0xa48e684e',
  TransferValidatorIsMintSink: '0x7f7c3ee1',
  TransferValidatorIsThisContract: '0xf85e8912',
  NoTransferValidator: '0x3459f07d',
  ConfigureDataTooShort: '0xde9f2dbd',
  SelectorNotAllowed: '0x3b06e146',
  PriceBelowFloor: '0xd6e7da92',
  FreeAllocationAlreadyReleased: '0x710bbce4',
  FreeAllocationReleaseTooEarly: '0x084cff68',
  FreeMintNeverOpened: '0x85e84bb7',
  OwnableInvalidOwner: '0x1e4fbdf7',
  OwnershipRenounceDisabled: '0x3df11b96',
  InvalidFeeRecipient: '0xf80a23ec',
  AlreadyListed: '0x19cd4595',
  InvalidRewardToken: '0x79260369',
  TooManyRewardTokens: '0xa9fe246a',
  ZeroProbe: '0xf999fbe6',
  TransferAmountMismatch: '0x541b1c9e',
  NoSurplusToRestream: '0x5b67df31',
  DurationOutOfRange: '0x874ce05e',
  RewardRateZero: '0x8f05a83c',
  IntervalTooShort: '0xa172870c',
  MaxPerCallTooHigh: '0x0404bf2f',
  SlippageBpsTooHigh: '0x1f8ecfbc',
  PriceAgeOutOfRange: '0x3ec6e85e',
  StreamDurationOutOfRange: '0xdfc8cc23',
  KeeperDropBpsTooHigh: '0x7e1abd67',
  NotThePriceKeeper: '0x96dca305',
  TooManyTargets: '0xe846175e',
  DuplicateTarget: '0xee8e351e',
  WeightsMustSumToBps: '0x01972183',
  RouteTooLong: '0x9fe54dd8',
  HopGoesNowhere: '0xc15a8157',
  RouteDoesNotReachTarget: '0x2e14391a',
  NotAV3Pool: '0x859db513',
  NoPosition: '0xabf0f034',
  StillLocked: '0x41344244',
  UnlockNotLater: '0xe602809f',
  AlreadyHoldsAPosition: '0xfb7f7079',
  // not the chain's
  UserRejected: null,
  WrongNetwork: null,
  NoWallet: null,
  SatchelCycle: null,
  ReadFailed: null,
  /**
   * Broadcast, receipt not seen. NOT a failure — the one state where "nothing
   * was taken" is a lie we cannot detect, so it has a name of its own rather
   * than falling through to Unknown.
   */
  ReceiptUnseen: null,
  Unknown: null,
};

export type ErrorArgs = Partial<{
  price: Amount; cap: Amount; cumulative: Amount;
  combo: bigint; tokenId: TokenId; id: TokenId;
  requested: number; available: number;
  limit: number; token: Address; symbol: string;
  launchAt: number; path: TokenId[];
  /** `CoolingDown(nextAllowedAt, currentTime)` — the Treasury's shared clock. */
  nextAllowedAt: number; currentTime: number;
  /** `NothingToConvert(currency, balance, claimable)`. */
  balance: Amount; reserved: Amount;
}>;

export class ContractError extends Error {
  readonly errorName: ErrorName;
  readonly selector: Hex | null;
  readonly args: ErrorArgs;
  constructor(errorName: ErrorName, args: ErrorArgs = {}) {
    super(errorName);
    this.name = 'ContractError';
    this.errorName = errorName;
    this.selector = SELECTORS[errorName];
    this.args = args;
  }
}

export type FixKind =
  | 'approve'
  /**
   * The OPERATOR approval — `setApprovalForAll`, for a contract to pull your
   * birds. Distinct from 'approve', which is an AVIANS allowance for an amount:
   * the two land on different contracts and neither substitutes for the other,
   * and a handler that could not tell them apart would run the wrong one.
   */
  | 'approve-operator'
  | 'get-avians' | 'recompose' | 'switch-network'
  | 'refresh' | 'retry' | 'paid-mint' | 'perch' | 'dismiss';

export type Explanation = {
  /**
   * The transaction WAS broadcast. The drawer's standing "Nothing was taken."
   * is true of a revert and false of this, so it is suppressed here.
   */
  sent?: boolean;
  /** The heading. Say the bad news first. */
  title: string;
  /** The sentence. Warm, brief, never blames the reader. */
  sentence: string;
  fix?: { label: string; kind: FixKind; amount?: Amount };
  /** true ⇒ stop polling and disable the control. */
  fatal: boolean;
};

export type ExplainContext = {
  price?: Amount; balance?: Amount; allowance?: Amount;
  walletLimit?: number; rewardSymbol?: string;
};

/**
 * The sentence, and the smallest fix. HANDOVER asks for one particular piece of
 * judgement here and it belongs in this layer rather than in a component:
 * `InsufficientPayment` is a balance problem or an allowance problem, and the
 * right sentence depends on which.
 */
export function explain(e: unknown, ctx: ExplainContext = {}): Explanation {
  const err = e instanceof ContractError ? e : null;
  const name: ErrorName = err?.errorName ?? 'Unknown';
  const a = err?.args ?? {};
  const price = (a.price ?? ctx.price ?? 0n) as Amount;

  switch (name) {
    // ── mint ────────────────────────────────────────────────────────────
    case 'MintClosed':
      return { title: 'The paid mint is closed right now.', fatal: true,
        sentence: 'Birds already minted are still trading, and the perch is still buying at 90,000 AVIANS — that part never closes.' };

    case 'InsufficientPayment': {
      const short = ctx.balance !== undefined && ctx.balance < price;
      if (short) {
        return { title: `You need ${avians(price)} to compose a bird.`, fatal: false,
          sentence: `You've got ${avians(ctx.balance!)}.`,
          fix: { label: 'Get AVIANS', kind: 'get-avians' } };
      }
      return { title: 'One approval first, then the mint.', fatal: false,
        sentence: `The collection needs to be allowed to take ${avians(price)} out of your wallet. It goes straight to the perch in the same transaction.`,
        fix: { label: `Approve ${avians(price)}`, kind: 'approve', amount: price } };
    }

    case 'SoldOut':
      return { title: 'Sold out.', fatal: true,
        sentence: 'All 5,555 are composed. The 1,866,240 combinations nobody chose stay unchosen forever. The perch is still open, and so is the secondary market.',
        fix: { label: 'Buy one from the perch', kind: 'perch' } };

    case 'WalletCapReached':
      return { title: `This wallet has minted its limit${a.limit ?? ctx.walletLimit ? ` of ${formatCount((a.limit ?? ctx.walletLimit)!)}` : ''}.`, fatal: true,
        sentence: 'The limit is set on the collection, and we read it rather than assume it.' };

    case 'InvalidTrait':
      return { title: 'That trait does not exist.', fatal: true,
        sentence: 'This is a fault on our side, not something you did. It has been logged.' };

    case 'ComboTaken':
      return { title: 'That one just went.', fatal: false,
        sentence: a.tokenId
          ? `Avian #${formatCount(a.tokenId)} has this exact combination. Nothing was taken — the transaction reverted before any AVIANS moved.`
          : 'Somebody composed this exact combination first. Nothing was taken.',
        fix: { label: 'Show me the nearest available', kind: 'recompose' } };

    case 'EmptyBatch':
    case 'EmptyList':
      return { title: 'Nothing was selected.', fatal: true,
        sentence: 'This is a fault on our side. It has been logged.' };

    case 'ERC721InvalidReceiver':
      return { title: 'Your wallet refused the bird.', fatal: false,
        sentence: 'The destination cannot receive an NFT. If that address is a contract, it needs to accept ERC-721 transfers.' };

    // ── the free door ───────────────────────────────────────────────────
    case 'FreeMintClosed':
      return { title: 'The free mint is not open.', fatal: true,
        sentence: 'The flocklist door opens when the owner opens it, and we will not post a date we might have to move.',
        fix: { label: 'Compose a paid one instead', kind: 'paid-mint' } };

    case 'FreeMintAlreadyClaimed':
      return { title: "You've already claimed yours.", fatal: true,
        sentence: 'One per wallet on the list. You can compose as many more as you like at 100,000 AVIANS each.',
        fix: { label: 'Compose a paid one', kind: 'paid-mint' } };

    case 'NotAllowlisted':
      return { title: "This wallet isn't on the flocklist.", fatal: true,
        sentence: 'That door is 2,000 birds, one per listed wallet — but the paid mint is a separate door, and your bird is composed exactly the same way.',
        fix: { label: 'Compose your Avian — 100,000 AVIANS', kind: 'paid-mint' } };

    case 'FreeAllocationExhausted':
      return { title: 'All 2,000 flocklist birds are claimed.', fatal: true,
        sentence: 'The paid mint is the door now.',
        fix: { label: 'Compose a paid one', kind: 'paid-mint' } };

    case 'FreeMintUnbacked':
      return { title: 'The free birds are not backed on this deployment.', fatal: true,
        sentence: 'The collection does not hold the 100,000 AVIANS that stands behind this bird. That is a deployment fault, not something you did — the operator has been told.' };

    // ── the perch ───────────────────────────────────────────────────────
    case 'InsufficientPool':
      return { title: `The perch only has ${formatCount(a.available ?? 0)} birds.`, fatal: false,
        sentence: 'Ask for fewer, or come back after somebody sells one.',
        fix: { label: 'Refresh the perch', kind: 'refresh' } };

    case 'NotHeld':
      return { title: 'That bird is no longer in the perch.', fatal: false,
        sentence: 'Somebody bought it first. Buying a named bird is all-or-nothing, so nothing was taken.',
        fix: { label: 'Refresh the perch', kind: 'refresh' } };

    case 'AlreadyHeld':
    case 'NotOwnedByPool':
    case 'MintIsNotASale':
    case 'NotTheCollection':
    case 'MintIsNotAStake':
    case 'NotOwnedByStaking':
    case 'PoolCorrupt':
    case 'Reentrancy':
    case 'LengthMismatch':
    case 'InvalidTier':
    case 'BadStakeData':
    case 'NeverListed':
      return { title: 'Something on our side is wrong.', fatal: true,
        sentence: 'Nothing was taken. This has been logged, and it is our bug to fix rather than yours to work around.' };

    // ── the roost ───────────────────────────────────────────────────────
    case 'AlreadyStaked':
      return { title: 'That bird is already roosting.', fatal: false,
        sentence: 'Refresh and it will show where it actually is.', fix: { label: 'Refresh', kind: 'refresh' } };

    case 'NotStaked':
      return { title: 'That bird is not roosting.', fatal: false,
        sentence: 'Refresh and it will show where it actually is.', fix: { label: 'Refresh', kind: 'refresh' } };

    case 'NotTheStaker':
      return { title: 'That stake is not yours.', fatal: true,
        sentence: 'Only the wallet that sent a bird to the roost can bring it home.' };

    case 'NotListed':
      return { title: 'That reward is not active.', fatal: true, sentence: 'It is not one of the tokens currently streaming.' };

    case 'NoLiveStream':
      return { title: 'There is no active stream to top up.', fatal: true, sentence: 'Nothing is streaming in that token right now.' };

    case 'NothingStaked':
      return { title: 'A stream cannot start while nobody has roosted.', fatal: true, sentence: 'Not something a collector can hit.' };

    case 'NotAFunder':
    case 'DonationIsZero':
      return { title: 'That is not a collector action.', fatal: true, sentence: 'Sponsors top up a stream with donate.' };

    case 'PushMustComeFromTheHolder':
      return { title: 'A bird has to be sent in by the person holding it.', fatal: false,
        sentence: 'We will use the batch route instead, which handles this.', fix: { label: 'Try again', kind: 'retry' } };

    // ── the treasury ────────────────────────────────────────────────────
    // Conversion is permissionless, so these sentences are written for a
    // visitor who pressed the button, not for an operator reading a log.
    case 'ConversionDisabled':
      return { title: 'The flywheel is not switched on yet.', fatal: true,
        sentence: 'Conversion is off at deployment and the owner turns it on once the pool and the streams are running. Income is still arriving in the meantime — none of it is lost.' };

    case 'CoolingDown': {
      const when = a.nextAllowedAt;
      return { title: 'Already converted today.', fatal: false,
        sentence: when
          ? `One conversion every 24 hours, on one clock shared by every currency. The next one can run at ${new Date(when * 1000).toLocaleTimeString()}.`
          : 'One conversion every 24 hours, on one clock shared by every currency.',
        fix: { label: 'Refresh', kind: 'refresh' } };
    }

    case 'NoRewardTokens':
      return { title: 'There is nothing to convert into yet.', fatal: true,
        sentence: 'No reward token has passed the incubator’s transferability gate, so a conversion would have nowhere to send anything.' };

    case 'NoTargets':
      return { title: 'No conversion targets are configured.', fatal: true,
        sentence: 'The owner sets which reward tokens the income is split into. Until that is done there is nothing for a conversion to buy.' };

    case 'NothingToConvert':
      return { title: 'Nothing to convert in that currency right now.', fatal: false,
        sentence: 'The balance here is spoken for, or it is too small for this call’s share of it. More income makes this possible again.',
        fix: { label: 'Refresh', kind: 'refresh' } };

    case 'NothingClaimable':
      return { title: 'Nothing outstanding in that currency.', fatal: false,
        sentence: 'Everything that had been earmarked has already been withdrawn.',
        fix: { label: 'Refresh', kind: 'refresh' } };

    case 'OwnableUnauthorizedAccount':
      return { title: 'That is an owner-only action.', fatal: true,
        sentence: 'The contract refused it because the wallet asking is not the owner. Nothing was taken. The refusal came from the contract, which is the only thing that decides this.' };

    // Guard 7: the per-target price checks. A person pressing a public button
    // did not cause any of these and cannot fix them — say what is true and do
    // not imply otherwise.
    case 'NoFloorPrice':
    case 'FloorPriceStale':
    case 'FloorPriceTooFresh':
      return { title: 'The price this conversion checks against is not usable.', fatal: false,
        sentence: 'A conversion refuses to trade against a floor price that is missing or out of date, rather than accept whatever the pool offers. Nothing was taken.',
        fix: { label: 'Try again later', kind: 'refresh' } };

    case 'FloorPriceDropTooLarge':
    case 'SlippageTooHigh':
      return { title: 'The pool moved too far for this conversion.', fatal: false,
        sentence: 'It refuses a fill below the floor price rather than take a bad one. Nothing was taken, and the income is still here.',
        fix: { label: 'Try again later', kind: 'refresh' } };

    case 'NoRoute':
    case 'MinOutIsZero':
    case 'ZeroSplitPart':
    case 'TargetNotListed':
    case 'ConversionProducedNothing':
      return { title: 'This conversion is not configured to run yet.', fatal: true,
        sentence: 'A route, a split or a target is missing or too small to trade. That is the operator’s to set, not yours, and nothing was taken.' };

    // ── shared, Solady ──────────────────────────────────────────────────
    case 'TransferFailed':
      return { title: `${ctx.rewardSymbol ?? 'This reward token'} is not transferable right now.`, fatal: false,
        sentence: 'Your rewards are safe and can be claimed later — and your bird can still come home. The issuer can pause these at any time, and this is what that looks like.' };

    case 'TransferFromFailed':
      return { title: 'One approval first.', fatal: false,
        sentence: price > 0n
          ? `The contract needs to be allowed to take ${avians(price)} out of your wallet.`
          : 'The contract needs to be allowed to take AVIANS out of your wallet.',
        fix: { label: price > 0n ? `Approve ${avians(price)}` : 'Approve AVIANS', kind: 'approve', amount: price } };

    case 'CallerMustBeWhitelisted':
      return { title: 'That route is not approved on this deployment.', fatal: false,
        sentence: 'We will send the bird in directly instead — same price, same result, one transaction. The operator has been told.',
        fix: { label: 'Try the direct route', kind: 'retry' } };

    // ── the token ───────────────────────────────────────────────────────
    case 'InsufficientBalance':
      return { title: 'Not enough AVIANS.', fatal: false,
        sentence: ctx.balance !== undefined ? `You've got ${avians(ctx.balance)}.` : 'Your balance is short.',
        fix: { label: 'Get AVIANS', kind: 'get-avians' } };

    case 'InsufficientAllowance':
      return { title: 'Approve more AVIANS.', fatal: false,
        sentence: 'The current allowance does not cover this.',
        fix: { label: 'Approve', kind: 'approve', amount: price } };

    case 'InvalidPermit':
    case 'PermitExpired':
      // HANDOVER section 2: never show "your signature was rejected" — the
      // contract wraps permit in a try on purpose, so what a person sees is
      // the allowance error.
      return { title: 'One approval first, then the mint.', fatal: false,
        sentence: `The collection needs to be allowed to take ${avians(price)} out of your wallet.`,
        fix: { label: `Approve ${avians(price)}`, kind: 'approve', amount: price } };

    // ── moving a bird ───────────────────────────────────────────────────
    case 'TransferToOwnAccount':
      return { title: 'A bird cannot be sent into its own satchel.', fatal: true,
        sentence: 'It would be stuck there forever, so the chain refuses it. Nothing was taken.' };

    case 'SatchelCycle':
      return { title: 'This would trap both birds forever.', fatal: true,
        sentence: 'The destination satchel belongs to a bird that is already inside this one. Sending it would close the loop, and neither bird could ever be moved again.' };

    case 'ERC721InsufficientApproval':
      return { title: 'Approve first.', fatal: false,
        sentence: 'That contract is not allowed to move your birds yet.',
        fix: { label: 'Approve', kind: 'approve-operator' } };

    case 'ERC721IncorrectOwner':
      return { title: 'That bird is not where we thought it was.', fatal: false,
        sentence: 'Ownership has changed since this page loaded.', fix: { label: 'Refresh', kind: 'refresh' } };

    case 'ERC721NonexistentToken':
      return { title: 'No such bird.', fatal: true, sentence: 'It has not been minted.' };

    // ── the pool ────────────────────────────────────────────────────────
    case 'NotLaunched':
      return { title: 'The pool is not open yet.', fatal: true,
        sentence: 'Every swap reverts until it opens, and the countdown on this page is built from the contract’s own refusal.' };

    case 'BuyTooLarge':
      return { title: 'That is more than one transaction may buy right now.', fatal: false,
        sentence: `During the first five minutes, one transaction can buy at most ${a.cap ? avians(a.cap) : '50,000,000 AVIANS'}.`,
        fix: { label: 'Split it', kind: 'retry' } };

    case 'PartialFill':
      return { title: 'The pool could not fill that amount at your price limit.', fatal: false,
        sentence: 'A swap either fills completely or reverts — there are no partial fills. Widen the limit or reduce the size.' };

    case 'NothingTraded':
      return { title: 'Amount too small.', fatal: false, sentence: 'That swap would have moved nothing.' };

    case 'OnlyThePerch':
      return { title: 'Only the Perch can burn a bird.', fatal: true,
        sentence: 'Not the owner, not a holder, and not this site. If you are seeing this, something called the collection directly.' };

    case 'NotHeldByThePerch':
      return { title: 'The Perch does not hold that bird.', fatal: true,
        sentence: 'It can only burn one already in the pool. If you are seeing this, something called the collection directly.' };

    case 'V4TooLittleReceived':
      return { title: 'The price moved while you were signing.', fatal: false,
        sentence: 'The pool would have paid less than the minimum you accepted, so nothing was traded. Quote it again, or raise the slippage you will accept.',
        fix: { label: 'Quote it again', kind: 'retry' } };

    case 'DeadlinePassed':
      return { title: 'That took too long.', fatal: false,
        sentence: 'The transaction sat unsigned past its deadline and the router refused it. Nothing was traded.',
        fix: { label: 'Try again', kind: 'retry' } };

    case 'ExecutionFailed':
      return { title: 'The router refused it.', fatal: false,
        sentence: 'The swap did not go through and nothing was taken. If it keeps happening, the pool may have moved further than the slippage you set allows.' };

    case 'WrongPool':
      return { title: 'That is not the pool.', fatal: true,
        sentence: 'The hook accepts exactly one pool and this was not it. A fault on our side, and it has been logged.' };

    case 'NotThePoolManager':
      return { title: 'That call did not come from the pool.', fatal: true,
        sentence: 'A fault on our side, and it has been logged.' };

    case 'NoPool':
      return { title: 'There is no pool on this deployment yet.', fatal: true,
        sentence: 'AVIANS cannot be traded here until the pool is launched. Nothing about minting, brooding or the perch depends on it.' };

    // ── the owner surface ───────────────────────────────────────────────
    //
    // Only the admin panel can provoke these. They are written the same way as
    // everything above — say what happened, say what it means — but the reader
    // is the owner, so they can carry the contract's own numbers without
    // needing a translation into collector language.

    case 'OwnableInvalidOwner':
      return { title: 'That address cannot be the owner.', fatal: false,
        sentence: 'Ownership cannot be handed to the zero address.' };

    case 'OwnershipRenounceDisabled':
      return { title: 'Ownership cannot be renounced.', fatal: true,
        sentence: 'These contracts refuse it by design, so no owner can walk away and leave them unattended. Nothing on this panel offers it.' };

    case 'ZeroAddress':
      return { title: 'That address is empty.', fatal: false,
        sentence: 'The contract will not send anything to the zero address.' };

    case 'ZeroValue':
      return { title: 'That amount is zero.', fatal: false, sentence: 'Nothing to do.' };

    case 'NotAContract':
      return { title: 'There is no contract at that address.', fatal: false,
        sentence: a.token ? `${a.token} has no code on this chain. Check the address, and check you are on the right network.` : 'The address has no code on this chain.' };

    case 'NothingToRescue':
      return { title: 'There is nothing to sweep.', fatal: false,
        sentence: 'The balance is zero — or, for AVIANS, all of it is the backing the free mint requires and none of it may leave.' };

    case 'RescueFailed':
      return { title: 'The transfer out failed.', fatal: false,
        sentence: 'The destination rejected the ETH. A contract that cannot receive it is the usual reason; try a plain address.' };

    case 'CannotRescue':
      return { title: 'The perch will not release that one.', fatal: true,
        sentence: 'AVIANS and the collection itself are refused by address, because they are the pool. Everything else can be swept.' };

    case 'NotStranded':
      return { title: 'That bird is staked, not stranded.', fatal: true,
        sentence: 'It has a staker, so it belongs to them. Only a bird the contract holds with no stake recorded against it can be rescued.' };

    case 'RendererLocked':
      return { title: 'The renderer is locked.', fatal: true,
        sentence: 'That was permanent when it happened. The art can never be re-pointed.' };

    case 'TransferValidatorLocked':
      return { title: 'The transfer validator is locked.', fatal: true,
        sentence: 'That was permanent when it happened. Enforcement can never be re-pointed.' };

    case 'RendererMismatch':
    case 'TransferValidatorMismatch':
      return { title: 'That is not the address you are looking at.', fatal: false,
        sentence: 'The lock takes the address it expects to lock, and the one on chain has changed since this page read it. Reload and check what is there before locking it.',
        fix: { label: 'Reload', kind: 'refresh' } };

    case 'RendererNotAContract':
    case 'TransferValidatorNotAContract':
      return { title: 'There is no contract at that address.', fatal: false,
        sentence: 'The collection checks for code before it will point at anything.' };

    case 'RendererRendersNothing':
      return { title: 'That renderer returned nothing.', fatal: false,
        sentence: 'The collection calls it once before accepting it, and it produced an empty token URI.' };

    case 'TransferValidatorIsAvians':
    case 'TransferValidatorIsMintSink':
    case 'TransferValidatorIsThisContract':
      return { title: 'That address cannot be the validator.', fatal: false,
        sentence: 'The collection refuses AVIANS, the perch and itself here — pointing enforcement at any of the three would be a way to make them move tokens.' };

    case 'NoTransferValidator':
      return { title: 'No validator is set.', fatal: true,
        sentence: 'There is nothing to configure until the collection points at one.' };

    case 'ConfigureDataTooShort':
    case 'SelectorNotAllowed':
      return { title: 'The collection will not forward that call.', fatal: true,
        sentence: 'It forwards thirteen validator configuration selectors and nothing else. This is a fault on our side — the panel composed something the collection refuses — and it has been logged.' };

    case 'PriceBelowFloor':
      return { title: 'That price is below the floor.', fatal: false,
        sentence: 'The collection has a minimum price it will not go under, and the panel shows it beside the field.' };

    case 'FreeAllocationAlreadyReleased':
      return { title: 'It has already been released.', fatal: true,
        sentence: 'This only happens once, and it has happened.' };

    case 'FreeAllocationReleaseTooEarly':
      return { title: 'Too early to release it.', fatal: false,
        sentence: 'The free mint has to have been open for its full delay first. The countdown is on the panel.' };

    case 'FreeMintNeverOpened':
      return { title: 'The free mint has never opened.', fatal: true,
        sentence: 'There is no clock to run down yet, so there is nothing to release.' };

    case 'InvalidFeeRecipient':
      return { title: 'The perch will not send fees there.', fatal: false,
        sentence: 'It refuses the zero address and itself.' };

    case 'AlreadyListed':
      return { title: 'That token is already streaming.', fatal: true,
        sentence: 'Retire it first if you mean to re-list it.' };

    case 'InvalidRewardToken':
      return { title: 'That token cannot be a reward.', fatal: true,
        sentence: 'AVIANS, the collection and the nest itself are refused by address — a reward token has to be something the contract does not already hold for another reason.' };

    case 'TooManyRewardTokens':
      return { title: 'The reward list is full.', fatal: true,
        sentence: 'The cap is on the list every staker pays gas for on every stake and unstake, which is why it exists. Re-listing a token that was once on it is free; a new one is not.' };

    case 'ZeroProbe':
      return { title: 'The probe cannot be zero.', fatal: false,
        sentence: 'Adding a reward token moves a real amount in and straight back out, to prove the token actually transfers. Zero proves nothing.' };

    case 'TransferAmountMismatch':
      return { title: 'That token did not move what it said it moved.', fatal: true,
        sentence: 'The probe sent an amount in and the balance changed by something else — a fee-on-transfer or rebasing token. The nest refuses it, because its accounting assumes what goes in comes out.' };

    case 'NoSurplusToRestream':
      return { title: 'There is nothing spare to restream.', fatal: true,
        sentence: 'Everything the nest holds in this token is already promised to stakers. Only the surplus above what is escrowed can be re-scheduled.' };

    case 'DurationOutOfRange':
    case 'StreamDurationOutOfRange':
      return { title: 'That duration is outside the allowed range.', fatal: false,
        sentence: 'The bounds are read off the contract and shown beside the field.' };

    case 'RewardRateZero':
      return { title: 'That would stream nothing.', fatal: false,
        sentence: 'The amount divided by the duration rounds to zero per second. A shorter duration, or a larger amount.' };

    case 'IntervalTooShort':
      return { title: 'That interval is below the floor.', fatal: false,
        sentence: 'The contract has a minimum time between conversions that the owner cannot configure away. It is shown beside the field.' };

    case 'MaxPerCallTooHigh':
    case 'SlippageBpsTooHigh':
    case 'KeeperDropBpsTooHigh':
      return { title: 'That is above the cap.', fatal: false,
        sentence: 'The contract publishes the ceiling and the panel shows it beside the field. This one is over it.' };

    case 'PriceAgeOutOfRange':
      return { title: 'That price age is outside the allowed range.', fatal: false,
        sentence: 'Both ends are read off the contract and shown beside the field.' };

    case 'NotThePriceKeeper':
      return { title: 'This wallet is neither the owner nor the price keeper.', fatal: true,
        sentence: 'Floor prices can be set by either, and by nobody else.' };

    case 'TooManyTargets':
      return { title: 'Too many targets.', fatal: false,
        sentence: 'The contract caps the list and the panel shows the cap.' };

    case 'DuplicateTarget':
      return { title: 'That token is in the list twice.', fatal: false,
        sentence: 'Each target appears once, with one weight.' };

    case 'WeightsMustSumToBps':
      return { title: 'The weights do not add up to 100%.', fatal: false,
        sentence: 'This is a fault on our side — the panel should not have offered to send it — and it has been logged.' };

    case 'RouteTooLong':
    case 'HopGoesNowhere':
    case 'RouteDoesNotReachTarget':
      return { title: 'That route does not arrive.', fatal: false,
        sentence: 'A route has to end at the target token, with every hop connecting to the next. The panel shows the hops it would send.' };

    case 'NotAV3Pool':
      return { title: 'That is not a v3 pool for this pair.', fatal: false,
        sentence: 'The contract checks the pool against the factory before it will store it.' };

    case 'NoPosition':
      return { title: 'The vault holds no position.', fatal: true,
        sentence: 'There is nothing to collect from or withdraw.' };

    case 'StillLocked':
      return { title: 'The lock has not expired.', fatal: true,
        sentence: 'The position cannot leave before then. The lock can be extended, and never shortened.' };

    case 'UnlockNotLater':
      return { title: 'That date is not later than the current one.', fatal: false,
        sentence: 'The unlock date only ever moves further out. That is the whole point of it.' };

    case 'AlreadyHoldsAPosition':
      return { title: 'The vault already holds a position.', fatal: true,
        sentence: 'It takes one, once.' };

    // ── not the chain's ─────────────────────────────────────────────────
    case 'UserRejected':
      return { title: 'You cancelled it.', fatal: false,
        sentence: 'Nothing was sent and nothing was taken.', fix: { label: 'Try again', kind: 'retry' } };

    case 'WrongNetwork':
      return { title: 'Wrong network.', fatal: true,
        sentence: 'Avian Stock is on Robinhood Chain, id 4663. Nothing here can be signed until you switch.',
        fix: { label: 'Switch to Robinhood Chain', kind: 'switch-network' } };

    case 'NoWallet':
      return { title: 'No wallet found.', fatal: true,
        sentence: 'Install a browser wallet, or open this page inside a wallet’s own browser.' };

    case 'ReceiptUnseen':
      // No fix button. There is nothing to retry that would be safe, and the
      // hash is already on screen — sending it again is how you buy twice.
      return { title: 'Sent. We could not see it confirm.', fatal: false, sent: true,
        sentence: 'It went to the network and the receipt did not come back in time. It may have landed, and it may still — check before you send it again.' };

    case 'ReadFailed':
      return { title: 'That read failed.', fatal: false,
        sentence: 'The node did not answer. Nothing is wrong with your wallet or your birds.',
        fix: { label: 'Try again', kind: 'retry' } };

    default:
      return { title: 'That didn’t go through and nothing was taken.', fatal: false,
        sentence: 'Nothing about your bird is reserved either — if someone else composes it first, it’s theirs.',
        fix: { label: 'Try again', kind: 'retry' } };
  }
}

/**
 * The detail line: the decoded error name and its selector, for a bug report.
 * Never the sentence — this is the small print under it.
 *
 * The wiring layer attaches a `detail` to anything it could NOT decode: what
 * the person was doing, the raw selector, which ABI it came from. An
 * unrecognised failure has to stay reportable, or "Unknown" is all anyone can
 * ever say about it.
 */
export function errorDetail(e: unknown): string | null {
  if (!(e instanceof ContractError)) return null;
  const extra = (e as ContractError & { detail?: string }).detail;
  const head = e.selector ? `${e.errorName} · ${e.selector}` : e.errorName;
  return extra ? `${head} · ${extra}` : head;
}
