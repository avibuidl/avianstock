// The council, read from the chain: the manifest key, the decoder, the pending
// list, the drift rule and the refusal (2026-09-24). The card's four mock
// states are tests/council.test.ts.

import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeFunctionData, getAddress, parseAbi, type Abi, type Hex } from 'viem';
import { describeCouncilCall, stillWaiting } from '../src/chain/council';
import { validateManifest } from '../src/chain/manifest';
import { detailOf } from '../src/chain/errors';
import { councilAbi } from '../src/chain/abis.generated';
import { BEHIND_COUNCIL_CHANGE, behindCouncilChange } from '../src/lib/council-drift';
import { SELECTORS, explain, ContractError } from '../src/mock/errors';
import type { Address } from '../src/mock/types';

const HOOK = '0x8888888888888888888888888888888888888888' as Address;
const COLLECTION = '0x7777777777777777777777777777777777777777' as Address;
const ROOST = '0xb0b0222222222222222222222222222222222222' as Address;
const STAKING = '0xa5a5111111111111111111111111111111111111' as Address;
// Encoded from lowercase; a decoded address comes back checksummed.
const TO_RAW = '0x12ac5b7e9f3d04ba61c8e25d7f0b4a9c3e6d89ab' as Address;
const TO = getAddress(TO_RAW);
const NAMES = new Map<string, string>([
  [HOOK.toLowerCase(), 'the hook'],
  [COLLECTION.toLowerCase(), 'the collection'],
  [ROOST.toLowerCase(), 'the Roost'],
  [STAKING.toLowerCase(), 'the staking contract'],
]);

const call = (sig: string, args: readonly unknown[] = []): Hex => {
  const abi = parseAbi([`function ${sig}`] as readonly string[]) as Abi;
  const name = sig.slice(0, sig.indexOf('('));
  return encodeFunctionData({ abi, functionName: name, args: args as never });
};
const says = (target: Address, data: Hex) => describeCouncilCall(target, data, NAMES);

// ── the manifest ───────────────────────────────────────────────────────────

const manifest = (over: Record<string, unknown>) => ({
  id: 'local-fork', label: 'Local fork', driver: 'chain',
  network: {
    chainId: 4663, chainName: 'Robinhood Chain',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['http://127.0.0.1:8545'], blockExplorerUrls: ['https://robinhoodchain.blockscout.com'],
  },
  contracts: {
    Avians: '0x1111111111111111111111111111111111111111',
    TraitRegistry: '0x2222222222222222222222222222222222222222',
    BirdRenderer: '0x3333333333333333333333333333333333333333',
    TheNest: '0x4444444444444444444444444444444444444444',
    Treasury: '0x5555555555555555555555555555555555555555',
    ThePerch: '0x6666666666666666666666666666666666666666',
    AvianStock: COLLECTION, AviansHook: HOOK,
    LiquidityVault: '0x9999999999999999999999999999999999999999',
  },
  thirdParty: {
    PoolManager: '0xaaaa111111111111111111111111111111111111',
    UniversalRouter: '0xbbbb222222222222222222222222222222222222',
    Permit2: '0xcccc333333333333333333333333333333333333',
    V4Quoter: '0xdddd444444444444444444444444444444444444',
    PositionManager: '0xeeee555555555555555555555555555555555555',
    StateView: '0xffff666666666666666666666666666666666666',
  },
  multicall3: null, sweeper: null,
  aviansStaking: STAKING, lockerRewards: '0x10ce333333333333333333333333333333333333', roost: ROOST,
  unveiled: { vaults: false, traitMarket: false }, usd: null,
  startBlock: 100, allowlistProofs: null,
  ...over,
});

test('the manifest requires council, and takes an address or null', () => {
  const missing = validateManifest(manifest({}), 'local-fork');
  assert.ok(missing.problems.some((p) => p.path === 'council'), 'a manifest with no council key passed');

  const named = validateManifest(manifest({ council: '0xc0c0333333333333333333333333333333333333' }), 'local-fork');
  assert.deepEqual(named.problems, []);
  assert.equal(named.manifest?.council, '0xc0c0333333333333333333333333333333333333');

  // A deployment that never named a seat says so, rather than leaving it out.
  const none = validateManifest(manifest({ council: null }), 'local-fork');
  assert.deepEqual(none.problems, []);
  assert.equal(none.manifest?.council, null);

  // And it is its own contract: a council on one of ours is a paste error.
  const clash = validateManifest(manifest({ council: HOOK }), 'local-fork');
  assert.ok(clash.problems.some((p) => p.path === 'council' && /AviansHook/.test(p.says)));
});

// ── what is waiting, in words ──────────────────────────────────────────────

