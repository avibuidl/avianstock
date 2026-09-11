// The rules that are easier to enforce than to remember.
//
// Each of these is a promise the site makes, turned into something that fails
// the build rather than something a reviewer has to notice.
//
//   1. Nothing from a contract is ever inserted into the DOM as markup.
//   2. No amount goes near `Number`, `parseFloat` or `toFixed`.
//   3. A failed read never becomes a zero.
//   4. No contract address is written in the source. Addresses come from the
//      manifest, and only from the manifest.
//   5. The built bundle carries no seed-phrase surface — viem's `bip39` and
//      `bip32` are in node_modules and must not be in `dist/`.
//   6. Only the two admin wiring files import an owner-surface ABI, so every
//      screen keeps importing one that cannot express an owner call.
//
// Run: node scripts/check-hygiene.mjs   (part of `npm run check`)

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const problems = [];

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

const sourceFiles = walk(join(root, 'src'))
  .filter((f) => ['.ts', '.tsx'].includes(extname(f)));
const chainFiles = sourceFiles.filter((f) => f.includes(`${'src'}${join('/', 'chain')}`) || f.includes(join('src', 'chain')));

const lines = (file) => readFileSync(file, 'utf8').split(/\r?\n/);
const report = (file, i, line, says) =>
  problems.push(`${relative(root, file)}:${i + 1}  ${says}\n    ${line.trim().slice(0, 120)}`);

/** A `//` comment or a line inside a block comment is prose, not code. */
function codeLines(file) {
  let inBlock = false;
  return lines(file).map((line) => {
    const trimmed = line.trim();
    if (inBlock) {
      if (trimmed.includes('*/')) inBlock = false;
      return '';
    }
    if (trimmed.startsWith('/*')) {
      if (!trimmed.includes('*/')) inBlock = true;
      return '';
    }
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) return '';
    return line.replace(/\/\/.*$/, '');
  });
}

// ── 1. nothing from a contract is rendered as markup ─────────────────────

for (const file of sourceFiles) {
  codeLines(file).forEach((line, i) => {
    if (/dangerouslySetInnerHTML|\.innerHTML\s*=|insertAdjacentHTML|document\.write/.test(line)) {
      report(file, i, line, 'renders markup — trait names and token symbols come from contracts and must be text nodes');
    }
  });
}

// ── 2. no amount goes near Number ────────────────────────────────────────

const MONEY = /(price|amount|balance|allowance|earned|paid|burned|cost|value|supply|wei|owed|claimable|backing)/i;

