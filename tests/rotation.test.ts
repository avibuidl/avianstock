// The rotation line's countdown, and the split lines' arithmetic.
//
// The Roost's three figures move one place a week on a fixed cycle
// (2026-09-20). The card reads this week's from `currentSplit()`, next week's
// from `splitAt(nextRotationAt())`, and counts down on the chain's clock. What
// is pure here is the countdown's two-unit format and the five-way receipt's
// percentages, which are the amounts' own rather than the week's constants,
// so a turn that straddled a rotation still reads true.

import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDaysHours, formatBps } from '../src/lib/format';

test('the countdown reads in two units: days and hours, hours and minutes, minutes, then under a minute', () => {
  assert.equal(formatDaysHours(3 * 86_400 + 4 * 3600 + 59 * 60), '3d 4h');
  assert.equal(formatDaysHours(4 * 3600 + 12 * 60 + 30), '4h 12m');
  assert.equal(formatDaysHours(12 * 60 + 59), '12m');
  assert.equal(formatDaysHours(59), 'under a minute');
  assert.equal(formatDaysHours(-5), 'under a minute');
});

test('the receipt’s percentages are the amounts’ own, truncated to the basis point', () => {
  const inflow = 318_500n * 10n ** 18n;
  const toStaking = (inflow * 3500n) / 10_000n;
  const toLockers = (inflow * 2000n) / 10_000n;
  const toBurn = (inflow * 500n) / 10_000n;
  const pct = (part: bigint) => formatBps(Number((part * 10_000n) / inflow));
  assert.equal(pct(toStaking), '35%');
  assert.equal(pct(toLockers), '20%');
  assert.equal(pct(toBurn), '5%');
});

test('the three-week cycle: each destination takes each figure once', () => {
  const rotation = [
    { staking: 3500, nest: 3000, lockers: 2000 },
    { staking: 3000, nest: 2000, lockers: 3500 },
    { staking: 2000, nest: 3500, lockers: 3000 },
  ];
  for (const leg of ['staking', 'nest', 'lockers'] as const) {
    assert.deepEqual(rotation.map((r) => r[leg]).sort(), [2000, 3000, 3500]);
  }
  for (const r of rotation) assert.equal(r.staking + r.nest + r.lockers + 1000 + 500, 10_000, 'the five legs make the whole');
});
