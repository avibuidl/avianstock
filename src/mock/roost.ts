// The Roost and AVIANS staking, without a chain.
//
// Two scenario axes drive it: `roost` (unallocated and both legs ready / a
// held Nest leg / too soon to turn) and `staking` (a stake with a live stream
// mid-week / nothing staked). A distribute and the four staking writes move
// the overlay, so a walkthrough can turn it and stake and see the figures
// change — with the same forced-failure hook every other mock write has.

import type { Address, Amount, DeliverResult, DistributeResult, OnPhase, RoostState, StakingState } from './types';
import { ContractError } from './errors';
import { scenario, subscribeScenario, takeForcedError } from './scenario';
import { ADDRESSES, YOU, overlay, world } from './fixtures';
import { read } from './reads';
import { requireChain, sleep } from './wallet';
import { settled } from './writes';

const e18 = (n: number) => BigInt(n) * 10n ** 18n;
const DAY = 86_400;
const WEEK = 604_800;
const BPS = { staking: 4000, nest: 3000, burn: 2000, admin: 1000 };
const PRECISION = 10n ** 18n;

/** The fixture's lifetime figures: what the Roost has split so far. */
const LIFETIME = { toStaking: e18(1_236_000), toNest: e18(927_000), burned: e18(618_000), adminClaimed: e18(240_000) };

/** This session's turns and stakes, on top of the fixture. */
const roostOverlay = {
  distributedAt: null as number | null,
  distributedInflow: 0n,
  staked: null as Amount | null,
  claimedReward: 0n,
  allowance: null as Amount | null,
  /** A held leg sent on this session: the held amount that now streams. */
  deliveredStaking: 0n,
  deliveredNest: 0n,
  deliveredAt: null as number | null,
};

/** The staking leg an earlier turn left waiting (2026-09-19's scene). */
const HELD_STAKING = e18(8_000);
const HELD_NEST_BROODING = e18(6_000);

/** Reset with the scenario, like the rest of the overlay. (Subscribed here, not from fixtures: that would be an import cycle.) */
function resetRoost() {
  roostOverlay.distributedAt = null;
  roostOverlay.distributedInflow = 0n;
  roostOverlay.staked = null;
  roostOverlay.claimedReward = 0n;
  roostOverlay.allowance = null;
  roostOverlay.deliveredStaking = 0n;
  roostOverlay.deliveredNest = 0n;
  roostOverlay.deliveredAt = null;
}
subscribeScenario(resetRoost);

function unallocatedNow(): Amount {
  const s = scenario();
  const base = s.roost === 'too-soon' ? e18(4_200) : e18(318_500);
  // A turn this session split everything that had arrived.
  return roostOverlay.distributedAt ? 0n : base;
}

export function getRoost(): Promise<RoostState> {
  return read(() => {
    const s = scenario();
    const now = Math.floor(Date.now() / 1000);
    const heldStaking = (s.staking === 'held-with-staker' || s.staking === 'held-nobody-staked') && roostOverlay.deliveredStaking === 0n ? HELD_STAKING : 0n;
    const nestHeld = s.roost === 'nest-held' ? e18(95_550)
      : s.roost === 'nest-held-brooding' && roostOverlay.deliveredNest === 0n ? HELD_NEST_BROODING : 0n;
    const lastTurn = roostOverlay.distributedAt
      ?? (s.roost === 'too-soon' ? now - 5 * 3600 : now - 2 * DAY);
    const extra = roostOverlay.distributedInflow;
    const stakedTotal = totalStakedNow();
    return {
      cumulativeIn: LIFETIME.toStaking + LIFETIME.toNest + LIFETIME.burned + LIFETIME.adminClaimed + e18(30_900) + unallocatedNow() + nestHeld + extra,
      unallocated: unallocatedNow(),
      toStaking: LIFETIME.toStaking + (extra * 4000n) / 10_000n,
      toNest: LIFETIME.toNest + (extra * 3000n) / 10_000n,
      burned: LIFETIME.burned + (extra * 2000n) / 10_000n,
      adminClaimed: LIFETIME.adminClaimed,
      adminClaimable: e18(30_900) + (extra * 1000n) / 10_000n,
      staking: stakedTotal > 0n
        ? { held: heldStaking, ready: true, reason: '' }
        : { held: heldStaking + (roostOverlay.distributedAt ? (extra * 4000n) / 10_000n : 0n), ready: false, reason: 'nothing is staked' },
      nest: s.roost === 'nest-held'
        ? { held: nestHeld, ready: false, reason: 'nothing is brooding' }
        : { held: nestHeld, ready: true, reason: '' },
      nextDistributionAt: lastTurn + DAY,
      chainNow: now,
      splitBps: BPS,
      admin: s.admin === 'owner' ? YOU : ADDRESSES.Treasury,
    };
  });
}

