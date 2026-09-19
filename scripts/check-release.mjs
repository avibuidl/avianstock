// The release gate: what must be true of `dist/` before it goes to the host.
//
// `npm run check` proves the build is sound — tests, art, hygiene, no dev
// wallet and no state switcher in the bundle. It does not ask which
// deployment the shipped site opens on, and a site that ships with only the
// mock to open on talks to no wallet and mints nothing: worse than no site. This
// script asks that, and the handful of things around it that only matter on
// the day:
//
//   1. the deployment the site opens on (mainnet if configured, else the
//      newest chain deployment; the index default is a tie-break) is a CHAIN
//      deployment, on the chain you name;
//   2. its manifest is present, has a Sweeper, and names a proofs file that
//      is really under public/ (the free mint depends on it);
//   3. dist/ carries the same index, manifest and proofs;
//   4. dist/_headers exists and its CSP lets the site reach that RPC — the
//      policy is generated from the manifests at build time, so a manifest
//      dropped in after the build is a blocked RPC and a blank site;
//   5. no per-machine local-* manifest went out with the build.
//
// Run: node scripts/check-release.mjs --chain 4663      (part of `npm run check:release`)

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };
const wantChain = flag('chain') ? Number(flag('chain')) : null;

const problems = [];
const say = (line) => console.log(line);

const PUBLIC = join(root, 'public');
const DIST = join(root, 'dist');
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

// ── 1. the deployment the site opens on ─────────────────────────────────
// The same rule as src/chain/manifest.ts's chooser (2026-09-19), minus the
// URL and the remembered choice a visitor does not have on a first visit:
// mainnet (4663) if configured, else the last chain deployment in the index,
// else the mock. The index's `default` is a tie-break only.
const MAINNET_CHAIN_ID = 4663;
const indexPath = join(PUBLIC, 'deployments', 'index.json');
if (!existsSync(indexPath)) problems.push('public/deployments/index.json is missing');
const index = existsSync(indexPath) ? readJson(indexPath) : { default: '', deployments: [] };
if (!index.deployments.some((d) => d.id === index.default)) {
  problems.push(`the index's default ${JSON.stringify(index.default)} is not in its deployments`);
}
const loaded = index.deployments.map((d) => {
  const file = join(PUBLIC, 'deployments', d.file);
  try { return { ...d, manifest: readJson(file) }; } catch { return { ...d, manifest: null }; }
});
const chain = loaded.filter((d) => d.manifest?.driver === 'chain');
const mainnet = chain.filter((d) => d.manifest.network?.chainId === MAINNET_CHAIN_ID);
const opens = mainnet.find((d) => d.id === index.default) ?? mainnet[mainnet.length - 1] ?? chain[chain.length - 1] ?? null;
let manifest = null;
if (!opens) {
  problems.push('the index holds no chain deployment, so the shipped site would open on the MOCK and talk to no wallet. Run make-manifest for the real deployment.');
} else {
  manifest = opens.manifest;
  if (wantChain !== null && manifest.network?.chainId !== wantChain) {
    problems.push(`the site would open on ${opens.id}, chain ${manifest.network?.chainId}, not ${wantChain}`
      + (wantChain === MAINNET_CHAIN_ID ? ': no mainnet manifest is in the index' : ''));
  }
  if (!manifest.sweeper) problems.push(`${opens.id} has no sweeper — the "collect from my birds" panel would not exist. Deploy the Sweeper (runbook step 10) and regenerate.`);
  if (!manifest.allowlistProofs) {
    problems.push(`${opens.id} names no proofs file — only the manual allowlist could free-mint. Regenerate with --proofs.`);
  } else if (!existsSync(join(PUBLIC, manifest.allowlistProofs))) {
    problems.push(`${opens.id} names ${manifest.allowlistProofs}, which is not under public/ — every Merkle-listed wallet would read NotAllowlisted`);
  }
  say(`  opens on    ${opens.id} — chain ${manifest.network?.chainId}, ${manifest.network?.rpcUrls?.[0]}${index.default === opens.id ? '' : ' (the index default is ' + JSON.stringify(index.default) + '; the site reads it only as a tie-break)'}`);
  say(`  sweeper     ${manifest.sweeper ?? 'NONE'}`);
  say(`  proofs      ${manifest.allowlistProofs ?? 'NONE'}`);
}
for (const d of index.deployments) {
  if (/^local-/.test(d.id)) problems.push(`the index lists ${d.id}, a per-machine manifest that must never ship`);
}

// ── 2..5. dist/ ──────────────────────────────────────────────────────────
if (!existsSync(DIST)) {
  problems.push('dist/ is not built — run `npm run build` (npm run check does)');
} else {
  const distDeployments = join(DIST, 'deployments');
  const same = (rel) => {
    const a = join(PUBLIC, rel);
    const b = join(DIST, rel);
    if (!existsSync(b)) { problems.push(`dist/${rel} is missing — the build did not copy it`); return; }
    if (readFileSync(a, 'utf8') !== readFileSync(b, 'utf8')) problems.push(`dist/${rel} differs from public/${rel} — rebuild`);
  };
  same('deployments/index.json');
  if (opens) same(`deployments/${opens.file.replace(/^\.\//, '')}`);
  if (manifest?.allowlistProofs) same(manifest.allowlistProofs.replace(/^\.\//, ''));
  if (existsSync(distDeployments)) {
    for (const f of readdirSync(distDeployments)) {
      if (/^local-.*\.json$/.test(f)) problems.push(`dist/deployments/${f} — a per-machine manifest went out with the build`);
    }
  }

  const headers = join(DIST, '_headers');
  if (!existsSync(headers)) {
    problems.push('dist/_headers is missing — the host would set no CSP');
  } else {
    const text = readFileSync(headers, 'utf8');
    const csp = text.split('\n').find((l) => /Content-Security-Policy:/.test(l)) ?? '';
    const connect = (csp.match(/connect-src ([^;]+)/) ?? [])[1] ?? '';
    say(`  connect-src ${connect.trim()}`);
    if (!/frame-ancestors 'none'/.test(csp)) problems.push("dist/_headers: the CSP has no frame-ancestors 'none'");
    if (!/script-src 'self'(;|$)/.test(csp)) problems.push("dist/_headers: script-src is not exactly 'self'");
    for (const url of manifest?.network?.rpcUrls ?? []) {
      const origin = new URL(url).origin;
      if (!connect.split(/\s+/).includes(origin)) {
        problems.push(`dist/_headers: connect-src does not allow ${origin} — the manifest was added after the build; rebuild`);
      }
    }
    // The same policy is in the page itself, for hosts that set no headers.
    const html = readFileSync(join(DIST, 'index.html'), 'utf8');
    if (!html.includes('http-equiv="Content-Security-Policy"')) problems.push('dist/index.html carries no CSP meta tag');
    for (const url of manifest?.network?.rpcUrls ?? []) {
      if (!html.includes(new URL(url).origin)) problems.push(`dist/index.html: the meta CSP does not allow ${new URL(url).origin}`);
    }
  }
}

if (problems.length) {
  console.error('\nNOT READY TO SHIP:\n  ' + problems.join('\n  '));
  process.exit(1);
}
say('\nrelease: the shipped default is a chain deployment, its proofs are served, and the CSP reaches its RPC. Ready.');
