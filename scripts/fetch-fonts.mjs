// Self-hosts the two typefaces into public/fonts/.
//
// Geist (every heading, every paragraph, every control) and Geist Mono
// (amounts, addresses, token ids, the nav labels and the tags). Both are
// SIL OFL 1.1, published by Vercel, so they can be self-hosted, and
// self-hosting them means the site makes no request to a third party at
// runtime.
//
// Only the `latin` and `latin-ext` subsets are kept: one variable-weight file
// per family per subset, four files in all.
//
//   node scripts/fetch-fonts.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'public', 'fonts');
// A modern desktop UA, so the API answers with woff2 rather than ttf.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const FAMILIES = [
  ['geist', 'Geist:wght@100..900'],
  ['geist-mono', 'Geist+Mono:wght@100..900'],
];

const KEEP = new Set(['latin', 'latin-ext']);

async function family(slug, spec) {
  const url = `https://fonts.googleapis.com/css2?family=${spec}&display=swap`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  const css = await res.text();

  // Blocks are preceded by a /* subset */ comment.
  const blocks = [...css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*(@font-face\s*\{[^}]*\})/g)];
  const out = [];
  let i = 0;
  for (const [, subset, block] of blocks) {
    if (!KEEP.has(subset)) continue;
    const m = block.match(/src:\s*url\(([^)]+)\)/);
    if (!m) continue;
    const file = `${slug}-${subset}-${i++}.woff2`;
    const bin = await fetch(m[1], { headers: { 'User-Agent': UA } });
    if (!bin.ok) throw new Error(`${m[1]} -> ${bin.status}`);
    fs.writeFileSync(path.join(OUT, file), Buffer.from(await bin.arrayBuffer()));
    out.push(block.replace(m[1], `./${file}`));
  }
  if (!out.length) throw new Error(`${slug}: no latin block in the response`);
  return out.join('\n');
}

fs.mkdirSync(OUT, { recursive: true });
// The families this script no longer fetches must not linger beside the ones
// it does: a stale woff2 is a file nothing references, shipped anyway.
for (const f of fs.readdirSync(OUT)) {
  if (f.endsWith('.woff2') && !FAMILIES.some(([slug]) => f.startsWith(`${slug}-`))) {
    fs.unlinkSync(path.join(OUT, f));
  }
}
const parts = [];
for (const [slug, spec] of FAMILIES) {
  parts.push(`/* ${spec.split(':')[0].replace(/\+/g, ' ')} - SIL OFL 1.1 */`);
  parts.push(await family(slug, spec));
}
fs.writeFileSync(path.join(OUT, 'fonts.css'), parts.join('\n\n') + '\n');

fs.writeFileSync(path.join(OUT, 'LICENSES.md'), `# Typefaces

Both are licensed under the SIL Open Font License 1.1, which permits
self-hosting and redistribution with the software. The full licence text ships
with each family upstream.

| family | used for | upstream |
|---|---|---|
| Geist | the wordmark, every heading, body copy and controls | https://github.com/vercel/geist-font |
| Geist Mono | amounts, addresses, token ids, the nav labels and the tags | https://github.com/vercel/geist-font |

The .woff2 files in this directory are the \`latin\` and \`latin-ext\` subsets
of the variable fonts as served by Google Fonts, fetched by
\`scripts/fetch-fonts.mjs\`. Re-run that script to refresh them.

Note from logo/final/README.md: an SVG cannot carry a font, so the lockups NAME
a family and fall back to a system stack wherever it is not loaded. That is
fine here, because this site loads the webfont. Anything going to print or to
a third party needs the wordmark converted to outlines first.
`);

const files = fs.readdirSync(OUT).filter((f) => f.endsWith('.woff2'));
const kb = files.reduce((a, f) => a + fs.statSync(path.join(OUT, f)).size, 0) / 1024;
console.log(`fonts: ${files.length} woff2 (${kb.toFixed(0)} KB) + fonts.css + LICENSES.md`);
