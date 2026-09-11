// BigInt end to end.
//
// AVIANS is 18 decimals and the mint price is 100000e18 — twenty-three zeros,
// which is far above 2^53. Every one of these is a value `Number` would get
// wrong, which is the whole reason none of them goes near it.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  avians, formatAvians, formatBps, formatEth, formatReward, parseAvians,
} from '../src/lib/format';

const WAD = 10n ** 18n;

test('the mint price survives a round trip exactly', () => {
  const price = 100_000n * WAD;
  assert.equal(formatAvians(price), '100,000');
  assert.equal(avians(price), '100,000 AVIANS');
  assert.equal(parseAvians('100000'), price);
  assert.equal(parseAvians('100,000'), price);
});

test('the numbers this site shows most', () => {
  const cases: [bigint, string][] = [
    [90_000n * WAD, '90,000'],
    [110_000n * WAD, '110,000'],
    [115_000n * WAD, '115,000'],
    [5_000n * WAD, '5,000'],
    [15_000n * WAD, '15,000'],
    [25_000n * WAD, '25,000'],
    [50_000_000n * WAD, '50,000,000'],
    [1_000_000_000n * WAD, '1,000,000,000'],
  ];
  for (const [value, shown] of cases) assert.equal(formatAvians(value), shown);
});

test('values above 2^53 are exact, where Number would not be', () => {
  const big = 18_446_744_073_709_551_617n;             // 2^64 + 1
  assert.notEqual(BigInt(Number(big)), big);           // the failure being avoided
  assert.equal(parseAvians('18446744073709551617'), big * WAD);
  assert.equal(formatAvians(big * WAD), '18,446,744,073,709,551,617');
});

test('a typed figure never goes through Number', () => {
  assert.equal(parseAvians('0.000000000000000001'), 1n);
  assert.equal(parseAvians('1.5'), 15n * 10n ** 17n);
  // More decimals than the token has are truncated, not rounded up.
  assert.equal(parseAvians('1.0000000000000000009'), WAD);
  for (const bad of ['', '.', 'abc', '1e18', '-1', '1.2.3', '0x10']) {
    assert.throws(() => parseAvians(bad), `should refuse ${JSON.stringify(bad)}`);
  }
});

test('a claimable balance is truncated, never rounded up', () => {
  // Round this up and somebody clicks claim for more than exists.
  const owed = 12_408_199_999_999_999_999n;            // 12.408199999999999999
  assert.equal(formatReward(owed, 18, 4), '12.4081');
  assert.equal(formatReward(owed, 18, 18), '12.408199999999999999');
  assert.equal(formatReward(WAD - 1n, 18, 4), '0.9999');
  assert.equal(formatReward(0n, 18, 4), '0.0000');
  assert.equal(formatEth(1n, 18), '0.000000000000000001');
});

test('a reward token with other decimals still truncates', () => {
  assert.equal(formatReward(123_456_789n, 6, 4), '123.4567');
  assert.equal(formatReward(999_999n, 6, 2), '0.99');
});

test('bps are a count, not money', () => {
  assert.equal(formatBps(2500), '25%');
  assert.equal(formatBps(100), '1%');
  // One decimal place, and it rounds — which for a FEE is the safe direction:
  // 13.96% is shown as 14.0%, never as 13.9%.
  assert.equal(formatBps(1396), '14.0%');
  assert.equal(formatBps(1350), '13.5%');
});
