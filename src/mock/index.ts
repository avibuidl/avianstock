// The public surface. Components import from here and from nowhere else —
// so replacing the mock with chain reads was one directory, not a search
// across the app.
//
// Everything below that touches a chain now goes through `./source`, which
// dispatches to the fixtures or to `src/chain/` depending on the active
// deployment manifest's `driver`. The names, the shapes and the call sites are
// exactly what they were.

export * from './types';
export * from './errors';
export * from './store';

// The seam, dispatched. `source.ts` says which side of it a call lands on.
export {
  // wallet and network
  listWallets, connect, disconnect, switchNetwork, connection, onConnectionChanged,
  NETWORK, network, isMock,
  // reads
  getCollection, getWallet, getBird, getBirdsOf, getMintedBirds, getPerch, getBrood, simulateSettle,
  canSweep, getSweep,
  getLaunch, getVault, getTreasury, getDeployment, getSupply, getRewardSplit, getPrices,
  comboTaken, nearestAvailable, quoteSell, quoteBuyNext, quoteBuy, nextBirds, freeMintStatus,
  // the site's own logic
  checkTransferSafety, satchelAddressOf,
  traitsForId, warmTraits, rewardTokenMeta, buyFeeBpsAt, ADDRESSES, THIRD_PARTY,
  // writes
  approveAviansForMint, approveAviansForPerch, approveAviansForNest,
  setPerchApproval,
  signMintPermit, mint, mintMany, mintFree, sellToPerch, buyNext, buyNamed,
  brood, upgrade, redirect, settle, claim, transferBird, createSatchel, routeFor, onWrite,
  prepareSatchels, grantSweeper, sweep,
  buyForRoost, takeRoostReading, convertAndStream,
  // the Roost and AVIAN staking
  getRoost, getRoostScreen, getStaking, distribute, deliverHeld, approveAviansForStaking, stake, withdrawStake,
  claimStakingReward, exitStaking,
  // the flywheel snapshot
  getFlywheel,
  // the council
  getCouncil,
  // the owner's seat
  getSeat, stillHere, proposeOwner, seatRunFixture,
  // trading AVIAN
  canSwap, getSwapState, quoteSwap, swap,
  approveAviansForPermit2, approvePermit2ForRouter, overCap, CAP_MARGIN_BPS,
} from './source';

// The owner surface. Behind this seam sit `src/chain/admin.ts` and
// `src/chain/admin-writes.ts`, the only two files in the application that hold
// an owner ABI — so the admin screen imports from here like every other screen
// and reaches into `src/chain` no more than the mint screen does.
export {
  getAdmin, getOwnerStatus, readForeignToken, encodeValidatorOperation, checkAllowlist,
  allowanceOf, balanceOfToken,
  setMintOpen, setFreeMintOpen, setAllowlistRoot, setAllowlisted, releaseFreeAllocation,
  setPrice, setRenderer, lockRenderer,
  setTransferValidator, lockTransferValidator, configureTransferValidator,
  rescueFromCollection,
  setFeeRecipient, rescueFromPerch,
  approveForProbe, addRewardToken, retireRewardToken, restream, setFunder, rescueBird,
  claimAdmin, claimRoostAdmin, setConversionConfig, setTargets, setPriceKeeper, setKeeperDropBps, setFloorPrice,
  readRoute, setRoute, setV3Route,
  collectFees, extendLock, withdrawPosition,
  transferOwnership, acceptOwnership,
} from './source';

export { useScenario, setScenario, applyPreset, PRESETS, DEFAULT_SCENARIO, type Scenario } from './scenario';

// Nominal figures, for prose and for a fallback before a read lands. Nothing
// that spends money uses one: the mint reads `price()`, the perch derives its
// prices from the AMM's own constants, and the tiers come from `tierCost()`.
export {
  MAX_SUPPLY, FREE_ALLOCATION, PAID_CEILING, PRICE, MIN_PRICE, PERCH_BASE, PERCH_BUY_NEXT,
  PERCH_BUY_NAMED, TIER_COST, TIER_WEIGHT, WINDOW_SECONDS, FEE_BPS, MAX_EXTRA_FEE_BPS,
  MAX_BUY_PER_TX, LOCK_SECONDS, AVIANS_SUPPLY, POOL_AVIANS, FREE_RESERVE,
  REWARD_TOKENS, STOCK_REWARD_TOKENS, AVIANS_REWARD, RETIRED_REWARD_TOKENS,
} from './fixtures';

// The deployment picker, and the boot result. Chrome, not chain data.
export {
  chooseId, chooseDeployment, loadIndex, loadManifest, manifest, hasManifest, switchDeployment,
  explorerTx, explorerAddress, unveiled, setUnveiledForDev, type Manifest, type DeploymentIndex,
} from '../chain/manifest';
export { lastStartup, type Check } from '../chain/startup';
export { capGuard, splitForCap, curveIsFromChain } from '../chain/launch';
// Live earnings between reads: pure arithmetic on the last read, tested in tests/estimate.test.ts.
export { estimateEarned } from '../chain/roost';
export { estimateUnsettled } from '../chain/reads';
export { detailOf } from '../chain/errors';