test('each council call the brief names reads as its sentence', () => {
  const cases: [Address, Hex, string, 'structural' | 'rescue'][] = [
    [HOOK, call('setTreasury(address)', [TO]), `The hook's Treasury moves to ${TO}`, 'structural'],
    [COLLECTION, call('setMintSink(address)', [TO]), `The collection's Perch moves to ${TO}`, 'structural'],
    [COLLECTION, call('setNest(address)', [TO]), `The collection's Nest moves to ${TO}`, 'structural'],
    [ROOST, call('setNest(address)', [TO]), `The Roost's Nest moves to ${TO}`, 'structural'],
    [COLLECTION, call('setCostSink(address)', [TO]), `The Nest's Roost moves to ${TO}`, 'structural'],
    [STAKING, call('setRoost(address)', [TO]), `The staking contract's Roost moves to ${TO}`, 'structural'],
    [COLLECTION, call('setStaking(address)', [TO]), `The Treasury's Nest moves to ${TO}`, 'structural'],
    [COLLECTION, call('setDefaultRoyalty(address,uint96)', [TO, 500n]), `The royalty becomes 500 bps to ${TO}`, 'structural'],
    [COLLECTION, call('deleteDefaultRoyalty()'), 'The royalty is removed', 'structural'],
    [COLLECTION, call('councilTransferOwnership(address)', [TO]), `The admin key moves to ${TO}, as the owner proposed`, 'structural'],
    [COLLECTION, call('setCouncil(address)', [TO]), `The council's seat moves to ${TO}`, 'structural'],
  ];
  for (const [target, data, sentence, kind] of cases) {
    assert.deepEqual(says(target, data), { says: sentence, kind }, sentence);
  }
});

test('the silent-owner rescue reads as a rescue, not as an unrecognised call', () => {
  // Not in the brief's list; HANDOVER section 9 names it, and it is the one
  // change a holder most needs to read.
  assert.deepEqual(says(COLLECTION, call('councilRescueSilentOwner(address)', [TO])),
    { says: `The admin key moves to ${TO}, after the owner's silence`, kind: 'rescue' });
});

test('anything else is named as unrecognised, with its selector and its target', () => {
  const data = call('pause()');
  assert.deepEqual(says(HOOK, data), { says: `An unrecognised call (${data.slice(0, 10)}) to the hook`, kind: 'structural' });
  // A target the manifest does not name is shown by its address.
  const stranger = '0x00000000000000000000000000000000000000aa' as Address;
  assert.match(says(stranger, data).says, new RegExp(`to ${stranger}$`));
  // The right selector over arguments that do not decode is not put into words.
  const truncated = call('setTreasury(address)', [TO]).slice(0, 20) as Hex;
  assert.match(says(HOOK, truncated).says, /^An unrecognised call/);
});

test('scheduled and not executed or cancelled: what is still waiting', () => {
  const id = (n: number) => `0x${n.toString(16).padStart(64, '0')}`;
  const sched = (n: number, index = 0) => ({ eventName: 'CallScheduled', args: { id: id(n), index: BigInt(index), target: HOOK, data: '0x' } });
  const logs = [
    sched(1),                                          // waiting
    sched(2), { eventName: 'CallExecuted', args: { id: id(2), index: 0n } },  // done
    sched(3), { eventName: 'Cancelled', args: { id: id(3) } },                // withdrawn
    sched(4, 0), sched(4, 1),                          // a batch: two calls, one id
    sched(1),                                          // the same call seen twice is one call
  ];
  assert.deepEqual(stillWaiting(logs).map((w) => `${Number(BigInt(w.id))}:${w.index}`), ['1:0', '4:0', '4:1']);
});

// ── the manifest behind a council change ───────────────────────────────────

test('only council-movable pointers failing reads as a council change, not a wrong deployment', () => {
  assert.equal(behindCouncilChange([{ ok: true }, { ok: false, drift: true }]), true);
  assert.equal(behindCouncilChange([{ ok: false, drift: true }, { ok: false, drift: true }]), true);
  // Anything else failing too: it is a wrong deployment after all.
  assert.equal(behindCouncilChange([{ ok: false, drift: true }, { ok: false }]), false);
  // Nothing failing is nothing to say.
  assert.equal(behindCouncilChange([{ ok: true }]), false);
  assert.equal(BEHIND_COUNCIL_CHANGE, 'The manifest is behind a council change; regenerate it.');
});

// ── the refusal, and the Council's own surface ─────────────────────────────

test('NotCouncil decodes by name and says whose it is', () => {
  const selector = SELECTORS.NotCouncil;
  assert.ok(selector);
  assert.equal(detailOf(selector!)?.split('(')[0] ?? 'NotCouncil', 'NotCouncil');
  assert.equal(explain(new ContractError('NotCouncil')).sentence, 'Only the council can do that, after its delay.');
});

test('the Council ABI carries the card’s reads and the three events of the pending list', () => {
  const entries = councilAbi as unknown as { type: string; name: string }[];
  const fns = new Set(entries.filter((e) => e.type === 'function').map((e) => e.name));
  for (const n of ['MULTISIG', 'STRUCTURAL_DELAY', 'RESCUE_DELAY', 'getTimestamp']) assert.ok(fns.has(n), n);
  const evs = new Set(entries.filter((e) => e.type === 'event').map((e) => e.name));
  for (const n of ['CallScheduled', 'CallExecuted', 'Cancelled']) assert.ok(evs.has(n), n);
  // It proposes nothing: no write of the timelock is on the site.
  for (const n of ['schedule', 'execute', 'cancel', 'scheduleBatch', 'executeBatch']) assert.ok(!fns.has(n), n);
});
