// forge broadcast  ->  a validated deployment manifest
//
// HANDOVER section 10: the addresses come out of
//   contracts/broadcast/Deploy.s.sol/<chainId>/run-latest.json
// and the pool's three out of the matching DeployLaunch.s.sol run. "Do not
// hard-code them from a testnet run." The token alone may come out of
//   contracts/broadcast/DeployAvians.s.sol/<chainId>/run-latest.json
// instead, when it went on chain first (MAINNET-RUNBOOK step 0).
//
// This script is that instruction, mechanised — and it does one more thing
// before it writes: it asks the CHAIN the same cross-check questions the site
// asks at start-up. A manifest that would stop the app has no business being
// written in the first place, so a mismatch here is a non-zero exit and no
// file, with the disagreement printed.
//
// Usage:
//   node scripts/make-manifest.mjs --chain 4663 --id mainnet-4663 \
//     --label "Robinhood Chain" --rpc https://rpc.mainnet.chain.robinhood.com
//
//   --explorer <url>      default https://robinhoodchain.blockscout.com
//   --proofs <path>       the allowlist toolkit's proofs.json (ALLOWLIST.md §3).
//                         Copied into public/deployments/proofs/<id>.json so the
//                         site can SERVE it; the manifest records the served path.
//   --default             make this deployment the index's default. Since
//                         2026-09-19 the site opens on mainnet if configured,
//                         else the newest chain deployment, else the mock, and
//                         reads the default only as a tie-break; a chain manifest
//                         written over a "mock" or missing default becomes the
//                         default on its own. A testnet never displaces a
//                         mainnet default, flag or no flag.
//   --broadcast <dir>     default ../contracts/broadcast
//   --dry-run             print it, write nothing
//   --skip-verify         write without asking the chain (say why in the PR)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createPublicClient, defineChain, encodeFunctionData, http, isAddress,
} from 'viem';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

// ── arguments ─────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};
const has = (name) => argv.includes(`--${name}`);

const chainId = Number(flag('chain'));
const id = flag('id');
const label = flag('label');
const rpc = flag('rpc');
const explorer = flag('explorer', 'https://robinhoodchain.blockscout.com');
const proofs = flag('proofs', null);
const broadcastDir = resolve(root, flag('broadcast', join('..', 'contracts', 'broadcast')));
const dryRun = has('dry-run');
const skipVerify = has('skip-verify');
const makeDefault = has('default');

const rel = (p) => relative(root, p).split('\\').join('/');
const die = (...lines) => { console.error(lines.join('\n')); process.exit(1); };

if (!Number.isInteger(chainId) || chainId <= 0) die('--chain <id> is required, and must be a positive integer.');
if (!id) die('--id <slug> is required. It becomes the filename and must match the manifest\'s id.');
if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) die(`--id must be a lowercase slug (letters, digits, dashes), got ${JSON.stringify(id)}`);
/**
 * A `local-*` id is PER-MACHINE: a fork somebody started themselves, whose
 * addresses exist nowhere else. The file is written and gitignored, and the
 * index is left alone — an index entry for it would point every other clone
 * at a file nobody else has. The site loads such an id straight from
 * `?d=<id>` (see `loadManifest` in src/chain/manifest.ts).
 */
const isLocal = id.startsWith('local-');
if (isLocal && makeDefault) die('--default makes no sense for a local-* manifest: it is never in the index.');

/**
 * THE PROOFS FILE IS SERVED, NOT REFERENCED. `allowlistProofs` is a URL the
 * site fetches relative to its own page, so a filesystem path such as
 * `../build/allowlist/proofs.json` would be a 404 on the host and every
 * Merkle-listed wallet would read NotAllowlisted. The file is copied under
 * `public/deployments/proofs/` and the manifest names THAT path. A file
 * already under `public/` is referenced where it is. Either way it is read
 * and checked first: an object of address -> bytes32[] and nothing else.
 */
