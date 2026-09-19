// The Roost, and AVIANS staking.
//
// Two cards. The Roost's: where every AVIANS fee lands and how it is split,
// with the one button anyone may press once a day. The staking card: a
// wallet's stake and the pool's stream, with the four actions. Every number is
// a read — HANDOVER section 9's two blocks — and the sentences the cards must
// say are the brief's, verbatim.

import { useState } from 'react';
import { Icon } from '../components/Icon';
import { ApprovalSheet, type ApprovalRoute } from '../components/ApprovalSheet';
import { Box, EmptyState, ErrorState, Note, PanelSkeleton, Tag } from '../components/Primitives';
import { WriteGate } from '../components/Wallet';
import { useTx, type FixHandlers } from '../components/Tx';
import { avians, formatAgo, formatAvians, formatBps, formatCountdown, formatReward, parseAvians } from '../lib/format';
import {
  approveAviansForStaking, claimStakingReward, deliverHeld, distribute, estimateEarned, exitStaking, stake,
  useConnection, useNow, useRoostScreen, withdrawStake,
  type Amount, type DeliverResult, type DistributeResult, type RoostState, type StakingState,
} from '../mock';

const DAY = 86_400n;
/** Below this, `undelivered − remainingReward` is rounding, not a remainder worth a sentence. */
const DUST = 10n ** 15n;

export function Roost({ onConnect }: { onConnect: () => void }) {
  const c = useConnection();
  const tx = useTx();
  const wall = useNow(1000);
  const [busy, setBusy] = useState(false);
  const [approving, setApproving] = useState<Amount | null>(null);
  // One read for both cards, re-run every few seconds while this screen is
  // on and the tab is visible: not while a transaction from here is in
  // flight, and not while the approval sheet is open.
  const screen = useRoostScreen({ paused: busy || tx.busy || approving !== null });
  const reload = screen.reload;

  // The drawer's fix this screen owns; the rest are the site's and the drawer's.
  const onFix: FixHandlers = { approve: (amount) => setApproving(amount && amount > 0n ? amount : null) };

  if (screen.loading && !screen.data) {
    return <div className="page page--wide"><div className="panel"><PanelSkeleton lines={6} /></div></div>;
  }
  if (!screen.data) {
    return (
      <div className="page page--wide">
        <ErrorState title="The Roost could not be read." detail="Nothing has moved. Try again in a moment." onRetry={reload} />
      </div>
    );
  }
  const r = screen.data.roost;
  const s: StakingState | undefined = screen.data.staking;
  // A background read that failed: the figures are the last good read's, and
  // the panel titles say how old. Nothing louder.
  const lastRead = screen.stale && screen.readAt !== null ? `last read ${formatAgo(wall - screen.readAt)} ago` : null;

  const doDeliver = async () => {
    setBusy(true);
    await tx.run('Delivering a held share', (on) => deliverHeld(on), {
      onFix,
      outcome: (x) => deliverOutcome(x as DeliverResult),
      rows: (x) => deliverRows(x as DeliverResult),
    });
    reload();
    setBusy(false);
  };

  return (
    <div className="page page--wide">
      <h2>The Roost</h2>
      <p className="lede" style={{ maxWidth: 820 }}>
        Where every fee lands: the perch&rsquo;s fees and every brooding fee. Once a day, anyone
        may split what has arrived: 40% to AVIANS token stakers, 30% to brooding birds, 20% burnt,
        10% to the protocol.
      </p>

      <div className="two-up">
        <RoostCard
          r={r} wall={wall} busy={busy} onConnect={onConnect} lastRead={lastRead}
          onDistribute={async () => {
            setBusy(true);
            await tx.run('Turning the Roost', (on) => distribute(on), {
              onFix,
              outcome: (x) => distributeOutcome(x as DistributeResult),
              rows: (x) => distributeRows(x as DistributeResult),
              note: (x) => distributeNote(x as DistributeResult),
            });
            reload();
            setBusy(false);
          }}
          onDeliver={doDeliver}
        />
        {s ? (
          <StakingCard
            s={s} r={r} wall={wall} busy={busy} connected={c.status === 'connected'} onConnect={onConnect} lastRead={lastRead}
            onDeliver={doDeliver}
            onStake={(amount) => {
              if (s.allowance < amount) { setApproving(amount); return; }
              void act(`Staking ${avians(amount)}`, (on) => stake(amount, on), () => `${avians(amount)} staked. It earns from this second. Withdraw it whenever you like.`);
            }}
            onWithdraw={(amount) => void act(`Withdrawing ${avians(amount)}`, (on) => withdrawStake(amount, on), () => `${avians(amount)} is back in your wallet. What it had earned is still yours to claim.`)}
            onClaim={() => void act('Claiming your AVIANS', (on) => claimStakingReward(on), (x) => `${avians((x as { paid: bigint }).paid)} is in your wallet.`)}
            onExit={() => void act('Withdrawing everything', (on) => exitStaking(on), (x) => `Your stake and the ${avians((x as { paid: bigint }).paid)} it earned are back in your wallet.`)}
          />
        ) : (
          <section className="panel"><ErrorState title="The staking contract could not be read." detail="Nothing has moved. Try again in a moment." onRetry={reload} /></section>
        )}
      </div>

      <div className="counters">
        <Counter value={avians(r.toStaking)} label="To stakers, ever" />
        <Counter value={avians(r.toNest)} label="To brooding birds, ever" />
        <Counter value={avians(r.burned)} label="Burnt, ever" />
        <Counter value={avians(r.adminClaimed)} label="Claimed by the protocol, ever" />
      </div>

      <ApprovalSheet
        open={approving !== null}
        amount={approving ?? 0n}
        what="the staking contract"
        action="stake"
        permitAvailable={false}
        busy={busy || tx.busy}
        onClose={() => setApproving(null)}
        onApprove={(route: ApprovalRoute, amount: Amount) => {
          setApproving(null);
          void act(`Approving ${avians(amount)}`, (on) => approveAviansForStaking(amount, on),
            () => `${avians(amount)} approved to the staking contract. Nothing has moved yet.${route === 'large' ? ' The next stakes will not ask again.' : ''}`);
        }}
      />
    </div>
  );

  async function act<T>(label: string, fn: (on: Parameters<typeof stake>[1]) => Promise<T>, outcome: (x: T) => string) {
    setBusy(true);
    await tx.run(label, fn as never, { onFix, outcome: outcome as never, context: { balance: s?.aviansBalance } });
    reload();
    setBusy(false);
  }
}

