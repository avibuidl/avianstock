// The flywheel snapshot's figures, as the landing page formats them.
//
// K and M above ten thousand, ETH to four significant figures, dollars to the
// nearest dollar, shares to two places, every one truncated rather than
// rounded up, and every dollar figure derived from `usdPerEth` rather than
// stored. BigInt end to end.

import test from 'node:test';
import assert from 'node:assert/strict';
import { formatCompact, formatEthSig, formatShare, formatUsd, formatUsdPrice, usdOf } from '../src/lib/format';

const WAD = 10n ** 18n;
const e18 = (n: number) => BigInt(n) * WAD;

test('a compact amount: separators below ten thousand, K above, M above a million, trailing zeros trimmed', () => {
  assert.equal(formatCompact(e18(8_800)), '8,800');
  assert.equal(formatCompact(e18(9_999)), '9,999');
  assert.equal(formatCompact(e18(10_000)), '10K');
  assert.equal(formatCompact(e18(850_000)), '850K');
  assert.equal(formatCompact(e18(999_850_000)), '999.85M');
  assert.equal(formatCompact(e18(1_000_000_000)), '1B');
  assert.equal(formatCompact(e18(999_999_999)), '999.99M');
  assert.equal(formatCompact(37_860_000_000_000_000_000n), '37.86');
  assert.equal(formatCompact(0n), '0');
});

test('a compact amount truncates, never rounds up', () => {
  assert.equal(formatCompact(e18(1_399_999)), '1.39M');
  assert.equal(formatCompact(2_144_999_999_999_999_999n), '2.14');
});

test('ETH to four significant figures, truncated, with the unit', () => {
  assert.equal(formatEthSig(4_400_000_000_000_000n), '0.0044 ETH');
  assert.equal(formatEthSig(11_499_900_000_000_000_000n), '11.49 ETH');
  assert.equal(formatEthSig(499_925_000_000_000_000_000n), '499.9 ETH');
  assert.equal(formatEthSig(e18(1_234_567)), '1,234,567 ETH');
});

test('dollars to the nearest dollar, K and M above ten thousand, and never "$0" for something', () => {
  assert.equal(formatUsd(e18(46_441)), '$46.44K');
  assert.equal(formatUsd(e18(5_120) + 900_000_000_000_000_000n), '$5,120');
  assert.equal(formatUsd(e18(1_390_000)), '$1.39M');
  assert.equal(formatUsd(e18(12)), '$12');
  assert.equal(formatUsd(0n), '$0');
  assert.equal(formatUsd(400_000_000_000_000_000n), 'less than $1');
});

test('a dollar unit price keeps four significant figures', () => {
  assert.equal(formatUsdPrice(1_391_335_000_000_000n), '$0.001391');
  assert.equal(formatUsdPrice(e18(2_782) + 670_000_000_000_000_000n), '$2,782');
});

test('a dollar value is derived from an ETH value and the dollar source, both 18 decimals', () => {
  const usdPerEth = 2_782_670_000_000_000_000_000n; // $2,782.67
  assert.equal(usdOf(WAD, usdPerEth), usdPerEth);
  assert.equal(formatUsd(usdOf(16_690_000_000_000_000_000n, usdPerEth)), '$46.44K');
  assert.equal(formatUsd(usdOf(1_840_000_000_000_000_000n, usdPerEth)), '$5,120');
  assert.equal(usdOf(0n, usdPerEth), 0n);
});

test('a share of the original supply, to two places, trimmed', () => {
  assert.equal(formatShare(e18(150_000), e18(1_000_000_000)), '0.01%');
  assert.equal(formatShare(e18(150_000_000), e18(1_000_000_000)), '15%');
  assert.equal(formatShare(e18(123_456_789), e18(1_000_000_000)), '12.34%');
  assert.equal(formatShare(0n, e18(1_000_000_000)), '0%');
  assert.equal(formatShare(e18(1), 0n), '0%');
});