function totalStakedNow(): Amount {
  const s = scenario();
  // 'held-nobody-staked' is the 2026-09-19 scene: nobody at all.
  // 'held-with-staker': this wallet alone, 50,000, as the owner staked.
  const others = s.staking === 'nothing-staked' ? e18(2_140_000)
    : s.staking === 'held-with-staker' || s.staking === 'held-nobody-staked' ? 0n
      : e18(8_650_000);
  return others + myStakeNow();
}

function myStakeNow(): Amount {
  if (roostOverlay.staked !== null) return roostOverlay.staked;
  const s = scenario().staking;
  return s === 'mid-week' ? e18(250_000) : s === 'held-with-staker' ? e18(50_000) : 0n;
}

export function getStaking(_who: Address | null): Promise<StakingState> {
  return read(() => {
    const s = scenario();
    const w = world();
    const now = Math.floor(Date.now() / 1000);
    const staked = myStakeNow();
    const total = totalStakedNow();
    // A delivery of 494,400 AVIANS, three and a half days into its week. In
    // the held scenes nothing has been delivered until this session's DELIVER
    // sends the held 8,000 on, which then streams from that moment.
    const heldScene = s.staking === 'held-with-staker' || s.staking === 'held-nobody-staked';
    const delivered = heldScene ? roostOverlay.deliveredStaking : e18(494_400);
    const started = heldScene ? (roostOverlay.deliveredAt ?? now) : now - Math.floor(WEEK / 2);
    const periodFinish = delivered > 0n ? started + WEEK : 0;
    const perSec = delivered / BigInt(WEEK);
    // The chain keeps the rate scaled by 1e18; so does the mock.
    const rate = perSec * PRECISION;
    const elapsed = BigInt(Math.max(0, Math.min(now, periodFinish) - started));
    const streamed = perSec * elapsed;
    const remaining = delivered - streamed;
    // My share of what has streamed since I staked (the fixture staked at the start).
    const earnedBase = total > 0n && staked > 0n ? (streamed * staked) / total : 0n;
    const earned = earnedBase > roostOverlay.claimedReward ? earnedBase - roostOverlay.claimedReward : 0n;
    // Seconds nobody was staked for, from an earlier week: streamed again next time.
    const undeliveredExtra = s.staking === 'mid-week' ? e18(12_360) : 0n;
    return {
      staked,
      earned,
      aviansBalance: w.wallet.avians,
      allowance: roostOverlay.allowance ?? (s.approvals === 'sufficient' ? e18(1_000_000) : 0n),
      totalStaked: total,
      rewardRate: rate,
      periodFinish,
      remainingReward: remaining,
      undelivered: remaining + undeliveredExtra,
      streamSeconds: WEEK,
      chainNow: now,
    };
  });
}

// ── writes ────────────────────────────────────────────────────────────────

async function send<T>(on: OnPhase | undefined, make: () => T): Promise<T & { hash: `0x${string}` }> {
  requireChain();
  const forced = takeForcedError();
  on?.('signing');
  await sleep(650);
  if (forced) throw new ContractError(forced);
  const h = `0x${Array.from({ length: 64 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('')}` as `0x${string}`;
  on?.('pending', h);
  await sleep(1400);
  const out = make();
  on?.('confirmed', h);
  settled();
  return { ...out, hash: h };
}

