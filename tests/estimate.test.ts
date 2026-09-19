// Live earnings between reads.
//
// `earned()` on chain only changes when it is read. Between reads the screen
// carries the last figure forward by the stream's own arithmetic, and the
// next read replaces it. Four properties, each for the staking card's
// `estimateEarned` and the brooding screen's `estimateUnsettled`: it never
// decreases between reads, it stops at `periodFinish`, it is zero with nobody
// sharing, and it equals the chain's figure when now == chainNowAtRead.

import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateEarned } from '../src/chain/roost';
import { estimateUnsettled } from '../src/chain/reads';
import { estimateSince, perSecond } from '../src/lib/stream';
import type { StakingState } from '../src/mock/types';

const E18 = 10n ** 18n;
const WEEK = 604_800;
const T0 = 1_789_800_000;

/** 10,000 AVIANS over a week, as the contract stores it: base units per second × 1e18. */
const RATE = (10_000n * E18 * E18) / BigInt(WEEK);

const staking = (o: Partial<StakingState> = {}): StakingState => ({
  staked: 50_000n * E18, earned: 60n * E18, aviansBalance: 0n, allowance: 0n,
  totalStaked: 50_000n * E18, rewardRate: RATE, periodFinish: T0 + WEEK,
  remainingReward: 0n, undelivered: 0n, streamSeconds: WEEK, chainNow: T0,
  ...o,
});

test('estimateEarned equals the chain’s earned when now == chainNowAtRead', () => {
  const s = staking();
  assert.equal(estimateEarned(s, T0), s.earned);
});

test('estimateEarned never decreases between reads, and never goes below what was read', () => {
  const s = staking();
  let last = s.earned;
  for (let t = T0; t <= T0 + 3 * 3600; t += 7) {
    const e = estimateEarned(s, t);
    assert.ok(e >= last, `went down at t=${t}`);
    assert.ok(e >= s.earned);
    last = e;
  }
  // A clock that runs backwards (a read landed with a newer chainNow) reads as the floor.
  assert.equal(estimateEarned(s, T0 - 30), s.earned);
});

test('estimateEarned ticks at rewardRate × staked / totalStaked / 1e18 per second, the whole stream to a sole staker', () => {
  const s = staking();
  // 10,000 AVIANS over 604,800 s: 0.0165343… AVIANS per second, all of it to the only staker.
  const perSec = perSecond(s.rewardRate, s.staked, s.totalStaked);
  assert.equal(perSec, (10_000n * E18) / BigInt(WEEK));
  assert.equal(estimateEarned(s, T0 + 3600), s.earned + perSec * 3600n);
  // Half the pool: half the rate.
  const half = staking({ totalStaked: 100_000n * E18 });
  assert.equal(estimateEarned(half, T0 + 3600), s.earned + (perSec / 2n) * 3600n);
});

test('estimateEarned stops at periodFinish', () => {
  const s = staking({ periodFinish: T0 + 600 });
  const atEnd = estimateEarned(s, T0 + 600);
  assert.equal(estimateEarned(s, T0 + 601), atEnd);
  assert.equal(estimateEarned(s, T0 + 86_400), atEnd);
  assert.ok(atEnd > s.earned);
  // A period that ended before the read: the floor, nothing more.
  const ended = staking({ periodFinish: T0 - 1 });
  assert.equal(estimateEarned(ended, T0 + 3600), ended.earned);
});

test('estimateEarned is zero with nobody staked, and stays at the floor with no stake of one’s own', () => {
  const nobody = staking({ staked: 0n, totalStaked: 0n, earned: 0n });
  assert.equal(estimateEarned(nobody, T0 + 3600), 0n);
  const others = staking({ staked: 0n, totalStaked: 1_000n * E18, earned: 0n });
  assert.equal(estimateEarned(others, T0 + 3600), 0n);
  const zeroRate = staking({ rewardRate: 0n });
  assert.equal(estimateEarned(zeroRate, T0 + 3600), zeroRate.earned);
});

// ── the brooding screen: a bird's unsettled line ─────────────────────────

const line = (o: Partial<Parameters<typeof estimateUnsettled>[0]> = {}) => ({
  unsettledAtRead: 3n * E18, rate: RATE, weight: 3n, totalWeight: 4185n,
  periodFinish: T0 + WEEK, chainNowAtRead: T0, now: T0,
  ...o,
});

test('estimateUnsettled equals the chain’s figure at the read, and never decreases after it', () => {
  assert.equal(estimateUnsettled(line()), 3n * E18);
  let last = 3n * E18;
  for (let t = T0; t <= T0 + 7200; t += 5) {
    const u = estimateUnsettled(line({ now: t }));
    assert.ok(u >= last);
    last = u;
  }
});

test('estimateUnsettled ticks at rate × weight / totalWeight / 1e18, stops at periodFinish, and is zero with no weight', () => {
  const perSec = perSecond(RATE, 3n, 4185n);
  assert.equal(perSec, (RATE * 3n) / 4185n / E18);
  assert.equal(estimateUnsettled(line({ now: T0 + 100 })), 3n * E18 + perSec * 100n);
  const end = estimateUnsettled(line({ periodFinish: T0 + 50, now: T0 + 50 }));
  assert.equal(estimateUnsettled(line({ periodFinish: T0 + 50, now: T0 + 5000 })), end);
  assert.equal(estimateUnsettled(line({ totalWeight: 0n, unsettledAtRead: 0n, now: T0 + 500 })), 0n);
  assert.equal(estimateUnsettled(line({ weight: 0n, unsettledAtRead: 0n, now: T0 + 500 })), 0n);
});

test('the shared arithmetic truncates and never returns less than the floor', () => {
  // A rate too small to yield a whole base unit per second still never goes negative or below the floor.
  const tiny = estimateSince({ atRead: 7n, rate: 1n, share: 1n, total: 10n ** 30n, periodFinish: T0 + WEEK, chainNowAtRead: T0, now: T0 + 1000 });
  assert.equal(tiny, 7n);
});
