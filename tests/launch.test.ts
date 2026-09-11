// The fee curve, and the buy cap.
//
// The curve here must equal the contract's integer arithmetic exactly —
// `FEE_BPS + MAX_EXTRA * (WINDOW - elapsed) / WINDOW`, floor division. The
// mock's port ROUNDS, which differs by a bp in the middle of the window; that
// is the difference `pinFeeCurve` exists to catch at start-up.

import test from 'node:test';
import assert from 'node:assert/strict';
import { buyFeeBpsAt, capGuard, setLaunchParams, splitForCap } from '../src/chain/launch';

const WAD = 10n ** 18n;
const LAUNCH_AT = 1_800_000_000;

const PARAMS = {
  launchAt: LAUNCH_AT,
  windowSeconds: 300,
  feeBps: 100,
  maxExtraFeeBps: 2400,
  maxBuyPerTx: 50_000_000n * WAD,
};

setLaunchParams(PARAMS);

/** The contract's own arithmetic, transcribed from AviansHook. */
const onChain = (t: number) => {
  if (t < LAUNCH_AT) return 100 + 2400;
  const elapsed = t - LAUNCH_AT;
  if (elapsed >= 300) return 100;
  return 100 + Math.floor((2400 * (300 - elapsed)) / 300);
};

test('25% at the first second, 1% at the last', () => {
  assert.equal(buyFeeBpsAt(LAUNCH_AT, LAUNCH_AT), 2500);
  assert.equal(buyFeeBpsAt(LAUNCH_AT + 300, LAUNCH_AT), 100);
  assert.equal(buyFeeBpsAt(LAUNCH_AT + 299, LAUNCH_AT), 108);
});

test('before the launch it returns the OPENING number, not a zero', () => {
  // A zero would read as "free". The contract does the same thing and says why.
  assert.equal(buyFeeBpsAt(LAUNCH_AT - 1, LAUNCH_AT), 2500);
  assert.equal(buyFeeBpsAt(LAUNCH_AT - 86_400, LAUNCH_AT), 2500);
});

test('every second of the window agrees with the contract, to the bp', () => {
  for (let s = -5; s <= 320; s++) {
    assert.equal(
      buyFeeBpsAt(LAUNCH_AT + s, LAUNCH_AT),
      onChain(LAUNCH_AT + s),
      `second ${s}`,
    );
  }
});

test('after the window it is 1%, forever', () => {
  assert.equal(buyFeeBpsAt(LAUNCH_AT + 301, LAUNCH_AT), 100);
  assert.equal(buyFeeBpsAt(LAUNCH_AT + 365 * 86_400, LAUNCH_AT), 100);
});

test('the cap is per TRANSACTION: bundled buys are added up', () => {
  const inWindow = LAUNCH_AT + 10;
  const half = 30_000_000n * WAD;
  assert.equal(capGuard([half], inWindow, PARAMS).ok, true);
  // Either alone fits; together they do not, and that is exactly the case a
  // site has to catch itself, because the counter is in transient storage and
  // no view can be asked what a transaction has already spent.
  const both = capGuard([half, half], inWindow, PARAMS);
  assert.equal(both.ok, false);
  assert.equal(both.cumulative, 60_000_000n * WAD);
  assert.equal(both.cap, 50_000_000n * WAD);
});

test('exactly the cap is allowed; one wei over is not', () => {
  const t = LAUNCH_AT + 1;
  assert.equal(capGuard([50_000_000n * WAD], t, PARAMS).ok, true);
  assert.equal(capGuard([50_000_000n * WAD + 1n], t, PARAMS).ok, false);
});

test('outside the window there is no cap at all', () => {
  const after = LAUNCH_AT + 301;
  const verdict = capGuard([500_000_000n * WAD], after, PARAMS);
  assert.equal(verdict.applies, false);
  assert.equal(verdict.ok, true);
});

test('before the launch the cap does not apply either — nothing trades yet', () => {
  assert.equal(capGuard([500_000_000n * WAD], LAUNCH_AT - 1, PARAMS).applies, false);
});

test('an over-cap amount splits into transactions that each fit', () => {
  const cap = 50_000_000n * WAD;
  const parts = splitForCap(120_000_000n * WAD, cap);
  assert.equal(parts.length, 3);
  assert.equal(parts.reduce((a, b) => a + b, 0n), 120_000_000n * WAD);
  for (const p of parts) assert.ok(p <= cap);
});

test('an amount that already fits is one transaction', () => {
  assert.deepEqual(splitForCap(1n, 50n), [1n]);
  assert.deepEqual(splitForCap(50n, 50n), [50n]);
});
