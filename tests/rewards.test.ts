// My Nest's rewards, as arithmetic (2026-09-27): the three reads into rows
// of one shape, valued at the snapshot's prices, and added up for the band.

import test from 'node:test';
import assert from 'node:assert/strict';
import { birdRows, ethValueOf, nestRows, stakingRow, totalValue, unreachable } from '../src/lib/rewards';
import type { FlywheelSnapshot, RewardToken, StakingState, SweepState } from '../src/mock/types';

const WAD = 10n ** 18n;
const AVIAN = { address: '0x000000000000000000000000000000000000a1a1', symbol: 'AVIAN', decimals: 18 } as RewardToken;
const NVDA = { address: '0x000000000000000000000000000000000000b1b1', symbol: 'NVDA', decimals: 18 } as RewardToken;
const SPY = { address: '0x000000000000000000000000000000000000c1c1', symbol: 'SPY', decimals: 18 } as RewardToken;

/** A snapshot with NVDA priced (1 NVDA = 0.1 ETH), SPY unpriced, AVIAN at 5e-7 ETH, and a dollar source at $3,000. */
const fly = {
  paid: [
    { token: NVDA.address, symbol: 'NVDA', decimals: 18, amount: 10n * WAD, ethValue: WAD },
    { token: SPY.address, symbol: 'SPY', decimals: 18, amount: 10n * WAD, ethValue: null },
  ],
  avian: { ethPerAvian: 500_000_000_000n },
  usd: { usdPerEth: 3_000n * WAD },
} as unknown as FlywheelSnapshot;

test('a token is valued through its paid-out entry, AVIAN through its own price, an unpriced one not at all', () => {
  assert.equal(ethValueOf(NVDA.address, 2n * WAD, fly, AVIAN.address), WAD / 5n);
  assert.equal(ethValueOf(AVIAN.address, 1_000_000n * WAD, fly, AVIAN.address), 500_000_000_000n * 1_000_000n);
  assert.equal(ethValueOf(SPY.address, WAD, fly, AVIAN.address), null);
  assert.equal(ethValueOf(SPY.address, 0n, fly, AVIAN.address), 0n);
  assert.equal(ethValueOf(NVDA.address, WAD, undefined, AVIAN.address), null);
});

const sweep: SweepState = {
  tokens: [NVDA, SPY],
  birds: [
    { id: 902, satchel: '0x1', deployed: true, granted: true, amounts: [3n * WAD, 0n] },
    { id: 1204, satchel: '0x2', deployed: true, granted: true, amounts: [WAD, WAD] },
    { id: 1377, satchel: '0x3', deployed: true, granted: false, amounts: [2n * WAD, 0n] },
    { id: 1588, satchel: '0x4', deployed: false, granted: false, amounts: [0n, 0n] },
  ] as SweepState['birds'],
  relevant: true,
};

test('the birds’ rows: one per token with something in a GRANTED satchel, and the birds it sits in', () => {
  const rows = birdRows(sweep, fly, AVIAN.address);
  assert.deepEqual(rows.map((r) => [r.token.symbol, r.amount, r.ids]), [['NVDA', 4n * WAD, [902, 1204]], ['SPY', WAD, [1204]]]);
  assert.equal(rows[0].usd, 3_000n * WAD * 4n / 10n);
  assert.equal(rows[1].eth, null);
  assert.equal(rows[1].usd, null);
});

test('the Nest’s held-back shares and the staking row', () => {
  const held = nestRows([{ token: NVDA, amount: WAD }, { token: SPY, amount: 0n }], fly, AVIAN.address);
  assert.equal(held.length, 1);
  assert.equal(held[0].source, 'nest');
  assert.equal(held[0].usd, 300n * WAD);
  const staked = stakingRow({ earned: 2_000n * WAD } as StakingState, AVIAN, fly);
  assert.equal(staked?.source, 'staking');
  assert.equal(staked?.eth, 500_000_000_000n * 2_000n);
  assert.equal(stakingRow({ earned: 0n } as StakingState, AVIAN, fly), null);
  assert.equal(stakingRow(undefined, AVIAN, fly), null);
});

test('the total: dollars when every row has them, else ETH, else neither, and the count either way', () => {
  const priced = [...nestRows([{ token: NVDA, amount: WAD }], fly, AVIAN.address), stakingRow({ earned: 2_000n * WAD } as StakingState, AVIAN, fly)!];
  const t = totalValue(priced);
  assert.equal(t.count, 2);
  assert.equal(t.usd, 300n * WAD + 500_000_000_000n * 2_000n * 3_000n);
  const mixed = birdRows(sweep, fly, AVIAN.address);
  assert.deepEqual(totalValue(mixed), { usd: null, eth: null, count: 2 });
  assert.deepEqual(totalValue([]), { usd: null, eth: null, count: 0 });
});

test('the birds the Sweeper cannot reach: stock in a listed token, no grant', () => {
  assert.deepEqual(unreachable(sweep, 2), [1377]);
});
