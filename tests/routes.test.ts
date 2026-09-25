// The routes that moved on 2026-09-25: the Contracts page became a section of
// Docs, and the Bird Engine page (first called the Flywheel page) took its
// place in the list.

import test from 'node:test';
import assert from 'node:assert/strict';
import { href, parse } from '../src/router';

test('the old #/contracts opens Docs at "The contracts"', () => {
  assert.deepEqual(parse('#/contracts'), { name: 'docs', at: 'contracts' });
  assert.equal(href({ name: 'docs', at: 'contracts' }), '#/docs/contracts');
  assert.deepEqual(parse('#/docs/contracts'), { name: 'docs', at: 'contracts' });
});

test('Docs with no section is plain Docs', () => {
  assert.deepEqual(parse('#/docs'), { name: 'docs' });
  assert.equal(href({ name: 'docs' }), '#/docs');
});

test('#/bird-engine, and #/bird-engine/roost at the Roost card', () => {
  assert.deepEqual(parse('#/bird-engine'), { name: 'engine' });
  assert.deepEqual(parse('#/bird-engine/roost'), { name: 'engine', at: 'roost' });
  assert.equal(href({ name: 'engine' }), '#/bird-engine');
  assert.equal(href({ name: 'engine', at: 'roost' }), '#/bird-engine/roost');
});

test('the first day\'s #/flywheel still opens the Bird Engine', () => {
  assert.deepEqual(parse('#/flywheel'), { name: 'engine' });
  assert.deepEqual(parse('#/flywheel/roost'), { name: 'engine', at: 'roost' });
});

test('the Roost and the Nest keep their addresses', () => {
  assert.deepEqual(parse('#/roost'), { name: 'roost' });
  assert.deepEqual(parse('#/nest'), { name: 'nest' });
});