const publicDir = join(root, 'public');
let proofsServed = null;      // the path the manifest records
let proofsSource = null;      // where the bytes come from, for the copy
let proofsCount = 0;
if (proofs !== null) {
  const source = resolve(process.cwd(), proofs);
  if (!existsSync(source)) die(`--proofs ${proofs}: no such file (resolved to ${source}).`);
  let parsed;
  try { parsed = JSON.parse(readFileSync(source, 'utf8')); } catch (e) { die(`--proofs ${proofs} is not valid JSON: ${e.message}`); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) die(`--proofs ${proofs}: expected an object of address -> proof[]`);
  for (const [address, proof] of Object.entries(parsed)) {
    if (!isAddress(address)) die(`--proofs ${proofs}: ${address} is not an address`);
    if (!Array.isArray(proof) || !proof.every((p) => /^0x[0-9a-fA-F]{64}$/.test(p))) die(`--proofs ${proofs}: the proof for ${address} is not an array of bytes32`);
    proofsCount++;
  }
  const relToPublic = relative(publicDir, source).split('\\').join('/');
  if (!relToPublic.startsWith('..') && !relToPublic.startsWith('/')) {
    proofsServed = `./${relToPublic}`;
  } else {
    proofsSource = source;
    proofsServed = `./deployments/proofs/${id}.json`;
  }
}
if (!rpc) die('--rpc <url> is required: the manifest carries the network, not just the addresses.');
if (!/^https?:\/\//.test(rpc)) die(`--rpc must be http or https, got ${rpc}`);

// ── the broadcast files ───────────────────────────────────────────────────

/** HANDOVER section 10's creation order, and where each one is deployed. */
const FROM_DEPLOY = ['Avians', 'TraitRegistry', 'BirdRenderer', 'TheNest', 'Treasury', 'ThePerch', 'AvianStock'];
/**
 * The two the Roost added on 2026-09-18, created between the Treasury and the
 * Perch in the same run. They are manifest fields of their own (`aviansStaking`,
 * `roost`), required and never null: the Nest sends every tier cost to the
 * Roost and the Perch every fee, so a deployment without them is the old one.
 */
const ROOST_PAIR = { aviansStaking: 'AviansStaking', roost: 'TheRoost' };
const FROM_LAUNCH = ['AviansHook', 'LiquidityVault'];

function readRun(script) {
  const path = join(broadcastDir, script, String(chainId), 'run-latest.json');
  if (!existsSync(path)) return { path, run: null };
  return { path, run: JSON.parse(readFileSync(path, 'utf8')) };
}

/**
 * Every CREATE in the run, by contract name. Two creates of one name in one run
 * is refused rather than guessed at: that is a re-run that left an orphan set,
 * and picking either one silently is how a site ends up pointed half at each.
 */
function creates(run, path) {
  const found = new Map();
  const note = (name, address) => {
    if (!name || !address) return;
    if (found.has(name) && found.get(name).toLowerCase() !== address.toLowerCase()) {
      die(
        `${path}: two different ${name} contracts in one run (${found.get(name)} and ${address}).`,
        'That is a re-run that left an orphan set. Pick the deployment you mean and point --broadcast at it.',
      );
    }
    found.set(name, address);
  };

  for (const tx of run?.transactions ?? []) {
    if (tx.transactionType === 'CREATE' || tx.transactionType === 'CREATE2') {
      note(tx.contractName, tx.contractAddress);
    }
    // `AviansHook` and `LiquidityVault` are created BY the Launcher inside its
    // own `launch()` call, not as top-level transactions, so forge records them
    // under `additionalContracts`. Miss this and a pool deployment looks like
    // no pool at all.
    for (const extra of tx.additionalContracts ?? []) {
      note(extra.contractName, extra.address ?? extra.contractAddress);
    }
  }
  return found;
}

const deploy = readRun('Deploy.s.sol');
if (!deploy.run) {
  die(
    `No broadcast at ${deploy.path}.`,
    'Run script/Deploy.s.sol with --broadcast against this chain first.',
  );
}
/**
 * THE TOKEN MAY HAVE GONE FIRST. MAINNET-RUNBOOK step 0: `DeployAvians.s.sol`
 * puts AVIANS on chain by itself, days or weeks early, so the address can be
 * published; step 1's `Deploy.s.sol` then reuses it through AVIARY_AVIANS and
 * its broadcast has no Avians CREATE at all. So the token comes from the
 * DeployAvians broadcast when there is one and from Deploy's otherwise. Both
 * with a token, and a different one each, is the runbook's own warning made
 * real — step 1 ran without AVIARY_AVIANS exported and minted a second AVIANS
 * — and is refused rather than chosen between. The cross-check below
 * (`token.AVIANS() == Avians`) is what catches a wrong pairing either way.
 */
const early = readRun('DeployAvians.s.sol');
const launch = readRun('DeployLaunch.s.sol');
// (The lens of 2026-09-11 is gone: "who holds what" is the collection's own.)
// The Sweeper (2026-09-12) is its own script, deployable by any key at any
// time after the collection, so it is its own broadcast — and its own field,
// null until that broadcast exists. The site hides the whole feature on null.
const sweeperRun = readRun('DeploySweeper.s.sol');

const deployed = creates(deploy.run, deploy.path);
const earlyCreates = early.run ? creates(early.run, early.path) : new Map();
const aviansEarly = earlyCreates.get('Avians') ?? null;
if (early.run && !aviansEarly) {
  die(`${early.path} exists but has no CREATE for Avians. Re-run DeployAvians.s.sol, or delete that broadcast.`);
}
const aviansHere = deployed.get('Avians') ?? null;
if (aviansEarly && aviansHere && aviansEarly.toLowerCase() !== aviansHere.toLowerCase()) {
  die(
    `Two AVIANS tokens: ${early.path} put ${aviansEarly} on chain, and ${deploy.path} then created another at ${aviansHere}.`,
    'Deploy.s.sol reuses the early token only when AVIARY_AVIANS is exported in the terminal that runs it',
    '(MAINNET-RUNBOOK step 0); without it, the collection is wired to the second token and the address',
    'already published is one nothing uses. Which of the two this deployment means is not the generator\'s',
    'call. Nothing was written.',
  );
}
const avians = aviansEarly ?? aviansHere;
if (!avians) {
  die(
    `${deploy.path} has no CREATE for Avians, and there is no ${early.path} to take the token from.`,
    'This deployment is incomplete.',
  );
}
const launched = launch.run ? creates(launch.run, launch.path) : new Map();
const sweeper = sweeperRun.run ? (creates(sweeperRun.run, sweeperRun.path).get('Sweeper') ?? null) : null;
if (sweeperRun.run && !sweeper) {
  die(`${sweeperRun.path} exists but has no CREATE for Sweeper. Re-run DeploySweeper.s.sol, or delete that broadcast.`);
}

const contracts = {};
for (const name of FROM_DEPLOY) {
  const address = name === 'Avians' ? avians : deployed.get(name);
  if (!address) die(`${deploy.path} has no CREATE for ${name}. This deployment is incomplete.`);
  contracts[name] = address;
}
const roostPair = {};
for (const [field, name] of Object.entries(ROOST_PAIR)) {
  const address = deployed.get(name);
  if (!address) die(`${deploy.path} has no CREATE for ${name}. This deployment predates the Roost (2026-09-18); redeploy.`);
  roostPair[field] = address;
}
for (const name of FROM_LAUNCH) {
  // Null as a PAIR: an explicit "this deployment has no pool yet", which the
  // site understands. A half-launched pool is refused.
  contracts[name] = launched.get(name) ?? null;
}
if ((contracts.AviansHook === null) !== (contracts.LiquidityVault === null)) {
  die(
    `${launch.path}: the pool deployment produced ${contracts.AviansHook ? 'a hook' : 'a vault'} but not the other.`,
    'Re-run DeployLaunch.s.sol with --resume; a half-launched pool is not a deployment the site will open on.',
  );
}

const startBlock = Number(
  (deploy.run.receipts ?? [])
    .map((r) => Number(BigInt(r.blockNumber ?? '0x0')))
    .filter((n) => n > 0)
    .sort((a, b) => a - b)[0] ?? 0,
);

for (const [name, address] of Object.entries(contracts)) {
  if (address !== null && !isAddress(address)) die(`${name}: ${address} is not an address.`);
}
if (sweeper !== null && !isAddress(sweeper)) die(`Sweeper: ${sweeper} is not an address.`);
for (const [field, address] of Object.entries(roostPair)) {
  if (!isAddress(address)) die(`${field}: ${address} is not an address.`);
}

// ── multicall3, if this chain has one at the canonical address ────────────

const CANONICAL_MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11';

/**
 * The third-party contracts a swap needs, from HANDOVER section 10's measured
 * table. Here in the GENERATOR, never in `src/`: the site's hygiene check
 * forbids an address in application source, so the only honest place for one is
 * a script that writes it into a manifest and verifies it on the way.
 *
 * Present at these same addresses on 4663 and on testnet 46630. The router's
 * and Permit2's bytecode differs between the two — same length, different hash,
 * which is what a struct of chain-local addresses baked in as immutables looks
 * like — so each manifest carries its own copy rather than the site assuming
 * one set is universal.
 */
const THIRD_PARTY = {
  PoolManager: '0x8366a39CC670B4001A1121B8F6A443A643e40951',
  UniversalRouter: '0x8876789976dEcBfCbBbe364623C63652db8C0904',
  Permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
  V4Quoter: '0x8Dc178eFB8111BB0973Dd9d722ebeFF267c98F94',
  // The admin panel's pending-fee read: the vault's position lives in the
  // PositionManager, and StateView is the read path into the PoolManager's
  // fee-growth storage. Both from HANDOVER section 10.
  PositionManager: '0x58daec3116aae6D93017bAAea7749052E8a04fA7',
  StateView: '0xF3334192D15450CdD385c8B70e03f9A6bD9E673b',
};

const chain = defineChain({
  id: chainId,
  name: label ?? `chain ${chainId}`,
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [rpc] } },
});
const client = createPublicClient({ chain, transport: http(rpc, { timeout: 15_000 }) });

