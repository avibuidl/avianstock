// The Roost and AVIANS staking, read from the chain and written to it.
//
// THE ROOST (2026-09-18). Where every AVIANS fee lands — the whole of every
// Perch fee and every brooding tier cost — and is split by a rule nobody can
// change: 40% streamed to AVIANS stakers, 30% to brooding birds through the
// Nest, 20% burnt, 10% the admin's. Anyone may turn it once a day; the site
// offers the turn when it is due and says why when it is not.
//
// AVIANS STAKING. Stake AVIANS, earn AVIANS, by amount, streamed over a week
// from each delivery. No lock, no cooldown, no fee, no owner. `stake` needs
// an AVIANS approval to the staking contract — the fourth approval in
// HANDOVER section 2's sense, and approve-only: `stake(amount)` takes no
// permit signature, so a "permit" here would be its own transaction.
//
// The same rules as every other read here: block-pinned, and a failure is a
// failure. Nothing below returns a zero it did not read.

import { parseEventLogs, type Abi } from 'viem';
import { pin, readMany, type At } from './client';
import { contracts, roostContracts } from './manifest';
import { aviansAbi, aviansStakingAbi, theRoostAbi } from './abis.generated';
import { guard } from './reads';
import { run } from './writes';
import { estimateSince } from '../lib/stream';
import type {
  Address, Amount, DeliverResult, DistributeResult, Hex, OnPhase, RoostState, StakingState, UnixSeconds,
} from '../mock/types';

// ── reads ─────────────────────────────────────────────────────────────────

export async function getRoost(at?: At): Promise<RoostState> {
  return guard('reading the Roost', async () => {
    const a = at ?? await pin();
    const { roost } = roostContracts();
    const r = (functionName: string) => ({ address: roost, abi: theRoostAbi as unknown as Abi, functionName });
    const [
      cumulativeIn, unallocated, toStaking, toNest, burned, adminClaimed, adminClaimable,
      stakingHeld, nestHeld, stakingReady, nestReady, nextAt,
      stakingBps, nestBps, burnBps, adminBps, admin,
    ] = await readMany<unknown>([
      r('cumulativeIn'), r('unallocated'), r('toStaking'), r('toNest'), r('burned'), r('adminClaimed'), r('adminClaimable'),
      r('stakingHeld'), r('nestHeld'), r('stakingReady'), r('nestReady'), r('nextDistributionAt'),
      r('STAKING_BPS'), r('NEST_BPS'), r('BURN_BPS'), r('ADMIN_BPS'), r('admin'),
    ], a);
    // `xReady()` returns (bool, string); viem hands that back as a tuple or,
    // when the outputs are named, as an object. Read it either way.
    const leg = (v: unknown) => {
      const t = Array.isArray(v) ? v as [boolean, string] : null;
      const o = t ? null : v as { ready?: boolean; reason?: string };
      return { ready: !!(t ? t[0] : o?.ready), reason: String(t ? t[1] : o?.reason ?? '') };
    };
    return {
      cumulativeIn: cumulativeIn as Amount,
      unallocated: unallocated as Amount,
      toStaking: toStaking as Amount,
      toNest: toNest as Amount,
      burned: burned as Amount,
      adminClaimed: adminClaimed as Amount,
      adminClaimable: adminClaimable as Amount,
      staking: { held: stakingHeld as Amount, ...leg(stakingReady) },
      nest: { held: nestHeld as Amount, ...leg(nestReady) },
      nextDistributionAt: Number(nextAt as bigint), /* count */
      chainNow: a.timestamp,
      splitBps: {
        staking: Number(stakingBps as bigint), /* count */
        nest: Number(nestBps as bigint), /* count */
        burn: Number(burnBps as bigint), /* count */
        admin: Number(adminBps as bigint), /* count */
      },
      admin: admin as Address,
    };
  });
}

export async function getStaking(who: Address | null, at?: At): Promise<StakingState> {
  return guard('reading the staking', async () => {
    const a = at ?? await pin();
    const { staking } = roostContracts();
    const c = contracts();
    const s = (functionName: string, args: readonly unknown[] = []) =>
      ({ address: staking, abi: aviansStakingAbi as unknown as Abi, functionName, args });
    const [totalStaked, rewardRate, periodFinish, remainingReward, undelivered, stream] = await readMany<unknown>([
      s('totalStaked'), s('rewardRate'), s('periodFinish'), s('remainingReward'), s('undelivered'), s('STREAM'),
    ], a);
    const [staked, earned, balance, allowance] = who
      ? await readMany<bigint>([
        s('stakedOf', [who]), s('earned', [who]),
        { address: c.Avians, abi: aviansAbi as unknown as Abi, functionName: 'balanceOf', args: [who] },
        { address: c.Avians, abi: aviansAbi as unknown as Abi, functionName: 'allowance', args: [who, staking] },
      ], a)
      : [0n, 0n, 0n, 0n];
    return {
      staked, earned, aviansBalance: balance, allowance,
      totalStaked: totalStaked as Amount,
      // Raw, as the contract keeps it: base units per second scaled by 1e18 —
      // the same scale as the Nest's, so one estimator serves both streams.
      rewardRate: rewardRate as bigint,
      periodFinish: Number(periodFinish as bigint), /* count */
      remainingReward: remainingReward as Amount,
      undelivered: undelivered as Amount,
      streamSeconds: Number(stream as bigint), /* count */
      chainNow: a.timestamp,
    };
  });
}

/**
 * THE ROOST SCREEN'S ONE READ. The Roost and the staking card under one pin,
 * their calls in one multicall — so a refresh every few seconds is one
 * request at one block, and the wallet's figures never come from a different
 * block than the pool's.
 */