// ── the Roost card ────────────────────────────────────────────────────────

/**
 * Which held legs a `deliverHeld` would move right now, and the button's
 * label for it. Null when nothing held can move. One call moves both legs,
 * so when both can go the label says so and carries the total, the way the
 * Distribute button carries its amount.
 */
function deliverable(r: RoostState): { label: string } | null {
  const staking = r.staking.held > 0n && r.staking.ready;
  const nest = r.nest.held > 0n && r.nest.ready;
  if (staking && nest) return { label: `Deliver both, ${avians(r.staking.held + r.nest.held)}` };
  if (staking) return { label: 'Deliver to stakers' };
  if (nest) return { label: 'Deliver to brooding birds' };
  return null;
}

function RoostCard({
  r, wall, busy, onConnect, onDistribute, onDeliver, lastRead,
}: {
  r: RoostState; wall: number; busy: boolean; onConnect: () => void;
  onDistribute: () => void; onDeliver: () => void; lastRead: string | null;
}) {
  const tx = useTx();
  const deliver = deliverable(r);
  // The chain's clock, carried forward by the wall clock since the read — so
  // "too soon" is judged on the chain's time, not a machine's.
  const now = r.chainNow + Math.max(0, wall - wallAt(r));
  const due = now >= r.nextDistributionAt;
  const something = r.unallocated > 0n || deliver !== null;
  const enabled = due && something;
  const reason = !due
    ? `The Roost turns at most once a day. Next turn in ${formatCountdown(r.nextDistributionAt - now)}, at ${new Date(r.nextDistributionAt * 1000).toLocaleString()}.`
    : 'Nothing new has arrived and nothing held could be delivered. Fees and brooding costs fill it as they happen.';

  return (
    <section className="panel" aria-labelledby="roost-h">
      <div className="row">
        <h3 id="roost-h">The Roost</h3>
        {lastRead ? <span className="tiny dim">{lastRead}</span> : null}
        <span className="spacer" />
        <Tag>{formatBps(r.splitBps.staking)} / {formatBps(r.splitBps.nest)} / {formatBps(r.splitBps.burn)} / {formatBps(r.splitBps.admin)}</Tag>
      </div>
      <p className="small dim" style={{ marginTop: 6 }}>
        What has arrived, and where it goes at the next turn.
      </p>

      <div className="inset" style={{ marginTop: 16 }}>
        <div className="row">
          <span className="small">Waiting to be split</span>
          <span className="spacer" />
          <span className="num" style={{ fontSize: 17 }}>{avians(r.unallocated)}</span>
        </div>
        <div className="row" style={{ marginTop: 6 }}>
          <span className="label">Arrived, ever</span>
          <span className="spacer" />
          <span className="num tiny">{avians(r.cumulativeIn)}</span>
        </div>
        <div className="row" style={{ marginTop: 6 }}>
          <span className="label">The protocol&rsquo;s tenth, unclaimed</span>
          <span className="spacer" />
          <span className="num tiny">{avians(r.adminClaimable)}</span>
        </div>
      </div>

      <h4 style={{ margin: '18px 0 8px' }}>The two streams it feeds</h4>
      <Leg name="AVIANS stakers" share={r.splitBps.staking} leg={r.staking} />
      <Leg name="Brooding birds, through the nest" share={r.splitBps.nest} leg={r.nest} />

      {/*
        Two different calls, and the copy must not blur them. DISTRIBUTE turns
        the Roost once a day: it splits what has arrived. DELIVER sends on what
        an earlier turn left waiting, the moment its stream can take it: any
        time, no interval, nothing split, the day's clock untouched.
      */}
      <div className="row row--wrap" style={{ marginTop: 18, gap: 8 }}>
        <WriteGate onConnect={onConnect}>
          <button type="button" className="btn" style={{ flex: '1 1 auto' }} disabled={!enabled || busy || tx.busy} onClick={onDistribute}>
            <Icon name="refresh" size={16} color="var(--ink)" />
            {enabled ? `Distribute ${avians(r.unallocated)}` : 'Distribute'}
          </button>
        </WriteGate>
        {deliver ? (
          <WriteGate onConnect={onConnect}>
            <button type="button" className="btn btn--ghost" style={{ flex: '1 1 auto' }} disabled={busy || tx.busy} onClick={onDeliver}>
              <Icon name="arrow" size={16} />
              {deliver.label}
            </button>
          </WriteGate>
        ) : null}
      </div>
      <p className="tiny dim" style={{ marginTop: 10 }}>
        {enabled
          ? 'Anyone may press Distribute. The split happens in the same transaction; a stream that cannot take its share right now is held and delivered at a later turn.'
          : reason}
        {deliver ? ' Deliver sends on what an earlier turn left waiting, the moment its stream can take it: any time, nothing is split, and the day’s clock is untouched.' : ''}
      </p>
    </section>
  );
}

