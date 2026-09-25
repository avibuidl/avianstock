// One transaction, read off the chain and decoded with the site's own ABIs.
//
// The launch-day tool. The founder walks the site, pastes a hash, and this
// prints what the RECEIPT says — status, block, target, and every log decoded
// against the same generated ABIs the site's receipt panel decodes with — so
// the two can be compared line for line. Nothing here signs, sends or holds a
// key: it is `eth_getTransactionReceipt` and a decoder.
//
//   node scripts/receipt.mjs <hash> [--d mainnet-4663 | --rpc <url>]
//
// `--d` names a manifest in public/deployments (default: the index's default),
// which supplies the RPC and the address -> name map. Unknown events are
// printed raw, with their first topic, never dropped.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicClient, decodeEventLog, formatUnits, http } from 'viem';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };
const hash = argv.find((a) => /^0x[0-9a-fA-F]{64}$/.test(a));
if (!hash) { console.error('usage: node scripts/receipt.mjs <txhash> [--d <deployment id> | --rpc <url>]'); process.exit(2); }

// ── the deployment ───────────────────────────────────────────────────────
const deployments = join(root, 'public', 'deployments');
const index = JSON.parse(readFileSync(join(deployments, 'index.json'), 'utf8'));
const id = flag('d') ?? index.default;
const manifestPath = join(deployments, `${id}.json`);
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : null;
const rpc = flag('rpc') ?? manifest?.network?.rpcUrls?.[0];
if (!rpc) { console.error(`no RPC: ${id}.json is not in public/deployments and --rpc was not given`); process.exit(2); }

const names = new Map();
for (const [name, address] of Object.entries(manifest?.contracts ?? {})) if (address) names.set(address.toLowerCase(), name);
if (manifest?.sweeper) names.set(manifest.sweeper.toLowerCase(), 'Sweeper');
if (manifest?.roost) names.set(manifest.roost.toLowerCase(), 'TheRoost');
if (manifest?.aviansStaking) names.set(manifest.aviansStaking.toLowerCase(), 'AviansStaking');
for (const [name, address] of Object.entries(manifest?.thirdParty ?? {})) if (address) names.set(address.toLowerCase(), name);

// ── the ABIs, exactly as generated ───────────────────────────────────────
const src = readFileSync(join(root, 'src', 'chain', 'abis.generated.ts'), 'utf8');
const abiOf = (name) => {
  const i = src.indexOf(`export const ${name} = `);
  if (i < 0) return [];
  const j = src.indexOf('[', i);
  return JSON.parse(src.slice(j, src.indexOf('] as const', j) + 1));
};
const ABIS = [
  'avianStockAbi', 'theNestAbi', 'thePerchAbi', 'aviansAbi', 'treasuryAbi', 'liquidityVaultAbi',
  'sweeperAbi', 'accountV3Abi', 'aviansHookAbi',
  // The Roost and AVIAN staking (2026-09-18): Allocated/Delivered/Held/Burned, Staked/Withdrawn/RewardPaid/RewardAdded.
  'theRoostAbi', 'aviansStakingAbi',
].map(abiOf);
const events = ABIS.flatMap((abi) => abi.filter((e) => e.type === 'event'));

const client = createPublicClient({ transport: http(rpc) });

const label = (address) => {
  const n = names.get(address.toLowerCase());
  return n ? `${n} (${address.slice(0, 6)}…${address.slice(-4)})` : address;
};
const symbolCache = new Map();
async function symbolOf(address) {
  const k = address.toLowerCase();
  if (symbolCache.has(k)) return symbolCache.get(k);
  let out = null;
  try {
    const [symbol, decimals] = await Promise.all([
      client.readContract({ address, abi: abiOf('aviansAbi'), functionName: 'symbol' }),
      client.readContract({ address, abi: abiOf('aviansAbi'), functionName: 'decimals' }),
    ]);
    out = { symbol: String(symbol).slice(0, 16), decimals: Number(decimals) };
  } catch { /* not an ERC-20 */ }
  symbolCache.set(k, out);
  return out;
}

const fmt = (v, decimals) => (typeof v === 'bigint' && decimals !== undefined ? `${formatUnits(v, decimals)}` : typeof v === 'bigint' ? v.toString() : String(v));

const receipt = await client.getTransactionReceipt({ hash });
const tx = await client.getTransaction({ hash });
const block = await client.getBlock({ blockNumber: receipt.blockNumber });
console.log(`tx      ${hash}`);
console.log(`status  ${receipt.status}${receipt.status === 'reverted' ? '  <-- REVERTED' : ''}`);
console.log(`block   ${receipt.blockNumber}  ${new Date(Number(block.timestamp) * 1000).toISOString()}`);
console.log(`from    ${tx.from}`);
console.log(`to      ${label(tx.to ?? '(create)')}`);
console.log(`gas     ${receipt.gasUsed}`);
console.log(`logs    ${receipt.logs.length}`);

for (const log of receipt.logs) {
  // The same topic hash can name two shapes — ERC-721's Transfer indexes the
  // id, ERC-20's does not — so a decode only counts when the event's indexed
  // inputs match the log's topics. Otherwise a token transfer reads as a bird.
  let decoded = null;
  for (const abi of ABIS) {
    try {
      const d = decodeEventLog({ abi, data: log.data, topics: log.topics, strict: false });
      const entry = abi.find((e) => e.type === 'event' && e.name === d.eventName);
      const indexed = entry ? entry.inputs.filter((i) => i.indexed).length : -1;
      if (indexed === log.topics.length - 1) { decoded = d; break; }
    } catch { /* next */ }
  }
  const who = label(log.address);
  if (!decoded) {
    console.log(`  ${who}  ?${log.topics[0]?.slice(0, 10)}  topics=${log.topics.length} data=${log.data.length > 2 ? (log.data.length - 2) / 2 + ' bytes' : 'none'}`);
    continue;
  }
  const meta = decoded.eventName === 'Transfer' || decoded.eventName === 'Approval' ? await symbolOf(log.address) : null;
  const args = Object.entries(decoded.args ?? {}).map(([k, v]) => {
    // Every amount-shaped argument in an ERC-20's own events is in its units;
    // the Nest's and the Sweeper's carry a `token` argument beside the amount.
    const decimals = meta && (k === 'value' || k === 'amount') ? meta.decimals : undefined;
    return `${k}=${fmt(v, decimals)}`;
  }).join(' ');
  const tag = meta ? ` [${meta.symbol}]` : '';
  console.log(`  ${who}  ${decoded.eventName}${tag}(${args})`);
}