export async function getRoostScreen(who: Address | null): Promise<{ roost: RoostState; staking: StakingState }> {
  const a = await pin();
  const [roost, staking] = await Promise.all([getRoost(a), getStaking(who, a)]);
  return { roost, staking };
}

/**
 * What a staker has earned NOW, carried forward from the last read by the
 * stream's arithmetic: `rewardRate × staked / totalStaked / 1e18` per second
 * since the read, up to `periodFinish`, never below what was read. The claim
 * button uses the chain's figure; this is what the counter shows between
 * reads. Pure: tests/estimate.test.ts.
 */
export function estimateEarned(s: StakingState, now: UnixSeconds): Amount {
  return estimateSince({
    atRead: s.earned, rate: s.rewardRate, share: s.staked, total: s.totalStaked,
    periodFinish: s.periodFinish, chainNowAtRead: s.chainNow, now,
  });
}

// ── the Roost's writes ────────────────────────────────────────────────────

const LEG = (v: unknown): 'staking' | 'nest' => (Number(v) === 1 ? 'nest' : 'staking');

/** What the receipt says the turn did. */
export function distributeEvents(logs: unknown[]): DistributeResult {
  const ev = (name: string) => parseEventLogs({
    abi: theRoostAbi as unknown as Abi, logs: logs as never, eventName: name as never,
  }) as unknown as { args: Record<string, unknown> }[];
  const b = (x: unknown) => (x as bigint) ?? 0n;
  const alloc = ev('Allocated')[0];
  return {
    allocated: alloc ? {
      inflow: b(alloc.args.inflow), toStaking: b(alloc.args.toStaking), toNest: b(alloc.args.toNest),
      toBurn: b(alloc.args.toBurn), toAdmin: b(alloc.args.toAdmin),
    } : null,
    delivered: ev('Delivered').map((e) => ({ leg: LEG(e.args.leg), amount: b(e.args.amount) })),
    held: ev('Held').map((e) => ({ leg: LEG(e.args.leg), amount: b(e.args.amount), reason: String(e.args.reason ?? '') })),
    burned: ev('Burned').reduce((sum, e) => sum + b(e.args.amount), 0n),
  };
}

/**
 * Turn the Roost. Simulated first, so `TooSoon(nextAt)` and
 * `NothingToDistribute()` arrive by name before the wallet opens.
 */
/**
 * Send a held leg on (2026-09-19). Anyone, any time, no interval: splits
 * nothing and leaves the day's clock alone. Simulated first, so
 * `NothingHeld()` and `NothingDeliverable()` arrive by name; the receipt
 * carries the same `Delivered` / `Held` events a turn does.
 */
export async function deliverHeld(on?: OnPhase): Promise<DeliverResult & { hash: Hex }> {
  const { roost } = roostContracts();
  const { hash, logs } = await run({
    where: 'delivering a held share',
    to: roost, abi: theRoostAbi, functionName: 'deliverHeld', args: [],
  }, { on });
  const ev = distributeEvents(logs);
  return { delivered: ev.delivered, held: ev.held, hash };
}

export async function distribute(on?: OnPhase): Promise<DistributeResult & { hash: Hex }> {
  const { roost } = roostContracts();
  const { hash, logs } = await run({
    where: 'turning the Roost',
    to: roost, abi: theRoostAbi, functionName: 'distribute', args: [],
  }, { on });
  return { ...distributeEvents(logs), hash };
}

// ── staking writes ────────────────────────────────────────────────────────

/** The fourth approval: AVIANS to the staking contract, for `stake`. */
export async function approveAviansForStaking(amount: Amount, on?: OnPhase) {
  const { hash } = await run({
    where: 'approving AVIANS for staking',
    to: contracts().Avians, abi: aviansAbi, functionName: 'approve',
    args: [roostContracts().staking, amount],
  }, { on });
  return { hash };
}

const stakingPlan = (where: string, functionName: string, args: readonly unknown[] = []) => ({
  where, to: roostContracts().staking, abi: aviansStakingAbi, functionName, args,
});

function paidFrom(logs: unknown[]): Amount {
  const paid = parseEventLogs({
    abi: aviansStakingAbi as unknown as Abi, logs: logs as never, eventName: 'RewardPaid' as never,
  }) as unknown as { args: { amount?: bigint } }[];
  return paid.reduce((sum, e) => sum + (e.args.amount ?? 0n), 0n);
}

export async function stake(amount: Amount, on?: OnPhase): Promise<{ hash: Hex }> {
  if (amount <= 0n) throw new Error('nothing to stake');   // ZeroAmount is the contract's; the button is disabled first
  const { hash } = await run(stakingPlan('staking AVIANS', 'stake', [amount]), { on, price: amount });
  return { hash };
}

export async function withdrawStake(amount: Amount, on?: OnPhase): Promise<{ hash: Hex }> {
  if (amount <= 0n) throw new Error('nothing to withdraw');
  const { hash } = await run(stakingPlan('withdrawing AVIANS', 'withdraw', [amount]), { on });
  return { hash };
}

export async function claimStakingReward(on?: OnPhase): Promise<{ hash: Hex; paid: Amount }> {
  const { hash, logs } = await run(stakingPlan('claiming AVIANS', 'claim'), { on });
  return { hash, paid: paidFrom(logs) };
}

/** Withdraw everything and claim, in one transaction. */
export async function exitStaking(on?: OnPhase): Promise<{ hash: Hex; paid: Amount }> {
  const { hash, logs } = await run(stakingPlan('leaving the staking', 'exit'), { on });
  return { hash, paid: paidFrom(logs) };
}
