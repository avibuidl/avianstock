// ../logo/final and ../pfp  ->  public/
//
// READ-ONLY over the sources. Writes only inside dapp/public/.
//
//   node scripts/sync-assets.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..');
const PUB = path.join(HERE, '..', 'public');

const LOGO = [
  ['logo/final/favicon.ico', 'logo/favicon.ico'],
  ['logo/final/svg/mark.svg', 'logo/mark.svg'],
  ['logo/final/svg/mark-mono.svg', 'logo/mark-mono.svg'],
  ['logo/final/svg/lockup-on-dark.svg', 'logo/lockup-on-dark.svg'],
  ['logo/final/png/apple-touch-icon-180.png', 'logo/apple-touch-icon-180.png'],
  ['logo/final/png/mark-192.png', 'logo/mark-192.png'],
  ['logo/final/png/mark-512.png', 'logo/mark-512.png'],
  ['logo/final/png/mark-512-nocturne.png', 'logo/mark-512-nocturne.png'],
];

let n = 0;
const copy = (from, to) => {
  const dst = path.join(PUB, to);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(path.join(ROOT, from), dst);
  n++;
};

for (const [from, to] of LOGO) copy(from, to);

// The 36 ready-made birds, and their traits. Every one is an ordinary mintable
// combination and none is reserved — see pfp/README.md.
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'pfp/index.json'), 'utf8'));
index.birds.forEach((b, i) => copy(path.join('pfp', b.file), `pfp/avian-${String(i + 1).padStart(2, '0')}.svg`));
fs.writeFileSync(
  path.join(PUB, 'pfp', 'index.json'),
  JSON.stringify({ note: index.note, birds: index.birds.map((b) => b.indices) }, null, 1),
);

console.log(`public/: ${n} files copied (${LOGO.length} logo, ${index.birds.length} birds)`);
