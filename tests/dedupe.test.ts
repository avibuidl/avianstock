// One row per currency on the admin Treasury panel: AVIAN is both the
// Treasury's own currency and a listed reward token, and used to be drawn twice.

import test from 'node:test';
import assert from 'node:assert/strict';
import { firstByAddress } from '../src/lib/dedupe';

const AVIAN = '0xae9c597e6c3e2e7f54425528a3113fce5e11cb80';
const NVDA = '0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC';

test('a currency that is also a listed reward token appears once, and the first entry wins', () => {
  const rows = [
    { currency: null, symbol: 'ETH', balance: 1n },
    { currency: AVIAN, symbol: 'AVIAN', balance: 2_140_000n },
    { currency: NVDA, symbol: 'NVDA', balance: 0n },
    { currency: AVIAN, symbol: 'AVIAN', balance: 0n },
  ];
  const out = firstByAddress(rows, (r) => r.currency);
  assert.deepEqual(out.map((r) => [r.symbol, r.balance]), [['ETH', 1n], ['AVIAN', 2_140_000n], ['NVDA', 0n]]);
});

test('addresses compare case-insensitively: a checksummed manifest address and a lowercase chain one are one currency', () => {
  const out = firstByAddress([AVIAN, AVIAN.toUpperCase().replace('0X', '0x'), NVDA], (a) => a);
  assert.deepEqual(out, [AVIAN, NVDA]);
});

test('native (null) is its own key and is kept once', () => {
  const out = firstByAddress([null, AVIAN, null], (a) => a);
  assert.deepEqual(out, [null, AVIAN]);
});