let multicall3 = null;
if (!skipVerify) {
  const code = await client.getCode({ address: CANONICAL_MULTICALL3 }).catch(() => undefined);
  multicall3 = code && code !== '0x' ? CANONICAL_MULTICALL3 : null;
}

/**
 * Only written once each address has been shown to have code on THIS chain.
 * A manifest naming a router that is not there produces a site whose trade
 * button fails at the wallet, which is the worst place to find out.
 */
let thirdParty = null;
if (contracts.AviansHook === null) {
  console.log('  thirdParty  null — no pool on this deployment, so nothing to swap');
} else if (skipVerify) {
  thirdParty = { ...THIRD_PARTY };
  console.log('  thirdParty  written UNVERIFIED (--skip-verify)');
} else {
  const missing = [];
  for (const [name, address] of Object.entries(THIRD_PARTY)) {
    const code = await client.getCode({ address }).catch(() => undefined);
    if (!code || code === '0x') missing.push(`${name} (${address})`);
  }
  if (missing.length) {
    die(
      `no code on chain ${chainId} at:\n    ${missing.join('\n    ')}\n`
      + '  A deployment with a pool but no router cannot be traded. Check the\n'
      + '  addresses against HANDOVER section 10 for this chain.',
    );
  }
  thirdParty = { ...THIRD_PARTY };
}

