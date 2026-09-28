// The staking card (lifted out of screens/Roost.tsx on 2026-09-27, whole):
// a wallet's stake and the pool's stream, with stake, withdraw and exit.
// The Withdraw column has two presses, side by side: "Withdraw earnings"
// claims the AVIAN the stake has earned (the same claim the Rewards panel's
// staking row makes), and "Withdraw stake" withdraws the typed amount of
// stake. The exit (all at once) is not offered: Max, Withdraw stake, then
// Withdraw earnings is the same result in two presses that each say what
// they do. Every number is a read (HANDOVER section 9's blocks).
//
// The page owns the read (`useRoostScreen`) and hands it in, so the Rewards
// panel's staking row and this card are one read and cannot disagree.

import { useState } from 'react';
import s from '../screens/MyNest.module.css';
import { Icon } from './Icon';
import { ApprovalSheet, type ApprovalRoute } from './ApprovalSheet';
import { Box, EmptyState, ErrorState, Note, PanelSkeleton, Tag } from './Primitives';
import { WriteGate } from './Wallet';
import { useTx, type FixHandlers } from './Tx';
import { avians, formatAgo, formatAvians, formatReward, parseAvians } from '../lib/format';
import { deliverOutcome, deliverRows } from './RoostCard';
import {
  approveAviansForStaking, claimStakingReward, deliverHeld, estimateEarned, stake, useNow, withdrawStake,
  type Amount, type DeliverResult, type Polled, type RoostState, type StakingState,
} from '../mock';

const DAY_N = 86_400;
/** Below this, `undelivered − remainingReward` is rounding, not a remainder worth a sentence. */
const DUST = 10n ** 15n;

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

