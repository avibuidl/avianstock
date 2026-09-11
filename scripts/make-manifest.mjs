// forge broadcast  ->  a validated deployment manifest
//
// HANDOVER section 10: the addresses come out of
//   contracts/broadcast/Deploy.s.sol/<chainId>/run-latest.json
// and the pool's three out of the matching DeployLaunch.s.sol run. "Do not
// hard-code them from a testnet run."
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
//   --proofs <path>       e.g. ./deployments/proofs/mainnet-4663.json
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

const rel = (p) => relative(root, p).split('\\').join('/');
const die = (...lines) => { console.error(lines.join('\n')); process.exit(1); };

if (!Number.isInteger(chainId) || chainId <= 0) die('--chain <id> is required, and must be a positive integer.');
if (!id) die('--id <slug> is required. It becomes the filename and must match the manifest\'s id.');
if (!rpc) die('--rpc <url> is required: the manifest carries the network, not just the addresses.');
if (!/^https?:\/\//.test(rpc)) die(`--rpc must be http or https, got ${rpc}`);

// ── the broadcast files ───────────────────────────────────────────────────

/** HANDOVER section 10's creation order, and where each one is deployed. */
const FROM_DEPLOY = ['Avians', 'TraitRegistry', 'BirdRenderer', 'TheNest', 'Treasury', 'ThePerch', 'AvianStock'];
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
const launch = readRun('DeployLaunch.s.sol');

const deployed = creates(deploy.run, deploy.path);
const launched = launch.run ? creates(launch.run, launch.path) : new Map();

const contracts = {};
for (const name of FROM_DEPLOY) {
  const address = deployed.get(name);
  if (!address) die(`${deploy.path} has no CREATE for ${name}. This deployment is incomplete.`);
  contracts[name] = address;
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
  startBlock,
  allowlistProofs: proofs,
  generated: {
    at: new Date().toISOString(),
    // Relative to the dapp folder, never the machine's absolute path: this
    // file is published with the site.
    from: `${rel(deploy.path)}${launch.run ? ` + ${rel(launch.path)}` : ''}`,
  },
};

// ── the same cross-check the site runs at start-up ────────────────────────

const SELECTORS = [
  ['token.AVIANS() == Avians', 'AvianStock', 'AVIANS', 'Avians'],
  ['token.MINT_SINK() == ThePerch', 'AvianStock', 'MINT_SINK', 'ThePerch'],
  ['token.registry() == TraitRegistry', 'AvianStock', 'registry', 'TraitRegistry'],
  ['amm.nft() == AvianStock', 'ThePerch', 'nft', 'AvianStock'],
  ['amm.avians() == Avians', 'ThePerch', 'avians', 'Avians'],
  ['staking.COLLECTION() == AvianStock', 'TheNest', 'COLLECTION', 'AvianStock'],
  ['staking.AVIANS() == Avians', 'TheNest', 'AVIANS', 'Avians'],
  ['treasury.STAKING() == TheNest', 'Treasury', 'STAKING', 'TheNest'],
  ['treasury.AVIANS() == Avians', 'Treasury', 'AVIANS', 'Avians'],
  ['hook.AVIANS() == Avians', 'AviansHook', 'AVIANS', 'Avians'],
  ['hook.TREASURY() == Treasury', 'AviansHook', 'TREASURY', 'Treasury'],
];

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
    const target = contracts[holder];
    const expect = contracts[expectName];
    if (!target || !expect) continue;                 // no pool on this deployment
    try {
      const actual = await readAddress(target, fn);
      if (actual.toLowerCase() !== expect.toLowerCase()) {
        failures.push(`  ${claim}\n      manifest says ${expect}\n      the chain says ${actual}`);
      }
    } catch (e) {
      failures.push(`  ${claim}\n      the call failed: ${e.message}`);
    }
  }
  for (const [name, address] of Object.entries(contracts)) {
    if (!address) continue;
    const code = await client.getCode({ address }).catch(() => undefined);
    if (!code || code === '0x') failures.push(`  there is contract code at ${name}\n      ${address} has none`);
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

const indexPath = join(dir, 'index.json');
const index = existsSync(indexPath)
  ? JSON.parse(readFileSync(indexPath, 'utf8'))
  : { default: id, deployments: [] };
index.deployments = index.deployments.filter((d) => d.id !== id);
index.deployments.push({ id, label: manifest.label, file: `./${id}.json` });
index.deployments.sort((a, b) => a.id.localeCompare(b.id));
if (!index.deployments.some((d) => d.id === index.default)) index.default = id;
writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);

console.log(`public/deployments/${id}.json`);
console.log(`  chain      ${chainId} via ${rpc}`);
console.log(`  contracts  ${Object.entries(contracts).filter(([, v]) => v).length} of ${Object.keys(contracts).length}`
  + `${contracts.AviansHook ? '' : ' (no pool on this deployment)'}`);
console.log(`  startBlock ${startBlock}`);
console.log(`  multicall3 ${multicall3 ?? 'none — JSON-RPC batching'}`);
if (thirdParty) {
  for (const [name, address] of Object.entries(thirdParty)) console.log(`  ${name.padEnd(16)} ${address}`);
}
console.log(skipVerify ? '  NOT verified against the chain (--skip-verify)' : '  cross-checks passed against the chain');
console.log(`\nOpen it with  ?d=${id}`);
