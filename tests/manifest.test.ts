// A bad manifest must stop the app and say which field.
//
// Every case below is a real mistake somebody makes when pointing a build at a
// deployment: a truncated address, a key left out, the same address pasted
// twice, a chain id as a string, an id that does not match the filename. Each
// one has to produce a message that names the path — "contracts.ThePerch" — not
// "invalid manifest".

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isLocalId, validateManifest } from '../src/chain/manifest';

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
    PositionManager: '0xeeee555555555555555555555555555555555555',
    StateView: '0xffff666666666666666666666666666666666666',
  },
  multicall3: null,
  sweeper: null,
  aviansStaking: '0xa5a5111111111111111111111111111111111111',
  roost: '0xb0b0222222222222222222222222222222222222',
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

test('multicall3 and allowlistProofs must be present, even as null', () => {
  const raw = GOOD();
  delete raw.multicall3;
  delete raw.allowlistProofs;
  const got = paths(raw);
  assert.ok(got.includes('multicall3'));
  assert.ok(got.includes('allowlistProofs'));
});

// ── the Sweeper, which arrived on 2026-09-12 ─────────────────────────────
//
// Its own field, not one of the seven: any key may deploy it at any time after
// the collection, and the site works without it. Null is the sentence "no
// Sweeper on this deployment", on which the panel does not exist; absence of
// the key is still the mistake it always is.

test('the sweeper key must be present — null says there is none, absence says nothing', () => {
  const raw = GOOD();
  delete raw.sweeper;
  assert.deepEqual(paths(raw), ['sweeper']);
  const { manifest } = validateManifest(GOOD(), 'local-fork');
  assert.equal(manifest?.sweeper, null);
});

test('a sweeper address is validated like any other, and kept', () => {
  const raw = GOOD();
  raw.sweeper = '0xabcd111111111111111111111111111111111111';
  const { manifest, problems } = validateManifest(raw, 'local-fork');
  assert.deepEqual(problems, []);
  assert.equal(manifest?.sweeper, '0xabcd111111111111111111111111111111111111');

  raw.sweeper = '0xabcd1111111111111111111111111111111111';
  const short = validateManifest(raw, 'local-fork').problems;
  assert.equal(short[0].path, 'sweeper');
  assert.match(short[0].says, /characters/);
});

test('a sweeper on one of the seven’s addresses is a paste error, and is named as one', () => {
  const raw = GOOD();
  raw.sweeper = (raw.contracts as Record<string, string>).TheNest;
  const { problems } = validateManifest(raw, 'local-fork');
  assert.ok(problems.some((p) => p.path === 'sweeper' && /same address as contracts\.TheNest/.test(p.says)));
});

// ── the Roost pair (2026-09-18) ──────────────────────────────────────────

test('aviansStaking and roost are required, and null is not an answer', () => {
  for (const key of ['aviansStaking', 'roost']) {
    const gone = GOOD(); delete gone[key];
    assert.deepEqual(paths(gone), [key], `${key} missing`);
    assert.match(validateManifest(gone, 'local-fork').problems[0].says, /predates 2026-09-18/);
    const nul = GOOD(); nul[key] = null;
    assert.deepEqual(paths(nul), [key], `${key} null`);
  }
});

test('the Roost pair is validated like any other address, and kept', () => {
  const { manifest, problems } = validateManifest(GOOD(), 'local-fork');
  assert.deepEqual(problems, []);
  assert.equal(manifest?.roost, '0xb0b0222222222222222222222222222222222222');
  assert.equal(manifest?.aviansStaking, '0xa5a5111111111111111111111111111111111111');
  const raw = GOOD(); raw.roost = '0xb0b02222222222222222222222222222222222';
  const short = validateManifest(raw, 'local-fork').problems;
  assert.equal(short[0].path, 'roost');
  assert.match(short[0].says, /characters/);
});