const manifest = {
  id,
  label: label ?? `chain ${chainId}`,
  driver: 'chain',
  network: {
    chainId,
    chainName: label ?? `chain ${chainId}`,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: [rpc],
    blockExplorerUrls: [explorer],
  },
  contracts,
  thirdParty,
  multicall3,
  // HANDOVER section 5, "Collecting from many birds at once". Null = not
  // deployed on this chain yet; the site then shows no sweep panel at all.
  sweeper,
  // The Roost and its first leg. Required: see ROOST_PAIR.
  aviansStaking: roostPair.aviansStaking,
  roost: roostPair.roost,
  startBlock,
  allowlistProofs: proofsServed,
  generated: {
    at: new Date().toISOString(),
    // Relative to the dapp folder, never the machine's absolute path: this
    // file is published with the site.
    from: `${aviansEarly ? `${rel(early.path)} + ` : ''}${rel(deploy.path)}${launch.run ? ` + ${rel(launch.path)}` : ''}${sweeperRun.run ? ` + ${rel(sweeperRun.path)}` : ''}`,
  },
};

// ── the same cross-check the site runs at start-up ────────────────────────

const SELECTORS = [
  ['token.AVIANS() == Avians', 'AvianStock', 'AVIANS', 'Avians'],
  ['token.MINT_SINK() == ThePerch', 'AvianStock', 'MINT_SINK', 'ThePerch'],
  // The collection tells the Nest about every transfer through this immutable.
  ['token.NEST() == TheNest', 'AvianStock', 'NEST', 'TheNest'],
  ['token.registry() == TraitRegistry', 'AvianStock', 'registry', 'TraitRegistry'],
  ['amm.nft() == AvianStock', 'ThePerch', 'nft', 'AvianStock'],
  ['amm.avians() == Avians', 'ThePerch', 'avians', 'Avians'],
  ['staking.COLLECTION() == AvianStock', 'TheNest', 'COLLECTION', 'AvianStock'],
  ['staking.AVIANS() == Avians', 'TheNest', 'AVIANS', 'Avians'],
  ['treasury.STAKING() == TheNest', 'Treasury', 'STAKING', 'TheNest'],
  ['treasury.AVIANS() == Avians', 'Treasury', 'AVIANS', 'Avians'],
  ['hook.AVIANS() == Avians', 'AviansHook', 'AVIANS', 'Avians'],
  ['hook.TREASURY() == Treasury', 'AviansHook', 'TREASURY', 'Treasury'],
  // The Sweeper's one immutable. A sweeper built for another collection
  // would read every satchel of the wrong birds.
  ['sweeper.COLLECTION() == AvianStock', 'Sweeper', 'COLLECTION', 'AvianStock'],
  // The Roost (2026-09-18): bound to this Nest and this staking contract at
  // construction, and the Nest's cost sink bound to it. The Perch's
  // `feeRecipient` is the Roost by default but owner-settable, so it is
  // checked below as a WARNING rather than here as a refusal.
  ['roost.NEST() == TheNest', 'TheRoost', 'NEST', 'TheNest'],
  ['roost.STAKING() == AviansStaking', 'TheRoost', 'STAKING', 'AviansStaking'],
  ['roost.AVIANS() == Avians', 'TheRoost', 'AVIANS', 'Avians'],
  ['aviansStaking.ROOST() == TheRoost', 'AviansStaking', 'ROOST', 'TheRoost'],
  ['aviansStaking.AVIANS() == Avians', 'AviansStaking', 'AVIANS', 'Avians'],
  ['nest.costSink() == TheRoost', 'TheNest', 'costSink', 'TheRoost'],
];

