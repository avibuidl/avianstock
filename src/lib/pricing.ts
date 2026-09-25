// Where a conversion's reference price comes from, and whether the AVIAN
// pool's history can be read yet (2026-09-24).
//
// The founder's decision: no keeper, and no daily floor. A pair whose pool
// keeps a history is priced from that history, and `Treasury.priceSource`
// says which of four kinds a pair is. So the owner page asks BEFORE it offers
// a floor form: a floor is not something to set for a pair that does not
// consult one, and a form that invites it is a form that misleads.
//
// A v4 pool keeps no history of its own, so the AVIAN pool's hook keeps one
// and the Treasury takes READINGS of it. A buy averages between two of them,
// which means one reading alone is not enough and a fresh one cannot replace
// a usable one. Both facts turn into the same small question — can the buy be
// priced right now, and if not, what is the wait — so both live here, pure,
// rather than as conditions spelled out twice in two components.

import type { Readings, UnixSeconds } from '../mock/types';

/**
 * `Treasury.priceSource(currency, target)`, as the contract's own constants
 * name it: `PRICE_NONE`, `PRICE_FLOOR`, `PRICE_V3_MEAN`, `PRICE_HOOK_MEAN`.
 */
export const PRICE_NONE = 0;
export const PRICE_FLOOR = 1;
export const PRICE_V3_MEAN = 2;
export const PRICE_HOOK_MEAN = 3;

/** That number, in words, for a person reading the owner page. */
export function priceSourceLabel(source: number): string {
  switch (source) {
    case PRICE_FLOOR: return 'a written floor';
    case PRICE_V3_MEAN: return 'priced by the pool’s thirty-minute mean';
    case PRICE_HOOK_MEAN: return 'priced by the AVIAN pool’s readings';
    default: return 'no route';
  }
}

/** Only a floor-priced pair has a floor to set. Everything else reads its pool. */
export function needsFloor(source: number): boolean {
  return source === PRICE_FLOOR;
}

/**
 * What a pair's source is on a Treasury deployed before `priceSource`
 * existed (2026-09-24). That contract had one reference and one only: a
 * written floor, consulted for every routed pair. Reading such a deployment
 * as "no route, therefore no price; otherwise a floor" is not a guess — it is
 * what the older contract did — and it keeps the owner page on an older
 * deployment exactly what it was.
 */
export function sourceWithoutPriceSource(venue: number): number {
  return venue === 0 ? PRICE_NONE : PRICE_FLOOR;
}

export type ReadingPlan =
  /** `roostMeanTick()` answers: the buy can be priced, and the button is the buy. */
  | { kind: 'priced' }
  /** No usable reading and one may be taken now: the button is TAKE A READING. */
  | { kind: 'take' }
  /** A reading is already on its way; the buy opens when it comes of age. */
  | { kind: 'waiting'; usableAt: UnixSeconds }
  /** The pool is not routed through the hook at all, so there is no history to read. */
  | { kind: 'unavailable' };

/**
 * What to offer for the Roost's buy right now.
 *
 * `takeRoostReading()` refuses `ReadingTooYoung` while the last reading is
 * under `window` old, so a NoUsableReading with a young last reading means
 * one was just taken and the previous one has expired: nobody can do anything
 * but wait for it to come of age. Offering the button then would draw a
 * control whose only outcome is a refusal.
 */
export function readingPlan(r: Readings | null, now: UnixSeconds): ReadingPlan {
  if (!r) return { kind: 'unavailable' };
  if (r.refusal === null) return { kind: 'priced' };
  if (r.refusal !== 'NoUsableReading') return { kind: 'unavailable' };
  if (r.lastAt === 0) return { kind: 'take' };
  if (now - r.lastAt >= r.window) return { kind: 'take' };
  return { kind: 'waiting', usableAt: r.lastAt + r.window };
}