/** The wall clock at the moment the Roost was read — `chainNow` is the block's, so the difference is the skew. */
const readAt = new WeakMap<RoostState, number>();
function wallAt(r: RoostState): number {
  let t = readAt.get(r);
  if (t === undefined) { t = Math.floor(Date.now() / 1000); readAt.set(r, t); }
  return t;
}

function Leg({ name, share, leg }: { name: string; share: number; leg: RoostState['staking'] }) {
  return (
    <div className="staked-row">
      <div style={{ minWidth: 0, flex: '1 1 auto' }}>
        <div className="small strong">{name} <span className="dim" style={{ fontWeight: 400 }}>{formatBps(share)}</span></div>
        {leg.held > 0n ? (
          <div className="tiny dim" style={{ marginTop: 2 }}>
            {avians(leg.held)} held. {leg.ready ? 'Deliverable now.' : leg.reason}
          </div>
        ) : (
          <div className="tiny dim" style={{ marginTop: 2 }}>{leg.ready ? 'Deliverable' : leg.reason}</div>
        )}
      </div>
      {leg.ready ? <Tag tone="ok">Ready</Tag> : <Tag tone="warn">Held</Tag>}
    </div>
  );
}

function distributeOutcome(x: DistributeResult): string {
  if (!x.allocated) return 'Held legs delivered. Nothing new was split.';
  const a = x.allocated;
  return `${avians(a.inflow)} split: ${avians(a.toStaking)} to stakers, ${avians(a.toNest)} to brooding birds, ${avians(a.toBurn)} burnt, ${avians(a.toAdmin)} to the protocol.`;
}

