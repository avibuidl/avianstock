// contracts/out  ->  src/chain/abis.generated.ts
//
// HANDOVER section 9c: take the ABIs from `contracts/out/<Name>.sol/<Name>.json`,
// never hand-write a fragment and never copy one off an explorer. This script is
// that instruction, automated, plus two corrections to it:
//
//   1. It filters the FUNCTIONS down to what the site actually calls, and it
//      emits TWO exports per contract that has an owner surface:
//
//        avianStockAbi            what a collector calls
//        avianStockAdminAbi       what the owner calls
//
//      The owner-only surface HANDOVER section 7 lists — setMintOpen, setPrice,
//      rescue, addRewardToken, claimAdmin and the rest — is absent from the
//      COLLECTOR ABI, so it cannot be called from any screen, any read or any
//      write outside `src/chain/admin.ts` and `src/chain/admin-writes.ts`.
//      Those two are the only files allowed to import a `*AdminAbi`, and
//      `scripts/check-hygiene.mjs` fails the build when any other file does.
//      Every screen therefore keeps importing an ABI that physically cannot
//      express an owner call.
//
//      An admin ABI carries the setters AND the getters that read back what
//      they set, because a panel that offers a control without showing its
//      current value is guessing.
//
//   2. It keeps EVERY error from every source, because errors are the decoder's
//      vocabulary. Three of the selectors HANDOVER section 7 names are NOT in
//      any of the seven contract ABIs, contrary to what section 9c says:
//
//        TransferFailed()      0x90b8ec18  ┐ Solady library errors: declared in
//        TransferFromFailed()  0x7939f424  ┘ SafeTransferLib, not in the caller
//        CreatorTokenTransferValidator__CallerMustBeWhitelisted()
//                              0xef28f901    raised by the validator, not by us
//
//      and a hook's revert arrives wrapped in Uniswap's
//        WrappedError(address,bytes4,bytes,bytes)
//
//      All four are in contracts/out too, just in other files — SafeTransferLib,
//      ICreatorTokenTransferValidator and CustomRevert — so they are still
//      GENERATED rather than typed from memory. That is the whole point.
//
// Run: npm run abis

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toFunctionSelector } from 'viem';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const out = resolve(root, '..', 'contracts', 'out');

