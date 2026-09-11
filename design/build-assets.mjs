// Renders the real art the design canvas needs, into dapp/design/assets/.
//
// READ-ONLY over ../../art, ../../pfp, ../../logo. Writes only inside dapp/.
// Everything here goes through tools/svg.mjs — the same parity oracle the
// on-chain renderer is tested against — so every bird and every trait swatch
// on the canvas is the real drawing, not an approximation.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPieces } from '../../tools/pieces.mjs';
import { renderSVG } from '../../tools/svg.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const OUT = path.join(HERE, 'assets');
const CATS = ['background', 'plumage', 'eyes', 'beak', 'neckwear', 'headwear'];
const SHORT = { background: 'bg', plumage: 'pl', eyes: 'ey', beak: 'bk', neckwear: 'nk', headwear: 'hw' };

// The z-order the collection paints in. Not the category order.
const LAYER_ORDER = ['background', 'plumage', 'base', 'neckwear', 'eyes', 'beak', 'headwear'];

const L = loadPieces();
const grid = (cat, i) => L.byKey.get(`${cat}/${i}`).grid;
const baseGrid = L.byKey.get('base/0').grid;

/**
 * A selection {background:0,...} -> the SVG string tokenURI would return.
 * `field: false` drops the background layer, leaving it transparent — used for
 * the trait swatches, which sit on the panel's own ground.
 */
function render(sel, { field = true } = {}) {
  const layers = LAYER_ORDER
    .filter((k) => field || k !== 'background')
    .map((k) => (k === 'base' ? baseGrid : grid(k, sel[k])));
  return renderSVG(layers, L.palette);
}

fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) fs.rmSync(path.join(OUT, f), { force: true });
const write = (name, s) => fs.writeFileSync(path.join(OUT, name), s);

// ---------------------------------------------------------------- swatches
// One set, shared by every composer artboard: the locked owlish base with a
// reference face, and the one trait being previewed swapped in.
const REFERENCE = { background: 0, plumage: 0, eyes: 0, beak: 0, neckwear: 0, headwear: 0 };
let swatches = 0;
for (const cat of CATS) {
  for (let i = 0; i < L.counts[cat]; i++) {
    // A background swatch IS its field; every other one is transparent so the
    // trait reads against the panel it sits on.
    const svg = render({ ...REFERENCE, [cat]: i }, { field: cat === 'background' });
    write(`sw-${SHORT[cat]}-${String(i).padStart(2, '0')}.svg`, svg);
    swatches++;
  }
}

// ------------------------------------------------------------ hero  birds
// Composed for the canvas. Every one is an ordinary mintable combination.
const COMPOSED = {
  'bird-compose': { background: 1, plumage: 4, eyes: 14, beak: 1, neckwear: 3, headwear: 4 },
  'bird-taken': { background: 1, plumage: 4, eyes: 14, beak: 1, neckwear: 3, headwear: 15 },
  'bird-free': { background: 11, plumage: 10, eyes: 12, beak: 7, neckwear: 1, headwear: 12 },
  'bird-hero': { background: 5, plumage: 6, eyes: 9, beak: 4, neckwear: 4, headwear: 7 },
};
for (const [name, sel] of Object.entries(COMPOSED)) write(`${name}.svg`, render(sel));

// The two headwear options either side of the one being changed in the hero,
// so the hero shows the ACT of choosing rather than a finished bird.
for (const hw of [6, 7, 8]) {
  write(`hero-hw-${hw}.svg`, render({ ...COMPOSED['bird-hero'], headwear: hw }));
}

// ------------------------------------------------------------- ready birds
// The 36 committed PFPs, copied as-is.
const pfp = JSON.parse(fs.readFileSync(path.join(ROOT, 'pfp/index.json'), 'utf8'));
pfp.birds.forEach((b, i) => {
  const n = String(i + 1).padStart(2, '0');
  fs.copyFileSync(path.join(ROOT, 'pfp', b.file), path.join(OUT, `avian-${n}.svg`));
});

// -------------------------------------------------------------------- mark
fs.copyFileSync(path.join(ROOT, 'logo/final/svg/mark.svg'), path.join(OUT, 'mark.svg'));

// ------------------------------------------------------- names, for the UI
const names = {};
for (const cat of CATS) {
  names[cat] = Array.from({ length: L.counts[cat] }, (_, i) => L.byKey.get(`${cat}/${i}`).display);
}
fs.writeFileSync(
  path.join(HERE, 'trait-names.json'),
  JSON.stringify({ counts: L.counts, names, pfp: pfp.birds.map((b) => b.traits) }, null, 1),
);

const files = fs.readdirSync(OUT);
const bytes = files.reduce((a, f) => a + fs.statSync(path.join(OUT, f)).size, 0);
console.log(`${files.length} assets (${swatches} swatches, 36 pfps, ${Object.keys(COMPOSED).length + 3} composed, 1 mark) — ${(bytes / 1024).toFixed(0)} KB`);
