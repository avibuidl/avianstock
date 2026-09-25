// The Roost and AVIAN staking, without a chain.
//
// Three scenario axes drive it: `roost` (unallocated and two legs ready / a
// held Nest leg / too soon to turn), `rotation` (which week of the three-week
// cycle, 2026-09-20) and `staking` (a stake with a live stream mid-week /
// nothing staked). A distribute and the four staking writes move the overlay,
// so a walkthrough can turn it and stake and see the figures change — with
// the same forced-failure hook every other mock write has. The lockers' leg
// is held in every scene, as it is on chain until the vault products exist.

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
const PRECISION = 10n ** 18n;
/** The contract's rotation: slot 0, 1, 2 as (stakers, brooders, lockers) in bps. */
const ROTATION = [
  { staking: 3500, nest: 3000, lockers: 2000 },
  { staking: 3000, nest: 2000, lockers: 3500 },
  { staking: 2000, nest: 3500, lockers: 3000 },
] as const;
const BURN_BPS = 500;
const ADMIN_BPS = 1000;
/** How far into its week each fixture is, so the rotation countdown reads differently in each. */
const ELAPSED_IN_WEEK = { 'week-0': 3 * DAY + 20 * 3600, 'week-1': 5 * DAY + 12 * 3600, 'week-2': 6 * DAY + 18 * 3600 + 1800 } as const;

/**
 * The fixture's lifetime figures: what the Roost has split so far, about
 * 3,000,000 over the cycle. The lockers' share was never delivered — nothing
 * is locked yet — so it sits in `lockersHeld` rather than `toLockers`.
 */
const LIFETIME = { toStaking: e18(850_000), toNest: e18(850_000), lockersHeld: e18(850_000), burned: e18(150_000), adminClaimed: e18(300_000) };

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
  /** This session's turns' lockers' shares, held: nothing is locked. */
  heldLockers: 0n,
  /** The clock's anchor: the scene was chosen at this second. */
  chosenAt: Math.floor(Date.now() / 1000),
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
  roostOverlay.heldLockers = 0n;
  roostOverlay.chosenAt = Math.floor(Date.now() / 1000);
}
subscribeScenario(resetRoost);

/** The rotation as the contract computes it, from a GENESIS placed so the scene's week is this one. */
function rotationNow(now: number) {
  const week = scenario().rotation;
  const slot = week === 'week-1' ? 1 : week === 'week-2' ? 2 : 0;
  const genesis = roostOverlay.chosenAt - (slot * WEEK + ELAPSED_IN_WEEK[week]);
  const weeks = Math.floor((now - genesis) / WEEK);
  const at = weeks % 3;
  return { split: ROTATION[at], nextSplit: ROTATION[(at + 1) % 3], nextRotationAt: genesis + (weeks + 1) * WEEK };
}

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
    const rot = rotationNow(now);
    const bps = (n: number) => (extra * BigInt(n)) / 10_000n;
    const lockersHeld = LIFETIME.lockersHeld + roostOverlay.heldLockers;
    return {
      cumulativeIn: LIFETIME.toStaking + LIFETIME.toNest + LIFETIME.lockersHeld + LIFETIME.burned + LIFETIME.adminClaimed + e18(30_900) + unallocatedNow() + nestHeld + extra,
      unallocated: unallocatedNow(),
      toStaking: LIFETIME.toStaking + bps(rot.split.staking),
      toNest: LIFETIME.toNest + bps(rot.split.nest),
      toLockers: 0n,
      burned: LIFETIME.burned + bps(BURN_BPS),
      adminClaimed: LIFETIME.adminClaimed,
      adminClaimable: e18(30_900) + bps(ADMIN_BPS),
      staking: stakedTotal > 0n
        ? { held: heldStaking, ready: true, reason: '' }
        : { held: heldStaking + (roostOverlay.distributedAt ? bps(rot.split.staking) : 0n), ready: false, reason: 'nothing is staked' },
      nest: s.roost === 'nest-held'
        ? { held: nestHeld, ready: false, reason: 'nothing is brooding' }
        : { held: nestHeld, ready: true, reason: '' },
      lockers: { held: lockersHeld, ready: false, reason: 'nothing is locked' },
      nextDistributionAt: lastTurn + DAY,
      chainNow: now,
      splitBps: { ...rot.split, burn: BURN_BPS, admin: ADMIN_BPS },
      nextRotationAt: rot.nextRotationAt,
      nextSplitBps: rot.nextSplit,
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
    // A delivery of 494,400 AVIAN, three and a half days into its week. In
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
    // This week's figures, as the contract applies them at the second it runs.
    const sp = r.splitBps;
    const toStaking = (inflow * BigInt(sp.staking)) / 10_000n;
    const toNest = (inflow * BigInt(sp.nest)) / 10_000n;
    const toLockers = (inflow * BigInt(sp.lockers)) / 10_000n;
    const toBurn = (inflow * BigInt(sp.burn)) / 10_000n;
    const toAdmin = inflow - toStaking - toNest - toLockers - toBurn;
    const delivered: DistributeResult['delivered'] = [];
    const held: DistributeResult['held'] = [];
    if (r.staking.ready) delivered.push({ leg: 'staking', amount: toStaking + r.staking.held });
    else held.push({ leg: 'staking', amount: toStaking, reason: r.staking.reason });
    if (r.nest.ready) delivered.push({ leg: 'nest', amount: toNest + r.nest.held });
    else held.push({ leg: 'nest', amount: toNest + r.nest.held, reason: r.nest.reason });
    // The lockers' leg: nothing is locked, so it is held, as every turn's is until the vault products.
    roostOverlay.heldLockers += toLockers;
    held.push({ leg: 'lockers', amount: toLockers + r.lockers.held, reason: r.lockers.reason });
    return { allocated: inflow > 0n ? { inflow, toStaking, toNest, toLockers, toBurn, toAdmin } : null, delivered, held, burned: toBurn };
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
  if (r.staking.held === 0n && r.nest.held === 0n && r.lockers.held === 0n) throw new ContractError('NothingHeld');
  const canStaking = r.staking.held > 0n && r.staking.ready;
  const canNest = r.nest.held > 0n && r.nest.ready;
  // The lockers' leg never moves in the mock: nothing is locked until the vault products.
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
    if (r.lockers.held > 0n) held.push({ leg: 'lockers', amount: r.lockers.held, reason: r.lockers.reason });
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
