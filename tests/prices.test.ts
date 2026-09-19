// The ticker's arithmetic, against a real pool.
//
// The numbers are the NVDA/WETH 0.05% pool on 4663 at block 62190576, read on
// a fork on 2026-09-13: `slot0().sqrtPriceX96`, WETH as token0, both tokens 18
// decimals. QuoterV2 was asked for the same pool at the same block, both
// directions, and the answers below are its — the derivation must land within
// the trade's own price impact of them, or it is reading the pool wrong.

import test from 'node:test';
import assert from 'node:assert/strict';
import { ethPerToken } from '../src/chain/prices';
import { formatPrice } from '../src/lib/format';

const SQRT = 270222645042386758714276660162n;
const WAD = 10n ** 18n;

test('ETH per NVDA off slot0, WETH as token0: 0.0859638', () => {
  const p = ethPerToken({ sqrtPriceX96: SQRT, tokenIsToken1: true, tokenDecimals: 18, wethDecimals: 18 });
  assert.equal(p, 85963816030997747n);
  assert.equal(formatPrice(p), '0.085963');
});

test('the same pool the other way round gives the inverse', () => {
  // If NVDA were token0, sqrtPriceX96 would be its reciprocal; the function
  // must then read ETH per token as s²/2^192 rather than 2^192/s².
  const up = ethPerToken({ sqrtPriceX96: SQRT, tokenIsToken1: true, tokenDecimals: 18, wethDecimals: 18 });
  const down = ethPerToken({ sqrtPriceX96: SQRT, tokenIsToken1: false, tokenDecimals: 18, wethDecimals: 18 });
  // up · down ≈ 1 (each is truncated once, so allow a few units of 1e-18)
  const product = (up * down) / WAD;
  assert.ok(product > WAD - 1_000_000n && product <= WAD, `${product}`);
});

test('the derivation agrees with QuoterV2 to within the trade’s own impact, both ways', () => {
  const p = ethPerToken({ sqrtPriceX96: SQRT, tokenIsToken1: true, tokenDecimals: 18, wethDecimals: 18 });
  // 1e15 NVDA in, less the 0.05% fee: the quoter said 85,920,832,898,557 wei.
  const outEth = (10n ** 15n * p * 9995n) / (WAD * 10_000n);
  const quotedEth = 85920832898557n;
  assert.ok(outEth > quotedEth, 'spot is above the quote (the quote pays the impact)');
  assert.ok((outEth - quotedEth) * 10_000_000n < quotedEth, 'and within one part in ten million');
  // 1e15 wei in: the quoter said 11,626,983,077,949,539 NVDA raw.
  const outNvda = (10n ** 15n * WAD * 9995n) / (p * 10_000n);
  const quotedNvda = 11626983077949539n;
  assert.ok(outNvda > quotedNvda);
  assert.ok((outNvda - quotedNvda) * 1_000_000n < quotedNvda, 'within one part in a million');
});

test('decimals are honoured: a 6-decimal token against 18-decimal WETH', () => {
  // A pool where 1 raw token1 (6 dp) is worth 1e12 raw token0 (18 dp), i.e. one
  // whole token is worth one whole ETH: sqrtPriceX96 = 2^96 · sqrt(1e-12)... the
  // easier statement is the reverse: price1per0 = 1e-12 → s = 2^96 / 1e6.
  const s = (1n << 96n) / 1_000_000n;
  const p = ethPerToken({ sqrtPriceX96: s, tokenIsToken1: true, tokenDecimals: 6, wethDecimals: 18 });
  assert.ok(p > WAD - 10_000_000_000_000n && p <= WAD, `${p}`);
});

test('an uninitialised pool has no price, and says so rather than giving zero', () => {
  assert.throws(() => ethPerToken({ sqrtPriceX96: 0n, tokenIsToken1: true, tokenDecimals: 18, wethDecimals: 18 }));
});

test('formatPrice: five significant figures, truncated, never rounded', () => {
  assert.equal(formatPrice(85963816030997747n), '0.085963');       // not 0.085964
  assert.equal(formatPrice(11632800000000000000n), '11.632');       // 11.6328 → five figures
  assert.equal(formatPrice(156824119003338120n), '0.15682');
  assert.equal(formatPrice(123456789n * WAD), '123,456,789');       // more than five digits: the whole, grouped
  assert.equal(formatPrice(1n * WAD), '1.0000');
  assert.equal(formatPrice(0n), '0');
  assert.equal(formatPrice(1n), '0.000000000000000001');            // the smallest unit, within 18 places
  assert.equal(formatPrice(1234567n, 6), '1.2345');                 // a 6-decimal token
});
