// The owner's seat, wired (part 18, 2026-09-25): the clock the control reads,
// the two senders' surfaces, the refusal before sending, and the dictionary.
// The control's mock scenes are tests/seat.test.ts.

import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeErrorResult, type Abi } from 'viem';
import {
  avianStockAbi, liquidityVaultAbi, theNestAbi, thePerchAbi, treasuryAbi,
} from '../src/chain/abis.generated';
import {
  avianStockAdminAbi, liquidityVaultAdminAbi, theNestAdminAbi, thePerchAdminAbi, treasuryAdminAbi,
} from '../src/chain/abis.admin.generated';
import { decodeRevert } from '../src/chain/errors';
import { SELECTORS, explain, ContractError } from '../src/mock/errors';
import { notHeldBy } from '../src/lib/seat';
import type { Address, OwnedSeat } from '../src/mock/types';

type Entry = { type: string; name?: string; stateMutability?: string };
const fns = (abi: unknown) => (abi as Entry[]).filter((e) => e.type === 'function');
const has = (abi: unknown, name: string) => fns(abi).some((e) => e.name === name);

const COLLECTOR = { avianStockAbi, thePerchAbi, theNestAbi, treasuryAbi, liquidityVaultAbi };
const OWNER = { avianStockAdminAbi, thePerchAdminAbi, theNestAdminAbi, treasuryAdminAbi, liquidityVaultAdminAbi };

// ── the surfaces ───────────────────────────────────────────────────────────

test('every owned seat’s clock is public: owner, lastSeenAt, silentAt, pendingOwner and SILENCE', () => {
  for (const [label, abi] of Object.entries(COLLECTOR)) {
    for (const n of ['owner', 'lastSeenAt', 'silentAt', 'pendingOwner', 'SILENCE']) {
      assert.ok(has(abi, n), `${label} cannot read ${n}`);
    }
  }
});

test('the two senders are owner calls: stillHere and transferOwnership on the owner surfaces only', () => {
  for (const [label, abi] of Object.entries(OWNER)) {
    assert.ok(has(abi, 'stillHere'), `${label} cannot send stillHere`);
    assert.ok(has(abi, 'transferOwnership'), `${label} cannot propose`);
  }
  for (const [label, abi] of Object.entries(COLLECTOR)) {
    assert.ok(!has(abi, 'stillHere'), `${label} can encode stillHere`);
    assert.ok(!has(abi, 'transferOwnership'), `${label} can encode a proposal`);
  }
});

test('acceptOwnership is disabled on every seat: pure, so nothing can accept a transfer alone', () => {
  for (const [label, abi] of Object.entries(OWNER)) {
    const accept = fns(abi).find((e) => e.name === 'acceptOwnership');
    if (accept) assert.equal(accept.stateMutability, 'pure', `${label}.acceptOwnership is callable`);
  }
});

// ── the refusal before sending ─────────────────────────────────────────────

const YOU = '0x8F3C4b2e9A7d15C0f8B36eA2d904C71bE5A19D3a' as Address;
const OTHER = '0x00000000000000000000000000000000000000A1' as Address;
const seat = (id: OwnedSeat['id'], owner: Address): OwnedSeat =>
  ({ id, name: `the ${id}`, owner, lastSeenAt: 0, silentAt: 0, proposed: null });

test('a wallet that does not hold every seat is refused before the first signature', () => {
  const all = [seat('collection', YOU), seat('perch', YOU), seat('nest', YOU)];
  assert.deepEqual(notHeldBy(YOU, all), [], 'the owner of all three was refused');
  // Case does not decide who owns a seat.
  assert.deepEqual(notHeldBy(YOU.toLowerCase(), all), []);

  // Halfway through a council reseat: the Nest has moved, the others have not.
  const midway = [seat('collection', YOU), seat('perch', YOU), seat('nest', OTHER)];
  assert.deepEqual(notHeldBy(YOU, midway).map((s) => s.id), ['nest']);

  // No wallet connected holds nothing.
  assert.equal(notHeldBy(null, all).length, 3);
});

// ── the dictionary ─────────────────────────────────────────────────────────

test('the two-path refusals decode by name, each with the brief’s sentence', () => {
  const expected: [ 'AcceptOwnershipDisabled' | 'NotTheOwnersProposal' | 'OwnerNotSilent', string][] = [
    ['AcceptOwnershipDisabled', 'Nobody accepts a transfer alone; the council seats the proposal.'],
    ['NotTheOwnersProposal', 'The council can only seat a key the owner proposed.'],
    ['OwnerNotSilent', 'The owner was heard from too recently.'],
  ];
  for (const [name, sentence] of expected) {
    assert.ok(SELECTORS[name], `${name} has no selector`);
    assert.equal(decodeRevert(SELECTORS[name]!).name, name);
    assert.equal(explain(new ContractError(name)).sentence, sentence);
  }
});

test('OwnerNotSilent shows when the council may act, taken from the revert itself', () => {
  const silentAt = 1_792_879_383;
  const data = encodeErrorResult({
    abi: avianStockAbi as unknown as Abi, errorName: 'OwnerNotSilent', args: [1_790_287_383n, BigInt(silentAt)],
  });
  const decoded = decodeRevert(data);
  assert.equal(decoded.name, 'OwnerNotSilent');
  assert.equal(decoded.args.silentAt, silentAt, 'the second figure did not survive the decoder');
  const when = new Date(silentAt * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  assert.equal(explain(new ContractError('OwnerNotSilent', decoded.args)).sentence,
    `The owner was heard from too recently. The council may act from ${when}.`);
});
