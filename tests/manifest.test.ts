// A bad manifest must stop the app and say which field.
//
// Every case below is a real mistake somebody makes when pointing a build at a
// deployment: a truncated address, a key left out, the same address pasted
// twice, a chain id as a string, an id that does not match the filename. Each
// one has to produce a message that names the path — "contracts.ThePerch" — not
// "invalid manifest".

import test from 'node:test';
import assert from 'node:assert/strict';
import { validateManifest } from '../src/chain/manifest';

const GOOD = () => ({
  id: 'local-fork',
  label: 'Local fork',
  driver: 'chain',
  network: {
    chainId: 4663,
    chainName: 'Robinhood Chain',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['http://127.0.0.1:8545'],
    blockExplorerUrls: ['https://robinhoodchain.blockscout.com'],
  },
  contracts: {
    Avians: '0x1111111111111111111111111111111111111111',
    TraitRegistry: '0x2222222222222222222222222222222222222222',
    BirdRenderer: '0x3333333333333333333333333333333333333333',
    TheNest: '0x4444444444444444444444444444444444444444',
    Treasury: '0x5555555555555555555555555555555555555555',
    ThePerch: '0x6666666666666666666666666666666666666666',
    AvianStock: '0x7777777777777777777777777777777777777777',
    AviansHook: '0x8888888888888888888888888888888888888888',
    LiquidityVault: '0x9999999999999999999999999999999999999999',
  },
  thirdParty: {
    PoolManager: '0xaaaa111111111111111111111111111111111111',
    UniversalRouter: '0xbbbb222222222222222222222222222222222222',
    Permit2: '0xcccc333333333333333333333333333333333333',
    V4Quoter: '0xdddd444444444444444444444444444444444444',
  },
  multicall3: null,
  lens: null,
  startBlock: 100,
  allowlistProofs: null,
} as Record<string, unknown>);

const paths = (raw: unknown, id = 'local-fork') =>
  validateManifest(raw, id).problems.map((p) => p.path);

test('a complete manifest passes', () => {
  const { manifest, problems } = validateManifest(GOOD(), 'local-fork');
  assert.deepEqual(problems, []);
  assert.equal(manifest?.network.chainId, 4663);
  assert.equal(manifest?.contracts.ThePerch, '0x6666666666666666666666666666666666666666');
});

test('a missing contract names the contract', () => {
  const raw = GOOD();
  delete (raw.contracts as Record<string, unknown>).ThePerch;
  assert.deepEqual(paths(raw), ['contracts.ThePerch']);
});

test('a truncated address says how long it is', () => {
  const raw = GOOD();
  (raw.contracts as Record<string, unknown>).Treasury = '0x61aD3c0f9E27B45810cA7e3b0D25FC48a19e07B';
  const { problems } = validateManifest(raw, 'local-fork');
  assert.equal(problems[0].path, 'contracts.Treasury');
  assert.match(problems[0].says, /41 characters/);
});

test('the zero address is refused', () => {
  const raw = GOOD();
  (raw.contracts as Record<string, unknown>).Avians = '0x0000000000000000000000000000000000000000';
  const { problems } = validateManifest(raw, 'local-fork');
  assert.equal(problems[0].path, 'contracts.Avians');
  assert.match(problems[0].says, /zero address/);
});

test('one address under two names is a copy-paste error, and is named as one', () => {
  const raw = GOOD();
  (raw.contracts as Record<string, unknown>).ThePerch = (raw.contracts as Record<string, unknown>).Treasury;
  const { problems } = validateManifest(raw, 'local-fork');
  assert.ok(problems.some((p) => /same address as contracts\.Treasury/.test(p.says)));
});

test('the pool pair must be null together or set together', () => {
  const raw = GOOD();
  (raw.contracts as Record<string, unknown>).LiquidityVault = null;
  assert.ok(paths(raw).some((p) => p.includes('AviansHook / contracts.LiquidityVault')));
});

test('but a deployment with no pool yet is valid, said explicitly', () => {
  const raw = GOOD();
  (raw.contracts as Record<string, unknown>).AviansHook = null;
  (raw.contracts as Record<string, unknown>).LiquidityVault = null;
  // Three nulls, not two: no pool means nothing to route through either.
  raw.thirdParty = null;
  const { manifest, problems } = validateManifest(raw, 'local-fork');
  assert.deepEqual(problems, []);
  assert.equal(manifest?.contracts.AviansHook, null);
  assert.equal(manifest?.thirdParty, null);
});

test('a MISSING pool key is still a failure — absence is not a statement', () => {
  const raw = GOOD();
  delete (raw.contracts as Record<string, unknown>).AviansHook;
  const { problems } = validateManifest(raw, 'local-fork');
  assert.equal(problems[0].path, 'contracts.AviansHook');
  assert.match(problems[0].says, /use null/);
});