function distributeRows(x: DistributeResult) {
  const legName = (l: 'staking' | 'nest') => (l === 'staking' ? 'AVIANS stakers' : 'Brooding birds');
  return [
    ...x.delivered.map((d) => ({ label: legName(d.leg), value: `${avians(d.amount)} delivered`, tone: 'ok' as const })),
    ...x.held.map((h) => ({ label: legName(h.leg), value: `${avians(h.amount)} held: ${h.reason}`, tone: 'warn' as const })),
    ...(x.burned > 0n ? [{ label: 'Burnt', value: avians(x.burned), tone: 'dim' as const }] : []),
  ];
}

function deliverOutcome(x: DeliverResult): string {
  const staking = x.delivered.find((d) => d.leg === 'staking');
  const nest = x.delivered.find((d) => d.leg === 'nest');
  if (staking && nest) return `${avians(staking.amount)} are now streaming to stakers over seven days, and ${avians(nest.amount)} to brooding birds.`;
  if (staking) return `${avians(staking.amount)} are now streaming to stakers over seven days.`;
  if (nest) return `${avians(nest.amount)} are now streaming to brooding birds through the nest.`;
  return 'Nothing moved.';
}

function deliverRows(x: DeliverResult) {
  const legName = (l: 'staking' | 'nest') => (l === 'staking' ? 'AVIANS stakers' : 'Brooding birds');
  return [
    ...x.delivered.map((d) => ({ label: legName(d.leg), value: `${avians(d.amount)} delivered`, tone: 'ok' as const })),
    ...x.held.map((h) => ({ label: legName(h.leg), value: `${avians(h.amount)} still held: ${h.reason}`, tone: 'warn' as const })),
  ];
}

function distributeNote(x: DistributeResult): string | undefined {
  return x.held.length
    ? 'A held share is not lost. The Roost keeps it and delivers it at a later turn, once that stream can take it.'
    : undefined;
}

// ── the staking card ──────────────────────────────────────────────────────

