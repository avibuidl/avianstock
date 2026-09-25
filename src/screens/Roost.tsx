// The Roost page: AVIAN staking.
//
// The staking card: a wallet's stake and the pool's stream, with the four
// actions. The Roost's own card (the split, the turn, Distribute and
// Deliver) moved to the Bird Engine page on 2026-09-25, whole, as
// `components/RoostCard.tsx`; this page reads the same one read for the
// staking card and the counters. Every number is a read — HANDOVER section
// 9's blocks — and the sentences the cards must say are the brief's, verbatim.

import { useState } from 'react';
import { Icon } from '../components/Icon';
import { ApprovalSheet, type ApprovalRoute } from '../components/ApprovalSheet';
import { Box, EmptyState, ErrorState, Note, PanelSkeleton, Tag } from '../components/Primitives';
import { WriteGate } from '../components/Wallet';
import { useTx, type FixHandlers } from '../components/Tx';
import { avians, formatAgo, formatAvians, formatReward, parseAvians } from '../lib/format';
import { deliverOutcome, deliverRows, showLockers } from '../components/RoostCard';
import { RoostCounters } from '../components/Counters';
import {
  approveAviansForStaking, claimStakingReward, deliverHeld, estimateEarned, exitStaking, stake,
  useConnection, useNow, useRoostScreen, withdrawStake,
  type Amount, type DeliverResult, type RoostState, type StakingState,
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
        Where every fee lands: the perch&rsquo;s fees, every brooding fee, and the Treasury&rsquo;s
        buys. Once a day it is split between AVIAN token
        stakers{showLockers() ? ', brooding birds and the users of the vault products' : ' and brooding birds'},
        with 10% to the protocol and 5% burnt.
      </p>

      {/*
        The Roost card moved to the Bird Engine page on 2026-09-25, whole: this
        page is staking. The staking card keeps its own Deliver for a held
        stakers' share, which is the staker's business. Alone on the page, it
        sits in the middle of it (2026-09-25).
      */}
      <div style={{ margin: '32px auto 0', maxWidth: 720 }}>
        {s ? (
          <StakingCard
            s={s} r={r} wall={wall} busy={busy} connected={c.status === 'connected'} onConnect={onConnect} lastRead={lastRead}
            onDeliver={doDeliver}
            onStake={(amount) => {
              if (s.allowance < amount) { setApproving(amount); return; }
              void act(`Staking ${avians(amount)}`, (on) => stake(amount, on), () => `${avians(amount)} staked. It earns from this second. Withdraw it whenever you like.`);
            }}
            onWithdraw={(amount) => void act(`Withdrawing ${avians(amount)}`, (on) => withdrawStake(amount, on), () => `${avians(amount)} is back in your wallet. What it had earned is still yours to claim.`)}
            onClaim={() => void act('Claiming your AVIAN', (on) => claimStakingReward(on), (x) => `${avians((x as { paid: bigint }).paid)} is in your wallet.`)}
            onExit={() => void act('Withdrawing everything', (on) => exitStaking(on), (x) => `Your stake and the ${avians((x as { paid: bigint }).paid)} it earned are back in your wallet.`)}
          />
        ) : (
          <section className="panel"><ErrorState title="The staking contract could not be read." detail="Nothing has moved. Try again in a moment." onRetry={reload} /></section>
        )}
      </div>

      <RoostCounters r={r} />

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
        <h3 id="stake-h">Stake AVIAN</h3>
        {lastRead ? <span className="tiny dim">{lastRead}</span> : null}
        <span className="spacer" />
        {streaming ? <Tag tone="ok">Streaming</Tag> : <Tag>No stream running</Tag>}
      </div>
      <p className="small dim" style={{ marginTop: 6 }}>
        Stake AVIAN, earn AVIAN. Each delivery from the Roost streams to stakers over seven days.
        No lock, no cooldown, no fee.
      </p>

      <div className="counters" style={{ marginTop: 16, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        <Counter value={avians(s.staked)} label="My stake" />
        {/* Four decimals, never whole units: the tick between reads is a fraction, and it must be seen to move. */}
        <Counter value={`${formatReward(earnedNow, 18)} AVIAN`} label="Claimable now" />
        <Counter value={avians(s.totalStaked)} label="Staked by everyone" />
        <Counter value={sharePct === null ? 'None' : `${sharePct}%`} label="My share" />
      </div>

      <p className="small" style={{ marginTop: 14 }}>
        {streaming
          ? <>The current stream pays <span className="num">{formatAvians(perDay)} AVIAN</span> a day until {new Date(s.periodFinish * 1000).toLocaleString()}.</>
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
              placeholder="AVIAN" inputMode="decimal" aria-label="AVIAN to stake" spellCheck={false}
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
              placeholder="AVIAN" inputMode="decimal" aria-label="AVIAN to withdraw" spellCheck={false}
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
