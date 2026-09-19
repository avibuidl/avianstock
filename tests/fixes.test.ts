// The drawer's fix button: drawn only when something will act on it, and the
// first handler in the chain that takes it is the one that runs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { handlersFor, runFix, type FixHandlers } from '../src/lib/fixes';
import { poolPhase } from '../src/lib/pool-phase';

test('a kind no map handles yields no handlers, so the drawer draws no button', () => {
  const screen: FixHandlers = { approve: () => {} };
  const site: FixHandlers = { 'get-avians': () => {} };
  assert.deepEqual(handlersFor('paid-mint', screen, site, undefined), []);
});

test('the screen’s handler comes before the site’s, and the site’s before the drawer’s own', () => {
  const order: string[] = [];
  const screen: FixHandlers = { retry: () => { order.push('screen'); } };
  const site: FixHandlers = { retry: () => { order.push('site'); } };
  const builtIn: FixHandlers = { retry: () => { order.push('built-in'); } };
  const chain = handlersFor('retry', screen, site, builtIn);
  assert.equal(chain.length, 3);
  assert.equal(runFix(chain), true);
  assert.deepEqual(order, ['screen']);
});

test('a handler that returns false declines, and the next one runs', () => {
  const order: string[] = [];
  const screen: FixHandlers = { retry: (_a, error) => { if (error !== 'mine') return false; order.push('screen'); return true; } };
  const builtIn: FixHandlers = { retry: () => { order.push('built-in'); } };
  assert.equal(runFix(handlersFor('retry', screen, builtIn), undefined, 'theirs'), true);
  assert.deepEqual(order, ['built-in']);
  assert.equal(runFix(handlersFor('retry', screen, builtIn), undefined, 'mine'), true);
  assert.deepEqual(order, ['built-in', 'screen']);
});

test('the amount and the error reach the handler', () => {
  let seen: unknown[] = [];
  const screen: FixHandlers = { approve: (amount, error) => { seen = [amount, error]; } };
  runFix(handlersFor('approve', screen), 100_000n * 10n ** 18n, 'the refusal');
  assert.deepEqual(seen, [100_000n * 10n ** 18n, 'the refusal']);
});

test('every handler declining leaves the fix unhandled', () => {
  const a: FixHandlers = { refresh: () => false };
  const b: FixHandlers = { refresh: () => false };
  assert.equal(runFix(handlersFor('refresh', a, b)), false);
});

// ── the pool's phase, on the clock ────────────────────────────────────────

const pool = { launchAt: 1_000, windowEndsAt: 1_300 };

test('before LAUNCH_AT the pool is closed; at it, the window opens; at LAUNCH_AT + WINDOW, the flat fees', () => {
  assert.equal(poolPhase(pool, 999), 'before');
  assert.equal(poolPhase(pool, 1_000), 'window');
  assert.equal(poolPhase(pool, 1_299), 'window');
  assert.equal(poolPhase(pool, 1_300), 'after');
});

test('the phase is the hook’s own test: launched means now >= LAUNCH_AT, not the last read’s isLaunched', () => {
  // A state read a minute before the launch says isLaunched: false; a minute
  // later the clock says otherwise, and the button follows the clock.
  const readAt = 940;
  const state = { ...pool, isLaunched: false, chainNow: 940 };
  const now = state.chainNow + (1_001 - readAt);
  assert.equal(state.isLaunched, false);
  assert.equal(poolPhase(state, now), 'window');
});