/** Everything the site calls, and nothing else. */
const SOURCES = [
  {
    export: 'aviansAbi',
    file: 'Avians.sol/Avians.json',
    functions: [
      'name', 'symbol', 'decimals', 'totalSupply', 'TOTAL_SUPPLY',
      'balanceOf', 'allowance', 'approve',
      'nonces', 'DOMAIN_SEPARATOR', 'permit',
    ],
    events: ['Transfer', 'Approval'],
  },
  {
    export: 'avianStockAbi',
    file: 'AvianStock.sol/AvianStock.json',
    functions: [
      // ERC-721
      'name', 'symbol', 'tokenURI', 'ownerOf', 'balanceOf',
      'isApprovedForAll', 'setApprovalForAll', 'safeTransferFrom', 'transferFrom',
      'royaltyInfo', 'supportsInterface',
      // the collection
      // `totalSupply` is `totalMinted - burned` since the Perch started
      // burning, so anything comparing the two needs both.
      'totalMinted', 'burned', 'totalSupply', 'MAX_SUPPLY', 'WALLET_LIMIT', 'mintedBy',
      'mintOpen', 'price', 'MIN_PRICE', 'AVIANS', 'MINT_SINK', 'registry', 'NEST',
      // Who holds what (2026-09-11). These were a separate lens for one day;
      // they are the collection's own views now, one SLOAD per id. Ids
      // 1-based, `stop` inclusive and free past `totalMinted`. Pages of at
      // most 2,000, each its own eth_call — see `readEach` in chain/client.ts.
      'tokensOfOwnerIn', 'ownersOf',
      'comboTaken', 'tokenCombo', 'traitsOf',
      // the bird's own wallet
      'accountOf', 'createAccount', 'ERC6551_REGISTRY', 'ACCOUNT_IMPLEMENTATION',
      'ACCOUNT_SALT',
      // enforcement
      'getTransferValidator',
      // Public views, and the cheapest way for the header to know whether to
      // draw the owner's link. Reading WHO the owner is protects nothing; the
      // split is about the owner-only WRITES, and none of those are here.
      'owner', 'pendingOwner',
      // the free mint
      'freeMintOpen', 'FREE_ALLOCATION', 'freeMinted', 'reservedFree',
      'paidRemaining', 'requiredBacking', 'freeClaimed', 'allowlisted',
      'allowlistRoot', 'isAllowlisted', 'freeMintStatus', 'freeAllocationReleased',
      'freeMintOpenedAt', 'freeReleaseAvailableAt', 'freeOpenSeconds',
      // the writes
      'mint', 'mintWithPermit', 'mintMany', 'mintManyWithPermit', 'mintFree',
    ],
    // NestHookFailed should never appear: the transfer hook into the Nest ran
    // out of its stipend or reverted, so a brood that should have expired did
    // not. A receipt that carries it is shown as a warning, not filed away.
    events: ['Transfer', 'ApprovalForAll', 'Minted', 'FreeMinted', 'Burned', 'NestHookFailed'],
    admin: [
      // the two doors, the list, the price
      'setMintOpen', 'setFreeMintOpen', 'setAllowlistRoot', 'setAllowlisted',
      'releaseFreeAllocation', 'setPrice',
      // royalties, the art, enforcement
      'setDefaultRoyalty', 'deleteDefaultRoyalty',
      'setRenderer', 'lockRenderer', 'setTransferValidator', 'lockTransferValidator',
      'configureTransferValidator',
      // the sweep
      'rescue',
      // ownership, two-step everywhere
      'owner', 'pendingOwner', 'transferOwnership', 'acceptOwnership',
      // and everything that reads back what the above set
      'mintOpen', 'freeMintOpen', 'price', 'MIN_PRICE', 'allowlistRoot', 'allowlisted',
      'renderer', 'rendererLocked', 'getTransferValidator', 'transferValidatorLocked',
      'freeAllocationReleased', 'freeReleaseAvailableAt', 'freeMintOpenedAt',
      'freeMinted', 'FREE_ALLOCATION', 'FREE_RELEASE_DELAY', 'requiredBacking',
      'royaltyInfo', 'AVIANS', 'MINT_SINK',
    ],
  },
  {
    export: 'thePerchAbi',
    file: 'ThePerch.sol/ThePerch.json',
    functions: [
      'nft', 'avians', 'BASE', 'SELL_FEE_BPS', 'BUY_FEE_BPS', 'PICK_FEE_BPS',
      // `feeRecipient` is the Roost since 2026-09-18: every fee, whole.
      // (`BURN_SHARE_BPS` is gone with the burn.)
      'feeRecipient',
      'poolSize', 'lowestId', 'isHeld', 'heldWord', 'backingRequired',
      'quoteSell', 'quoteBuyNext', 'quoteBuy',
      'sell', 'buyNext', 'buy',
      'owner', 'pendingOwner',
      // One bird in every hundred deposited is burnt — while more than
      // BURN_FLOOR birds are alive. Below the floor `burnsActive` is false,
      // the countdown reads 0 (meaning "no burns", never "next sale burns"),
      // and a hundredth is withheld: BurnWithheld in place of BirdBurned.
      'BURN_EVERY', 'BURN_FLOOR', 'burnsActive', 'deposits', 'depositsUntilNextBurn',
    ],
    // `FeeTaken` and `Registered` ride on every sale and buy; a receipt that
    // names the burnt and the Treasury's halves is one a collector can check.
    events: ['Sold', 'Bought', 'BirdBurned', 'BurnWithheld', 'FeeTaken', 'Registered'],
    admin: [
      'setFeeRecipient', 'rescueERC20',
      'owner', 'pendingOwner', 'transferOwnership', 'acceptOwnership',
      'feeRecipient', 'avians', 'nft',
    ],
  },
  {
    export: 'theNestAbi',
    file: 'TheNest.sol/TheNest.json',
    // BROODING, NOT STAKING (2026-09-11). Nothing is sent anywhere: a bird
    // broods in its holder's wallet, the tier cost is burned, and rewards are
    // delivered wherever `deliveryOf` says — the bird's own wallet by default,
    // or the activator's by choice. The only approval is AVIANS to the Nest.
    // There is no bird approval and never a reason to ask for one.
    functions: [
      'COLLECTION', 'AVIANS',
      'TIER_1_COST', 'TIER_2_COST', 'TIER_3_COST', 'tierCost', 'MAX_TIER',
      // the brood, per bird
      'broodOf', 'isBrooding', 'weightOf', 'deliveryOf', 'earned', 'pending',
      'claimable', 'totalWeight',
      // the streams
      'listedRewardTokens', 'rewardTokenCount', 'isRewardToken',
      'wasEverRewardToken', 'MAX_REWARD_TOKENS',
      'rewardPerToken', 'rewardPerTokenAt', 'rewardData', 'escrowedOf',
      'lastTimeRewardApplicable', 'checkpointCount', 'checkpointAt',
      // lifetime counters, for a stats panel with no indexer
      // `totalForwarded` was `totalBurned` until 2026-09-18: tier costs go on
      // to the Roost (`costSink`) now, and nothing is burnt at a brood.
      'totalBrooding', 'totalForwarded', 'totalPaid', 'totalReturned', 'totalFunded', 'costSink',
      // the writes — every one a holder's own
      'brood', 'broodTo', 'upgrade', 'redirect', 'settle', 'claim', 'donate',
      'owner', 'pendingOwner',
    ],
    events: [
      'Brooded', 'Upgraded', 'Redirected', 'Expired', 'Settled', 'ExpirySettled',
      'BroodClosed', 'RewardReturned', 'RewardHeld', 'RewardPaid', 'BirdRescued',
      // A stream starting — from a conversion, or a donation, both of which a
      // collector can trigger. The Treasury card's receipt names the stream.
      'RewardAdded', 'RewardDonated',
    ],
    admin: [
      // `rescueBird`: a bird someone transferred INTO the Nest by mistake.
      // There is no other reason for a bird to be there.
      'addRewardToken', 'retireRewardToken', 'restream', 'setFunder', 'rescueBird',
      'owner', 'pendingOwner', 'transferOwnership', 'acceptOwnership',
      'listedRewardTokens', 'isRewardToken', 'wasEverRewardToken', 'isFunder',
      // `rewardTokenCount` is what the panel shows against MAX_REWARD_TOKENS.
      // It was on the collector list only, and the panel's multicall threw
      // "function not found on ABI" — the whole owner screen read as failed.
      // Found on the launch dry run.
      'rewardData', 'escrowedOf', 'totalWeight', 'totalBrooding', 'rewardTokenCount',
      'MAX_REWARD_TOKENS', 'MIN_DURATION', 'MAX_DURATION', 'costSink',
    ],
  },
  {
    export: 'theRoostAbi',
    file: 'TheRoost.sol/TheRoost.json',
    // THE ROOST (2026-09-18). Where every AVIANS fee lands — the whole of every
    // Perch fee and every brooding tier cost — split 40% to AVIANS stakers,
    // 30% to brooding birds through the Nest, 20% burnt, 10% the admin's.
    // Anyone may turn it once a day; the site offers the turn when it is due.
    functions: [
      'cumulativeIn', 'unallocated', 'allocated',
      'stakingHeld', 'nestHeld', 'stakingReady', 'nestReady',
      'toStaking', 'toNest', 'burned', 'adminClaimed', 'adminClaimable',
      'nextDistributionAt', 'lastDistribution', 'MIN_INTERVAL',
      'STAKING_BPS', 'NEST_BPS', 'BURN_BPS', 'ADMIN_BPS', 'LEG_STAKING', 'LEG_NEST',
      'NEST', 'STAKING', 'AVIANS', 'admin',
      'distribute', 'deliverHeld',
    ],
    events: ['Allocated', 'Delivered', 'Held', 'Burned', 'AdminClaimed'],
    // The admin's tenth. `rescueERC20` is owner tooling and stays off both.
    admin: ['claimAdmin', 'admin', 'adminClaimable', 'adminClaimed', 'NEST', 'STAKING', 'AVIANS'],
  },
  {
    export: 'aviansStakingAbi',
    file: 'AviansStaking.sol/AviansStaking.json',
    // AVIANS STAKING (2026-09-18). Stake AVIANS, earn AVIANS, by amount,
    // streamed over a week from each of the Roost's deliveries. No lock, no
    // cooldown, no fee, no owner — so no admin surface at all.
    functions: [
      'stakedOf', 'earned', 'totalStaked',
      'rewardRate', 'periodFinish', 'remainingReward', 'undelivered', 'escrowed',
      'totalNotified', 'totalPaid', 'accounted', 'STREAM', 'ROOST', 'AVIANS',
      'stake', 'withdraw', 'claim', 'exit',
    ],
    events: ['Staked', 'Withdrawn', 'RewardPaid', 'RewardAdded'],
  },
  {
    export: 'treasuryAbi',
    file: 'Treasury.sol/Treasury.json',
    functions: [
      'STAKING', 'AVIANS', 'NATIVE', 'ADMIN_SHARE_BPS', 'MIN_INTERVAL_FLOOR',
      'cumulativeIn', 'claimable', 'convertible', 'adminClaimed', 'convertedOut',
      'adminShareBps', 'lastConversionAt', 'targets', 'targetCount', 'routeVenue',
      'conversionConfig',
      // Permissionless, and a selling point: anyone at all can convert the
      // Treasury's income into rewards. It belongs in a collector-facing UI.
      'convertAndStream',
      // `claimAdmin` used to be here, as a commented exception, so the Treasury
      // card could draw a withdraw button. It has moved to the admin surface
      // below with the withdraw control itself, and this list is back to having
      // no owner-only function in a collector ABI at all. `owner` and
      // `pendingOwner` stay: they are public views, and the header reads them.
      'owner', 'pendingOwner',
      // The price ticker (2026-09-13). Where the stock tokens trade: the v3
      // factory and WETH (immutables) and the route the owner set for each
      // reward token, whose one hop names the pool. Reads, all three.
      'V3_FACTORY', 'WETH', 'v3RouteOf',
    ],
    // Every event is public whoever emitted it; the admin surface carries none.
    // `Converted` and `Streamed` are what `convertAndStream` says it did;
    // `AdminClaimed` is what the owner's withdrawal says.
    events: ['Converted', 'Streamed', 'AdminClaimed'],
    admin: [
      'claimAdmin',
      'setConversionConfig', 'setTargets', 'setRoute', 'setV3Route',
      'setPriceKeeper', 'setKeeperDropBps', 'setFloorPrice',
      'owner', 'pendingOwner', 'transferOwnership', 'acceptOwnership',
      // read back what those set, and the bounds each one is validated against
      'conversionConfig', 'targets', 'targetCount', 'routeOf', 'v3RouteOf', 'routeVenue',
      'priceKeeper', 'maxKeeperDropBps', 'floorPrice', 'floorPriceSetAt',
      'claimable', 'cumulativeIn', 'convertible', 'adminShareBps', 'adminClaimed',
      'ADMIN_SHARE_BPS', 'MIN_INTERVAL_FLOOR', 'MAX_PER_CALL_BPS_CAP',
      'SLIPPAGE_BPS_CAP', 'MIN_PRICE_AGE', 'MAX_PRICE_AGE', 'MAX_TARGETS', 'MAX_HOPS',
      'STAKING', 'AVIANS', 'NATIVE',
    ],
  },
  {
    export: 'aviansHookAbi',
    file: 'AviansHook.sol/AviansHook.json',
    functions: [
      'LAUNCH_AT', 'isLaunched', 'WINDOW', 'windowEndsAt',
      'currentBuyFeeBps', 'buyFeeBpsAt', 'sellFeeBps',
      'MAX_BUY_PER_TX', 'FEE_BPS', 'MAX_EXTRA_FEE_BPS',
      'POOL_FEE', 'TICK_SPACING', 'AVIANS', 'TREASURY',
    ],
    events: [],
  },
  {
    export: 'traitRegistryAbi',
    file: 'TraitRegistry.sol/TraitRegistry.json',
    functions: ['counts', 'traitCount', 'categoryName', 'traitName', 'anchorBox'],
    events: [],
  },
  {
    export: 'liquidityVaultAbi',
    file: 'LiquidityVault.sol/LiquidityVault.json',
    functions: [
      'tokenId', 'unlockAt', 'isLocked', 'positionLiquidity', 'LOCK_DURATION',
      'owner', 'pendingOwner',
    ],
    // The receipt of a collection names what was actually paid. An event is
    // public whoever emits it, so it sits on the collector surface; the admin
    // surface carries no events at all.
    events: ['FeesCollected'],
    admin: [
      'collectFees', 'extendLock', 'withdraw',
      'owner', 'pendingOwner', 'transferOwnership', 'acceptOwnership',
      'tokenId', 'unlockAt', 'isLocked', 'positionLiquidity', 'LOCK_DURATION',
      'POSITION_MANAGER',
    ],
  },
  {
    export: 'sweeperAbi',
    file: 'Sweeper.sol/Sweeper.json',
    // THE SWEEPER (2026-09-12). Stateless, ownerless, no admin surface: every
    // function on it is a holder's (or anyone's, for `prepare`), so it has a
    // collector export and nothing else. Its `NotTheOwner` shares the Nest's
    // signature and selector; its `Reentrancy` is Solady's, like the Perch's.
    functions: ['prepare', 'sweep', 'status', 'sweepable', 'COLLECTION'],
    events: ['Swept', 'SweepSkipped', 'SatchelDeployed'],
  },
  {
    export: 'accountV3Abi',
    file: 'IERC6551Account.sol/IERC6551Account.json',
    // The bird's own wallet — Tokenbound's AccountV3, which is not ours and is
    // not in `contracts/src`. This is the slice the tests drive against the
    // real code on 4663 (`contracts/test/mocks/IERC6551Account.sol`, proved by
    // `Sweeper.t.sol`), compiled like everything else here rather than typed
    // from memory. The site sends exactly one call to it: `setPermissions`,
    // the holder's grant to the Sweeper. Its `NotAuthorized()` is the refusal
    // a stranger gets.
    functions: ['setPermissions', 'permissions', 'owner'],
    events: [],
  },
  {
    export: 'positionManagerAbi',
    file: 'IPositionManager.sol/IPositionManager.json',
    // Uniswap's position NFT. The vault holds one; these read WHICH pool and
    // WHICH tick range it is in, so the pending fees can be derived. Reads
    // only — the vault is the only thing that may modify its liquidity.
    functions: ['getPoolAndPositionInfo', 'positionInfo', 'getPositionLiquidity'],
    events: [],
  },
  {
    export: 'stateViewAbi',
    file: 'IStateView.sol/IStateView.json',
    // Uniswap's own lens over the PoolManager's storage. `getPositionInfo`
    // gives the position's stored fee-growth-inside values; `getFeeGrowthInside`
    // gives the current ones. Their difference times the liquidity is what
    // `collectFees` will pay, per currency — the same arithmetic the pool does.
    functions: ['getPositionInfo', 'getFeeGrowthInside', 'getSlot0', 'getLiquidity'],
    events: [],
  },
  {
    export: 'uniswapV3FactoryAbi',
    file: 'IUniswapV3.sol/IUniswapV3Factory.json',
    // The stock tokens trade on Uniswap v3 against WETH. The Treasury's own
    // interface slice (contracts/src/interfaces), compiled with the rest. The
    // ticker asks it one question: which pool, for a token, WETH and a fee.
    functions: ['getPool'],
    events: [],
  },
  {
    export: 'uniswapV3PoolAbi',
    file: 'IUniswapV3.sol/IUniswapV3Pool.json',
    // A pool's price is `slot0().sqrtPriceX96`; `token0` says which way round
    // it is; `liquidity` says whether there is anything behind it.
    functions: ['slot0', 'liquidity', 'token0', 'token1', 'fee'],
    events: [],
  },
  {
    export: 'v4QuoterAbi',
    file: 'IV4Quoter.sol/IV4Quoter.json',
    // Uniswap's own lens. Not imported by anything in `src/`, so `forge build`
    // does not reach it on its own — see the note in `load()` below.
    functions: ['quoteExactInputSingle'],
    events: [],
  },
  {
    export: 'universalRouterAbi',
    file: 'IUniversalRouter.sol/IUniversalRouter.json',
    // Vendored as an interface in `contracts/src/interfaces/`, the way
    // ICreatorTokenTransferValidator and IERC6551Registry are. One function.
    functions: ['execute'],
    events: [],
  },
  {
    export: 'permit2Abi',
    file: 'IAllowanceTransfer.sol/IAllowanceTransfer.json',
    // Selling needs two approvals: AVIANS -> Permit2 the ordinary way, then
    // Permit2 -> the router through this.
    functions: ['approve', 'allowance'],
    events: [],
  },
  {
    export: 'transferValidatorAbi',
    file: 'ICreatorTokenTransferValidator.sol/ICreatorTokenTransferValidator.json',
    // A reverting view: the cheapest honest way to ask whether the batch route
    // (`sell(ids)` / `stake(ids, tiers)`) is open on this deployment, before a
    // person is asked to sign anything. HANDOVER section 7, 0xef28f901.
    functions: ['validateTransfer'],
    events: [],
    // The seven operations `configureTransferValidator` composes its calldata
    // from. This ABI is used ONLY to encode — the site never calls the
    // validator directly, and the collection's own selector allowlist is what
    // decides which of these it will forward. Six of the seven are exactly what
    // `EnforcementRunbook.applyPolicy` builds; the two removals are the undo
    // for the two adds, so the panel cannot make a change it has to send the
    // owner to a script to reverse.
    admin: [
      'createList', 'applyListToCollection',
      'setTransferSecurityLevelOfCollection', 'setTokenTypeOfCollection',
      'addAccountsToWhitelist', 'removeAccountsFromWhitelist',
      'addAccountsToAuthorizers', 'removeAccountsFromAuthorizers',
    ],
  },
];

