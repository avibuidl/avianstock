// The renderer, ported from tools/svg.mjs — the parity oracle the on-chain
// renderer is tested against.
//
// This is NOT part of the mock layer and it does not go away when the site is
// wired to the chain. It is what lets the composer preview any of the
// 1,866,240 combinations before a token exists, and `npm run check:art`
// asserts it reproduces the 36 committed PFPs byte for byte — so what it draws
// is exactly what `tokenURI` will return, not a lookalike.
//
// The contract emits, exactly:
//   viewBox="0 0 32 32", shape-rendering="crispEdges"
//   one <rect> per horizontal run of equal palette index in the COMPOSITE
//   integer x/y/width, height always 1
//   fill as a literal uppercase #RRGGBB
//   transparent (index 0) runs emit nothing
//   no whitespace between rects

import pieces from './pieces.json';

export type TraitIndices = readonly [number, number, number, number, number, number];
export type CategoryId = 0 | 1 | 2 | 3 | 4 | 5;

export const W = 32;
export const H = 32;
export const PIXELS = W * H;
export const SVG_WIDTH = 512;
export const SVG_HEIGHT = 512;

/** Category order: the order `mint`'s six arguments are in, and the packing order. */
export const CATEGORY_KEYS = ['background', 'plumage', 'eyes', 'beak', 'neckwear', 'headwear'];

const PALETTE = pieces.palette as (string | null)[];
const LAYER_ORDER = pieces.layerOrder as string[];

