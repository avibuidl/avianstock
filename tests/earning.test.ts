// "Earning now" (2026-09-28): the wallet's unsettled amount per token, now,
// carried forward from the read by each bird's share of the stream.

import test from 'node:test';
import assert from 'node:assert/strict';
import { earningRows, placesFor, totalNow, walletWeight } from '../src/lib/earning';
import type { BroodState, FlywheelSnapshot, RewardToken } from '../src/mock/types';

const WAD = 10n ** 18n;
const AVIAN = { address: '0x000000000000000000000000000000000000a1a1', symbol: 'AVIAN', decimals: 18 } as RewardToken;
const NVDA = { address: '0x000000000000000000000000000000000000b1b1', symbol: 'NVDA', decimals: 18 } as RewardToken;
const SPY = { address: '0x000000000000000000000000000000000000c1c1', symbol: 'SPY', decimals: 18 } as RewardToken;

/** NVDA at 0.1 ETH, SPY unpriced, AVIAN at 5e-7 ETH, dollars at $3,000. */
const fly = {
  paid: [
    { token: NVDA.address, symbol: 'NVDA', decimals: 18, amount: 10n * WAD, ethValue: WAD },
    { token: SPY.address, symbol: 'SPY', decimals: 18, amount: 10n * WAD, ethValue: null },
  ],
  avian: { ethPerAvian: 500_000_000_000n },
  usd: { usdPerEth: 3_000n * WAD },
} as unknown as FlywheelSnapshot;

const READ = 1_800_000_000;
/** 2,000 tokens a day to the whole Nest, as the chain scales it. */
const RATE = (2_000n * WAD * WAD) / 86_400n;
const brood = (tier: 1 | 2 | 3, live = true) => ({ tier, live } as BroodState['yours'][number]['brood']);
const line = (token: RewardToken, unsettled: bigint) => ({ token, unsettled });
const nest = {
  totalWeight: 100n,
  chainNow: READ,
  listed: [NVDA, AVIAN, SPY],
  streams: [
    { token: NVDA, rate: RATE, periodFinish: READ + 3 * 86_400 },
    { token: AVIAN, rate: RATE, periodFinish: READ + 3 * 86_400 },
    { token: SPY, rate: RATE, periodFinish: READ - 86_400 },
  ],
  yours: [
    { bird: { id: 1 }, brood: brood(3), lines: [line(NVDA, 3n * WAD), line(AVIAN, 30n * WAD), line(SPY, WAD)] },
    { bird: { id: 2 }, brood: brood(2), lines: [line(NVDA, 2n * WAD), line(AVIAN, 20n * WAD), line(SPY, 0n)] },
    { bird: { id: 3 }, brood: brood(1, false), lines: [line(NVDA, 9n * WAD)] },
    { bird: { id: 4 }, brood: null, lines: [] },
  ],
} as unknown as BroodState;

test('the wallet’s weight is its live broods’ tiers, added up', () => {
  assert.equal(walletWeight(nest), 5n);
});

test('at the read the figure is the chain’s word, summed over the live broods; sorted by value', () => {
  const rows = earningRows(nest, fly, AVIAN.address, READ);
  assert.deepEqual(rows.map((r) => [r.token.symbol, r.state, r.amount]), [['NVDA', 'running', 5n * WAD], ['AVIAN', 'running', 50n * WAD], ['SPY', 'ended', WAD]]);
  assert.equal(rows[0].usd, 5n * WAD / 10n * 3_000n);
});

test('a minute on, a running stream has added each bird’s share; an ended one has not', () => {
  const rows = earningRows(nest, fly, AVIAN.address, READ + 60);
  const nvda = rows.find((r) => r.token.symbol === 'NVDA')!;
  // 5% of 2,000 a day is 100 a day: a minute adds 100 / 1440, to the second's truncation.
  const added = nvda.amount - 5n * WAD;
  assert.ok(added > (100n * WAD) / 1440n - 60n * 100n && added <= (100n * WAD) / 1440n, String(added));
  assert.equal(rows.find((r) => r.token.symbol === 'SPY')!.amount, WAD);
  // Two birds, each truncated to the base unit: within one of the sum.
  const sum = (RATE * 5n) / 100n / WAD;
  assert.ok(nvda.perSecond >= sum - 1n && nvda.perSecond <= sum, String(nvda.perSecond));
});

test('the digits come from the rate: four where a second moves the fourth place, six at most', () => {
  assert.equal(placesFor(2n * 10n ** 14n, 18), 4);
  assert.equal(placesFor(3n * 10n ** 13n, 18), 5);
  assert.equal(placesFor(3n * 10n ** 11n, 18), 6);
  assert.equal(placesFor(1n, 18), 6);
  assert.equal(placesFor(0n, 18), 4);
  assert.equal(placesFor(10n ** 4n, 6), 4);
});

test('a token never funded is "none" and shows what was read; the total is dollars, else ETH, else null', () => {
  const quiet = { ...nest, streams: [{ token: NVDA, rate: 0n, periodFinish: 0 }], listed: [NVDA] } as unknown as BroodState;
  const rows = earningRows(quiet, fly, AVIAN.address, READ + 999);
  assert.equal(rows[0].state, 'none');
  assert.equal(rows[0].amount, 5n * WAD);
  const all = earningRows(nest, fly, AVIAN.address, READ);
  assert.deepEqual(totalNow(all), { usd: null, eth: null });
  const priced = all.filter((r) => r.token.symbol !== 'SPY');
  assert.equal(totalNow(priced).usd, priced[0].usd! + priced[1].usd!);
  const noUsd = earningRows({ ...nest, listed: [NVDA] } as BroodState, { ...fly, usd: null } as unknown as FlywheelSnapshot, AVIAN.address, READ);
  assert.equal(totalNow(noUsd).usd, null);
  assert.equal(totalNow(noUsd).eth, WAD / 2n);
  assert.deepEqual(totalNow([]), { usd: 0n, eth: 0n });
});