/** Error-only sources: the vocabulary the decoder needs, not callable surface. */
const ERROR_SOURCES = [
  'SafeTransferLib.sol/SafeTransferLib.json',
  'ICreatorTokenTransferValidator.sol/ICreatorTokenTransferValidator.json',
  'CustomRevert.sol/CustomRevert.json',
];

/**
 * Errors declared in a Solidity SOURCE that `forge build` never compiles,
 * because nothing of ours imports it. The V4Quoter answers a quote by
 * reverting, and when the swap it simulates reverts instead — the hook's
 * `BuyTooLarge` in the opening window, say — it wraps that revert in
 * `UnexpectedRevertBytes(bytes)` from its own `QuoterRevert` library. That
 * library is in `lib/v4-periphery` and in no artifact, so the declaration is
 * read out of the file, the way the action bytes are — never typed here.
 */
const SOURCE_ERRORS = [
  {
    file: resolve(root, '..', 'contracts', 'lib', 'v4-periphery', 'src', 'libraries', 'QuoterRevert.sol'),
    names: ['UnexpectedRevertBytes'],
  },
];

/**
 * Errors of a contract we call but whose source is neither vendored nor in
 * `lib/`. The UniversalRouter refuses an `execute` past its deadline with
 * `TransactionDeadlinePassed()` — declared in Uniswap's universal-router
 * repository (`contracts/interfaces/IUniversalRouter.sol`), which is not a
 * dependency here on purpose (see `src/interfaces/IUniversalRouter.sol`).
 * The SIGNATURE is recorded, with its provenance, and the selector is
 * computed from it at build time like every other; no hex is typed anywhere.
 * Seen on the launch dry run as an undecoded 0x5bf6f916.
 */