function decode(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const layerCache = new Map<string, Uint8Array>();

function layer(key: string): Uint8Array {
  let v = layerCache.get(key);
  if (!v) {
    const raw = key === 'base' ? pieces.base : (pieces.pieces as Record<string, string>)[key];
    if (!raw) throw new Error(`no piece for ${key}`);
    v = decode(raw);
    layerCache.set(key, v);
  }
  return v;
}

/** Composite layers in z-order. A non-zero index overwrites what is beneath it. */
function composite(layers: Uint8Array[]): Uint8Array {
  const px = new Uint8Array(PIXELS);
  for (const l of layers) {
    for (let i = 0; i < PIXELS; i++) {
      const v = l[i];
      if (v !== 0) px[i] = v;
    }
  }
  return px;
}

/** One <rect> per horizontal run. Byte-identical to the oracle's `svgBody`. */
function svgBody(px: Uint8Array): string {
  let body = '';
  for (let r = 0; r < H; r++) {
    let c = 0;
    while (c < W) {
      const v = px[r * W + c];
      let w = 1;
      while (c + w < W && px[r * W + c + w] === v) w++;
      if (v !== 0) {
        const hex = PALETTE[v];
        if (!hex) throw new Error(`palette index ${v} at (${r},${c}) has no colour`);
        body += '<rect x="' + c + '" y="' + r + '" width="' + w + '" height="1" fill="' + hex + '"/>';
      }
      c += w;
    }
  }
  return body;
}

function svgDocument(px: Uint8Array): string {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + SVG_WIDTH + '" height="' + SVG_HEIGHT + '" ' +
    'viewBox="0 0 ' + W + ' ' + H + '" shape-rendering="crispEdges">' + svgBody(px) + '</svg>';
}

/**
 * The six trait indices, in category order, as the SVG the chain will return.
 * `field: false` drops the background layer — used for trait swatches, which
 * sit on the panel's own ground.
 */
export function renderAvian(traits: TraitIndices, field = true): string {
  // A negative index is the wiring layer's "we have not read this bird's traits
  // yet" (see `chain/birds.ts`). Draw nothing rather than draw a real, mintable
  // combination that is not this bird — an empty frame is honest, wrong art is
  // not. No valid combination reaches this branch, so the parity oracle is
  // untouched.
  if (traits.some((t) => t < 0)) return svgDocument(new Uint8Array(PIXELS));

  const layers: Uint8Array[] = [];
  for (const k of LAYER_ORDER) {
    if (k === 'base') { layers.push(layer('base')); continue; }
    if (k === 'background' && !field) continue;
    layers.push(layer(k + '/' + traits[CATEGORY_KEYS.indexOf(k)]));
  }
  return svgDocument(composite(layers));
}

const uriCache = new Map<string, string>();

/** The same drawing, as a data URI for an <img>. Memoised. */
export function avianDataUri(traits: TraitIndices, field = true): string {
  const key = traits.join(',') + (field ? '' : '-nf');
  let v = uriCache.get(key);
  if (!v) {
    v = 'data:image/svg+xml,' + encodeURIComponent(renderAvian(traits, field));
    uriCache.set(key, v);
  }
  return v;
}

/**
 * A trait swatch: the locked owlish base with a reference face, and the one
 * trait being previewed swapped in. A background swatch keeps its field —
 * the field IS the trait; every other one is transparent.
 */
const REFERENCE: TraitIndices = [0, 0, 0, 0, 0, 0];

export function swatchDataUri(category: CategoryId, index: number): string {
  const t = REFERENCE.slice() as number[];
  t[category] = index;
  return avianDataUri(t as unknown as TraitIndices, category === 0);
}

/**
 * The layer each category draws, in category order. The composite order is
 * different (base sits between plumage and neckwear) and is spelled out where
 * it matters; this is only the name of a category's OWN art.
 */
const LAYER_KEY = ['background', 'plumage', 'eyes', 'beak', 'neckwear', 'headwear'] as const;

/**
 * ONE trait's art, on nothing.
 *
 * For a chooser rather than a showcase. A row of composed birds asks the eye to
 * find the one part that differs between them; a row of the parts themselves
 * does not, and a background swatch with a bird standing on it is showing the
 * bird twice over. So: the background alone, the plumage without a face, the
 * beak on its own.
 *
 * The ground is transparent — the swatch's own panel shows through, and these
 * sit at 32 x 32 upscaled with `crispEdges`, so a beak is a beak and not a
 * smudge.
 */
export function traitOnlyDataUri(category: CategoryId, index: number): string {
  const key = `only-${category}-${index}`;
  let v = uriCache.get(key);
  if (v) return v;
  v = 'data:image/svg+xml,' + encodeURIComponent(
    svgDocument(composite([layer(`${LAYER_KEY[category]}/${index}`)])),
  );
  uriCache.set(key, v);
  return v;
}

/**
 * One trait on its own: the locked owlish base under the single plumage every
 * swatch in the row shares, and nothing else except the trait being shown.
 *
 * Where a row is making a point about ONE category, a reference face is noise
 * — a strip of birds that differ in eyes, beak and throat as well as the hat
 * reads as six different birds rather than one bird trying on six hats, which
 * is what it is.
 */
export function isolatedTraitDataUri(
  category: CategoryId,
  index: number,
  face: { plumage?: number; eyes?: number; beak?: number } = {},
): string {
  const plumage = face.plumage ?? 0;
  const eyes = face.eyes ?? 0;
  const beak = face.beak ?? 0;
  const key = `iso-${category}-${index}-${plumage}-${eyes}-${beak}`;
  let v = uriCache.get(key);
  if (v) return v;

  // Built in the collection's own layer order: background, plumage, base,
  // neckwear, eyes, beak, headwear. The field and the throat are left out —
  // they are what made the row read as different birds — but the face stays,
  // because a bird with no eyes and no bill is not a bird.
  const layers: Uint8Array[] = [];
  if (category === 0) layers.push(layer(`background/${index}`));
  layers.push(layer(`plumage/${category === 1 ? index : plumage}`));
  layers.push(layer('base'));
  if (category === 4) layers.push(layer(`neckwear/${index}`));
  layers.push(layer(`eyes/${category === 2 ? index : eyes}`));
  layers.push(layer(`beak/${category === 3 ? index : beak}`));
  if (category === 5) layers.push(layer(`headwear/${index}`));

  v = 'data:image/svg+xml,' + encodeURIComponent(svgDocument(composite(layers)));
  uriCache.set(key, v);
  return v;
}

/** The packed uint48 the register keys on. LSB is background. */
export function packCombo(t: TraitIndices): bigint {
  return BigInt(t[0]) | (BigInt(t[1]) << 8n) | (BigInt(t[2]) << 16n)
    | (BigInt(t[3]) << 24n) | (BigInt(t[4]) << 32n) | (BigInt(t[5]) << 40n);
}

export function unpackCombo(c: bigint): TraitIndices {
  return [
    Number(c & 0xffn), Number((c >> 8n) & 0xffn), Number((c >> 16n) & 0xffn),
    Number((c >> 24n) & 0xffn), Number((c >> 32n) & 0xffn), Number((c >> 40n) & 0xffn),
  ];
}

/** 0x + 12 uppercase hex digits, the way an explorer shows a uint48. */
export function comboHex(c: bigint): string {
  return '0x' + c.toString(16).toUpperCase().padStart(12, '0');
}