/** Every address the cross-check can name: the seven, the pool pair, the Sweeper, the Roost pair. */
const named = { ...contracts, Sweeper: sweeper, AviansStaking: roostPair.aviansStaking, TheRoost: roostPair.roost };

async function readAddress(target, fn) {
  const data = encodeFunctionData({
    abi: [{ type: 'function', name: fn, inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' }],
    functionName: fn,
  });
  const { data: out } = await client.call({ to: target, data });
  if (!out || out.length < 66) throw new Error('no return data');
  return `0x${out.slice(-40)}`;
}

if (!skipVerify) {
  const live = await client.getChainId();
  if (live !== chainId) {
    die(`The RPC at ${rpc} answers for chain ${live}, not ${chainId}. Nothing was written.`);
  }

  const failures = [];
  for (const [claim, holder, fn, expectName] of SELECTORS) {
    const target = named[holder];
    const expect = named[expectName];
    if (!target || !expect) continue;                 // no pool, or no sweeper, on this deployment
    try {
      const actual = await readAddress(target, fn);
      if (actual.toLowerCase() !== expect.toLowerCase()) {
        failures.push(`  ${claim}\n      manifest says ${expect}\n      the chain says ${actual}`);
      }
    } catch (e) {
      failures.push(`  ${claim}\n      the call failed: ${e.message}`);
    }
  }
  for (const [name, address] of Object.entries(named)) {
    if (!address) continue;
    const code = await client.getCode({ address }).catch(() => undefined);
    if (!code || code === '0x') failures.push(`  there is contract code at ${name}\n      ${address} has none`);
  }

  // Where the Perch's fees go. Every fee, whole, to the Roost by default —
  // but the owner may point it elsewhere, so a difference is said, not refused.
  try {
    const recipient = await readAddress(contracts.ThePerch, 'feeRecipient');
    if (recipient.toLowerCase() !== roostPair.roost.toLowerCase()) {
      console.warn(`  WARNING: perch.feeRecipient() is ${recipient}, not the Roost (${roostPair.roost}). The Perch's fees are going somewhere else; the site says so on the admin panel.`);
    }
  } catch (e) {
    failures.push(`  perch.feeRecipient() is readable
      the call failed: ${e.message}`);
  }

  if (failures.length) {
    die(
      `These addresses do not check out against ${rpc}:`,
      '',
      ...failures,
      '',
      'Nothing was written. This is the same check the site runs at start-up,',
      'and it is what turns a pasted-wrong address into a message instead of a',
      'support ticket — so it runs here too, before the file exists.',
    );
  }
}

// ── write ─────────────────────────────────────────────────────────────────

const json = `${JSON.stringify(manifest, null, 2)}\n`;

if (dryRun) {
  console.log(json);
  process.exit(0);
}

const dir = join(root, 'public', 'deployments');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, `${id}.json`), json);
if (proofsSource) {
  mkdirSync(join(dir, 'proofs'), { recursive: true });
  writeFileSync(join(dir, 'proofs', `${id}.json`), readFileSync(proofsSource));
}

