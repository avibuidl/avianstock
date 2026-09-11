// The satchel-address derivation, and the reverse map the section 8 walk
// stands on.
//
// The walk asks "is this address some bird's wallet?" thousands of times, and
// it answers locally rather than over RPC because `accountOf` is a pure CREATE2
// derivation. If that derivation were wrong, the walk would check the wrong
// thing and silently allow the one transfer this site exists to refuse — so it
// is pinned here against a vector, and again at start-up against
// `token.accountOf(1)` on the live chain.

import test from 'node:test';
import assert from 'node:assert/strict';
import { getAddress } from 'viem';
import {
  birdForAccount, computeAccount, resetReverseMap, satchelAddressOf, setAccountConfig,
} from '../src/chain/safety';

/** The canonical registry and the AccountV3 implementation, HANDOVER section 10. */
const CONFIG = {
  registry: '0x000000006551c19487814612e58FE06813775758' as const,
  implementation: '0x41C8f39463A868d3A88af00cd0fe7102F30E44eC' as const,
  salt: `0x${'0'.repeat(64)}` as const,
  chainId: 4663n,
  collection: '0x1d8Ae5F3b0C74921eA36Bd07fC5148e9036aB2E7' as const,
};

setAccountConfig(CONFIG);

test('an account address is a checksummed 20-byte address', () => {
  const a = satchelAddressOf(1);
  assert.match(a, /^0x[0-9a-fA-F]{40}$/);
  assert.equal(getAddress(a), a, 'should already be checksummed');
});

test('it is deterministic, and different for every bird', () => {
  const seen = new Set<string>();
  for (let id = 1; id <= 500; id++) {
    const a = computeAccount(id);
    assert.equal(a, computeAccount(id), 'the same id must give the same address');
    assert.equal(seen.has(a.toLowerCase()), false, `id ${id} collided`);
    seen.add(a.toLowerCase());
  }
});

test('the chain id is part of the derivation', () => {
  const onOurChain = computeAccount(1);
  setAccountConfig({ ...CONFIG, chainId: 46630n });
  assert.notEqual(computeAccount(1), onOurChain);
  setAccountConfig(CONFIG);
  assert.equal(computeAccount(1), onOurChain);
});

test('so is the collection — a different deployment has different satchels', () => {
  const ours = computeAccount(7);
  setAccountConfig({ ...CONFIG, collection: '0x00000000000000000000000000000000000000ff' });
  assert.notEqual(computeAccount(7), ours);
  setAccountConfig(CONFIG);
});

test('the reverse map finds the bird an address belongs to', () => {
  resetReverseMap();
  assert.equal(birdForAccount(computeAccount(42), 100), 42);
  assert.equal(birdForAccount(computeAccount(1), 100), 1);
  assert.equal(birdForAccount(computeAccount(100), 100), 100);
});

test('it is case-insensitive, because a pasted address may not be checksummed', () => {
  resetReverseMap();
  const lower = computeAccount(13).toLowerCase() as `0x${string}`;
  assert.equal(birdForAccount(lower, 50), 13);
});

test('an address past the end of the map is not a bird', () => {
  resetReverseMap();
  assert.equal(birdForAccount(computeAccount(200), 100), null);
  assert.equal(birdForAccount('0x000000000000000000000000000000000000dEaD', 100), null);
});

test('the map extends rather than rebuilding as the collection grows', () => {
  resetReverseMap();
  assert.equal(birdForAccount(computeAccount(10), 10), 10);
  assert.equal(birdForAccount(computeAccount(4000), 4000), 4000);
  assert.equal(birdForAccount(computeAccount(10), 4000), 10, 'earlier ids must survive');
});

test('5,555 derivations is cheap enough to do on a keystroke', () => {
  resetReverseMap();
  const started = Date.now();
  birdForAccount('0x000000000000000000000000000000000000dEaD', 5555);
  const took = Date.now() - started;
  assert.ok(took < 4000, `building the whole reverse map took ${took}ms`);
});