const THIRD_PARTY_ERRORS = [
  { signature: 'TransactionDeadlinePassed()', from: 'universal-router/contracts/interfaces/IUniversalRouter.sol (upstream, not vendored)' },
];

function fromSignature({ signature }) {
  const m = signature.match(/^(\w+)\((.*)\)$/);
  if (!m) throw new Error(`bad signature ${signature}`);
  const inputs = m[2] === '' ? [] : m[2].split(',').map((type) => ({ name: '', type: type.trim(), internalType: type.trim() }));
  return { type: 'error', name: m[1], inputs };
}

function readSolidityErrors(file, names) {
  const text = readFileSync(file, 'utf8');
  return names.map((name) => {
    const m = text.match(new RegExp(`error\\s+${name}\\s*\\(([^)]*)\\)`));
    if (!m) throw new Error(`${file}: no error ${name}`);
    const inputs = m[1].trim() === '' ? [] : m[1].split(',').map((p) => {
      const [type, argName] = p.trim().split(/\s+/);
      return { name: argName ?? '', type, internalType: type };
    });
    return { type: 'error', name, inputs };
  });
}

const sig = (e) => `${e.name}(${e.inputs.map((i) => i.type).join(',')})`;

function load(file) {
  const p = join(out, file);
  if (!existsSync(p)) {
    throw new Error(
      `${file} is not in contracts/out. Run \`forge build\` in contracts/ first.`,
    );
  }
  const json = JSON.parse(readFileSync(p, 'utf8'));
  if (!Array.isArray(json.abi)) throw new Error(`${file} has no abi field`);
  return json.abi;
}

