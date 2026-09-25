// The flywheel snapshot, without a chain (2026-09-22).
//
// The landing page's live figures, composed from the same fixtures the
// screens read, so the snapshot and the Roost, the Nest and the perch agree:
// the birds from the collection and the perch, the AVIAN figures from the
// supply and the Roost's burn counter, the Roost's own counters, the paid
// totals from the Nest's streams. The `flywheel` scene picks the day: a live
// one, the first, one with no dollar source, one with a turn due now.
//
// Once wired this is `src/chain/flywheel.ts`: one pin, one multicall, the
// same shape. Nothing here is a number the chain cannot give.

import type { Address, Amount, FlywheelSnapshot, PaidOut } from './types';
import { scenario } from './scenario';
import { ADDRESSES, AVIANS_SUPPLY, world } from './fixtures';
import { countStakers } from '../lib/paid';
import { read } from './reads';
import { getPrices } from './prices';
import { getRoost, getStaking } from './roost';

const WAD = 10n ** 18n;
const e18 = (n: number) => BigInt(n) * WAD;

/** 1 ETH buys 2,000,000 AVIAN on the fixture pool (swap.ts): a mid-price of 0.0000005 ETH. */
const ETH_PER_AVIAN = WAD / 2_000_000n;
/** Dollars per ETH, 18 decimals. The wiring's own test figure, from a known v3 slot0. */
const USD_PER_ETH = 2_782_670_000_000_000_000_000n;
/** What AVIAN stakers have been paid, ever, beside what brooding birds were. */
const STAKING_PAID = e18(812_000);

export async function getFlywheel(): Promise<FlywheelSnapshot> {
  const [roost, staking, board] = await Promise.all([getRoost(), getStaking(null), getPrices()]);
  return read(() => {
    const s = scenario();
    const w = world();
    const firstDay = s.flywheel === 'first-day';
    const now = Math.floor(Date.now() / 1000);

    const priceOf = (token: Address): Amount | null => {
      if (token.toLowerCase() === ADDRESSES.Avians.toLowerCase()) return ETH_PER_AVIAN;
      return board.prices.find((p) => p.address.toLowerCase() === token.toLowerCase())?.ethPerToken ?? null;
    };
    const value = (amount: Amount, decimals: number, price: Amount | null): Amount | null =>
      (price === null ? null : (amount * price) / 10n ** BigInt(decimals));

    // AVIAN first, then by value descending, unpriced last: the order the
    // wiring produces, so the view never sorts.
    // The stakers' stream (part 19): its own clock, and what it has paid.
    // Never funded pays nothing; every other scene has paid STAKING_PAID.
    const stakers = {
      periodFinish: firstDay || s.stakers === 'unfunded' ? 0
        : s.stakers === 'ended' ? now - 2 * 86_400
          : now + 5 * 86_400,
      totalPaid: firstDay || s.stakers === 'unfunded' ? 0n : STAKING_PAID,
    };
    // The Nest's own totals, then the stakers' on their own, exactly as the
    // chain read sums them: the unlisted scene still counts the stakers.
    const nestPaid = firstDay ? [] : w.nest.streams.map((st) => ({
      token: st.token.address, symbol: st.token.symbol, decimals: st.token.decimals, amount: st.totalPaid,
    }));
    const paid: PaidOut[] = countStakers(nestPaid, { token: ADDRESSES.Avians, symbol: 'AVIAN', decimals: 18 }, stakers.totalPaid)
      .map((p) => ({ ...p, ethValue: value(p.amount, p.decimals, priceOf(p.token)) }))
      .sort((a, b) => {
        const av = a.symbol === 'AVIAN', bv = b.symbol === 'AVIAN';
        if (av !== bv) return av ? -1 : 1;
        if (a.ethValue === null || b.ethValue === null) return a.ethValue === null ? (b.ethValue === null ? 0 : 1) : -1;
        return a.ethValue === b.ethValue ? 0 : a.ethValue > b.ethValue ? -1 : 1;
      });

    const burnedAvian = firstDay ? 0n : roost.burned;
    const allocated = firstDay ? 0n : roost.cumulativeIn - roost.unallocated;

    return {
      readAt: now,
      blockNumber: 62_190_576 + (now % 1000),
      birds: {
        minted: firstDay ? 312 : w.collection.totalMinted,
        maxSupply: w.collection.maxSupply,
        burned: firstDay ? 0 : w.collection.burned,
        brooding: firstDay ? 0 : w.nest.totalBrooding,
        onPerch: firstDay ? 0 : w.perch.poolSize,
        perchBuysAt: w.perch.sell,
      },
      avian: {
        ethPerAvian: ETH_PER_AVIAN,
        // What the Treasury's tenth has bought for the Roost, ever (2026-09-22).
        boughtForRoost: firstDay ? 0n : e18(2_508_000),
        totalSupply: AVIANS_SUPPLY - burnedAvian,
        burned: burnedAvian,
        originalSupply: AVIANS_SUPPLY,
        staked: firstDay ? 0n : staking.totalStaked,
      },
      roost: {
        allocated,
        toStaking: firstDay ? 0n : roost.toStaking,
        toNest: firstDay ? 0n : roost.toNest,
        burned: burnedAvian,
        // The live day counts down to a turn; 'turn-due' is the Roost's own
        // ready scene, the turn due now. (The Roost's default scene is that
        // ready one, so the live day sets a turn of its own when the Roost's
        // is already due.)
        nextDistributeAt: firstDay ? null
          : s.flywheel === 'turn-due' ? now
            : roost.nextDistributionAt > now ? roost.nextDistributionAt : now + 19 * 3600 + 12 * 60 + 7,
      },
      usd: s.flywheel === 'no-usd' ? null : { usdPerEth: USD_PER_ETH },
      paid,
      stakers,
    };
  });
}
