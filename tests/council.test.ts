// The council card's four states, from the mock's own read.
//
// The card is read-only everywhere it appears, so what there is to test is
// the shape the wiring session must fill: which fields are present in each
// state, that a pending change carries a sentence and a moment rather than a
// duration, and that the rescue is marked as the one to notice.

import test from 'node:test';
import assert from 'node:assert/strict';
import { getCouncil } from '../src/mock/council';
import { setScenario, resetScenario } from '../src/mock/scenario';

const DAY = 86_400;

test.afterEach(() => resetScenario());

test('a seat named and nothing waiting: the facts, and an empty list', async () => {
  setScenario({ council: 'quiet' });
  const c = await getCouncil();
  assert.match(c.council ?? '', /^0x[0-9a-fA-F]{40}$/);
  assert.match(c.multisig ?? '', /^0x[0-9a-fA-F]{40}$/);
  assert.equal(c.structuralDelay, 3 * DAY);
  assert.equal(c.rescueDelay, DAY);
  assert.deepEqual(c.pending, []);
});

test('a replacement waiting: one structural change, its sentence, and a moment two days out', async () => {
  setScenario({ council: 'replacement' });
  const c = await getCouncil();
  assert.equal(c.pending.length, 1);
  const [p] = c.pending;
  assert.equal(p.kind, 'structural');
  assert.match(p.says, /^The hook's Treasury moves to 0x[0-9a-fA-F]{40}$/);
  // A moment, not a duration: the card counts down to it on the chain's clock.
  const waits = p.readyAt - c.chainNow;
  assert.ok(waits > 2 * DAY && waits <= 3 * DAY, `waits ${waits}`);
});

test('the owner’s proposal waiting: the ordinary tone, one day out', async () => {
  // Part 18: path A is the owner's own request, seated a day on. It reads as
  // such, and the stronger tone is kept for the rescue after silence.
  setScenario({ council: 'rescue' });
  const c = await getCouncil();
  assert.equal(c.pending.length, 1);
  const [p] = c.pending;
  assert.equal(p.kind, 'structural');
  assert.match(p.says, /^The admin key moves to 0x[0-9a-fA-F]{40}, as the owner proposed$/);
  const waits = p.readyAt - c.chainNow;
  assert.ok(waits > DAY - 60 && waits <= DAY, `waits ${waits}`);
});

test('the silent rescue waiting: marked as the rescue, three days out', async () => {
  setScenario({ council: 'silent-rescue' });
  const c = await getCouncil();
  assert.equal(c.pending.length, 1);
  const [p] = c.pending;
  assert.equal(p.kind, 'rescue');
  assert.match(p.says, /^The admin key moves to 0x[0-9a-fA-F]{40}, after the owner's silence$/);
  const waits = p.readyAt - c.chainNow;
  assert.ok(waits > 3 * DAY - 60 && waits <= 3 * DAY, `waits ${waits}`);
});

test('a seat with no council: the Nest named as frozen, the rest of the facts still stated', async () => {
  // Part 17 made this fixture ONE seat never named, as the brief lists it,
  // rather than a deployment with no council at all: the card now names each
  // unnamed seat, and the others may still answer to the council.
  setScenario({ council: 'none' });
  const c = await getCouncil();
  assert.deepEqual(c.unnamedOn, ['the Nest']);
  assert.match(c.council ?? '', /^0x[0-9a-fA-F]{40}$/);
  assert.deepEqual(c.pending, []);
  assert.equal(c.structuralDelay, 3 * DAY);
  assert.equal(c.rescueDelay, DAY);
});

test('every pending change carries an id of its own', async () => {
  setScenario({ council: 'replacement' });
  const a = await getCouncil();
  setScenario({ council: 'rescue' });
  const b = await getCouncil();
  assert.notEqual(a.pending[0].id, b.pending[0].id);
  for (const c of [a, b]) assert.match(c.pending[0].id, /^0x[0-9a-f]{64}$/);
});
