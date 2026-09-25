// Conversions open by the clock, six hours after trading opened (2026-09-24).

import test from 'node:test';
import assert from 'node:assert/strict';
import { SELECTORS, explain, ContractError } from '../src/mock/errors';
import { encodeErrorResult, type Abi } from 'viem';
import { decodeRevert, detailOf } from '../src/chain/errors';
import { clockState, conversionsOpen, formatOpenAt, openingState } from '../src/lib/opening';
import { mockOpening } from '../src/mock/reads';
import { treasuryAbi } from '../src/chain/abis.generated';
import type { Opening } from '../src/mock/types';

type Entry = { type: string; name?: string; inputs?: { name: string; type: string }[]; outputs?: { type: string }[] };
const entries = treasuryAbi as unknown as Entry[];

const NOW = 1_800_000_000;
const opening = (over: Partial<Opening> = {}): Opening => ({ openAt: NOW - 60, enabled: true, open: false, ...over });

// ── the ABI ────────────────────────────────────────────────────────────────

test('the Treasury ABI carries the clock: when both buttons open, whether they are, and the two refusals', () => {
  const fn = (n: string) => entries.find((e) => e.type === 'function' && e.name === n);
  assert.deepEqual(fn('conversionsOpenAt')?.outputs?.map((o) => o.type), ['uint256']);
  assert.deepEqual(fn('conversionsOpen')?.outputs?.map((o) => o.type), ['bool']);
  const err = (n: string) => entries.find((e) => e.type === 'error' && e.name === n);
  assert.deepEqual(err('LaunchUnknown')?.inputs, []);
  assert.deepEqual(err('ConversionsNotOpen')?.inputs?.map((i) => `${i.type} ${i.name}`), ['uint256 openAt']);
});

// ── the clock ──────────────────────────────────────────────────────────────

test('the clock’s line: unknown while openAt is 0, waiting until it, open from its second', () => {
  assert.deepEqual(clockState(opening({ openAt: 0 }), NOW), { kind: 'unknown' });
  assert.deepEqual(clockState(opening({ openAt: NOW + 7_200 }), NOW), { kind: 'waiting', openAt: NOW + 7_200 });
  // `block.timestamp < openAt` refuses, so the second itself is open.
  assert.deepEqual(clockState(opening({ openAt: NOW }), NOW), { kind: 'open' });
  assert.equal(conversionsOpen(opening({ openAt: NOW }), NOW), true);
  assert.equal(conversionsOpen(opening({ openAt: NOW + 1 }), NOW), false);
});

test('the pause comes first, as the contract checks it first, and it cannot open anything early', () => {
  // Paused and past the clock: shut.
  assert.deepEqual(openingState(opening({ enabled: false }), NOW), { kind: 'paused' });
  assert.equal(conversionsOpen(opening({ enabled: false }), NOW), false);
  // Not paused and before the clock: still shut. The flag is not a switch.
  assert.equal(conversionsOpen(opening({ openAt: NOW + 7_200 }), NOW), false);
  // The card's line states the clock alone, paused or not.
  assert.deepEqual(clockState(opening({ enabled: false }), NOW), { kind: 'open' });
});

test('the chain’s own answer is believed over a carried clock', () => {
  // A fork running ahead of this machine said "open" at the block read.
  assert.deepEqual(clockState(opening({ openAt: NOW + 600, open: true }), NOW), { kind: 'open' });
});

// ── the refusals ───────────────────────────────────────────────────────────

test('the two clock refusals decode by name, and each says when', () => {
  for (const name of ['LaunchUnknown', 'ConversionsNotOpen'] as const) {
    const selector = SELECTORS[name];
    assert.ok(selector, `${name} has no selector`);
    assert.equal(detailOf(selector!)?.split('(')[0] ?? name, name, `${selector} does not decode to ${name}`);
  }
  assert.equal(explain(new ContractError('LaunchUnknown')).title,
    'The Treasury does not know when trading opened yet.');

  const openAt = Math.floor(Date.now() / 1000) + 7_200;
  const e = explain(new ContractError('ConversionsNotOpen', { openAt }));
  assert.equal(e.title, `Conversions open at ${formatOpenAt(openAt)}.`);
  assert.match(e.sentence, /from now/, 'no countdown');
  // Counted from the chain's clock when the card hands it over, not this
  // machine's: an hour ahead, and the countdown is an hour shorter.
  const ahead = explain(new ContractError('ConversionsNotOpen', { openAt }), { now: openAt - 3_600 });
  assert.match(ahead.sentence, /That is 1:00:00 from now/);
  assert.match(e.sentence, /nobody can open them early/);
  assert.equal(e.fatal, false);
});

test('a real revert’s arguments survive the decoder and reach the sentence', () => {
  // The decoder maps argument names onto the shape `explain` reads, by an
  // allowlist. An unmapped name is dropped silently and the sentence falls
  // back to its vaguest form: that is how a live `ConversionsNotOpen` first
  // read "Conversions are not open yet" on the fork, with no time in it.
  const errs = treasuryAbi as unknown as Abi;
  const decodeOf = (errorName: string, args: readonly unknown[]) =>
    decodeRevert(encodeErrorResult({ abi: errs, errorName, args }));

  const openAt = Math.floor(Date.now() / 1000) + 7_200;
  const notOpen = decodeOf('ConversionsNotOpen', [BigInt(openAt)]);
  assert.equal(notOpen.name, 'ConversionsNotOpen');
  assert.equal(notOpen.args.openAt, openAt);
  assert.equal(explain(new ContractError('ConversionsNotOpen', notOpen.args)).title,
    `Conversions open at ${formatOpenAt(openAt)}.`);

  const young = decodeOf('ReadingTooYoung', [1_000_000, 1_001_800]);
  assert.deepEqual([young.args.at, young.args.usableAt], [1_000_000, 1_001_800]);

  const none = decodeOf('NoUsableReading', [0, 0]);
  assert.deepEqual([none.args.lastAt, none.args.prevAt], [0, 0]);

  const moving = decodeOf('PriceUnsettled', ['0x0000000000000000000000000000000000000001', 4_200, -5_600]);
  assert.deepEqual([moving.args.meanTick, moving.args.spotTick], [4_200, -5_600]);
});

test('the owner’s flag reads as a pause, not a switch waiting to be thrown', () => {
  const e = explain(new ContractError('ConversionDisabled'));
  assert.equal(e.title, 'Conversions are paused.');
  assert.doesNotMatch(e.sentence, /off at deployment|switched on|turns it on/);
});

// ── the fixtures ───────────────────────────────────────────────────────────

test('the four mock scenes are the four states: unknown, two hours away, open, paused', () => {
  const now = Math.floor(Date.now() / 1000);
  assert.deepEqual(openingState(mockOpening('launch-unknown', now), now), { kind: 'unknown' });
  const later = openingState(mockOpening('opens-later', now), now);
  assert.equal(later.kind, 'waiting');
  const left = (later as { openAt: number }).openAt - now;
  assert.ok(left > 7_000 && left <= 7_200, `opens in ${left} s, not about two hours`);
  assert.deepEqual(openingState(mockOpening('flowing', now), now), { kind: 'open' });
  assert.deepEqual(openingState(mockOpening('paused', now), now), { kind: 'paused' });
});