function StakingCard({
  s, r, wall, busy, connected, onConnect, onDeliver, onStake, onWithdraw, onClaim, onExit, lastRead,
}: {
  s: StakingState; r: RoostState; wall: number; busy: boolean; connected: boolean; onConnect: () => void;
  onDeliver: () => void;
  onStake: (amount: Amount) => void; onWithdraw: (amount: Amount) => void; onClaim: () => void; onExit: () => void;
  lastRead: string | null;
}) {
  const tx = useTx();
  const [stakeText, setStakeText] = useState('');
  const [withdrawText, setWithdrawText] = useState('');
  const now = s.chainNow + Math.max(0, wall - wallAtS(s));
  const streaming = s.rewardRate > 0n && now < s.periodFinish;
  // The rate is 1e18-scaled on chain; whole base units per day for the sentence.
  const perDay = (s.rewardRate * DAY) / RATE_PRECISION;
  // What has been earned NOW: the last read, carried forward by the stream's
  // arithmetic once a second, replaced by the next read. The claim button
  // uses the chain's figure (`s.earned`), never this.
  const earnedNow = estimateEarned(s, now);
  // The stakers' leg an earlier turn left waiting at the Roost.
  const held = r.staking.held;
  const sharePct = s.totalStaked > 0n && s.staked > 0n
    ? Number((s.staked * 10_000n) / s.totalStaked) /* count */ / 100
    : null;
  const waiting = s.undelivered > s.remainingReward + DUST ? s.undelivered - s.remainingReward : 0n;

  const parse = (t: string): Amount | null => { try { return parseAvians(t); } catch { return null; } };
  const stakeAmount = parse(stakeText);
  const withdrawAmount = parse(withdrawText);
  // Clamped: neither ZeroAmount nor InsufficientStake can reach the chain from here.
  const stakeOk = stakeAmount !== null && stakeAmount > 0n && stakeAmount <= s.aviansBalance;
  const withdrawOk = withdrawAmount !== null && withdrawAmount > 0n && withdrawAmount <= s.staked;

  return (
    <section className="panel" aria-labelledby="stake-h">
      <div className="row">
        <h3 id="stake-h">Stake AVIANS</h3>
        {lastRead ? <span className="tiny dim">{lastRead}</span> : null}
        <span className="spacer" />
        {streaming ? <Tag tone="ok">Streaming</Tag> : <Tag>No stream running</Tag>}
      </div>
      <p className="small dim" style={{ marginTop: 6 }}>
        Stake AVIANS, earn AVIANS. Each delivery from the Roost streams to stakers over seven days.
        No lock, no cooldown, no fee.
      </p>

      <div className="counters" style={{ marginTop: 16, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        <Counter value={avians(s.staked)} label="My stake" />
        {/* Four decimals, never whole units: the tick between reads is a fraction, and it must be seen to move. */}
        <Counter value={`${formatReward(earnedNow, 18)} AVIANS`} label="Claimable now" />
        <Counter value={avians(s.totalStaked)} label="Staked by everyone" />
        <Counter value={sharePct === null ? 'None' : `${sharePct}%`} label="My share" />
      </div>

      <p className="small" style={{ marginTop: 14 }}>
        {streaming
          ? <>The current stream pays <span className="num">{formatAvians(perDay)} AVIANS</span> a day until {new Date(s.periodFinish * 1000).toLocaleString()}.</>
          : s.periodFinish === 0
            ? 'Nothing has been delivered yet. The first stream starts when the Roost turns while somebody is staked.'
            : <>The last stream ended {new Date(s.periodFinish * 1000).toLocaleString()}. The next delivery starts a new one.</>}
      </p>
      {/*
        A held stakers' leg. Sent on by `deliverHeld` the moment somebody is
        staked: the card says so, and offers it, rather than leaving the
        figure one panel up and "nothing has been delivered yet" here.
      */}
      {held > 0n ? (
        <div style={{ marginTop: 10 }}>
          {r.staking.ready ? (
            <Box tone="ok">
              <div className="row row--wrap" style={{ gap: 10 }}>
                <span className="small" style={{ flex: '1 1 260px' }}>
                  <strong className="strong">{avians(held)} are held at the Roost for stakers.</strong>{' '}
                  Delivering starts them streaming over seven days, to whoever is staked. Anyone may press it.
                </span>
                <WriteGate onConnect={onConnect}>
                  <button type="button" className="btn btn--small" disabled={busy || tx.busy} onClick={onDeliver}>
                    <Icon name="arrow" size={14} color="var(--ink)" />
                    Deliver to stakers
                  </button>
                </WriteGate>
              </div>
            </Box>
          ) : (
            <Note tone="warn">
              <span className="small">
                <strong className="strong">{avians(held)} are waiting at the Roost for the first staker.</strong>{' '}
                Stake, and they can be delivered at once.
              </span>
            </Note>
          )}
        </div>
      ) : null}
      {waiting > 0n ? (
        <div style={{ marginTop: 10 }}>
          <Note tone="ok">
            <span className="small">
              <strong className="strong">{avians(waiting)} waiting for the next delivery.</strong>{' '}
              It streamed while nobody was staked, so it streams again with the next delivery, to
              whoever is staked then. Nothing is lost.
            </span>
          </Note>
        </div>
      ) : null}

      {!connected ? (
        <div style={{ marginTop: 16 }}>
          <EmptyState title="Connect a wallet to stake.">
            Your stake, what it has earned, and the buttons to stake, withdraw and claim appear here.
          </EmptyState>
          <div style={{ marginTop: 12 }}><WriteGate onConnect={onConnect}><span /></WriteGate></div>
        </div>
      ) : (
        <>
          <h4 style={{ margin: '18px 0 8px' }}>Stake</h4>
          <div className="field">
            <input
              value={stakeText} onChange={(e) => setStakeText(e.target.value)}
              placeholder="AVIANS" inputMode="decimal" aria-label="AVIANS to stake" spellCheck={false}
            />
            <button type="button" className="btn btn--ghost btn--small" onClick={() => setStakeText(formatAvians(s.aviansBalance).replace(/,/g, ''))}>Max</button>
          </div>
          <div className="row" style={{ marginTop: 6 }}>
            <span className="tiny dim">In your wallet: {avians(s.aviansBalance)}</span>
            <span className="spacer" />
            <span className="tiny dim">Approved: {avians(s.allowance)}</span>
          </div>
          <div style={{ marginTop: 10 }}>
            <WriteGate onConnect={onConnect}>
              <button type="button" className="btn btn--wide" disabled={!stakeOk || busy || tx.busy} onClick={() => stakeAmount && onStake(stakeAmount)}>
                {stakeAmount === null || stakeAmount === 0n ? 'Type an amount'
                  : stakeAmount > s.aviansBalance ? 'More than you have'
                    : s.allowance < stakeAmount ? 'Approve, then stake' : `Stake ${avians(stakeAmount)}`}
              </button>
            </WriteGate>
          </div>

          <h4 style={{ margin: '18px 0 8px' }}>Withdraw</h4>
          <div className="field">
            <input
              value={withdrawText} onChange={(e) => setWithdrawText(e.target.value)}
              placeholder="AVIANS" inputMode="decimal" aria-label="AVIANS to withdraw" spellCheck={false}
            />
            <button type="button" className="btn btn--ghost btn--small" disabled={s.staked === 0n} onClick={() => setWithdrawText(formatAvians(s.staked).replace(/,/g, ''))}>Max</button>
          </div>
          <div className="row row--wrap" style={{ gap: 8, marginTop: 10 }}>
            <WriteGate onConnect={onConnect}>
              <button type="button" className="btn btn--ghost btn--small" disabled={!withdrawOk || busy || tx.busy} onClick={() => withdrawAmount && onWithdraw(withdrawAmount)}>
                {withdrawAmount !== null && withdrawAmount > s.staked ? `Only ${avians(s.staked)} is staked` : withdrawOk ? `Withdraw ${avians(withdrawAmount!)}` : 'Withdraw'}
              </button>
            </WriteGate>
            <WriteGate onConnect={onConnect}>
              <button type="button" className="btn btn--ghost btn--small" disabled={s.earned === 0n || busy || tx.busy} onClick={onClaim}>
                Claim {s.earned > 0n ? avians(s.earned) : ''}
              </button>
            </WriteGate>
            <WriteGate onConnect={onConnect}>
              <button type="button" className="btn btn--ghost btn--small" disabled={(s.staked === 0n && s.earned === 0n) || busy || tx.busy} onClick={onExit}>
                Withdraw all and claim
              </button>
            </WriteGate>
          </div>
        </>
      )}

      <div style={{ marginTop: 16 }}>
        <Box tone="ok">
          <p className="tiny dim" style={{ margin: 0 }}>
            No lock, no cooldown, no fee, no owner. The staking contract is fed by the Roost alone,
            and each delivery streams over {Math.round(s.streamSeconds / DAY_N)} days.
          </p>
        </Box>
      </div>
    </section>
  );
}

const DAY_N = 86_400;
const RATE_PRECISION = 10n ** 18n;
const readAtS = new WeakMap<StakingState, number>();
function wallAtS(s: StakingState): number {
  let t = readAtS.get(s);
  if (t === undefined) { t = Math.floor(Date.now() / 1000); readAtS.set(s, t); }
  return t;
}

function Counter({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="num" style={{ fontSize: 20 }}>{value}</div>
      <div className="label" style={{ marginTop: 4 }}>{label}</div>
    </div>
  );
}