const errorsBySelector = new Map();
function collectErrors(abi, from) {
  for (const e of abi) {
    if (e.type !== 'error') continue;
    const selector = toFunctionSelector(sig(e));
    const seen = errorsBySelector.get(selector);
    if (seen && sig(seen.entry) !== sig(e)) {
      throw new Error(
        `selector collision ${selector}: ${sig(seen.entry)} (${seen.from}) vs ${sig(e)} (${from})`,
      );
    }
    if (!seen) errorsBySelector.set(selector, { entry: e, from });
  }
}

/**
 * The V4 action bytes and the router command bytes.
 *
 * Not hand-typed, and not in any ABI either — they are Solidity `constant`s,
 * which compiler output does not carry. So they are READ OUT OF THE SOURCE:
 * the actions from Uniswap's own `Actions.sol`, and the two command bytes from
 * `test/URPrograms.sol`, which is the file whose programs the phase-B fork
 * tests send to the real router on 4663. Taking the site's numbers from the
 * file that is actually exercised against the live contract is the point — the
 * two cannot drift apart without this build failing.
 */
const CONSTANT_SOURCES = [
  {
    export: 'V4_ACTIONS',
    file: resolve(root, '..', 'contracts', 'lib', 'v4-periphery', 'src', 'libraries', 'Actions.sol'),
    names: ['SWAP_EXACT_IN_SINGLE', 'SETTLE_ALL', 'TAKE_ALL'],
  },
  {
    export: 'UR_COMMANDS',
    file: resolve(root, '..', 'contracts', 'test', 'URPrograms.sol'),
    names: ['V4_SWAP', 'SWEEP'],
  },
];

