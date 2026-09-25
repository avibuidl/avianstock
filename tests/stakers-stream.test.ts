// The stakers' stream on the flywheel views, and the headline that counts it
// on its own (part 19, 2026-09-25).

import test from 'node:test';
import assert from 'node:assert/strict';
import { countStakers, type PaidIn } from '../src/lib/paid';
import { paidLine, streamStateLine } from '../src/lib/stream';
import { aviansStakingAbi } from '../src/chain/abis.generated';
import type { Address, FlywheelSnapshot, RewardStream } from '../src/mock/types';

const WAD = 10n ** 18n;
const AVIAN = '0x00000000000000000000000000000000000a71a0' as Address;
const NVDA = '0x0000000000000000000000000000000000000d1a' as Address;
const avian = { token: AVIAN, symbol: 'AVIAN', decimals: 18 };
const nvda = (amount: bigint): PaidIn => ({ token: NVDA, symbol: 'NVDA', decimals: 18, amount });
const nestAvian = (amount: bigint): PaidIn => ({ ...avian, amount });

// ── the headline ───────────────────────────────────────────────────────────

test('with AVIAN listed, its entry is the Nest’s AVIAN total plus the stakers’', () => {
  const out = countStakers([nvda(12n * WAD), nestAvian(300n * WAD)], avian, 812n * WAD);
  assert.equal(out.find((p) => p.symbol === 'AVIAN')?.amount, 1_112n * WAD);
  // Nothing else in the figures changes.
  assert.equal(out.find((p) => p.symbol === 'NVDA')?.amount, 12n * WAD);
  assert.equal(out.length, 2);
});

test('with AVIAN not listed, the stakers’ total is AVIAN’s whole entry, and is not dropped', () => {
  const out = countStakers([nvda(12n * WAD)], avian, 812n * WAD);
  assert.deepEqual(out.map((p) => [p.symbol, p.amount]), [['NVDA', 12n * WAD], ['AVIAN', 812n * WAD]]);
});

test('with AVIAN not listed and nothing paid to stakers, no empty entry appears', () => {
  // Launch day must still read "Nothing has been paid out yet."
  assert.deepEqual(countStakers([], avian, 0n), []);
  assert.deepEqual(countStakers([nvda(1n)], avian, 0n).map((p) => p.symbol), ['NVDA']);
});

test('the snapshot can read the stakers’ stream: periodFinish and totalPaid on the staking ABI', () => {
  const names = new Set((aviansStakingAbi as unknown as { type: string; name: string }[])
    .filter((e) => e.type === 'function').map((e) => e.name));
  assert.ok(names.has('periodFinish') && names.has('totalPaid'));
});

// ── the row ────────────────────────────────────────────────────────────────

test('the row’s three states, worded as a Nest row words them', () => {
  const now = 1_800_000_000;
  assert.match(streamStateLine(now + 3 * 86_400 + 4 * 3_600, now), /^Streaming\. Ends in .+\.$/);
  assert.equal(streamStateLine(now - 60, now), 'Stream ended.');
  // 0 is a stream never funded, not one that ended.
  assert.equal(streamStateLine(0, now), 'Nothing has streamed yet.');
});

const stakers = (totalPaid: bigint): RewardStream => ({
  token: { address: AVIAN, symbol: 'AVIAN', decimals: 18 },
  rate: 0n, periodFinish: 0, escrowed: 0n, totalPaid, totalReturned: 0n,
});
const snapshot = (paidAvian: bigint, ethValue: bigint | null, usdPerEth: bigint | null) => ({
  paid: [{ token: AVIAN, symbol: 'AVIAN', decimals: 18, amount: paidAvian, ethValue }],
  usd: usdPerEth === null ? null : { usdPerEth },
}) as unknown as FlywheelSnapshot;

test('the stakers’ paid line: dollars, ETH, the amount alone, or nothing yet', () => {
  // 2,000,000 AVIAN a ETH; $3,000 a ETH. The AVIAN entry counts brooders and
  // stakers together, so the stakers' share is valued at the unit price.
  const entry = 1_500_000n * WAD;
  const eth = entry / 2_000_000n;
  const paid = 1_200_000n * WAD;

  const usd = paidLine(stakers(paid), snapshot(entry, eth, 3_000n * WAD), 'stakers');
  assert.equal(usd, 'Total paid to stakers: 1.2M AVIAN, $1,800 today.');

  const inEth = paidLine(stakers(paid), snapshot(entry, eth, null), 'stakers');
  assert.match(inEth, /^Total paid to stakers: 1\.2M AVIAN, 0\.6 ETH today\.$/);

  assert.equal(paidLine(stakers(paid), snapshot(entry, null, null), 'stakers'), 'Total paid to stakers: 1.2M AVIAN.');
  assert.equal(paidLine(stakers(0n), snapshot(entry, eth, null), 'stakers'), 'Total paid to stakers: nothing yet.');
});

test('a Nest row still says brooders', () => {
  assert.equal(paidLine(stakers(0n), undefined), 'Total paid to brooders: nothing yet.');
});
