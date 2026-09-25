// Who holds the owner's seats (part 18, 2026-09-25).
//
// Each owned seat has its own owner. They agree on an ordinary day and differ
// halfway through a council reseat, when some seats have moved and some have
// not. The seat control sends one signature per seat, so it asks this before
// the first one rather than finding out at the fourth.

import type { OwnedSeat } from '../mock/types';

/** The seats of these that `you` does not hold; all of them when no wallet is connected. */
export function notHeldBy(you: string | null, seats: readonly OwnedSeat[]): OwnedSeat[] {
  return seats.filter((x) => !you || x.owner.toLowerCase() !== you.toLowerCase());
}
