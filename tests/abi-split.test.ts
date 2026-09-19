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
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import {
  accountV3Abi, aviansAbi, theNestAbi, avianStockAbi, liquidityVaultAbi, sweeperAbi, thePerchAbi,
  transferValidatorAbi, treasuryAbi, uniswapV3FactoryAbi, uniswapV3PoolAbi,
  theRoostAbi, aviansStakingAbi,
} from '../src/chain/abis.generated';
import * as adminSurfaces from '../src/chain/abis.admin.generated';
import {
  theNestAdminAbi, avianStockAdminAbi, liquidityVaultAdminAbi,
  thePerchAdminAbi, transferValidatorAdminAbi, treasuryAdminAbi, theRoostAdminAbi,
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
  'addRewardToken', 'retireRewardToken', 'restream', 'setFunder', 'rescueBird',
  // Treasury
  'claimAdmin', 'setConversionConfig', 'setTargets', 'setRoute', 'setV3Route',
  'setPriceKeeper', 'setKeeperDropBps', 'setFloorPrice',
  // LiquidityVault
  'collectFees', 'extendLock', 'withdraw',
  // TheRoost (2026-09-18): the admin's tenth, and the rescue
  'claimAdmin',
  // all five
  'transferOwnership', 'acceptOwnership',
];

/**
 * A name on the owner list that is a COLLECTOR call on another contract. The
 * vault's `withdraw` is the owner's; the staking contract's `withdraw` is
 * every staker's own — same word, different door. Named, so the check below
 * stays a name check everywhere else.
 */
const SAME_NAME_DIFFERENT_DOOR = new Set(['aviansStakingAbi.withdraw']);

const COLLECTOR = {
  aviansAbi, avianStockAbi, thePerchAbi, theNestAbi, treasuryAbi,
  liquidityVaultAbi, transferValidatorAbi, sweeperAbi, accountV3Abi,
  theRoostAbi, aviansStakingAbi,
};

test('no owner-only function is in any collector ABI', () => {
  const leaked: string[] = [];
  for (const [label, abi] of Object.entries(COLLECTOR)) {
    for (const name of names(abi)) {
      if (OWNER_ONLY.includes(name) && !SAME_NAME_DIFFERENT_DOOR.has(`${label}.${name}`)) leaked.push(`${label}.${name}`);
    }
  }
  assert.deepEqual(leaked, [], 'these owner calls can be encoded from a collector ABI');
});