export async function distribute(on?: OnPhase): Promise<DistributeResult & { hash: `0x${string}` }> {
  const r = await getRoost();
  if (r.chainNow < r.nextDistributionAt) throw new ContractError('TooSoon', { at: r.nextDistributionAt });
  const inflow = r.unallocated;
  const canDeliver = r.staking.ready ? r.staking.held : 0n;
  if (inflow === 0n && !(r.nest.ready && r.nest.held > 0n) && canDeliver === 0n) throw new ContractError('NothingToDistribute');
  return send(on, () => {
    roostOverlay.distributedAt = Math.floor(Date.now() / 1000);
    roostOverlay.distributedInflow += inflow;
    const toStaking = (inflow * 4000n) / 10_000n;
    const toNest = (inflow * 3000n) / 10_000n;
    const toBurn = (inflow * 2000n) / 10_000n;
    const toAdmin = inflow - toStaking - toNest - toBurn;
    const delivered: DistributeResult['delivered'] = [];
    const held: DistributeResult['held'] = [];
    if (r.staking.ready) delivered.push({ leg: 'staking', amount: toStaking + r.staking.held });
    else held.push({ leg: 'staking', amount: toStaking, reason: r.staking.reason });
    if (r.nest.ready) delivered.push({ leg: 'nest', amount: toNest + r.nest.held });
    else held.push({ leg: 'nest', amount: toNest + r.nest.held, reason: r.nest.reason });
    return { allocated: inflow > 0n ? { inflow, toStaking, toNest, toBurn, toAdmin } : null, delivered, held, burned: toBurn };
  });
}

/** The Roost screen's one read, as the chain does it: both under one clock. */
export async function getRoostScreen(who: Address | null): Promise<{ roost: RoostState; staking: StakingState }> {
  const [roost, staking] = await Promise.all([getRoost(), getStaking(who)]);
  return { roost, staking };
}

/** Send a held leg on: the moment its destination can take it, no interval. */
export async function deliverHeld(on?: OnPhase): Promise<DeliverResult & { hash: `0x${string}` }> {
  const r = await getRoost();
  if (r.staking.held === 0n && r.nest.held === 0n) throw new ContractError('NothingHeld');
  const canStaking = r.staking.held > 0n && r.staking.ready;
  const canNest = r.nest.held > 0n && r.nest.ready;
  if (!canStaking && !canNest) throw new ContractError('NothingDeliverable');
  return send(on, () => {
    const delivered: DeliverResult['delivered'] = [];
    const held: DeliverResult['held'] = [];
    if (canStaking) {
      roostOverlay.deliveredStaking = r.staking.held;
      roostOverlay.deliveredAt = Math.floor(Date.now() / 1000);
      delivered.push({ leg: 'staking', amount: r.staking.held });
    } else if (r.staking.held > 0n) held.push({ leg: 'staking', amount: r.staking.held, reason: r.staking.reason });
    if (canNest) { roostOverlay.deliveredNest = r.nest.held; delivered.push({ leg: 'nest', amount: r.nest.held }); }
    else if (r.nest.held > 0n) held.push({ leg: 'nest', amount: r.nest.held, reason: r.nest.reason });
    return { delivered, held };
  });
}

export async function approveAviansForStaking(amount: Amount, on?: OnPhase) {
  return send(on, () => { roostOverlay.allowance = amount; return {}; });
}

export async function stake(amount: Amount, on?: OnPhase) {
  const w = world();
  if (amount <= 0n) throw new ContractError('ZeroAmount');
  const s = await getStaking(YOU);
  if (w.wallet.avians < amount || s.allowance < amount) throw new ContractError('TransferFromFailed', { price: amount });
  return send(on, () => {
    roostOverlay.staked = myStakeNow() + amount;
    roostOverlay.allowance = s.allowance - amount;
    overlay.spent += amount;
    return {};
  });
}

export async function withdrawStake(amount: Amount, on?: OnPhase) {
  if (amount <= 0n) throw new ContractError('ZeroAmount');
  const mine = myStakeNow();
  if (amount > mine) throw new ContractError('InsufficientStake', { staked: mine, wanted: amount });
  return send(on, () => {
    roostOverlay.staked = mine - amount;
    overlay.spent -= amount;
    return {};
  });
}

export async function claimStakingReward(on?: OnPhase) {
  const s = await getStaking(YOU);
  return send(on, () => {
    roostOverlay.claimedReward += s.earned;
    overlay.spent -= s.earned;
    return { paid: s.earned };
  });
}

export async function exitStaking(on?: OnPhase) {
  const s = await getStaking(YOU);
  const mine = myStakeNow();
  return send(on, () => {
    roostOverlay.claimedReward += s.earned;
    roostOverlay.staked = 0n;
    overlay.spent -= mine + s.earned;
    return { paid: s.earned };
  });
}
