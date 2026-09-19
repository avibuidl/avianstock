import type { Amount } from '../mock/types';
import type { FixKind } from '../mock/errors';

// The drawer's one button after a refusal.
//
// A refusal's explanation names a fix (`approve`, `retry`, `refresh`, ...) and
// the drawer draws a button for it. Whether anything happens when it is pressed
// used to depend on the screen: each screen's handler was one function that
// acted on the kinds it knew and silently dropped the rest, so "Try again" and
// "Get AVIANS" closed the drawer and did nothing. Now a handler is a MAP from
// kind to action, and the button is drawn only when some map in the chain has
// an entry for the kind: a button that exists is a button that acts.
//
// Three maps, in order: the screen's own (the approval it can run, the door it
// can switch), the site's (open the trade modal, open the wallet), and the
// drawer's built-ins (re-run the last write, re-read every panel). The first
// entry found runs; an entry may return `false` to decline, and the next one
// runs instead — the sell sheet's `retry` takes the direct route for one
// refusal and lets the built-in re-run handle the rest.

export type FixHandler = (amount?: Amount, error?: unknown) => void | boolean;
export type FixHandlers = Partial<Record<FixKind, FixHandler>>;

/** Every handler for the kind, screen first. Empty means: draw no button. */
export function handlersFor(kind: FixKind, ...maps: (FixHandlers | undefined)[]): FixHandler[] {
  const out: FixHandler[] = [];
  for (const m of maps) {
    const h = m?.[kind];
    if (h) out.push(h);
  }
  return out;
}

/** Run the chain until one handler takes it. True when one did. */
export function runFix(handlers: FixHandler[], amount?: Amount, error?: unknown): boolean {
  for (const h of handlers) {
    if (h(amount, error) !== false) return true;
  }
  return false;
}
