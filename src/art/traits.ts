// The trait registry, as the site reads it.
//
// On chain this is TraitRegistry: counts(), categoryName(c), traitName(c, i).
// Here it comes from the same art/**.json the registry was encoded from, plus
// one to three sentences per trait from lore/traits.md. When the site is
// wired, the display names could be read live instead — but they are frozen
// art, so reading them from the bundle is not a shortcut, it is the same data
// without 76 calls.

import pieces from './pieces.json';
import type { CategoryId, TraitIndices } from './render';

export type Trait = { index: number; key: string; display: string; lore: string };
export type Category = { id: CategoryId; key: string; display: string; traits: Trait[] };

export const CATEGORIES = pieces.categories as unknown as Category[];

export const COUNTS = CATEGORIES.map((c) => c.traits.length);

/** 12 * 12 * 15 * 9 * 6 * 16 = 1,866,240 */
export const COMBINATIONS = COUNTS.reduce((a, b) => a * b, 1);

export const TOTAL_TRAITS = COUNTS.reduce((a, b) => a + b, 0);

export function traitName(category: CategoryId, index: number): string {
  return CATEGORIES[category].traits[index]?.display ?? `#${index}`;
}

export function traitLore(category: CategoryId, index: number): string {
  return CATEGORIES[category].traits[index]?.lore ?? '';
}

/** ["Duskline", "Kingfisher", …] in category order. */
export function traitNames(t: TraitIndices): string[] {
  return CATEGORIES.map((c, i) => traitName(c.id, t[i]));
}

export function isValid(t: TraitIndices): boolean {
  return t.length === 6 && t.every((v, i) => Number.isInteger(v) && v >= 0 && v < COUNTS[i]);
}
