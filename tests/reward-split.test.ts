// The Docs reference row used to say "NVDA, SPY, SPCX, AAPL, equal parts".
//
// It was read from nothing. The four tokens are TheNest's `listedRewardTokens()`
// and the split is the Treasury's `targets()` — both owner-set, and the mock's
// own weights were 40/30/20/10 while the page said equal. So the row asserted a
// number the site already knew was different.
//
// It reads both now. What is checked here is the part the UI cannot reach: the
// mock always returns four listed tokens with four weights, so the states an
// owner can actually leave the contracts in — nothing listed, listed with no
// targets, a target retired out from under the split — never render in the app
// and would rot silently.

import test from 'node:test';
import assert from 'node:assert/strict';
import { rewardSplitLine, rewardTokenNames } from '../src/lib/format';
import type { Address, RewardSplit, RewardToken } from '../src/mock/types';

const A = (n: number) => `0x${n.toString(16).padStart(40, '0')}` as Address;
const tok = (n: number, symbol: string): RewardToken => ({ address: A(n), symbol, decimals: 18 });

const NVDA = tok(1, 'NVDA');
const SPY = tok(2, 'SPY');
const SPCX = tok(3, 'SPCX');
const AAPL = tok(4, 'AAPL');

const split = (listed: RewardToken[], parts: [RewardToken, number][]): RewardSplit => ({
  listed,
  parts: parts.map(([t, weightBps]) => ({ address: t.address, weightBps })),
});

test('a read that has not landed is an em-dash, not a guess', () => {
  assert.equal(rewardSplitLine(undefined), '—');
});

test('the ordinary case names each token and its share', () => {
  const line = rewardSplitLine(split(
    [NVDA, SPY, SPCX, AAPL],
    [[NVDA, 4000], [SPY, 3000], [SPCX, 2000], [AAPL, 1000]],
  ));
  assert.equal(line, 'NVDA 40%, SPY 30%, SPCX 20%, AAPL 10%');
});

test('equal parts is a possible answer, never an assumed one', () => {
  // The old copy's claim, which the contracts may or may not be set to.
  const line = rewardSplitLine(split(
    [NVDA, SPY, SPCX, AAPL],
    [[NVDA, 2500], [SPY, 2500], [SPCX, 2500], [AAPL, 2500]],
  ));
  assert.equal(line, 'NVDA 25%, SPY 25%, SPCX 25%, AAPL 25%');
});

test('a fractional weight keeps its decimal — 3333 bps is not 33%', () => {
  const line = rewardSplitLine(split([NVDA, SPY], [[NVDA, 3333], [SPY, 6667]]));
  assert.equal(line, 'NVDA 33.3%, SPY 66.7%');
});

test('nothing listed says so — it does not render an empty list', () => {
  assert.equal(rewardSplitLine(split([], [])), 'None listed yet — nothing streams');
});

test('listed with no targets is the NoTargets state, and is named', () => {
  // `convertAndStream` reverts `NoTargets()` here. The tokens are real; the
  // split is not set, so nothing can convert into them yet.
  const line = rewardSplitLine(split([NVDA, SPY], []));
  assert.equal(line, 'NVDA, SPY — listed, but no split is set, so nothing converts yet');
});

test('a listed token with no share is marked, not silently dropped', () => {
  const line = rewardSplitLine(split([NVDA, SPY], [[NVDA, 10000]]));
  assert.equal(line, 'NVDA 100%, SPY (no share)');
});

test('a target retired out of the listing is reported — every conversion reverts', () => {
  // `setTargets` refuses an unlisted token, so this cannot be set directly. It
  // arrives the other way round: the target was listed, then `retireRewardToken`
  // removed it, and now `convertAndStream` reverts `TargetNotListed` for
  // everyone. The row has to be able to say that rather than show a tidy split.
  const line = rewardSplitLine(split([NVDA, SPY], [[NVDA, 5000], [SPCX, 5000]]));
  assert.equal(
    line,
    'NVDA 50%, SPY (no share) — and 1 target is no longer listed, so conversions revert',
  );
});

test('two orphaned targets are plural', () => {
  const line = rewardSplitLine(split([NVDA], [[SPY, 5000], [SPCX, 5000]]));
  assert.equal(
    line,
    'NVDA (no share) — and 2 targets are no longer listed, so conversions revert',
  );
});

test('the address comparison is case-insensitive, because a manifest may not be checksummed', () => {
  const shouty = { ...NVDA, address: NVDA.address.toUpperCase().replace('0X', '0x') as Address };
  const line = rewardSplitLine({
    listed: [shouty],
    parts: [{ address: NVDA.address, weightBps: 10000 }],
  });
  assert.equal(line, 'NVDA 100%');
});

// ── the listing in prose, for the landing page ───────────────────────────
//
// A different shape from the table row: a sentence cannot hold an em-dash, so
// this returns null and the caller picks other words rather than rendering a
// gap into the middle of a paragraph.

test('the listing reads as prose, with an "and" before the last', () => {
  assert.equal(
    rewardTokenNames(split([NVDA, SPY, SPCX, AAPL], [])),
    'NVDA, SPY, SPCX and AAPL',
  );
});

test('two tokens take the "and" with no comma', () => {
  assert.equal(rewardTokenNames(split([NVDA, SPY], [])), 'NVDA and SPY');
});

test('one token is just itself', () => {
  assert.equal(rewardTokenNames(split([NVDA], [])), 'NVDA');
});

test('a read in flight is null, so the sentence can be a different sentence', () => {
  assert.equal(rewardTokenNames(undefined), null);
});

test('an empty listing is null too — there are no names to read out', () => {
  assert.equal(rewardTokenNames(split([], [])), null);
});

test('the names are the listing, in the order the contract returns them', () => {
  // `listedRewardTokens()` is ordered by when each was added. Sorting it here
  // would invent a ranking the chain does not have.
  assert.equal(rewardTokenNames(split([AAPL, NVDA, SPY], [])), 'AAPL, NVDA and SPY');
});
