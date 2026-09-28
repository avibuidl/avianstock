// "Earning now" (2026-09-28): what a wallet's brooding birds have earned and
// not yet settled, token by token, all together, growing as you watch. Pure
// arithmetic over reads that exist: per token, the sum over the wallet's
// live broods of each bird's unsettled amount NOW, which is what the chain
// said at the read plus the bird's share of the stream's rate for every
// second since (the chain module's `estimateUnsettled`, which is
// `estimateSince` here), clamped at the stream's end and never below the
// read. When a read lands the figure snaps to the chain's word and carries
// on. An estimate between reads: nothing that spends money uses it.

import { usdOf } from './format';
import { ethValueOf } from './rewards';
import { estimateSince, perSecond } from './stream';
import type { Address, Amount, BroodState, FlywheelSnapshot, RewardToken, UnixSeconds } from '../mock/types';

/** The site's usual for a reward amount, and the most the row will show: a seventh place is noise. */
const PLACES_MIN = 4;
const PLACES_MAX = 6;

export type EarningRow = {
  token: RewardToken;
  /** Base units earned and not yet settled, for this wallet's brooding birds together, now. */
  amount: Amount;
  /** The wallet's base units per second in this token: the rate the digits are chosen from. */
  perSecond: Amount;
  /** Fractional digits to show: enough that the figure moves each second at the rate, never fewer than the site's usual. */
  places: number;
  eth: bigint | null;
  usd: bigint | null;
  /** 'running' with a countdown, 'ended' past `periodFinish`, 'none' for a token never funded. */
  state: 'running' | 'ended' | 'none';
  periodFinish: UnixSeconds;
};

/** The wallet's weight in the Nest: the tiers of its live broods, added up. */
export function walletWeight(nest: BroodState): bigint {
  return nest.yours.reduce((a, e) => a + (e.brood?.live ? BigInt(e.brood.tier) : 0n), 0n);
}

/**
 * The fractional digits a figure needs to move each second at `perSec` base
 * units a second: the fewest, from the site's usual four, at which one unit
 * of the last place is at most a second's growth; never more than six.
 */
export function placesFor(perSec: Amount, decimals: number): number {
  if (perSec <= 0n) return PLACES_MIN;
  for (let p = PLACES_MIN; p <= PLACES_MAX; p++) {
    const unit = 10n ** BigInt(Math.max(0, decimals - p));
    if (perSec >= unit) return p;
  }
  return Math.min(PLACES_MAX, decimals);
}

/** One row per listed token, sorted by value, highest first; the unvalued after, by amount. */
export function earningRows(nest: BroodState, fly: FlywheelSnapshot | undefined, avian: Address, now: UnixSeconds): EarningRow[] {
  const rows = nest.listed.map((token): EarningRow => {
    const stream = nest.streams.find((s) => s.token.address.toLowerCase() === token.address.toLowerCase());
    const funded = !!stream && stream.periodFinish !== 0;
    const state: EarningRow['state'] = !funded ? 'none' : now >= stream.periodFinish ? 'ended' : 'running';
    let amount = 0n;
    let perSec = 0n;
    for (const e of nest.yours) {
      if (!e.brood?.live) continue;
      const line = e.lines.find((l) => l.token.address.toLowerCase() === token.address.toLowerCase());
      if (!line) continue;
      const weight = BigInt(e.brood.tier);
      amount += funded
        ? estimateSince({
          atRead: line.unsettled, rate: stream.rate, share: weight, total: nest.totalWeight,
          periodFinish: stream.periodFinish, chainNowAtRead: nest.chainNow, now,
        })
        : line.unsettled;
      if (state === 'running') perSec += perSecond(stream!.rate, weight, nest.totalWeight);
    }
    const eth = ethValueOf(token.address, amount, fly, avian);
    const usd = eth !== null && fly?.usd ? usdOf(eth, fly.usd.usdPerEth) : null;
    return { token, amount, perSecond: perSec, places: placesFor(perSec, token.decimals), eth, usd, state, periodFinish: stream?.periodFinish ?? 0 };
  });
  return rows.sort((a, b) => {
    if (a.eth !== null && b.eth !== null && a.eth !== b.eth) return a.eth > b.eth ? -1 : 1;
    if ((a.eth === null) !== (b.eth === null)) return a.eth === null ? 1 : -1;
    return a.amount === b.amount ? 0 : a.amount > b.amount ? -1 : 1;
  });
}

/** The rows' total now: dollars when every row has them, else ETH, else null (a row with no price). */
export function totalNow(rows: EarningRow[]): { usd: bigint | null; eth: bigint | null } {
  if (rows.length === 0) return { usd: 0n, eth: 0n };
  if (rows.some((r) => r.eth === null)) return { usd: null, eth: null };
  const eth = rows.reduce((a, r) => a + (r.eth ?? 0n), 0n);
  const usd = rows.every((r) => r.usd !== null) ? rows.reduce((a, r) => a + (r.usd ?? 0n), 0n) : null;
  return { usd, eth };
}
