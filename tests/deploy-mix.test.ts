// The Targets control's "Set by the deploy" line, shown only while true.

import test from 'node:test';
import assert from 'node:assert/strict';
import { isDeployMix } from '../src/lib/deploy-mix';

const mix = (...pairs: [string, number][]) => pairs.map(([symbol, weightBps]) => ({ symbol, weightBps }));

test('the deploy’s four at equal weights is the deploy’s mix, in any order', () => {
  assert.equal(isDeployMix(mix(['NVDA', 2500], ['SPY', 2500], ['SPCX', 2500], ['AAPL', 2500])), true);
  assert.equal(isDeployMix(mix(['AAPL', 2500], ['SPCX', 2500], ['NVDA', 2500], ['SPY', 2500])), true);
});

test('no targets, as on the testnet, is not the deploy’s mix', () => {
  assert.equal(isDeployMix([]), false);
});

test('a mix the owner changed is not the deploy’s', () => {
  // Reweighted.
  assert.equal(isDeployMix(mix(['NVDA', 4000], ['SPY', 3000], ['SPCX', 2000], ['AAPL', 1000])), false);
  // One swapped out.
  assert.equal(isDeployMix(mix(['NVDA', 2500], ['SPY', 2500], ['SPCX', 2500], ['rSPY', 2500])), false);
  // One dropped, the rest still equal.
  assert.equal(isDeployMix(mix(['NVDA', 3334], ['SPY', 3333], ['SPCX', 3333])), false);
  // A duplicate cannot stand in for a missing one.
  assert.equal(isDeployMix(mix(['NVDA', 2500], ['NVDA', 2500], ['SPCX', 2500], ['AAPL', 2500])), false);
});
