// Which deployment the site opens on.
//
// The rule (2026-09-19): a real deployment whenever one is configured, the
// mock only when none is. `?d=` first, then the remembered choice unless it
// is the mock while a chain deployment exists, then mainnet, then the newest
// chain deployment, then the mock. The index's `default` is a tie-break only.
// The chooser is pure, so every case is a table here: the index, what each
// indexed file turned out to be, the URL's `?d=`, and what the browser
// remembered.

import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseDeployment, type DeploymentIndex, type IndexedDeployment } from '../src/chain/manifest';

const entry = (id: string) => ({ id, label: id, file: `./${id}.json` });
const MOCK: IndexedDeployment = { id: 'mock', driver: 'mock', chainId: 4663 };
const TESTNET: IndexedDeployment = { id: 'testnet-46630', driver: 'chain', chainId: 46630 };
const MAINNET: IndexedDeployment = { id: 'mainnet-4663', driver: 'chain', chainId: 4663 };

const index = (def: string, ...known: IndexedDeployment[]): DeploymentIndex =>
  ({ default: def, deployments: known.map((k) => entry(k.id)) });

test('an index with the mock only opens the mock', () => {
  assert.equal(chooseDeployment(index('mock', MOCK), [MOCK], null, null), 'mock');
});

test('mock and a testnet: the testnet, whatever the index default says', () => {
  assert.equal(chooseDeployment(index('mock', MOCK, TESTNET), [MOCK, TESTNET], null, null), 'testnet-46630');
});

test('mock, testnet and mainnet: mainnet, wherever it sits in the index', () => {
  assert.equal(chooseDeployment(index('mock', MAINNET, MOCK, TESTNET), [MAINNET, MOCK, TESTNET], null, null), 'mainnet-4663');
  assert.equal(chooseDeployment(index('testnet-46630', MOCK, TESTNET, MAINNET), [MOCK, TESTNET, MAINNET], null, null), 'mainnet-4663');
});

test('a stale remembered id that is no longer indexed is ignored', () => {
  assert.equal(chooseDeployment(index('mock', MOCK, TESTNET), [MOCK, TESTNET], null, 'testnet-old'), 'testnet-46630');
});

test('a remembered mock does not pin a visitor to the mock once a chain deployment is configured', () => {
  assert.equal(chooseDeployment(index('mock', MOCK, TESTNET), [MOCK, TESTNET], null, 'mock'), 'testnet-46630');
  // With nothing but the mock configured, the remembered mock is simply the mock.
  assert.equal(chooseDeployment(index('mock', MOCK), [MOCK], null, 'mock'), 'mock');
});

test('?d=mock opens the mock explicitly, chain deployment or not', () => {
  assert.equal(chooseDeployment(index('mock', MOCK, TESTNET, MAINNET), [MOCK, TESTNET, MAINNET], 'mock', null), 'mock');
});

test('a remembered chain deployment is honoured over mainnet', () => {
  assert.equal(chooseDeployment(index('mock', MOCK, TESTNET, MAINNET), [MOCK, TESTNET, MAINNET], null, 'testnet-46630'), 'testnet-46630');
});

test('?d= names an indexed id or a local-* file; anything else is ignored', () => {
  assert.equal(chooseDeployment(index('mock', MOCK, TESTNET), [MOCK, TESTNET], 'local-fork', null), 'local-fork');
  assert.equal(chooseDeployment(index('mock', MOCK, TESTNET), [MOCK, TESTNET], 'typo', 'mock'), 'testnet-46630');
});

test('with no mainnet, the last chain entry in the index is the newest and wins', () => {
  const older: IndexedDeployment = { id: 'testnet-46630-a', driver: 'chain', chainId: 46630 };
  const newer: IndexedDeployment = { id: 'testnet-46630-b', driver: 'chain', chainId: 46630 };
  assert.equal(chooseDeployment(index('mock', MOCK, older, newer), [MOCK, older, newer], null, null), 'testnet-46630-b');
  assert.equal(chooseDeployment(index('mock', MOCK, newer, older), [MOCK, newer, older], null, null), 'testnet-46630-a');
});

test('the index default is a tie-break among mainnet deployments, never a reason to open the mock', () => {
  const a: IndexedDeployment = { id: 'mainnet-a', driver: 'chain', chainId: 4663 };
  const b: IndexedDeployment = { id: 'mainnet-b', driver: 'chain', chainId: 4663 };
  assert.equal(chooseDeployment(index('mainnet-a', MOCK, a, b), [MOCK, a, b], null, null), 'mainnet-a');
  assert.equal(chooseDeployment(index('mock', MOCK, a, b), [MOCK, a, b], null, null), 'mainnet-b');
});

test('a chain manifest that does not validate is not configured', () => {
  const broken: IndexedDeployment = { id: 'testnet-46630', driver: null, chainId: null };
  assert.equal(chooseDeployment(index('mock', MOCK, broken), [MOCK, broken], null, null), 'mock');
  // Asked for by name, it is still opened, so the boot can say what is wrong with it.
  assert.equal(chooseDeployment(index('mock', MOCK, broken), [MOCK, broken], 'testnet-46630', null), 'testnet-46630');
});
