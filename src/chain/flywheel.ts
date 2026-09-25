// The flywheel snapshot (2026-09-22): the landing page's live figures, from
// the chain.
//
// ONE PIN, ONE MULTICALL. Every figure is read at one block: the collection's
// counts, the Nest's, the perch's, the supply, the staking pool, the Roost's
// counters, the launch pool's price, every listed token's paid total, the
// band's price reads and the dollar pool's. What the multicall needs to know
// first — which tokens are listed, which pools price them, which pool is the
// dollar source, what the launch pool's key is — is resolved once per
// deployment and remembered, so the steady state is the one batch; the
// listing rides along in it, and a listing that moved re-runs the batch once.
//
// WHAT IS NOT HERE. Nothing from the lockers' distributor, veiled or not: the
// founder will say when. `toLockers` is read with the Roost's other counters
// and dropped, because the snapshot has no field for the leg.
//
// PRICES. AVIAN's is the launch pool's mid-price, `StateView.getSlot0` on the
// pool id, not the quoter's figure, which carries the hook's fee. Every other
// token's is the band's. A dollar figure exists only while the dollar pool
// answers: never stale, never made up.

import type { Abi, Hex } from 'viem';
import { pin, tryReadMany, type At, type Attempt } from './client';
import { contracts, manifest, roostContracts, thirdParty } from './manifest';
import {
  avianStockAbi, aviansAbi, aviansStakingAbi, stateViewAbi, theNestAbi, thePerchAbi, theRoostAbi,
  treasuryAbi,
} from './abis.generated';
import { guard, tokenMeta } from './reads';
import { canSwap, poolKey } from './swap';
import { decodePrices, decodeUsd, ensureResolved, ethPerToken, onTheBand, priceReads, usdReads, usdSource } from './prices';
import { poolIdOf } from '../lib/pool-id';
import { countStakers, type PaidIn } from '../lib/paid';
import type { Address, Amount, FlywheelSnapshot, PaidOut } from '../mock/types';

const BPS = 10_000n;

/** The listing the last refresh saw, so the next one's batch can carry the per-token reads without asking first. */
let lastListing: { id: string; listed: Address[] } | null = null;

export function resetFlywheel() { lastListing = null; }

/**
 * AVIAN first, then by value descending, unpriced last. Pure, so the view
 * never sorts and the order is testable.
 */
export function orderPaid(list: readonly PaidOut[], avian: Address): PaidOut[] {
  const isAvian = (p: PaidOut) => p.token.toLowerCase() === avian.toLowerCase();
  return [...list].sort((a, b) => {
    const av = isAvian(a), bv = isAvian(b);
    if (av !== bv) return av ? -1 : 1;
    if (a.ethValue === null || b.ethValue === null) return a.ethValue === null ? (b.ethValue === null ? 0 : 1) : -1;
    return a.ethValue === b.ethValue ? 0 : a.ethValue > b.ethValue ? -1 : 1;
  });
}

/** An amount of a token at a price: ETH, 18 decimals; null with no price. */
export function ethValueOf(amount: Amount, decimals: number, ethPerOne: Amount | null): Amount | null {
  return ethPerOne === null ? null : (amount * ethPerOne) / 10n ** BigInt(decimals);
}

/** A counter as a bigint. viem hands a uint48 or smaller back as a number, so both are taken. */
const big = (a: Attempt<unknown>, name: string): bigint => {
  if (!a.ok) throw new Error(`${name} did not read`);
  if (typeof a.value === 'bigint') return a.value;
  if (typeof a.value === 'number' && Number.isInteger(a.value)) return BigInt(a.value);
  throw new Error(`${name} did not read`);
};