function readSolidityConstants(file, names) {
  const text = readFileSync(file, 'utf8');
  const out = {};
  for (const name of names) {
    const m = text.match(
      new RegExp(`constant\\s+${name}\\s*=\\s*(0x[0-9a-fA-F]+|\\d+)`),
    );
    if (!m) throw new Error(`${file}: no constant ${name}`);
    out[name] = Number(m[1]); /* count */
  }
  return out;
}

const parts = [];
const missing = [];

/** `treasuryAbi` -> `treasuryAdminAbi`. */
const adminExport = (name) => `${name.replace(/Abi$/, '')}AdminAbi`;

/**
 * Getters that legitimately appear on both surfaces. A VIEW on both lists is
 * duplication, not a leak — the panel shows `price` beside `setPrice` and the
 * mint screen shows the same `price` to a collector. A NON-view on both lists
 * is the thing the check below is looking for.
 */
const READ_ONLY_ON_BOTH = [
  'owner', 'pendingOwner',
  'price', 'MIN_PRICE', 'mintOpen', 'freeMintOpen', 'allowlistRoot', 'allowlisted',
  'getTransferValidator', 'freeAllocationReleased', 'freeReleaseAvailableAt',
  'freeMintOpenedAt', 'freeMinted', 'FREE_ALLOCATION', 'requiredBacking',
  'royaltyInfo', 'AVIANS', 'MINT_SINK', 'feeRecipient', 'avians', 'nft',
  'listedRewardTokens', 'isRewardToken', 'wasEverRewardToken', 'rewardData',
  'escrowedOf', 'totalWeight', 'totalBrooding', 'rewardTokenCount', 'MAX_REWARD_TOKENS',
  'conversionConfig', 'targets', 'targetCount', 'routeVenue', 'v3RouteOf', 'claimable', 'costSink',
  'admin', 'adminClaimable', 'adminClaimed', 'NEST',
  'cumulativeIn', 'convertible', 'adminShareBps', 'adminClaimed',
  'ADMIN_SHARE_BPS', 'MIN_INTERVAL_FLOOR', 'STAKING', 'NATIVE',
  'tokenId', 'unlockAt', 'isLocked', 'positionLiquidity', 'LOCK_DURATION',
];