test('a Roost on one of the seven’s, the sweeper’s or the staking’s address is a paste error, and is named', () => {
  const onNest = GOOD(); onNest.roost = (onNest.contracts as Record<string, string>).TheNest;
  assert.ok(validateManifest(onNest, 'local-fork').problems.some((p) => p.path === 'roost' && /same address as contracts.TheNest/.test(p.says)));
  const onSweeper = GOOD(); onSweeper.sweeper = '0xabcd111111111111111111111111111111111111'; onSweeper.aviansStaking = onSweeper.sweeper;
  assert.ok(validateManifest(onSweeper, 'local-fork').problems.some((p) => p.path === 'aviansStaking' && /same address as sweeper/.test(p.says)));
  const same = GOOD(); same.roost = same.aviansStaking;
  assert.ok(validateManifest(same, 'local-fork').problems.some((p) => p.path === 'roost' && /same address as aviansStaking/.test(p.says)));
});

test('a manifest that still carries a lens is stale, and is refused rather than tolerated', () => {
  // The lens existed for one day. A manifest naming one was generated against
  // contracts from before every 2026-09-11 change, and the site must not boot
  // against them. Null and an address are equally stale: the KEY is the tell.
  for (const lens of [null, '0x0aa91c20a4d78596c7e20c0ba39a44b67eae5718']) {
    const raw = GOOD();
    raw.lens = lens;
    const { manifest, problems } = validateManifest(raw, 'local-fork');
    assert.equal(manifest, null);
    const p = problems.find((x) => x.path === 'lens');
    assert.ok(p, 'the lens key was not reported');
    assert.match(p!.says, /predates 2026-09-11/);
  }
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

// ── the committed index, against the disk ────────────────────────────────
//
// `loadManifest` only opens an entry's file when that deployment is chosen,
// so an index pointing at a file that is not there sits unnoticed until
// somebody picks it. This is where it is noticed instead: every entry in the
// index that ships must name a file that exists, parses, carries its own id,
// and is a manifest the site would boot on. A `local-*` entry is refused
// outright — those manifests are per-machine and gitignored, and are loaded
// from `?d=` without an entry.

// `tests/` and the bundled `.test-build/` are both one level under the dapp
// root, so the same relative path reaches the folder from either.
const DEPLOYMENTS = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'deployments');

/**
 * The one staleness that is allowed to stand, and only as a TODO: a manifest
 * generated before 2026-09-11 (the `lens` key, and no `sweeper` key because
 * that field did not exist yet). The site refuses to boot on it, by design,
 * until the founder regenerates it after the redeploy. Any other problem — a
 * bad address, a missing field, a wrong id — is a failure like any other.
 */
const PREDATES_THE_REDEPLOY = (problems: { path: string }[]) =>
  problems.some((p) => p.path === 'lens')
  && problems.every((p) => p.path === 'lens' || p.path === 'sweeper');

test('every deployment the committed index lists exists on disk and is a manifest the site would boot', async (t) => {
  const indexPath = join(DEPLOYMENTS, 'index.json');
  assert.ok(existsSync(indexPath), 'public/deployments/index.json is missing');
  const index = JSON.parse(readFileSync(indexPath, 'utf8')) as { default: string; deployments: { id: string; label: string; file: string }[] };
  assert.ok(Array.isArray(index.deployments) && index.deployments.length > 0, 'the index lists no deployments');
  assert.ok(index.deployments.some((d) => d.id === index.default), `the default ${JSON.stringify(index.default)} is not in the index`);

  for (const entry of index.deployments) {
    await t.test(`${entry.id} -> ${entry.file}`, (tt) => {
      assert.match(entry.id, /^[a-z0-9][a-z0-9-]*$/, 'an id is a lowercase slug');
      assert.ok(!isLocalId(entry.id), `${entry.id} is a per-machine manifest and must not be in the index — open it with ?d=${entry.id} instead`);
      assert.equal(entry.file, `./${entry.id}.json`, 'an entry names the file of its own id, beside the index');
      const file = join(DEPLOYMENTS, entry.file);
      assert.ok(existsSync(file), `${entry.file} is not in public/deployments — the index points at a file nobody has`);
      let raw: unknown;
      try {
        raw = JSON.parse(readFileSync(file, 'utf8'));
      } catch (e) {
        assert.fail(`${entry.file} is not valid JSON: ${(e as Error).message}`);
      }
      const { manifest, problems } = validateManifest(raw, entry.id);
      if (!manifest && PREDATES_THE_REDEPLOY(problems)) {
        tt.todo(`${entry.file} predates 2026-09-11 (it still carries \`lens\`) — regenerate it after the redeploy; until then the site refuses to boot on it, by design`);
        return;
      }
      assert.deepEqual(problems, [], `${entry.file} would stop the site`);
      assert.equal(manifest!.id, entry.id);
      assert.equal(manifest!.label, entry.label, 'the index label and the manifest label disagree');
      // A proofs file the manifest names is a URL the site fetches relative
      // to its page, so it must be under public/ — and be what the mint
      // expects, address -> proof[].
      if (manifest!.allowlistProofs) {
        assert.match(manifest!.allowlistProofs, /^\.\//, 'allowlistProofs is a page-relative path, ./…');
        const served = join(DEPLOYMENTS, '..', manifest!.allowlistProofs);
        assert.ok(existsSync(served), `${entry.file} names ${manifest!.allowlistProofs}, which is not under public/ — every Merkle-listed wallet would read NotAllowlisted`);
        const raw = JSON.parse(readFileSync(served, 'utf8')) as Record<string, unknown>;
        assert.ok(raw && typeof raw === 'object' && !Array.isArray(raw), 'the proofs file is an object');
        for (const [address, proof] of Object.entries(raw)) {
          assert.match(address, /^0x[0-9a-fA-F]{40}$/);
          assert.ok(Array.isArray(proof) && proof.every((p) => typeof p === 'string' && /^0x[0-9a-fA-F]{64}$/.test(p)), `the proof for ${address} is not bytes32[]`);
        }
      }
    });
  }
});

// ── the generator, and where the token comes from ─────────────────────────
//
// MAINNET-RUNBOOK step 0 lets the founder put AVIANS on chain weeks early, to
// publish its address; step 1's Deploy.s.sol then reuses it and its broadcast
// has no Avians CREATE. The generator must take the token from whichever
// broadcast has it, and must not pick when both do and they differ — that is
// step 1 run without AVIARY_AVIANS, a second token nobody published. These
// run the real script (--dry-run --skip-verify: nothing written, no chain)
// against fixture broadcasts, so the refusals are the sentences the founder
// would read.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const GENERATOR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'make-manifest.mjs');
const CHAIN = 4663;

const A = (n: number) => `0x${n.toString(16).padStart(40, '0')}`;
// The eight beside the token (2026-09-18: AviansStaking and TheRoost joined, between the Treasury and the Perch).
const SIX = { TraitRegistry: A(2), BirdRenderer: A(3), TheNest: A(4), Treasury: A(5), AviansStaking: A(8), TheRoost: A(9), ThePerch: A(6), AvianStock: A(7) };
const EARLY = A(0x1a);   // the token from step 0
const HERE = A(0x1b);    // a token Deploy.s.sol would create itself

/** A forge run-latest.json with one CREATE per name, in the order given. */
const run = (creates: Record<string, string>) => JSON.stringify({
  transactions: Object.entries(creates).map(([contractName, contractAddress]) => ({
    transactionType: 'CREATE', contractName, contractAddress, additionalContracts: [],
  })),
  receipts: [{ blockNumber: '0x64' }],
});

function generate(broadcasts: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), 'avian-broadcast-'));
  try {
    for (const [script, json] of Object.entries(broadcasts)) {
      mkdirSync(join(dir, script, String(CHAIN)), { recursive: true });
      writeFileSync(join(dir, script, String(CHAIN), 'run-latest.json'), json);
    }
    const r = spawnSync(process.execPath, [
      GENERATOR, '--chain', String(CHAIN), '--id', 'fixture-4663', '--label', 'Fixture',
      '--rpc', 'http://127.0.0.1:1', '--broadcast', dir, '--dry-run', '--skip-verify',
    ], { encoding: 'utf8' });
    const at = r.stdout.indexOf('{');
    const manifest = r.status === 0 && at >= 0
      ? JSON.parse(r.stdout.slice(at)) as { contracts: Record<string, string | null>; generated: { from: string } }
      : null;
    return { status: r.status, stdout: r.stdout, stderr: r.stderr, manifest };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('the token from Deploy.s.sol when nothing went early', () => {
  const r = generate({ 'Deploy.s.sol': run({ Avians: HERE, ...SIX }) });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.manifest!.contracts.Avians, HERE);
  assert.equal(r.manifest!.contracts.AvianStock, A(7));
  assert.doesNotMatch(r.manifest!.generated.from, /DeployAvians/);
});

