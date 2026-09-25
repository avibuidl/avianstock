// When the Treasury's two permissionless buttons open (2026-09-24).
//
// Nobody switches conversions on any more. The Treasury is born configured
// and both CONVERT and BUY FOR THE ROOST open by themselves `OPENING_DELAY`
// (six hours) after trading opened on the AVIAN pool. The owner's `enabled`
// flag is a PAUSE: off holds both shut, on lets the clock decide, and it
// cannot open them early.
//
// `conversionsOpen()` on chain is `enabled && openAt != 0 && now >= openAt`,
// a pure function of the block's clock and two reads. So a screen with the
// chain's clock answers the same question between reads, and the buttons open
// the second the countdown ends rather than at the next poll — the rule the
// trade modal's `poolPhase` follows for the same reason.

import type { Opening, UnixSeconds } from '../mock/types';

export type OpeningState =
  /** No route names a hook yet, so the Treasury cannot know when trading opened. */
  | { kind: 'unknown' }
  /** The clock is known and has not passed. */
  | { kind: 'waiting'; openAt: UnixSeconds }
  /** Open by the clock, and not paused. */
  | { kind: 'open' }
  /** Held shut by the owner. Whatever the clock says, nothing moves. */
  | { kind: 'paused' };

/**
 * The clock's view: what the public card's one line says. The pause is not
 * part of it — the card states the clock and lets each button say the rest.
 */
export function clockState(o: Opening, now: UnixSeconds): Exclude<OpeningState, { kind: 'paused' }> {
  // The chain said open at the block read: believe it over a carried clock.
  if (o.open) return { kind: 'open' };
  if (o.openAt === 0) return { kind: 'unknown' };
  if (now < o.openAt) return { kind: 'waiting', openAt: o.openAt };
  return { kind: 'open' };
}

/**
 * The owner's view: the pause first, because it is the owner's own lever and
 * the one thing on this page that changes the answer; then the clock.
 */
export function openingState(o: Opening, now: UnixSeconds): OpeningState {
  if (!o.enabled) return { kind: 'paused' };
  return clockState(o, now);
}

/** `conversionsOpen()`, answered from the chain's clock. */
export function conversionsOpen(o: Opening, now: UnixSeconds): boolean {
  return openingState(o, now).kind === 'open';
}

/** "Sep 24, 2:40 PM": the moment, in the reader's own zone. */
export function formatOpenAt(openAt: UnixSeconds): string {
  return new Date(openAt * 1000).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}