/** The functions and events one named surface keeps, plus every error. */
function surface(abi, functions, events) {
  const wanted = new Set(functions);
  return abi.filter(
    (e) =>
      (e.type === 'function' && wanted.has(e.name))
      || (e.type === 'event' && events.includes(e.name))
      // Its OWN errors travel with it. viem decodes a revert against the ABI it
      // was handed, so an ABI without errors turns `ComboTaken` into "the
      // contract function reverted" — a hex blob with extra steps. The admin
      // surface needs them at least as much: every owner call has its own
      // refusal, and `TooManyRewardTokens(current, max)` carries the two
      // numbers a panel would otherwise have to guess at.
      || e.type === 'error',
  );
}

for (const src of SOURCES) {
  const abi = load(src.file);
  collectErrors(abi, src.file);

  for (const name of [...src.functions, ...(src.admin ?? [])]) {
    if (!abi.some((e) => e.type === 'function' && e.name === name)) {
      missing.push(`${src.file}: no function ${name}`);
    }
  }
  for (const name of src.events) {
    if (!abi.some((e) => e.type === 'event' && e.name === name)) {
      missing.push(`${src.file}: no event ${name}`);
    }
  }

  parts.push({ name: src.export, file: src.file, entries: surface(abi, src.functions, src.events) });

  if (src.admin) {
    // A NON-view on both lists would mean an owner call had leaked into the
    // collector surface, which is the one property this split exists to keep.
    const leaked = src.admin.filter(
      (n) => src.functions.includes(n) && !READ_ONLY_ON_BOTH.includes(n),
    );
    if (leaked.length) {
      missing.push(`${src.file}: ${leaked.join(', ')} is on the collector list AND the admin list`);
    }
    parts.push({
      name: adminExport(src.export),
      file: src.file,
      admin: true,
      entries: surface(abi, src.admin, []),
    });
  }
}

for (const file of ERROR_SOURCES) collectErrors(load(file), file);
for (const s of SOURCE_ERRORS) collectErrors(readSolidityErrors(s.file, s.names), `${relative(root, s.file).split('\\').join('/')} (source)`);
for (const e of THIRD_PARTY_ERRORS) collectErrors([fromSignature(e)], e.from);

/**
 * The four that are raised THROUGH our contracts but declared elsewhere —
 * Solady's two, the validator's whitelist refusal and Uniswap's wrapper. Every
 * contract ABI gets them, because every one of them can come back from a call
 * to it and nothing else would name them.
 */
const SHARED_ERRORS = ['TransferFailed()', 'TransferFromFailed()',
  'CreatorTokenTransferValidator__CallerMustBeWhitelisted()',
  'WrappedError(address,bytes4,bytes,bytes)'];

for (const part of parts) {
  const already = new Set(part.entries.filter((e) => e.type === 'error').map(sig));
  for (const { entry } of errorsBySelector.values()) {
    if (SHARED_ERRORS.includes(sig(entry)) && !already.has(sig(entry))) part.entries.push(entry);
  }
}

if (missing.length) {
  console.error('The compiled ABIs do not carry what this site calls:\n  ' + missing.join('\n  '));
  console.error('\nEither contracts/out is stale (run `forge build`) or a name changed.');
  process.exit(1);
}