const MAINNET_CHAIN_ID = 4663;

/** The chain id a manifest in the index describes, or null when its file will not read. */
function indexedChainId(entry) {
  try { return JSON.parse(readFileSync(join(dir, entry.file), 'utf8'))?.network?.chainId ?? null; } catch { return null; }
}

const indexPath = join(dir, 'index.json');
let indexLine = '';
if (!isLocal) {
  const index = existsSync(indexPath)
    ? JSON.parse(readFileSync(indexPath, 'utf8'))
    : { default: id, deployments: [] };
  // Appended, never sorted: the site treats the last chain entry as the
  // newest, and a re-run of an id moves it to the end, which is when it was
  // written.
  index.deployments = index.deployments.filter((d) => d.id !== id);
  index.deployments.push({ id, label: manifest.label, file: `./${id}.json` });

  // Which default the index ends up with, and why. The site opens on mainnet
  // if configured, else the newest chain deployment, else the mock, and reads
  // the default only as a tie-break; but a default that names the mock or
  // nothing is put right here, so nobody has to know to pass --default.
  const current = index.deployments.find((d) => d.id === index.default);
  const currentIsMainnet = !!current && current.id !== id && indexedChainId(current) === MAINNET_CHAIN_ID;
  const thisIsMainnet = chainId === MAINNET_CHAIN_ID;
  if (currentIsMainnet && !thisIsMainnet) {
    indexLine = `entry written; the default stays ${index.default}, which is on mainnet, and a testnet never displaces it`
      + (makeDefault ? ' (--default ignored; edit index.json by hand if you mean it)' : '');
  } else if (makeDefault) {
    index.default = id;
    indexLine = `DEFAULT is now ${id} (--default)`;
  } else if (!current || index.default === 'mock') {
    const was = !current ? 'named nothing in the index' : 'was "mock"';
    index.default = id;
    indexLine = `DEFAULT is now ${id}: the default ${was}, and a chain deployment is never behind the mock`;
  } else {
    indexLine = `entry written; the default stays ${index.default} (add --default to change it)`
      + (thisIsMainnet ? `; the site opens on ${id} regardless, mainnet being preferred` : '');
  }
  writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
}

console.log(`public/deployments/${id}.json`);
console.log(`  chain      ${chainId} via ${rpc}`);
console.log(`  contracts  ${Object.entries(contracts).filter(([, v]) => v).length} of ${Object.keys(contracts).length}`
  + `${contracts.AviansHook ? '' : ' (no pool on this deployment)'}`);
console.log(`  Avians     ${avians} — ${aviansEarly ? 'the token went first (DeployAvians.s.sol, step 0), reused by Deploy.s.sol' : 'created by Deploy.s.sol'}`);
console.log(`  startBlock ${startBlock}`);
console.log(`  multicall3 ${multicall3 ?? 'none — JSON-RPC batching'}`);
console.log(`  sweeper    ${sweeper ?? 'none — no DeploySweeper broadcast, so the site shows no sweep panel'}`);
console.log(`  roost      ${roostPair.roost} — every AVIANS fee lands here; staking at ${roostPair.aviansStaking}`);
if (thirdParty) {
  for (const [name, address] of Object.entries(thirdParty)) console.log(`  ${name.padEnd(16)} ${address}`);
}
console.log(skipVerify ? '  NOT verified against the chain (--skip-verify)' : '  cross-checks passed against the chain');
if (proofsServed) {
  console.log(`  proofs     ${proofsServed} (${proofsCount} wallets)${proofsSource ? ' — copied from ' + rel(proofsSource) : ''}`);
} else {
  console.log('  proofs     none — only the manual allowlist can free-mint on this deployment');
}
if (isLocal) {
  console.log('  index.json  untouched — a local-* manifest is per-machine and gitignored');
} else {
  console.log(`  index.json  ${indexLine}`);
}
console.log('\nRebuild before shipping: the CSP\'s connect-src is generated from the manifests at build time.');
console.log(`Open it with  ?d=${id}`);
