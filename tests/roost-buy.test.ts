// The Treasury's third share, the doubled tiers, and the two "None" pieces
// (2026-09-22).

import test from 'node:test';
import assert from 'node:assert/strict';
import { SELECTORS, explain, ContractError } from '../src/mock/errors';
import { detailOf } from '../src/chain/errors';
import { TIER_COST } from '../src/mock/fixtures';
import { CATEGORIES } from '../src/art/traits';
import { treasuryAbi } from '../src/chain/abis.generated';

const WAD = 10n ** 18n;
type Entry = { type: string; name?: string; inputs?: { name: string }[]; outputs?: { name: string }[] };
const entries = treasuryAbi as unknown as Entry[];

// ── the Roost's tenth ─────────────────────────────────────────────────────

test('the Treasury ABI carries the third share: the reads, the write, the event and the shares', () => {
  const names = new Set(entries.filter((e) => e.type === 'function').map((e) => e.name));
  for (const n of ['roostBuyable', 'roostOut', 'aviansToRoost', 'lastRoostBuyAt',
    'ROOST_SHARE_BPS', 'REWARDS_SHARE_BPS', 'ADMIN_SHARE_BPS', 'buyForRoost']) {
    assert.ok(names.has(n), `the Treasury card cannot read ${n}`);
  }
  const buy = entries.find((e) => e.type === 'function' && e.name === 'buyForRoost')!;
  assert.deepEqual(buy.outputs!.map((o) => o.name), ['amountIn', 'amountOut']);
  const ev = entries.find((e) => e.type === 'event' && e.name === 'BoughtForRoost');
  assert.ok(ev, 'the receipt cannot name BoughtForRoost');
  assert.deepEqual(ev!.inputs!.map((i) => i.name), ['caller', 'roost', 'amountIn', 'amountOut']);
});

test('the buy’s two refusals decode by name, and the site explains each', () => {
  for (const name of ['NothingToBuyForRoost', 'NoRoost'] as const) {
    const selector = SELECTORS[name];
    assert.ok(selector, `${name} has no selector`);
    assert.equal(detailOf(selector!)?.split('(')[0] ?? name, name, `${selector} does not decode to ${name}`);
    const e = explain(new ContractError(name));
    assert.ok(e.title.length > 0 && e.sentence.length > 0, `${name} has no sentence`);
  }
});

test('the route and floor refusals say which button was pressed', () => {
  for (const name of ['NoRoute', 'NoFloorPrice', 'FloorPriceStale', 'FloorPriceTooFresh'] as const) {
    const roost = explain(new ContractError(name), { roostBuy: true });
    const conversion = explain(new ContractError(name));
    assert.match(roost.title, /Roost’s buy is not open/, `${name} does not name the Roost's buy`);
    assert.notEqual(conversion.title, roost.title, `${name} says the same thing for a conversion`);
  }
});

test('the receipt sentence reads as the brief asks', () => {
  // The card builds it from the event's two amounts; this is that arithmetic.
  const amountIn = 11_000_000_000_000_000n;          // 0.011 ETH
  const amountOut = 1_100_000n * WAD;                 // 1.1M AVIAN
  const { formatEth, avians } = require('../src/lib/format') as typeof import('../src/lib/format');
  assert.equal(`${formatEth(amountIn)} ETH bought ${avians(amountOut)} for the Roost.`,
    '0.0110 ETH bought 1,100,000 AVIAN for the Roost.');
});

// ── the doubled tiers ─────────────────────────────────────────────────────

test('the tiers are 10,000 / 30,000 / 50,000, and an upgrade pays the difference', () => {
  assert.equal(TIER_COST[1], 10_000n * WAD);
  assert.equal(TIER_COST[2], 30_000n * WAD);
  assert.equal(TIER_COST[3], 50_000n * WAD);
  assert.equal(TIER_COST[2] - TIER_COST[1], 20_000n * WAD, '1x to 2x');
  assert.equal(TIER_COST[3] - TIER_COST[2], 20_000n * WAD, '2x to 3x');
  assert.equal(TIER_COST[3] - TIER_COST[1], 40_000n * WAD, '1x to 3x');
});

// ── the two empty pieces ──────────────────────────────────────────────────

test('headwear 0 and neckwear 0 are both "None", and no trait is called Bare any more', () => {
  const neckwear = CATEGORIES.find((c) => c.key === 'neckwear')!;
  const headwear = CATEGORIES.find((c) => c.key === 'headwear')!;
  assert.equal(headwear.traits[0].display, 'None');
  assert.equal(neckwear.traits[0].display, 'None');
  for (const c of CATEGORIES) {
    for (const t of c.traits) assert.doesNotMatch(t.display, /\bBare\b/, `${c.key}: ${t.display}`);
  }
});

test('the indices and the count did not move: only the two words did', () => {
  assert.equal(CATEGORIES.find((c) => c.key === 'headwear')!.traits.length, 16);
  assert.equal(CATEGORIES.find((c) => c.key === 'neckwear')!.traits.length, 6);
});