// ── emit ──────────────────────────────────────────────────────────────────

const json = (v) => JSON.stringify(v, null, 2).replace(/\n/g, '\n');

const errorEntries = [...errorsBySelector.entries()]
  .sort((a, b) => a[0].localeCompare(b[0]))
  .map(([selector, { entry, from }]) => ({ selector, entry, from }));

const collector = parts.filter((p) => !p.admin);
const owner = parts.filter((p) => p.admin);

let ts = `// GENERATED by scripts/build-abis.mjs from contracts/out. Do not edit.
//
// Regenerate with \`npm run abis\` after \`forge build\` in contracts/.
// The function lists are curated in the script: the owner-only surface is
// deliberately absent, so it cannot be called from this application at all.

`;

/**
 * The banner over an admin export. It says what the split is and, more
 * importantly, what it is not: importing this ABI is not what authorises an
 * owner call, and not importing it is not what prevents one.
 */
const ADMIN_NOTE = (file) =>
  '/**\n'
  + ' * THE OWNER SURFACE of contracts/out/' + file + '.\n'
  + ' *\n'
  + ' * Only src/chain/admin.ts and src/chain/admin-writes.ts may import this,\n'
  + ' * and scripts/check-hygiene.mjs fails the build when anything else does.\n'
  + ' *\n'
  + ' * That is a property of the bundle, not a permission. onlyOwner on the\n'
  + ' * contract is what refuses everyone else, whatever this file contains.\n'
  + ' * The split keeps the rest of the application unable to express an owner\n'
  + ' * call at all, which is a different and much smaller claim.\n'
  + ' */';

for (const p of collector) {
  ts += `/** From \`contracts/out/${p.file}\`. */\nexport const ${p.name} = ${json(p.entries)} as const;\n\n`;
}

ts += `/**
 * Every custom error from every source above, deduplicated by selector — the
 * decoder's whole vocabulary. A revert that does not decode against this is
 * reported as unknown WITH its selector, never as "execution reverted".
 */
export const errorAbi = ${json(errorEntries.map((e) => e.entry))} as const;

/** selector -> the error's canonical signature, for the bug-report detail line. */
export const ERROR_SIGNATURES: Record<string, string> = ${json(
  Object.fromEntries(errorEntries.map((e) => [e.selector, sig(e.entry)])),
)};

/** Where each one came from, so a surprise selector can be traced. */
export const ERROR_SOURCES: Record<string, string> = ${json(
  Object.fromEntries(errorEntries.map((e) => [e.selector, e.from])),
)};

export const GENERATED_FROM = ${json(SOURCES.map((s) => s.file).concat(ERROR_SOURCES))} as const;
`;

let adminTs = `// GENERATED by scripts/build-abis.mjs from contracts/out. Do not edit.
//
// THE OWNER SURFACE, in a file of its own.
//
// Not for secrecy — an ABI hides nothing, and \`onlyOwner\` on each contract is
// what refuses a stranger whatever any bundle contains. It is here because a
// module is the unit a bundler splits on: beside the collector ABIs these were
// pulled into the main bundle by every screen that imports one of those, and
// every visitor paid for a screen one person opens. In their own module,
// imported only by \`src/chain/admin.ts\` and \`src/chain/admin-writes.ts\` —
// which \`src/mock/source.ts\` reaches through a dynamic import — they land in
// the owner's chunk and stay there.
//
// \`scripts/check-hygiene.mjs\` fails the build if any other file imports one.

`;

for (const p of owner) {
  adminTs += `${ADMIN_NOTE(p.file)}\nexport const ${p.name} = ${json(p.entries)} as const;\n\n`;
}

ts += `/**
 * Uniswap's v4 action bytes and the UniversalRouter command bytes, read from
 * the Solidity named above rather than typed here. See CONSTANT_SOURCES in
 * scripts/build-abis.mjs for why the command bytes come from the test file.
 */
`;
for (const c of CONSTANT_SOURCES) {
  ts += `export const ${c.export} = ${json(readSolidityConstants(c.file, c.names))} as const;\n\n`;
}

const dest = resolve(root, 'src', 'chain');
mkdirSync(dest, { recursive: true });
writeFileSync(join(dest, 'abis.generated.ts'), ts);
writeFileSync(join(dest, 'abis.admin.generated.ts'), adminTs);

console.log(
  `abis.generated.ts: ${collector.length} contracts, `
  + `${collector.reduce((n, p) => n + p.entries.length, 0)} entries, `
  + `${errorEntries.length} distinct error selectors.`,
);
console.log(
  `abis.admin.generated.ts: ${owner.length} owner surfaces, `
  + `${owner.reduce((n, p) => n + p.entries.length, 0)} entries.`,
);
