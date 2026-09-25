// "Your seat" (2026-09-24): the owner's clock and proposal, from the mock's
// own read, and the two senders that move them.
//
// What the wiring session must fill: six seats, each with its own
// `lastSeenAt` and `silentAt` thirty days on, and its own `pendingOwner`. The
// control takes the earliest of each clock and compares the proposals; these
// tests hold the scenes to that shape.

import test from 'node:test';
import assert from 'node:assert/strict';
import { getSeat, proposeOwner, seatRunFixture, stillHere, SEAT_FIXTURES } from '../src/mock/seat';
import { setScenario, resetScenario } from '../src/mock/scenario';
import { formatDay } from '../src/lib/format';

const DAY = 86_400;

test.afterEach(() => resetScenario());

test('heard from today: six seats, each clock thirty days on, nothing proposed', async () => {
  setScenario({ seat: 'today' });
  const r = await getSeat();
  assert.equal(r.seats.length, 6);
  assert.equal(r.silence, 30 * DAY);
  for (const x of r.seats) {
    assert.ok(r.chainNow - x.lastSeenAt < 3600, `${x.name} heard from ${r.chainNow - x.lastSeenAt}s ago`);
    assert.equal(x.silentAt, x.lastSeenAt + r.silence);
    assert.equal(x.proposed, null);
  }
  assert.equal(seatRunFixture(), null);
});

test('heard from 26 days ago: the council may act alone within the last five days, not yet', async () => {
  setScenario({ seat: 'quiet-26' });
  const r = await getSeat();
  const left = Math.min(...r.seats.map((x) => x.silentAt)) - r.chainNow;
  assert.ok(left > 0 && left <= 5 * DAY, `left ${left}`);
});

test('a proposal on all six: the same key on every seat', async () => {
  setScenario({ seat: 'proposed' });
  const r = await getSeat();
  assert.deepEqual(new Set(r.seats.map((x) => x.proposed)), new Set([SEAT_FIXTURES.PROPOSED]));
});

test('the six disagreeing: the Nest names another key and the Treasury none', async () => {
  setScenario({ seat: 'disagree' });
  const r = await getSeat();
  const by = Object.fromEntries(r.seats.map((x) => [x.id, x.proposed]));
  assert.equal(by.nest, SEAT_FIXTURES.OTHER);
  assert.equal(by.treasury, null);
  assert.equal(by.collection, SEAT_FIXTURES.PROPOSED);
});

test('"Still here" mid-way: three of six confirmed, and three seats read today', async () => {
  setScenario({ seat: 'midway' });
  const run = seatRunFixture();
  assert.deepEqual(run && { done: run.done, of: run.of, kind: run.kind }, { done: 3, of: 6, kind: 'still' });
  const r = await getSeat();
  const today = r.seats.filter((x) => formatDay(x.lastSeenAt, r.chainNow) === 'today');
  assert.equal(today.length, 3);
});

test('the two senders: "Still here" resets one seat\'s clock, a proposal names the key and counts as a word', async () => {
  setScenario({ seat: 'quiet-26' });
  await stillHere('nest');
  let r = await getSeat();
  const nest = r.seats.find((x) => x.id === 'nest')!;
  assert.ok(r.chainNow - nest.lastSeenAt < 60);
  assert.ok(r.seats.find((x) => x.id === 'perch')!.lastSeenAt < nest.lastSeenAt - 25 * DAY);

  await proposeOwner('perch', SEAT_FIXTURES.PROPOSED);
  r = await getSeat();
  const perch = r.seats.find((x) => x.id === 'perch')!;
  assert.equal(perch.proposed, SEAT_FIXTURES.PROPOSED);
  assert.ok(r.chainNow - perch.lastSeenAt < 60);
});

test('the date line: "today", else the month and day', () => {
  const now = Math.floor(new Date(2026, 8, 24, 15, 0).getTime() / 1000);
  assert.equal(formatDay(now - 3600, now), 'today');
  const later = formatDay(now + 30 * DAY, now);
  assert.match(later, /24/);
  assert.doesNotMatch(later, /2026/);
  assert.match(formatDay(now + 120 * DAY, now), /2027/);
});
