// A stream's share of one second, and how far it has run since a read.
//
// Synthetix-style streams — the staking contract's and the Nest's — pay a
// rate per second (scaled by 1e18 on chain) to whoever holds a share of the
// total. `earned()` on chain only changes when it is read; between reads the
// figure on screen is carried forward from the last read by this arithmetic,
// and replaced the moment the next read lands. An estimate, never a promise:
// nothing that spends money uses it.
//
// BigInt throughout, truncating, and clamped: the estimate never goes below
// what was read, stops at `periodFinish`, and is zero with nobody sharing.

import type { Amount, UnixSeconds } from '../mock/types';

const PRECISION = 10n ** 18n;

export type StreamShare = {
  /** What the chain said at the read. The floor of every estimate. */
  atRead: Amount;
  /** The contract's `rewardRate`: base units per second, scaled by 1e18. */
  rate: Amount;
  /** The holder's share, as numerator / denominator of the total (stake / totalStaked, weight / totalWeight). */
  share: Amount;
  total: Amount;
  periodFinish: UnixSeconds;
  /** The block's clock at the read, and the estimate's clock now. */
  chainNowAtRead: UnixSeconds;
  now: UnixSeconds;
};

/** The holder's base units per second, from the raw rate and the share. Zero with nobody sharing. */
export function perSecond(rate: Amount, share: Amount, total: Amount): Amount {
  if (total <= 0n || share <= 0n || rate <= 0n) return 0n;
  return (rate * share) / total / PRECISION;
}

/**
 * `atRead + perSecond × (min(now, periodFinish) − chainNowAtRead)`, and never
 * less than `atRead`. Equal to `atRead` when `now == chainNowAtRead`, when the
 * period has ended, when nobody shares, and when the clock runs backwards.
 */
export function estimateSince(o: StreamShare): Amount {
  const until = Math.min(o.now, o.periodFinish);
  const elapsed = until - o.chainNowAtRead;
  if (elapsed <= 0) return o.atRead;
  const mine = perSecond(o.rate, o.share, o.total);
  if (mine === 0n) return o.atRead;
  return o.atRead + mine * BigInt(elapsed);
}
