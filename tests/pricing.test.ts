// Conversions priced by the pools' own history, and the AVIAN pool's readings
// (2026-09-24).

import test from 'node:test';
import assert from 'node:assert/strict';
import { SELECTORS, explain, ContractError } from '../src/mock/errors';
import { detailOf } from '../src/chain/errors';
import {
  PRICE_FLOOR, PRICE_HOOK_MEAN, PRICE_NONE, PRICE_V3_MEAN,
  needsFloor, priceSourceLabel, readingPlan, sourceWithoutPriceSource, type Readings,
} from '../src/lib/pricing';
import { treasuryAbi } from '../src/chain/abis.generated';

type Entry = { type: string; name?: string; inputs?: { name: string }[]; outputs?: { name: string }[] };
const entries = treasuryAbi as unknown as Entry[];

const WINDOW = 1_800;
const readings = (over: Partial<Readings> = {}): Readings => ({
  window: WINDOW, maxAge: 604_800, lastAt: 0, prevAt: 0, refusal: null, ...over,
});

// ── the ABI the site was regenerated against ──────────────────────────────

test('the Treasury ABI carries the pools’ pricing: the source, the two readings and the reading write', () => {
  const names = new Set(entries.filter((e) => e.type === 'function').map((e) => e.name));
  for (const n of ['priceSource', 'lastReading', 'prevReading', 'TWAP_WINDOW',
    'READING_MAX_AGE', 'roostMeanTick', 'takeRoostReading']) {
    assert.ok(names.has(n), `the Treasury card cannot read ${n}`);
  }
  // Both readings answer `(tickCumulative, at)`: the site reads the second.
  for (const n of ['lastReading', 'prevReading']) {
    const e = entries.find((x) => x.type === 'function' && x.name === n)!;
    assert.deepEqual(e.outputs!.map((o) => o.name), ['tickCumulative', 'at'], n);
  }
  const ev = entries.find((e) => e.type === 'event' && e.name === 'RoostReadingTaken');
  assert.ok(ev, 'the receipt cannot name RoostReadingTaken');
  assert.deepEqual(ev!.inputs!.map((i) => i.name), ['tickCumulative', 'at', 'by']);
});

// ── where a pair's price comes from ───────────────────────────────────────

test('a pair’s source reads in words, and only a written floor has a floor to set', () => {
  assert.equal(priceSourceLabel(PRICE_NONE), 'no route');
  assert.equal(priceSourceLabel(PRICE_FLOOR), 'a written floor');
  assert.equal(priceSourceLabel(PRICE_V3_MEAN), 'priced by the pool’s thirty-minute mean');
  assert.equal(priceSourceLabel(PRICE_HOOK_MEAN), 'priced by the AVIAN pool’s readings');

  assert.equal(needsFloor(PRICE_FLOOR), true);
  for (const s of [PRICE_NONE, PRICE_V3_MEAN, PRICE_HOOK_MEAN]) {
    assert.equal(needsFloor(s), false, `${priceSourceLabel(s)} would be offered a floor form`);
  }
});

test('a Treasury that predates priceSource reads as the contract it is', () => {
  // The live set answers no `priceSource` at all, and its one reference was a
  // written floor for every routed pair. Reading it any other way would hide
  // the floor form on the deployment that still needs it.
  assert.equal(sourceWithoutPriceSource(0), PRICE_NONE, 'an unrouted pair');
  for (const venue of [3, 4]) {
    assert.equal(sourceWithoutPriceSource(venue), PRICE_FLOOR, `a v${venue} route`);
    assert.equal(needsFloor(sourceWithoutPriceSource(venue)), true);
  }
});

// ── what the Roost's buy can be offered right now ─────────────────────────

