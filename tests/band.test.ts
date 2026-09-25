// The price band's council half (2026-09-25): what it is fed and how a wait
// reads. The band splits only while the pending list has something in it, so
// the fixtures are held to that: none for the everyday state, one, a rescue,
// three soonest first, and one past its time.

import test from 'node:test';
import assert from 'node:assert/strict';
import { getCouncil } from '../src/mock/council';
import { setScenario, resetScenario } from '../src/mock/scenario';
import { formatWait } from '../src/lib/format';
import { ELSEWHERE } from '../src/lib/links';

const DAY = 86_400;

test.afterEach(() => resetScenario());

test('a wait in words, two units at most', () => {
  assert.equal(formatWait(2 * DAY + 4 * 3600 + 59), '2 days 4 hours');
  assert.equal(formatWait(DAY), '1 day');
  assert.equal(formatWait(5 * 3600 + 12 * 60), '5 hours 12 minutes');
  assert.equal(formatWait(3600), '1 hour');
  assert.equal(formatWait(12 * 60 + 30), '12 minutes');
  assert.equal(formatWait(59), 'under a minute');
  assert.equal(formatWait(-5), 'under a minute');
});

test('the everyday state: nothing pending, so no split', async () => {
  setScenario({ council: 'quiet' });
  assert.deepEqual((await getCouncil()).pending, []);
});

test('three waiting: soonest first, the rescue among them', async () => {
  setScenario({ council: 'three' });
  const c = await getCouncil();
  assert.equal(c.pending.length, 3);
  const at = c.pending.map((p) => p.readyAt);
  assert.deepEqual(at, [...at].sort((a, b) => a - b));
  assert.equal(c.pending.filter((p) => p.kind === 'rescue').length, 1);
  assert.equal(new Set(c.pending.map((p) => p.id)).size, 3);
});

test('past its time and not executed: still pending, its moment behind the chain\'s clock', async () => {
  setScenario({ council: 'overdue' });
  const c = await getCouncil();
  assert.equal(c.pending.length, 1);
  assert.ok(c.pending[0].readyAt < c.chainNow);
});

test('the footer\'s places: four, X live, the rest inert until a URL is filled in', () => {
  assert.deepEqual(ELSEWHERE.map((p) => p.id), ['x', 'opensea', 'dexscreener', 'github']);
  assert.equal(ELSEWHERE[0].url, 'https://x.com/AvianStock');
  assert.ok(ELSEWHERE.slice(1).every((p) => p.url === null));
});