export function StakingCard({
  read, connected, onConnect, id,
}: { read: Polled<{ roost: RoostState; staking: StakingState }>; connected: boolean; onConnect: () => void; id?: string }) {
  const tx = useTx();
  const wall = useNow(1000);
  const [busy, setBusy] = useState(false);
  const [approving, setApproving] = useState<Amount | null>(null);
  const [stakeText, setStakeText] = useState('');
  const [withdrawText, setWithdrawText] = useState('');
  const reload = read.reload;
  // The drawer's fix this card owns; the rest are the site's and the drawer's.
  const onFix: FixHandlers = { approve: (amount) => setApproving(amount && amount > 0n ? amount : null) };

  // The same footprint whether the read has landed or not: nothing below jumps.
  if (read.loading && !read.data) {
    return (
      <section className="panel anchor" id={id} aria-labelledby="stake-h" style={{ minHeight: 520 }}>
        <h3 id="stake-h">Stake AVIAN</h3>
        <div style={{ marginTop: 16 }}><PanelSkeleton lines={6} /></div>
      </section>
    );
  }
  if (!read.data) {
    return (
      <section className="panel anchor" id={id} aria-labelledby="stake-h" style={{ minHeight: 520 }}>
        <h3 id="stake-h">Stake AVIAN</h3>
        <div style={{ marginTop: 16 }}>
          <ErrorState title="The staking contract could not be read." detail="Nothing has moved. Try again in a moment." onRetry={reload} />
        </div>
      </section>
    );
  }

  const r = read.data.roost;
  const st = read.data.staking;
  const lastRead = read.stale && read.readAt !== null ? `last read ${formatAgo(wall - read.readAt)} ago` : null;
  const now = st.chainNow + Math.max(0, wall - wallAtS(st));
  const streaming = st.rewardRate > 0n && now < st.periodFinish;
  // What has been earned NOW: the last read, carried forward by the stream's
  // arithmetic once a second, replaced by the next read. The Rewards panel's
  // claim uses the chain's figure (`st.earned`), never this.
  const earnedNow = estimateEarned(st, now);
  const held = r.staking.held;
  const sharePct = st.totalStaked > 0n && st.staked > 0n
    ? Number((st.staked * 10_000n) / st.totalStaked) /* count */ / 100
    : null;
  const waiting = st.undelivered > st.remainingReward + DUST ? st.undelivered - st.remainingReward : 0n;

  const parse = (t: string): Amount | null => { try { return parseAvians(t); } catch { return null; } };
  const stakeAmount = parse(stakeText);
  const withdrawAmount = parse(withdrawText);
  // Clamped: neither ZeroAmount nor InsufficientStake can reach the chain from here.
  const stakeOk = stakeAmount !== null && stakeAmount > 0n && stakeAmount <= st.aviansBalance;
  const withdrawOk = withdrawAmount !== null && withdrawAmount > 0n && withdrawAmount <= st.staked;

  async function act<T>(label: string, fn: (on: Parameters<typeof stake>[1]) => Promise<T>, outcome: (x: T) => string) {
    setBusy(true);
    await tx.run(label, fn as never, { onFix, outcome: outcome as never, context: { balance: st.aviansBalance } });
    reload();
    setBusy(false);
  }
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
  const onStake = (amount: Amount) => {
    if (st.allowance < amount) { setApproving(amount); return; }
    void act(`Staking ${avians(amount)}`, (on) => stake(amount, on), () => `${avians(amount)} staked. It earns from this second. Withdraw it whenever you like.`);
  };

  return (
    <section className="panel anchor" id={id} aria-labelledby="stake-h">
      <div className="row">
        <h3 id="stake-h">Stake AVIAN</h3>
        {lastRead ? <span className="tiny dim">{lastRead}</span> : null}
        <span className="spacer" />
        {streaming ? <Tag tone="ok">Streaming</Tag> : <Tag>No stream running</Tag>}
      </div>
      <p className="small dim" style={{ marginTop: 6 }}>Stake AVIAN to earn more AVIAN. No lock, no cooldown, no fees.</p>

      <div className="counters" style={{ marginTop: 16, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        <Counter value={avians(st.staked)} label="My stake" />
        {/* Four decimals, never whole units: the tick between reads is a fraction, and it must be seen to move. */}
        <Counter value={`${formatReward(earnedNow, 18)} AVIAN`} label="Earned so far" />
        <Counter value={avians(st.totalStaked)} label="Staked by everyone" />
        <Counter value={sharePct === null ? 'None' : `${sharePct}%`} label="My share" />
      </div>

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
                  <button type="button" className="btn btn--small" disabled={busy || tx.busy} onClick={doDeliver}>
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
            Your stake, what it has earned, and the buttons to stake and withdraw appear here.
          </EmptyState>
        </div>
      ) : (
        <div className={s.stakeForms}>
          <div className={s.stakeForm}>
            <h4 style={{ margin: '18px 0 8px' }}>Stake</h4>
            <div className="field">
              <input
                value={stakeText} onChange={(e) => setStakeText(e.target.value)}
                placeholder="AVIAN" inputMode="decimal" aria-label="AVIAN to stake" spellCheck={false}
              />
              <button type="button" className="btn btn--ghost btn--small" onClick={() => setStakeText(formatAvians(st.aviansBalance).replace(/,/g, ''))}>Max</button>
            </div>
            <div className="tiny dim" style={{ marginTop: 6 }}>Balance: {avians(st.aviansBalance)}</div>
            <div className={s.stakeFoot}>
              <WriteGate onConnect={onConnect}>
                <button type="button" className="btn btn--compact" disabled={!stakeOk || busy || tx.busy} onClick={() => stakeAmount && onStake(stakeAmount)}>
                  {stakeAmount === null || stakeAmount === 0n ? 'Type an amount'
                    : stakeAmount > st.aviansBalance ? 'More than you have'
                      : st.allowance < stakeAmount ? 'Approve, then stake' : `Stake ${avians(stakeAmount)}`}
                </button>
              </WriteGate>
            </div>
          </div>

          <div className={s.stakeForm}>
            <h4 style={{ margin: '18px 0 8px' }}>Withdraw</h4>
            <div className="field">
              <input
                value={withdrawText} onChange={(e) => setWithdrawText(e.target.value)}
                placeholder="AVIAN" inputMode="decimal" aria-label="AVIAN to withdraw" spellCheck={false}
              />
              <button type="button" className="btn btn--ghost btn--small" disabled={st.staked === 0n} onClick={() => setWithdrawText(formatAvians(st.staked).replace(/,/g, ''))}>Max</button>
            </div>
            <div className={`row row--wrap ${s.stakeFoot}`} style={{ gap: 8 }}>
              <WriteGate onConnect={onConnect}>
                <button
                  type="button" className="btn btn--ghost btn--compact" disabled={st.earned === 0n || busy || tx.busy}
                  onClick={() => void act('Claiming your staking AVIAN', (on) => claimStakingReward(on), (x) => `${avians((x as { paid: bigint }).paid)} is in your wallet.`)}
                >
                  Withdraw earnings
                </button>
              </WriteGate>
              <WriteGate onConnect={onConnect}>
                <button
                  type="button" className="btn btn--ghost btn--compact" disabled={!withdrawOk || busy || tx.busy}
                  onClick={() => withdrawAmount && void act(`Withdrawing ${avians(withdrawAmount)}`, (on) => withdrawStake(withdrawAmount, on), () => `${avians(withdrawAmount)} is back in your wallet. What it had earned is still yours to claim.`)}
                >
                  Withdraw stake
                </button>
              </WriteGate>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <Box tone="ok">
          <p className="tiny dim" style={{ margin: 0 }}>
            No lock, no cooldown, no fee, no owner. The staking contract is fed by the Roost alone,
            and each delivery streams over {Math.round(st.streamSeconds / DAY_N)} days.
          </p>
        </Box>
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
    </section>
  );
}
