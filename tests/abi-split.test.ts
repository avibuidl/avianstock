// The collector ABIs cannot express an owner call.
//
// This is the property the whole two-ABI arrangement exists for, and it is the
// kind that decays quietly: someone adds `setPrice` to a function list to save
// a round trip, and a year later nobody remembers there was ever a rule.
//
// What it does NOT claim, and what no test could: that this protects the
// contracts. `onlyOwner` does that, and it refuses a stranger whether or not
// these ABIs ship. What is checked here is narrower — that a mistake in a
// screen, a read or a collector write cannot BECOME an owner call, because the
// ABI those files hold has no such entry to encode.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aviansAbi, theNestAbi, avianStockAbi, liquidityVaultAbi, thePerchAbi,
  transferValidatorAbi, treasuryAbi,
} from '../src/chain/abis.generated';
import {
  theNestAdminAbi, avianStockAdminAbi, liquidityVaultAdminAbi,
  thePerchAdminAbi, transferValidatorAdminAbi, treasuryAdminAbi,
} from '../src/chain/abis.admin.generated';

type Entry = { type: string; name?: string; stateMutability?: string };

const names = (abi: readonly unknown[], write = true) =>
  (abi as Entry[])
    .filter((e) => e.type === 'function')
    .filter((e) => (write
      ? e.stateMutability !== 'view' && e.stateMutability !== 'pure'
      : true))
    .map((e) => e.name!);

/**
 * Every owner-only function on the five, by name. Typed out rather than derived,
 * because deriving it from the same generator that produced the ABIs would only
 * check the generator against itself.
 */
const OWNER_ONLY = [
  // AvianStock
  'setMintOpen', 'setFreeMintOpen', 'setAllowlistRoot', 'setAllowlisted',
  'releaseFreeAllocation', 'setPrice', 'setDefaultRoyalty', 'deleteDefaultRoyalty',
  'setRenderer', 'lockRenderer', 'setTransferValidator', 'lockTransferValidator',
  'configureTransferValidator', 'rescue',
  // ThePerch
  'setFeeRecipient', 'rescueERC20',
  // TheNest
  'addRewardToken', 'retireRewardToken', 'restream', 'setFunder', 'rescueUnstaked',
  // Treasury
  'claimAdmin', 'setConversionConfig', 'setTargets', 'setRoute', 'setV3Route',
  'setPriceKeeper', 'setKeeperDropBps', 'setFloorPrice',
  // LiquidityVault
  'collectFees', 'extendLock', 'withdraw',
  // all five
  'transferOwnership', 'acceptOwnership',
];

const COLLECTOR = {
  aviansAbi, avianStockAbi, thePerchAbi, theNestAbi, treasuryAbi,
  liquidityVaultAbi, transferValidatorAbi,
};

test('no owner-only function is in any collector ABI', () => {
  const leaked: string[] = [];
  for (const [label, abi] of Object.entries(COLLECTOR)) {
    for (const name of names(abi)) {
      if (OWNER_ONLY.includes(name)) leaked.push(`${label}.${name}`);
    }
  }
  assert.deepEqual(leaked, [], 'these owner calls can be encoded from a collector ABI');
});

test('the admin ABIs carry the owner surface they are for', () => {
  const surface = new Set([
    ...names(avianStockAdminAbi), ...names(thePerchAdminAbi),
    ...names(theNestAdminAbi), ...names(treasuryAdminAbi),
    ...names(liquidityVaultAdminAbi),
  ]);
  const missing = OWNER_ONLY.filter((n) => !surface.has(n));
  assert.deepEqual(missing, [], 'the panel cannot make these calls at all');
});

test('every ABI carries errors, or a revert would render as hex', () => {
  for (const [label, abi] of Object.entries({
    ...COLLECTOR,
    avianStockAdminAbi, thePerchAdminAbi, theNestAdminAbi,
    treasuryAdminAbi, liquidityVaultAdminAbi, transferValidatorAdminAbi,
  })) {
    const errors = (abi as unknown as Entry[]).filter((e) => e.type === 'error');
    assert.ok(errors.length > 0, `${label} has no error entries`);
  }
});

test('owner() and pendingOwner() are readable without the admin ABIs', () => {
  // The header decides whether to draw the owner's link from these, on every
  // page. If they were only on the admin surface, every connected wallet would
  // pull the owner chunk to answer a question about a screen it cannot use.
  for (const [label, abi] of Object.entries({
    avianStockAbi, thePerchAbi, theNestAbi, treasuryAbi, liquidityVaultAbi,
  })) {
    const views = names(abi, false);
    assert.ok(views.includes('owner'), `${label} cannot answer owner()`);
    assert.ok(views.includes('pendingOwner'), `${label} cannot answer pendingOwner()`);
  }
});

test('the validator config ABI encodes the runbook’s six, and the two undos', () => {
  const surface = names(transferValidatorAdminAbi);
  for (const name of [
    'createList', 'applyListToCollection', 'setTransferSecurityLevelOfCollection',
    'setTokenTypeOfCollection', 'addAccountsToWhitelist', 'addAccountsToAuthorizers',
    'removeAccountsFromWhitelist', 'removeAccountsFromAuthorizers',
  ]) {
    assert.ok(surface.includes(name), `the panel cannot compose ${name}`);
  }
  // And nothing else. List governance and account freezing stay in the script.
  for (const name of [
    'createListCopy', 'reassignOwnershipOfList', 'renounceOwnershipOfList',
    'freezeAccountsForCollection', 'unfreezeAccountsForCollection',
  ]) {
    assert.ok(!surface.includes(name), `${name} should not be composable from the panel`);
  }
});

// ── the burn, which arrived on 2026-09-09 ────────────────────────────────
//
// `burn` is neither a collector call nor an owner call: the Perch is its only
// caller. So it belongs on no generated surface, and the two errors it raises
// still have to be nameable — a decoder that cannot name them shows hex.

test('burn is on no generated surface — only the Perch calls it', () => {
  const everywhere = [
    ...names(avianStockAbi), ...names(avianStockAdminAbi),
    ...names(thePerchAbi), ...names(thePerchAdminAbi),
  ];
  assert.ok(!everywhere.includes('burn'), 'burn is the Perch’s, not ours to encode');
});

test('the sell card can read the countdown, and the receipt can be decoded', () => {
  const views = names(thePerchAbi, false);
  for (const n of ['BURN_EVERY', 'deposits', 'depositsUntilNextBurn']) {
    assert.ok(views.includes(n), `the sell card cannot read ${n}`);
  }
  const events = (thePerchAbi as unknown as Entry[]).filter((e) => e.type === 'event').map((e) => e.name);
  assert.ok(events.includes('BirdBurned'), 'the receipt cannot name the burnt bird');

  // Both of the collection's halves of the same fact, so a burn is confirmed by
  // two contracts rather than taken on one's word.
  const tokenEvents = (avianStockAbi as unknown as Entry[]).filter((e) => e.type === 'event').map((e) => e.name);
  assert.ok(tokenEvents.includes('Burned'));
  assert.ok(tokenEvents.includes('Transfer'));
});

test('totalSupply and burned are both readable — they are no longer the same number', () => {
  const views = names(avianStockAbi, false);
  for (const n of ['totalMinted', 'burned', 'totalSupply']) {
    assert.ok(views.includes(n), `${n} is not readable`);
  }
});
