// The two rows after the six traits (2026-09-21): Mint Combo and Recomposed.
//
// Two answers to two questions. A never-swapped bird reads Yes / No; a swapped
// one No / Yes; one swapped and later restored to its minted combination reads
// Yes / Yes; No / No cannot happen. The mock's bird #1204 walks the three
// states on the `recompose` axis, and every other bird is as minted.

import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SCENARIO, type Scenario } from '../src/mock/scenario';
import { world, traitsForId } from '../src/mock/fixtures';

const at = (recompose: Scenario['recompose']) => world({ ...DEFAULT_SCENARIO, recompose });

test('as minted: Mint Combo Yes, Recomposed No, the traits the bird was minted with', () => {
  const b = at('as-minted').makeBird(1204, { where: 'wallet', owner: '0x0000000000000000000000000000000000000001' });
  assert.equal(b.isMintCombo, true);
  assert.equal(b.recomposed, false);
  assert.deepEqual([...b.traits], [...traitsForId(1204)]);
});

test('swapped: the headwear differs from the minted one, so No / Yes', () => {
  const b = at('swapped').makeBird(1204, { where: 'wallet', owner: '0x0000000000000000000000000000000000000001' });
  assert.equal(b.isMintCombo, false);
  assert.equal(b.recomposed, true);
  assert.notEqual(b.traits[5], traitsForId(1204)[5]);
  assert.deepEqual([...b.traits].slice(0, 5), [...traitsForId(1204)].slice(0, 5));
});

test('restored: the minted traits again, and Recomposed stays Yes for good', () => {
  const b = at('restored').makeBird(1204, { where: 'wallet', owner: '0x0000000000000000000000000000000000000001' });
  assert.equal(b.isMintCombo, true);
  assert.equal(b.recomposed, true);
  assert.deepEqual([...b.traits], [...traitsForId(1204)]);
});

test('every other bird is as minted whatever the axis says, and No / No never happens', () => {
  for (const r of ['as-minted', 'swapped', 'restored'] as const) {
    const b = at(r).makeBird(7, { where: 'wallet', owner: '0x0000000000000000000000000000000000000001' });
    assert.equal(b.isMintCombo, true);
    assert.equal(b.recomposed, false);
    const x = at(r).makeBird(1204, { where: 'wallet', owner: '0x0000000000000000000000000000000000000001' });
    assert.ok(x.isMintCombo || x.recomposed, 'No / No cannot happen');
  }
});
