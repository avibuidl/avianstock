// Parity: the browser renderer against the 36 committed PFPs.
//
// pfp/svg/*.svg were rendered through tools/svg.mjs — the parity oracle the
// on-chain renderer is tested against — and verified byte-identical to what
// tokenURI returns for those combinations. If src/art/render.ts reproduces
// them byte for byte, the composer's live preview is showing exactly what the
// chain will hand back, not a lookalike.
//
//   node scripts/check-art.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..');

const src = fs.readFileSync(path.join(HERE, '..', 'src', 'art', 'render.ts'), 'utf8');
const pieces = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'src', 'art', 'pieces.json'), 'utf8'));

// The check runs the SAME source the browser runs — transformed by the same
// tool Vite uses, so there is no second implementation to drift.
const { transformSync } = await import('esbuild');
const js = transformSync(src, { loader: 'ts', format: 'cjs', target: 'es2022' }).code;
const module_ = { exports: {} };
new Function('exports', 'require', 'module', js)(
  module_.exports, (id) => (id.endsWith('pieces.json') ? { default: pieces, ...pieces } : {}), module_,
);
const mod = module_.exports;

const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'pfp/index.json'), 'utf8'));
const order = ['background', 'plumage', 'eyes', 'beak', 'neckwear', 'headwear'];

let ok = 0;
const bad = [];
for (const b of index.birds) {
  const traits = order.map((k) => b.indices[k]);
  const got = mod.renderAvian(traits);
  const want = fs.readFileSync(path.join(ROOT, 'pfp', b.file), 'utf8');
  if (got === want) ok++;
  else {
    let at = 0;
    while (at < got.length && got[at] === want[at]) at++;
    bad.push(`${b.file}: first difference at byte ${at}\n  want …${want.slice(Math.max(0, at - 40), at + 40)}…\n  got  …${got.slice(Math.max(0, at - 40), at + 40)}…`);
  }
}

console.log(`art parity: ${ok}/${index.birds.length} byte-identical to pfp/svg/*.svg`);
if (bad.length) {
  console.error('\n' + bad.slice(0, 3).join('\n\n'));
  process.exit(1);
}