export async function getFlywheel(at?: At): Promise<FlywheelSnapshot> {
  return guard('reading the flywheel', async () => {
    const a = at ?? await pin();
    const m = manifest();
    const c = contracts();
    const { roost, staking } = roostContracts();
    const call = (address: Address, abi: unknown, functionName: string, args: readonly unknown[] = []) =>
      ({ address, abi: abi as Abi, functionName, args });

    // What the batch needs to know first, remembered across refreshes.
    const [launch, usd] = await Promise.all([
      canSwap() ? poolKey(a).then((k) => poolIdOf(k)) : Promise.resolve<Hex | null>(null),
      usdSource(a),
    ]);
    let listed: Address[];
    if (lastListing && lastListing.id === m.id) {
      listed = lastListing.listed;
    } else {
      // The first refresh on a deployment asks for the listing on its own;
      // every later one carries it in the batch.
      const [l] = await tryReadMany<readonly Address[]>([call(c.TheNest, theNestAbi, 'listedRewardTokens')], a);
      listed = l.ok ? [...l.value] : [];
    }
    const stateView = thirdParty()?.StateView ?? null;

    for (let attempt = 0; attempt < 2; attempt++) {
      const resolved = await ensureResolved(onTheBand(listed), a);
      // AVIAN's own name and decimals even when the Nest does not list it: the
      // stakers' payouts are counted either way (part 19).
      const meta = await tokenMeta(listed.some((t) => t.toLowerCase() === c.Avians.toLowerCase()) ? listed : [...listed, c.Avians], a);

      const fixed = [
        call(c.AvianStock, avianStockAbi, 'totalMinted'),
        call(c.AvianStock, avianStockAbi, 'MAX_SUPPLY'),
        call(c.AvianStock, avianStockAbi, 'burned'),
        call(c.TheNest, theNestAbi, 'totalBrooding'),
        call(c.TheNest, theNestAbi, 'listedRewardTokens'),
        call(c.ThePerch, thePerchAbi, 'poolSize'),
        call(c.ThePerch, thePerchAbi, 'BASE'),
        call(c.ThePerch, thePerchAbi, 'SELL_FEE_BPS'),
        call(c.Avians, aviansAbi, 'TOTAL_SUPPLY'),
        call(c.Avians, aviansAbi, 'totalSupply'),
        call(staking, aviansStakingAbi, 'totalStaked'),
        call(staking, aviansStakingAbi, 'totalPaid'),
        call(roost, theRoostAbi, 'allocated'),
        call(roost, theRoostAbi, 'toStaking'),
        call(roost, theRoostAbi, 'toNest'),
        call(roost, theRoostAbi, 'burned'),
        call(roost, theRoostAbi, 'nextDistributionAt'),
        call(roost, theRoostAbi, 'toLockers'),
        // The Treasury's buys for the Roost, ever (2026-09-22). Read with the
        // rest; a Treasury that predates the leg leaves it at zero.
        call(c.Treasury, treasuryAbi, 'aviansToRoost'),
        // The stakers' own stream (part 19): when it ends, 0 until first funded.
        call(staking, aviansStakingAbi, 'periodFinish'),
      ];
      const launchRead = launch && stateView ? [call(stateView, stateViewAbi, 'getSlot0', [launch])] : [];
      const paidReads = listed.map((token) => call(c.TheNest, theNestAbi, 'totalPaid', [token]));
      const prices = priceReads(resolved);
      const dollars = usd ? usdReads(usd) : [];

      const answers = await tryReadMany<unknown>([...fixed, ...launchRead, ...paidReads, ...prices, ...dollars], a);
      let i = 0;
      const next = () => answers[i++];
      const f = fixed.map(() => next());
      const launchAnswer = launchRead.length ? next() : null;
      const paidAnswers = paidReads.map(() => next());
      const priceAnswers = prices.map(() => next());
      const usdAnswers = dollars.map(() => next());

      // The listing moved under us: remember the new one and go round once more.
      const listedNow = f[4];
      if (!listedNow.ok || !Array.isArray(listedNow.value)) throw listedNow.ok ? new Error('the listing did not read') : listedNow.error;
      const nowKey = (listedNow.value as Address[]).map((x) => x.toLowerCase()).join(',');
      if (nowKey !== listed.map((x) => x.toLowerCase()).join(',')) {
        listed = [...(listedNow.value as Address[])];
        lastListing = { id: m.id, listed };
        continue;
      }
      lastListing = { id: m.id, listed };

      const base = big(f[6], 'ThePerch.BASE');
      const perchBuysAt = base - (base * big(f[7], 'ThePerch.SELL_FEE_BPS')) / BPS;
      const originalSupply = big(f[8], 'Avians.TOTAL_SUPPLY');
      const totalSupply = big(f[9], 'Avians.totalSupply');
      const nextAt = Number(big(f[16], 'TheRoost.nextDistributionAt')); /* count */
      // `toLockers` (f[17]) is read with the rest and dropped: no field for the leg.

      // AVIAN's price: the launch pool's mid-price, null with no pool or no answer.
      let ethPerAvian: Amount | null = null;
      if (launchAnswer && launchAnswer.ok) {
        const v = launchAnswer.value as unknown;
        const sqrt = Array.isArray(v) ? v[0] : (v as { sqrtPriceX96?: bigint })?.sqrtPriceX96;
        if (typeof sqrt === 'bigint' && sqrt > 0n) {
          ethPerAvian = ethPerToken({ sqrtPriceX96: sqrt, tokenIsToken1: true, tokenDecimals: 18, wethDecimals: 18 });
        }
      }

      const board = decodePrices(resolved, priceAnswers);
      const priceOf = (token: Address): Amount | null => {
        if (token.toLowerCase() === c.Avians.toLowerCase()) return ethPerAvian;
        return board.find((p) => p.address.toLowerCase() === token.toLowerCase())?.ethPerToken ?? null;
      };
      const stakingPaid = big(f[11], 'AviansStaking.totalPaid');
      // The Nest's own totals first, then the stakers' on their own: onto
      // AVIAN's entry when the Nest lists it, as its entry alone when not.
      const nestPaid: PaidIn[] = [];
      listed.forEach((token, k) => {
        const mt = meta.get(token.toLowerCase());
        const answer = paidAnswers[k];
        if (!mt || !answer.ok || typeof answer.value !== 'bigint') return;
        nestPaid.push({ token, symbol: mt.symbol, decimals: mt.decimals, amount: answer.value });
      });
      const avianMeta = meta.get(c.Avians.toLowerCase());
      const withStakers = avianMeta
        ? countStakers(nestPaid, { token: c.Avians, symbol: avianMeta.symbol, decimals: avianMeta.decimals }, stakingPaid)
        : nestPaid;
      const paid: PaidOut[] = withStakers.map((p) => ({ ...p, ethValue: ethValueOf(p.amount, p.decimals, priceOf(p.token)) }));

      const usdPerEth = usd ? decodeUsd(usd, usdAnswers) : null;

      return {
        readAt: a.timestamp,
        blockNumber: Number(a.blockNumber), /* count */
        birds: {
          minted: Number(big(f[0], 'AvianStock.totalMinted')), /* count */
          maxSupply: Number(big(f[1], 'AvianStock.MAX_SUPPLY')), /* count */
          burned: Number(big(f[2], 'AvianStock.burned')), /* count */
          brooding: Number(big(f[3], 'TheNest.totalBrooding')), /* count */
          onPerch: Number(big(f[5], 'ThePerch.poolSize')), /* count */
          perchBuysAt,
        },
        avian: {
          ethPerAvian,
          boughtForRoost: f[18].ok && typeof f[18].value === 'bigint' ? f[18].value : 0n,
          totalSupply,
          burned: originalSupply - totalSupply,
          originalSupply,
          staked: big(f[10], 'AviansStaking.totalStaked'),
        },
        roost: {
          allocated: big(f[12], 'TheRoost.allocated'),
          toStaking: big(f[13], 'TheRoost.toStaking'),
          toNest: big(f[14], 'TheRoost.toNest'),
          burned: big(f[15], 'TheRoost.burned'),
          nextDistributeAt: nextAt === 0 ? null : nextAt,
        },
        usd: usdPerEth === null ? null : { usdPerEth },
        paid: orderPaid(paid, c.Avians),
        stakers: {
          periodFinish: Number(big(f[19], 'AviansStaking.periodFinish')), /* count */
          totalPaid: stakingPaid,
        },
      };
    }
    throw new Error('the reward listing kept changing between reads');
  });
}
