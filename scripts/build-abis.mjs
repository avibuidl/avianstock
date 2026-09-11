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
import { dirname, join, resolve } from 'node:path';
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
      'mintOpen', 'price', 'MIN_PRICE', 'AVIANS', 'MINT_SINK', 'registry',
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
    events: ['Transfer', 'ApprovalForAll', 'Minted', 'FreeMinted', 'Burned'],
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
      'BURN_SHARE_BPS', 'feeRecipient',
      'poolSize', 'lowestId', 'isHeld', 'heldWord', 'backingRequired',
      'quoteSell', 'quoteBuyNext', 'quoteBuy',
      'sell', 'buyNext', 'buy',
      'owner', 'pendingOwner',
      // One bird in every hundred deposited is burnt. `deposits` counts paid
      // sales only, and `depositsUntilNextBurn` is the sell card's countdown.
      'BURN_EVERY', 'deposits', 'depositsUntilNextBurn',
    ],
    events: ['Sold', 'Bought', 'BirdBurned'],
    admin: [
      'setFeeRecipient', 'rescueERC20',
      'owner', 'pendingOwner', 'transferOwnership', 'acceptOwnership',
      'feeRecipient', 'avians', 'nft',
    ],
  },
  {
    export: 'theNestAbi',
    file: 'TheNest.sol/TheNest.json',
    functions: [
      'COLLECTION', 'AVIANS',
      'TIER_1_COST', 'TIER_2_COST', 'TIER_3_COST', 'tierCost', 'MAX_TIER',
      'totalWeight', 'weightOf', 'stakeOf', 'stakerOf',
      'stakedIdsOf', 'stakedCountOf',
      'listedRewardTokens', 'rewardTokenCount', 'isRewardToken',
      'wasEverRewardToken', 'MAX_REWARD_TOKENS',
      'earned', 'rewardPerToken', 'rewardData', 'escrowedOf',
      'lastTimeRewardApplicable',
      'totalStaked', 'totalBurned', 'totalPaid', 'claimedBy', 'totalFunded',
      'stake', 'unstake', 'claim', 'claimAll',
      'owner', 'pendingOwner',
    ],
    events: ['Staked', 'Unstaked', 'RewardPaid', 'RewardSkipped'],
    admin: [
      'addRewardToken', 'retireRewardToken', 'restream', 'setFunder', 'rescueUnstaked',
      'owner', 'pendingOwner', 'transferOwnership', 'acceptOwnership',
      'listedRewardTokens', 'isRewardToken', 'wasEverRewardToken', 'isFunder',
      'rewardData', 'escrowedOf', 'totalWeight', 'stakerOf',
      'MAX_REWARD_TOKENS', 'MIN_DURATION', 'MAX_DURATION',
      // `claimAll` returns `_snapshotTokens`, which has no getter of its own.
      // Simulated, it is the only honest way to count what the 8-token cap
      // actually counts. See `snapshotCount` in src/chain/admin.ts.
      'claimAll',
    ],
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
    ],
    events: [],
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
    events: [],
    admin: [
      'collectFees', 'extendLock', 'withdraw',
      'owner', 'pendingOwner', 'transferOwnership', 'acceptOwnership',
      'tokenId', 'unlockAt', 'isLocked', 'positionLiquidity', 'LOCK_DURATION',
      'POSITION_MANAGER',
    ],
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
  'escrowedOf', 'totalWeight', 'stakerOf', 'MAX_REWARD_TOKENS', 'claimAll',
  'conversionConfig', 'targets', 'targetCount', 'routeVenue', 'claimable',
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
