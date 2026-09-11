// Writes the artboards, canvas.json, and a plain-HTML preview of each board
// so the layout can be measured in a browser before it is published.
//
//   node build-assets.mjs   # the art first
//   node build.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as A from './screens-a.mjs';
import * as B from './screens-b.mjs';
import * as Cc from './screens-c.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PREVIEW = path.join(HERE, '_preview');

// name -> [source, x, y, w, h, title]
// Heights are the measured content height of each board plus ~5% slack; the
// surplus paints the artboard's own ink background. Rows are spaced 140px.
const BOARDS = [
  ['Main', A.Main, 0, 0, 1440, 6800, 'Landing'],

  ['Compose', A.Compose, 1560, 0, 1440, 1520, 'Compose & mint'],
  ['ComposeTaken', A.ComposeTaken, 3120, 0, 1440, 1520, 'Compose — that one just went'],
  ['ComposeFree', A.ComposeFree, 4680, 0, 1440, 1540, 'Compose — the flocklist'],
  ['ComposeMobile', A.ComposeMobile, 6240, 0, 390, 844, 'Compose — a phone, 390px'],

  ['Perch', B.Perch, 1560, 1680, 1440, 1380, 'The perch'],
  ['Nest', B.Nest, 3120, 1680, 1440, 1900, 'The Nest'],
  ['YourBirds', B.YourBirds, 4680, 1680, 1440, 1260, 'Your birds'],

  ['Flock', B.Flock, 1560, 3720, 1440, 1030, 'The flock'],
  ['FirstLight', Cc.FirstLight, 3120, 3720, 1440, 1380, 'First Light'],
  ['WrongNetwork', Cc.WrongNetwork, 4680, 3720, 1440, 1140, 'Wrong network'],

  ['Refusal', Cc.Refusal, 1560, 5240, 1440, 900, 'Refused — the satchel cycle'],
  ['SystemStates', Cc.SystemStates, 3120, 5240, 1440, 2100, 'Every state, reachable'],
];

// ------------------------------------------------------------- artboards
fs.mkdirSync(PREVIEW, { recursive: true });
const referenced = new Set();
for (const [name, src] of BOARDS) {
  fs.writeFileSync(path.join(HERE, `${name}.dc.html`), src);
  for (const m of src.matchAll(/src="([^"]+\.svg)"/g)) referenced.add(m[1]);

  // A plain page, for measuring and eyeballing. Not part of the canvas.
  const plain = src
    .replace('<script src="./support.js"></script>', '')
    .replace(/<\/?x-dc>/g, '')
    .replace(/<\/?helmet>/g, '')
    .replace(/src="([^"/]+\.svg)"/g, 'src="../assets/$1"');
  fs.writeFileSync(path.join(PREVIEW, `${name}.html`), plain);
}

// --------------------------------------------------------- canvas.json
const canvas = {
  artboards: BOARDS.map(([file, , x, y, w, h, title]) => ({ file: `${file}.dc.html`, x, y, w, h, title })),
  annotations: [
    {
      id: 'note-landing', x: 0, y: -150, w: 620,
      text: 'The landing page, end to end. Every line of copy is the real text from lore/site-copy.md — nothing here is drafted or filler.',
    },
    {
      id: 'note-compose', x: 1560, y: -150, w: 600,
      text: 'The heart of the product, and its three critical variants.\nThe swatches are the real 32x32 art, rendered through tools/svg.mjs — the same parity oracle the on-chain renderer is tested against.',
    },
    {
      id: 'note-mobile', x: 6240, y: -150, w: 390,
      text: 'A wallet in-app browser at 390px. The preview stays; the six categories scroll under it.',
    },
    {
      id: 'note-awkward', x: 4680, y: 3420, w: 600,
      text: 'The awkward states, drawn rather than described: the wrong chain and the 4902 add-then-switch path, the refused mint (next row), and the transfer this site will not perform.',
    },
    {
      id: 'note-states', x: 3120, y: 4940, w: 620,
      text: 'The dev-only state switcher and the states it reaches. If a state exists in HANDOVER and cannot be reached here, the wiring agent has nowhere to put it.',
    },
  ],
  launch: { view: 'canvas' },
};
fs.writeFileSync(path.join(HERE, 'canvas.json'), JSON.stringify(canvas, null, 1));

// --------------------------------------------------------- the seed line
const images = [...referenced].sort();
const missing = images.filter((f) => !fs.existsSync(path.join(HERE, 'assets', f)));
if (missing.length) throw new Error(`missing assets: ${missing.join(', ')}`);
fs.writeFileSync(
  path.join(HERE, 'images.txt'),
  images.map((f) => `--image\nassets/${f}`).join('\n') + '\n',
);

const bytes = images.reduce((a, f) => a + fs.statSync(path.join(HERE, 'assets', f)).size, 0);
console.log(`${BOARDS.length} artboards · ${images.length} images (${(bytes / 1024).toFixed(0)} KB raw)`);
console.log(`previews: _preview/*.html`);