test('the reading plan: priced, or take one, or wait for the one on its way', () => {
  const now = 1_000_000;

  // `roostMeanTick()` answered: the button is the buy, as it always was.
  assert.deepEqual(readingPlan(readings({ lastAt: now - 5_400, prevAt: now - 9_000 }), now),
    { kind: 'priced' });

  // Nobody has ever taken one.
  assert.deepEqual(readingPlan(readings({ refusal: 'NoUsableReading' }), now), { kind: 'take' });

  // A week of quiet: the readings expired and anyone may renew them.
  assert.deepEqual(
    readingPlan(readings({ refusal: 'NoUsableReading', lastAt: now - 700_000, prevAt: now - 800_000 }), now),
    { kind: 'take' });

  // One was taken seven minutes ago and the previous has expired: taking
  // another would be refused `ReadingTooYoung`, so the page says the wait.
  assert.deepEqual(
    readingPlan(readings({ refusal: 'NoUsableReading', lastAt: now - 420 }), now),
    { kind: 'waiting', usableAt: now - 420 + WINDOW });

  // Exactly `TWAP_WINDOW` old is old enough: the contract's test is `>=`.
  assert.deepEqual(
    readingPlan(readings({ refusal: 'NoUsableReading', lastAt: now - WINDOW }), now),
    { kind: 'take' });
});

test('a Treasury with no readings is offered the buy, not a reading', () => {
  // The live set predates the readings, and every one of those calls fails.
  // The card must go on drawing BUY FOR THE ROOST rather than a button that
  // lands on a function the deployment does not have.
  assert.deepEqual(readingPlan(null, 1_000_000), { kind: 'unavailable' });
  // And a refusal that is not about the readings is not a reading's to fix.
  assert.deepEqual(readingPlan(readings({ refusal: 'NoTickOracle' }), 1_000_000),
    { kind: 'unavailable' });
});

// ── the four refusals ─────────────────────────────────────────────────────

test('the pool-pricing refusals decode by name, and each says what the wait is', () => {
  for (const name of ['PriceUnsettled', 'NoUsableReading', 'ReadingTooYoung', 'NoTickOracle'] as const) {
    const selector = SELECTORS[name];
    assert.ok(selector, `${name} has no selector`);
    assert.equal(detailOf(selector!)?.split('(')[0] ?? name, name, `${selector} does not decode to ${name}`);
    const e = explain(new ContractError(name));
    assert.ok(e.title.length > 0 && e.sentence.length > 0, `${name} has no sentence`);
    assert.match(e.sentence, /Nothing was taken|none of it is lost/, `${name} does not say nothing moved`);
  }

  // The unsettled pool is the one a person will meet most, and it is not
  // permanent: the sentence has to say so and offer the retry.
  const unsettled = explain(new ContractError('PriceUnsettled'));
  assert.equal(unsettled.fatal, false);
  assert.match(unsettled.sentence, /10%/);
  assert.equal(unsettled.fix?.kind, 'refresh');

  // A reading that is still too young names when it was taken and when the
  // buy opens, which is the pair of facts the presser needs.
  const young = explain(new ContractError('ReadingTooYoung', { at: 1_000_000, usableAt: 1_001_800 }));
  for (const t of [1_000_000, 1_001_800]) {
    assert.match(young.sentence, new RegExp(new Date(t * 1000).toLocaleTimeString()
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `does not name ${t}`);
  }
  // And without the arguments it still says something true rather than "NaN".
  assert.doesNotMatch(explain(new ContractError('ReadingTooYoung')).sentence, /NaN|Invalid/);
});

test('no refusal claims the Roost’s buy trades against a floor any more', () => {
  // The buy is priced from the pool's own history; a floor is consulted only
  // where there is none to read. A sentence that says otherwise is now false.
  for (const name of ['NoFloorPrice', 'FloorPriceStale', 'FloorPriceTooFresh', 'SlippageTooHigh'] as const) {
    for (const ctx of [{}, { roostBuy: true }]) {
      const e = explain(new ContractError(name), ctx);
      assert.doesNotMatch(e.sentence, /trades only against a floor|below the floor price/,
        `${name}: ${e.sentence}`);
    }
  }
});