for (const file of [...chainFiles, join(root, 'src', 'lib', 'format.ts')]) {
  const raw = lines(file);
  codeLines(file).forEach((line, i) => {
    // A count is a number on purpose — a token id, a supply ceiling, seconds,
    // bps — and every one of them fits. Say so on the line and the rule steps
    // aside; say nothing and it does not.
    if (raw[i].includes('/* count */')) return;
    if (/\bparseFloat\s*\(/.test(line)) report(file, i, line, 'parseFloat on a money path');
    if (/\.toFixed\s*\(/.test(line) && !/bps|percent|pct/i.test(line)) {
      report(file, i, line, 'toFixed on a money path');
    }
    const numberCall = line.match(/\bNumber\s*\(\s*([A-Za-z_$][\w$.[\]]*)/);
    if (numberCall && MONEY.test(numberCall[1])) {
      report(file, i, line, `Number(${numberCall[1]}) — that reads like an amount, and Number loses precision above 2^53`);
    }
  });
}

// ── 3. a failed read never becomes a zero ────────────────────────────────

for (const file of chainFiles) {
  codeLines(file).forEach((line, i) => {
    if (/catch\s*(\([^)]*\))?\s*\{?\s*return\s+(0n?|\[\]|false)\b/.test(line)) {
      report(file, i, line, 'a caught failure returning a zero, an empty list or a false — "we could not ask" is not "there is none"');
    }
    if (/\.catch\s*\(\s*\(\s*\)\s*=>\s*(0n?|\[\])\s*\)/.test(line) && !/getCode|listedRewardTokens|getTransferValidator/.test(line)) {
      report(file, i, line, 'a rejected read defaulting to a zero or an empty list');
    }
  });
}

// ── 4. no contract address is written in the source ──────────────────────

const ALLOWED_ADDRESSES = new Set([
  '0x0000000000000000000000000000000000000000',   // the zero address, named as such
  '0x0000000000000000000000000000000000000001',   // a placeholder in a test vector
]);

for (const file of sourceFiles) {
  // The mock's fixtures are the mock's: they are not a deployment and nothing
  // real reads them. Everything else must take its addresses from a manifest.
  if (file.includes(join('src', 'mock') + sep)) continue;
  codeLines(file).forEach((line, i) => {
    for (const match of line.matchAll(/0x[0-9a-fA-F]{40}\b/g)) {
      if (ALLOWED_ADDRESSES.has(match[0].toLowerCase())) continue;
      if (/'0x'\s*\+|repeat\(/.test(line)) continue;
      report(file, i, line, `a contract address in the source (${match[0]}) — addresses come from the deployment manifest`);
    }
  });
}

// ── 5. the built bundle has no seed-phrase surface ───────────────────────

/**
 * These are the three checks that matter most — no BIP-39 wordlist, no HD key
 * derivation, no dev wallet in the shipped bundle — and they can only be made
 * against a build. A missing `dist/` therefore FAILS. It used to print a note
 * and pass, which meant that on a clean checkout the strongest guarantees in
 * this file were quietly vacuous.
 *
 * `--allow-missing-dist` opts out, for someone running the source checks alone
 * while iterating. CI never passes it, and `npm run check` builds first.
 */
const allowMissingDist = process.argv.includes('--allow-missing-dist');

const dist = join(root, 'dist');
if (existsSync(dist)) {
  const bundles = walk(dist).filter((f) => ['.js', '.mjs'].includes(extname(f)));
  if (bundles.length === 0) {
    problems.push('dist/ exists but contains no JavaScript — the bundle checks had nothing to read');
  }
  const markers = [
    ['abandon ability able about', 'the BIP-39 English wordlist'],
    ['bip39', 'a BIP-39 module'],
    ['HDKey', 'a BIP-32 hierarchical key'],
    ['mnemonicToSeed', 'a mnemonic-to-seed function'],
    ['AVIAN_STOCK_DEV_WALLET_MUST_NOT_SHIP', 'the dev-only injected wallet'],
  ];
  for (const bundle of bundles) {
    const text = readFileSync(bundle, 'utf8');
    for (const [needle, says] of markers) {
      if (text.includes(needle)) {
        problems.push(`${relative(root, bundle)}  ships ${says} — nothing here should ask for or handle a seed phrase`);
      }
    }
  }
} else if (allowMissingDist) {
  console.log('note: dist/ is absent and --allow-missing-dist was passed, so the bundle');
  console.log('      checks (BIP-39, HD keys, the dev wallet) did NOT run.');
} else {
  problems.push(
    'dist/ is not built, so the bundle checks could not run — and those are the ones that\n'
    + '    prove no BIP-39 wordlist, no HD key derivation and no dev wallet ship. Run\n'
    + '    `npm run build` first (`npm run check` does), or pass --allow-missing-dist to\n'
    + '    run only the source checks.',
  );
}

// ── 6. the owner surface stays out of the collector bundle ───────────────

/**
 * `scripts/build-abis.mjs` emits two ABIs per contract, and the collector one
 * has no owner function in it. That is only worth anything while the admin one
 * stays where it is, so: these two files may import a `*AdminAbi`, and nothing
 * else may.
 *
 * To be clear about what this does and does not do. It does not protect the
 * contracts — `onlyOwner` does that, and it refuses a stranger whatever any
 * bundle contains. What it keeps is a much smaller property: that a mistake in
 * a screen, a read or a collector write cannot become an owner call, because
 * the ABI those files hold has no such entry to encode.
 */
const ADMIN_ABI_IMPORTERS = [
  join('src', 'chain', 'admin.ts'),
  join('src', 'chain', 'admin-writes.ts'),
];

const GENERATED_ABIS = join('src', 'chain', 'abis.admin.generated.ts');

for (const file of sourceFiles) {
  // Where they are declared, obviously.
  if (file.endsWith(GENERATED_ABIS)) continue;
  if (ADMIN_ABI_IMPORTERS.some((allowed) => file.endsWith(allowed))) continue;
  codeLines(file).forEach((line, i) => {
    const match = line.match(/\b([a-zA-Z]+AdminAbi)\b/);
    if (match) {
      report(file, i, line, `imports ${match[1]} — only src/chain/admin.ts and src/chain/admin-writes.ts may`);
    }
  });
}

// ── report ────────────────────────────────────────────────────────────────

if (problems.length) {
  console.error(`\n${problems.length} hygiene problem${problems.length === 1 ? '' : 's'}:\n`);
  for (const p of problems) console.error(`  ${p}\n`);
  process.exit(1);
}
console.log(`hygiene: ${sourceFiles.length} source files, ${chainFiles.length} of them wiring. Clean.`);
