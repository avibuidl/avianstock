// Where the pool is in its opening, on the clock.
//
// The hook's three rules are pure functions of `block.timestamp` and two
// immutables (`AviansHook.sol`, "THE WINDOW"): before `LAUNCH_AT` every swap
// reverts; for `WINDOW` seconds after it a buy pays the decaying opening fee
// and is capped per transaction; after that the flat fees apply. `isLaunched()`
// on chain is `block.timestamp >= LAUNCH_AT`, so a screen that has the chain's
// clock can answer the same question between reads, and the modal's button
// opens the second the countdown ends rather than at the next read.

export type PoolPhase = 'before' | 'window' | 'after';

export function poolPhase(pool: { launchAt: number; windowEndsAt: number }, now: number): PoolPhase {
  if (now < pool.launchAt) return 'before';
  if (now < pool.windowEndsAt) return 'window';
  return 'after';
}