test('the token from DeployAvians.s.sol when it went first and Deploy.s.sol reused it', () => {
  const r = generate({
    'DeployAvians.s.sol': run({ Avians: EARLY }),
    'Deploy.s.sol': run(SIX),                       // six creates: no Avians
  });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.manifest!.contracts.Avians, EARLY);
  assert.equal(r.manifest!.contracts.AvianStock, A(7));
  assert.match(r.manifest!.generated.from, /DeployAvians\.s\.sol.*Deploy\.s\.sol/, 'the manifest records both sources');
});

test('the Roost pair is read from the deploy broadcast into its own two fields, and a broadcast without them is refused', () => {
  const r = generate({ 'Deploy.s.sol': run({ Avians: HERE, ...SIX }) });
  assert.equal(r.status, 0, r.stderr);
  const m = r.manifest as unknown as { roost: string; aviansStaking: string };
  assert.equal(m.roost, A(9));
  assert.equal(m.aviansStaking, A(8));
  const { TheRoost: _r, ...old } = SIX;
  const stale = generate({ 'Deploy.s.sol': run({ Avians: HERE, ...old }) });
  assert.equal(stale.status, 1);
  assert.match(stale.stderr, /no CREATE for TheRoost/);
  assert.match(stale.stderr, /predates the Roost/);
});

