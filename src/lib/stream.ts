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

import type { Amount, FlywheelSnapshot, RewardStream, UnixSeconds } from '../mock/types';
import { formatCompact, formatEthSig, formatSince, formatUsd, usdOf } from './format';

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

// ── a stream row's words (part 19) ─────────────────────────────────────────
//
// One row for every stream on the flywheel views: the Nest's, one per listed
// token, and the staking contract's own AVIAN stream to stakers. The words
// are the same for both but for who is paid.

/** Whose stream a row is. */
export type StreamFor = 'brooders' | 'stakers';

/**
 * "Streaming. Ends in 3d 4h." / "Stream ended." / "Nothing has streamed yet."
 * `periodFinish` is 0 until the stream is first funded: that is not a stream
 * that ended but one that has not started.
 */
export function streamStateLine(periodFinish: UnixSeconds, now: UnixSeconds): string {
  if (periodFinish > now) return `Streaming. Ends in ${formatSince(periodFinish - now)}.`;
  return periodFinish === 0 ? 'Nothing has streamed yet.' : 'Stream ended.';
}

/**
 * "Total paid to brooders: 12.4 NVDA, $2,140 today." or, for the stakers'
 * row, "Total paid to stakers: 1.2M AVIAN, $3,400 today." The value is the
 * amount at the snapshot's unit price for the token (for AVIAN that entry
 * counts brooders and stakers together, so the unit price is used, not the
 * entry's value), in dollars where the deployment has a dollar source and in
 * ETH where it has not. No price this refresh: the amount alone.
 */
export function paidLine(stream: RewardStream, fly: FlywheelSnapshot | undefined, who: StreamFor = 'brooders'): string {
  const lead = who === 'stakers' ? 'Total paid to stakers' : 'Total paid to brooders';
  if (stream.totalPaid === 0n) return `${lead}: nothing yet.`;
  const amount = `${formatCompact(stream.totalPaid, stream.token.decimals)} ${stream.token.symbol}`;
  const entry = fly?.paid.find((p) => p.token.toLowerCase() === stream.token.address.toLowerCase());
  if (!entry || entry.ethValue === null || entry.amount === 0n) return `${lead}: ${amount}.`;
  const eth = (entry.ethValue * stream.totalPaid) / entry.amount;
  const usd = fly?.usd ? usdOf(eth, fly.usd.usdPerEth) : null;
  return `${lead}: ${amount}, ${usd !== null ? formatUsd(usd) : formatEthSig(eth)} today.`;
}