test('the chain id must be a positive integer, not a string', () => {
  const raw = GOOD();
  (raw.network as Record<string, unknown>).chainId = '4663';
  assert.deepEqual(paths(raw), ['network.chainId']);
});

test('an empty rpcUrls is refused: the manifest carries the network too', () => {
  const raw = GOOD();
  (raw.network as Record<string, unknown>).rpcUrls = [];
  assert.deepEqual(paths(raw), ['network.rpcUrls']);
});

test('an RPC that is not http(s) is refused', () => {
  const raw = GOOD();
  (raw.network as Record<string, unknown>).rpcUrls = ['ws://127.0.0.1:8545'];
  assert.deepEqual(paths(raw), ['network.rpcUrls[0]']);
});

test('an id that does not match the filename is refused', () => {
  assert.deepEqual(paths(GOOD(), 'mainnet-4663'), ['id']);
});

test('an unknown driver is refused', () => {
  const raw = GOOD();
  raw.driver = 'chian';
  assert.deepEqual(paths(raw), ['driver']);
});

test('multicall3, lens and allowlistProofs must be present, even as null', () => {
  const raw = GOOD();
  delete raw.multicall3;
  delete raw.lens;
  delete raw.allowlistProofs;
  const got = paths(raw);
  assert.ok(got.includes('multicall3'));
  assert.ok(got.includes('lens'));
  assert.ok(got.includes('allowlistProofs'));
});

test('a lens is an address or null, never a string that is not one', () => {
  const raw = GOOD();
  raw.lens = '0xnot-an-address';
  assert.ok(paths(raw).includes('lens'));
  raw.lens = '0x0aa91c20a4d78596c7e20c0ba39a44b67eae5718';
  const { manifest } = validateManifest(raw, 'local-fork');
  assert.equal(manifest?.lens?.toLowerCase(), '0x0aa91c20a4d78596c7e20c0ba39a44b67eae5718');
});

test('several problems are all reported, not just the first', () => {
  const raw = GOOD();
  delete (raw.contracts as Record<string, unknown>).ThePerch;
  delete (raw.contracts as Record<string, unknown>).Treasury;
  (raw.network as Record<string, unknown>).chainId = 0;
  const got = paths(raw);
  assert.equal(got.length, 3);
});

test('a document that is not an object is refused without throwing', () => {
  for (const raw of [null, 42, 'a string', []]) {
    assert.equal(validateManifest(raw, 'x').manifest, null);
  }
});

// ── the third-party block, which arrived with the trade modal ─────────────
//
// The router, the quoter and Permit2 are not ours and their addresses may not
// be written in `src/`. Everything below is a way of getting that wrong.

test('the third-party block must be present, even as null', () => {
  const raw = GOOD();
  delete raw.thirdParty;
  assert.deepEqual(paths(raw), ['thirdParty']);
});

test('a missing router names the router', () => {
  const raw = GOOD();
  delete (raw.thirdParty as Record<string, unknown>).UniversalRouter;
  assert.deepEqual(paths(raw), ['thirdParty.UniversalRouter']);
});

test('a pool with no router is refused — it could not be traded', () => {
  const raw = GOOD();
  raw.thirdParty = null;
  const { problems } = validateManifest(raw, 'local-fork');
  assert.equal(problems[0].path, 'thirdParty');
  assert.match(problems[0].says, /AviansHook is set/);
});

test('a router with no pool is refused too — there is nothing to reach', () => {
  const raw = GOOD();
  (raw.contracts as Record<string, unknown>).AviansHook = null;
  (raw.contracts as Record<string, unknown>).LiquidityVault = null;
  const { problems } = validateManifest(raw, 'local-fork');
  assert.equal(problems[0].path, 'thirdParty');
  assert.match(problems[0].says, /no pool/);
});

test('no pool and no third party is a complete, valid manifest', () => {
  const raw = GOOD();
  (raw.contracts as Record<string, unknown>).AviansHook = null;
  (raw.contracts as Record<string, unknown>).LiquidityVault = null;
  raw.thirdParty = null;
  const { manifest, problems } = validateManifest(raw, 'local-fork');
  assert.deepEqual(problems, []);
  assert.equal(manifest?.thirdParty, null);
});

test('one address under two third-party names is a copy-paste error', () => {
  const raw = GOOD();
  (raw.thirdParty as Record<string, unknown>).V4Quoter =
    (raw.thirdParty as Record<string, unknown>).Permit2;
  const { problems } = validateManifest(raw, 'local-fork');
  assert.equal(problems[0].path, 'thirdParty.V4Quoter');
  assert.match(problems[0].says, /same address as thirdParty.Permit2/);
});