test('two different tokens is refused, naming both files and both addresses', () => {
  const r = generate({
    'DeployAvians.s.sol': run({ Avians: EARLY }),
    'Deploy.s.sol': run({ Avians: HERE, ...SIX }),  // step 1 without AVIARY_AVIANS
  });
  assert.equal(r.status, 1);
  assert.equal(r.manifest, null, 'nothing is printed as a manifest');
  assert.match(r.stderr, /Two AVIANS tokens/);
  assert.ok(r.stderr.includes(EARLY) && r.stderr.includes(HERE), 'both addresses are in the refusal');
  assert.match(r.stderr, /DeployAvians\.s\.sol/);
  assert.match(r.stderr, /AVIARY_AVIANS/, 'it says what was most likely missed');
  assert.match(r.stderr, /Nothing was written/);
});

test('the same token in both broadcasts is not a conflict', () => {
  const r = generate({
    'DeployAvians.s.sol': run({ Avians: EARLY }),
    'Deploy.s.sol': run({ Avians: EARLY, ...SIX }),
  });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.manifest!.contracts.Avians, EARLY);
});

test('a DeployAvians broadcast with no Avians in it is refused, not skipped', () => {
  const r = generate({
    'DeployAvians.s.sol': run({}),
    'Deploy.s.sol': run({ Avians: HERE, ...SIX }),
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /DeployAvians\.s\.sol.*no CREATE for Avians/);
});

test('no token anywhere names both files it looked in', () => {
  const r = generate({ 'Deploy.s.sol': run(SIX) });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /no CREATE for Avians/);
  assert.match(r.stderr, /DeployAvians\.s\.sol/, 'it says where else the token could have come from');
  assert.match(r.stderr, /incomplete/);
});