test('the admin ABIs carry the owner surface they are for', () => {
  const surface = new Set([
    ...names(avianStockAdminAbi), ...names(thePerchAdminAbi),
    ...names(theNestAdminAbi), ...names(treasuryAdminAbi),
    ...names(liquidityVaultAdminAbi), ...names(theRoostAdminAbi),
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

test('the sell card can read the countdown and the floor, and the receipt can decode both outcomes', () => {
  const views = names(thePerchAbi, false);
  for (const n of ['BURN_EVERY', 'BURN_FLOOR', 'burnsActive', 'deposits', 'depositsUntilNextBurn']) {
    assert.ok(views.includes(n), `the sell card cannot read ${n}`);
  }
  const events = (thePerchAbi as unknown as Entry[]).filter((e) => e.type === 'event').map((e) => e.name);
  assert.ok(events.includes('BirdBurned'), 'the receipt cannot name the burnt bird');
  // Below the floor a hundredth is kept, not burnt, and the receipt says so.
  assert.ok(events.includes('BurnWithheld'), 'the receipt cannot name a withheld hundredth');

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

// ── brooding, which arrived on 2026-09-11 ────────────────────────────────
//
// Nothing is custodial. The four collector writes and every read the screen
// needs are on the collector surface; the owner's are on the admin surface;
// and there is NO bird approval to the Nest anywhere — the one
// `setApprovalForAll` write in the site targets the perch and refuses the Nest.

test('the brooding surface is the collector’s, and settle is on it because anyone may call it', () => {
  const surface = names(theNestAbi);
  for (const n of ['brood', 'broodTo', 'upgrade', 'redirect', 'settle', 'claim', 'donate']) {
    assert.ok(surface.includes(n), `a collector cannot call ${n}`);
  }
  const views = names(theNestAbi, false);
  for (const n of [
    'broodOf', 'isBrooding', 'weightOf', 'deliveryOf', 'earned', 'pending', 'claimable',
    'tierCost', 'totalWeight', 'totalBrooding', 'totalForwarded', 'costSink', 'listedRewardTokens',
  ]) {
    assert.ok(views.includes(n), `the brooding screen cannot read ${n}`);
  }
});

test('the custodial surface is gone from every ABI', () => {
  const everywhere = [...names(theNestAbi), ...names(theNestAdminAbi), ...names(theNestAbi, false)];
  for (const n of ['stake', 'unstake', 'claimAll', 'stakeOf', 'stakerOf', 'stakedIdsOf', 'stakedCountOf', 'totalStaked', 'rescueUnstaked']) {
    assert.ok(!everywhere.includes(n), `${n} is still encodable`);
  }
});

test('every event a brood receipt reads is on the collector Nest ABI, and the hook’s failure on the collection’s', () => {
  const events = (theNestAbi as unknown as Entry[]).filter((e) => e.type === 'event').map((e) => e.name);
  for (const n of [
    'Brooded', 'Upgraded', 'Redirected', 'Expired', 'Settled', 'ExpirySettled',
    'BroodClosed', 'RewardReturned', 'RewardHeld', 'RewardPaid',
  ]) {
    assert.ok(events.includes(n), `a receipt cannot decode ${n}`);
  }
  const stock = (avianStockAbi as unknown as Entry[]).filter((e) => e.type === 'event').map((e) => e.name);
  assert.ok(stock.includes('NestHookFailed'), 'a transfer receipt cannot warn about a failed hook');
});

test('the collection answers who holds what, and names its Nest', () => {
  const views = names(avianStockAbi, false);
  for (const n of ['tokensOfOwnerIn', 'ownersOf', 'NEST']) {
    assert.ok(views.includes(n), `the collection cannot answer ${n}`);
  }
  // Both views take the range only — the lens's `collection` argument is gone.
  const fn = (name: string) => (avianStockAbi as unknown as { type: string; name?: string; inputs?: { type: string }[] }[])
    .find((e) => e.type === 'function' && e.name === name)!;
  assert.deepEqual(fn('tokensOfOwnerIn').inputs!.map((i) => i.type), ['address', 'uint256', 'uint256']);
  assert.deepEqual(fn('ownersOf').inputs!.map((i) => i.type), ['uint256', 'uint256']);
});

// ── the Sweeper, which arrived on 2026-09-12 ─────────────────────────────
//
// Stateless and ownerless: every function on it is a holder's, or anyone's,
// so it has a collector surface and nothing else. Nothing on it is
// owner-gated, and there is no admin export for it at all. The grant it
// depends on is not made on the Sweeper but on the SATCHEL — Tokenbound's
// AccountV3 — whose `setPermissions` is the one call the site sends there.

test('the Sweeper is collector-only: no admin surface, nothing owner-gated', () => {
  assert.ok(!('sweeperAdminAbi' in adminSurfaces), 'a Sweeper admin ABI exists, and nothing on the contract is the owner’s');
  assert.ok(!('accountV3AdminAbi' in adminSurfaces), 'an AccountV3 admin ABI exists, and the satchel has no owner surface of ours');
  const surface = [...names(sweeperAbi), ...names(sweeperAbi, false)];
  for (const n of ['owner', 'pendingOwner', 'transferOwnership', 'acceptOwnership']) {
    assert.ok(!surface.includes(n), `the Sweeper answers ${n}, which an ownerless contract cannot`);
  }
  for (const n of ['prepare', 'sweep']) assert.ok(names(sweeperAbi).includes(n), `a holder cannot call ${n}`);
  for (const n of ['status', 'sweepable', 'COLLECTION']) {
    assert.ok(names(sweeperAbi, false).includes(n), `the panel cannot read ${n}`);
  }
  const events = (sweeperAbi as unknown as Entry[]).filter((e) => e.type === 'event').map((e) => e.name);
  for (const n of ['Swept', 'SweepSkipped', 'SatchelDeployed']) assert.ok(events.includes(n), `a receipt cannot decode ${n}`);
});

test('the grant is made on the satchel: setPermissions(address[], bool[]) is encodable, and nothing else is sent there', () => {
  const fn = (name: string) => (accountV3Abi as unknown as { type: string; name?: string; inputs?: { type: string }[] }[])
    .find((e) => e.type === 'function' && e.name === name);
  assert.ok(fn('setPermissions'), 'the holder cannot grant');
  assert.deepEqual(fn('setPermissions')!.inputs!.map((i) => i.type), ['address[]', 'bool[]']);
  assert.ok(fn('permissions'), 'the grant cannot be read back');
  // `execute` is what the Sweeper drives; the site never sends it. It is
  // deliberately not on this surface, so no screen can move a satchel's
  // contents through the site's own code.
  assert.ok(!names(accountV3Abi).includes('execute'), 'the site can drive a satchel’s execute, which it must never do');
  // And its refusal travels with it, so a stranger's grant is a sentence.
  const errors = (accountV3Abi as unknown as Entry[]).filter((e) => e.type === 'error').map((e) => e.name);
  assert.ok(errors.includes('NotAuthorized'));
});

// ── every read the owner panel makes is on the surface it makes it with ──
//
// `src/chain/admin.ts` builds its calls through four helpers, each bound to
// one admin ABI. A function on the collector list but not the admin list
// compiles fine and fails at runtime — viem throws "function not found on
// ABI" and the whole owner screen reads as failed. `rewardTokenCount` did
// exactly that on the launch dry run. This reads the helper calls out of the
// source and checks each name against the ABI its helper carries.

test('every function the owner panel reads through fac/amm/nest/tre is on that admin ABI', () => {
  const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'chain', 'admin.ts'), 'utf8');
  const by: Record<string, readonly unknown[]> = {
    fac: avianStockAdminAbi, amm: thePerchAdminAbi, nest: theNestAdminAbi, tre: treasuryAdminAbi,
  };
  const missing: string[] = [];
  for (const m of src.matchAll(/\b(fac|amm|nest|tre)\('([A-Za-z_][A-Za-z0-9_]*)'/g)) {
    const [, helper, fn] = m;
    if (!names(by[helper], false).includes(fn)) missing.push(`${helper}('${fn}')`);
  }
  assert.deepEqual(missing, [], 'these owner-panel reads would throw "function not found on ABI"');
});

test('the price ticker reads the venue off the collector Treasury ABI, and the v3 slices are reads only', () => {
  const tre = new Set(names(treasuryAbi, false));
  for (const fn of ['NATIVE', 'WETH', 'V3_FACTORY', 'v3RouteOf']) {
    assert.ok(tre.has(fn), `Treasury collector ABI lacks ${fn}`);
  }
  assert.ok(new Set(names(theNestAbi, false)).has('listedRewardTokens'));
  // The owner's setter for the route is NOT on the collector surface.
  assert.ok(!tre.has('setV3Route'));
  assert.deepEqual(names(uniswapV3FactoryAbi), [], 'the factory slice carries no write');
  assert.deepEqual(names(uniswapV3PoolAbi), [], 'the pool slice carries no write');
  assert.deepEqual(names(uniswapV3FactoryAbi, false), ['getPool']);
  assert.deepEqual([...names(uniswapV3PoolAbi, false)].sort(), ['fee', 'liquidity', 'slot0', 'token0', 'token1']);
});

// ── the Roost and AVIANS staking, which arrived on 2026-09-18 ─────────────

test('the Roost: distribute and deliverHeld are everyone’s, claimAdmin is the admin’s, and the receipt’s four events are readable', () => {
  // `deliverHeld` (2026-09-19): anyone, any time, no interval; sends a held leg on.
  assert.deepEqual([...names(theRoostAbi)].sort(), ['deliverHeld', 'distribute'], 'the collector Roost ABI has exactly two writes');
  assert.ok(names(theRoostAdminAbi).includes('claimAdmin'));
  assert.ok(!names(theRoostAdminAbi).includes('rescueERC20'), 'the rescue stays in owner tooling');
  const views = names(theRoostAbi, false);
  for (const n of ['cumulativeIn', 'unallocated', 'nextDistributionAt', 'stakingHeld', 'nestHeld', 'adminClaimable',
    'toStaking', 'toNest', 'burned', 'adminClaimed', 'stakingReady', 'nestReady', 'admin']) {
    assert.ok(views.includes(n), `the Roost card cannot read ${n}`);
  }
  const events = (theRoostAbi as unknown as Entry[]).filter((e) => e.type === 'event').map((e) => e.name);
  for (const n of ['Allocated', 'Delivered', 'Held', 'Burned']) assert.ok(events.includes(n), `the receipt cannot name ${n}`);
});

test('AVIANS staking has no owner surface, and the four actions are every staker’s', () => {
  assert.deepEqual([...names(aviansStakingAbi)].sort(), ['claim', 'exit', 'stake', 'withdraw']);
  assert.ok(!('aviansStakingAdminAbi' in adminSurfaces), 'no admin ABI was generated for a contract with no owner');
  const views = names(aviansStakingAbi, false);
  for (const n of ['stakedOf', 'earned', 'totalStaked', 'rewardRate', 'periodFinish', 'remainingReward', 'undelivered', 'escrowed', 'STREAM']) {
    assert.ok(views.includes(n), `the staking card cannot read ${n}`);
  }
});

test('the Nest names its cost sink and counts what it forwarded; the Perch has no burn share', () => {
  const nest = names(theNestAbi, false);
  assert.ok(nest.includes('costSink') && nest.includes('totalForwarded'));
  assert.ok(!nest.includes('totalBurned'), 'totalBurned is gone: tier costs are paid on, not burnt');
  assert.ok(!names(thePerchAbi, false).includes('BURN_SHARE_BPS'));
  // `FeeTaken(uint256)` — one argument since the whole fee goes to one place.
  const fee = (thePerchAbi as unknown as { type: string; name?: string; inputs?: unknown[] }[]).find((e) => e.type === 'event' && e.name === 'FeeTaken');
  assert.equal(fee?.inputs?.length, 1);
  // `Brooded` and `Upgraded` say what was PAID, not burned.
  const brooded = (theNestAbi as unknown as { type: string; name?: string; inputs?: { name: string }[] }[]).find((e) => e.type === 'event' && e.name === 'Brooded');
  assert.ok(brooded?.inputs?.some((i) => i.name === 'aviansPaid'));
  assert.ok(!brooded?.inputs?.some((i) => i.name === 'aviansBurned'));
});
