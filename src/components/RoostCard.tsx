// The Roost card (lifted out of screens/Roost.tsx on 2026-09-25, whole):
// where every AVIAN fee lands and how it is split this week (three figures
// that rotate weekly since 2026-09-20, and two constants), with the one
// button anyone may press once a day and the one that sends a held leg on.
// It lives on the Bird Engine page now, beside the Treasury card; the Roost
// page is staking. It reads `useRoostScreen`, the same one read the Roost
// page reads, and carries the page's two handlers, Distribute and Deliver,
// as they were. The veil on the lockers' share is unchanged.

import { useState } from 'react';
import { Icon } from './Icon';
import { ErrorState, PanelSkeleton, Tag } from './Primitives';
import { WriteGate } from './Wallet';
import { useTx } from './Tx';
import { avians, formatAgo, formatBps, formatCountdown, formatDaysHours } from '../lib/format';
import {
  deliverHeld, distribute, unveiled, useNow, useRoostScreen,
  type Amount, type DeliverResult, type DistributeResult, type RoostLegName, type RoostState,
} from '../mock';

/** The three legs' names, as the card and the receipts say them. */
export const LEG_NAME: Record<RoostLegName, string> = { staking: 'AVIAN stakers', nest: 'Brooding birds', lockers: 'Vault users' };

/**
 * THE VEIL (2026-09-22). Until the founder unveils the vault products, the
 * Roost's third leg is not spoken of here: the split line names two figures,
 * the third stream row, its counter, its DELIVER case and its receipt rows
 * are omitted, and the DISTRIBUTE sentence names four legs. Read from the
 * manifest on every render, so an unveiling is an edit to that file and
 * nothing else. The chain is read the same either way.
 */
export const showLockers = () => unveiled('vaults');
export const visibleLegs = <T extends { leg: RoostLegName }>(rows: T[]) => (showLockers() ? rows : rows.filter((r) => r.leg !== 'lockers'));


/**
 * The card, with its own read and its two presses. `id` is the anchor the
 * homepage's "See the Roost" opens the Bird Engine page at. `read`: a page
 * that shows the Roost's figures elsewhere reads once and hands it here, and
 * the card's own read stands idle after its first.
 */
export function RoostCard({ onConnect, id, read }: { onConnect: () => void; id?: string; read?: ReturnType<typeof useRoostScreen> }) {
  const tx = useTx();
  const wall = useNow(1000);
  const [busy, setBusy] = useState(false);
  // Re-run every few seconds while the card is on and the tab is visible;
  // not while a transaction from here is in flight.
  const own = useRoostScreen({ paused: busy || tx.busy || !!read });
  const screen = read ?? own;
  const reload = screen.reload;

  if (screen.loading && !screen.data) {
    return <section className="panel" id={id}><PanelSkeleton lines={6} /></section>;
  }
  if (!screen.data) {
    return (
      <section className="panel" id={id}>
        <ErrorState title="The Roost could not be read." detail="Nothing has moved. Try again in a moment." onRetry={reload} />
      </section>
    );
  }
  const r = screen.data.roost;
  // A background read that failed: the figures are the last good read's, and
  // the panel title says how old. Nothing louder.
  const lastRead = screen.stale && screen.readAt !== null ? `last read ${formatAgo(wall - screen.readAt)} ago` : null;

  const doDeliver = async () => {
    setBusy(true);
    await tx.run('Delivering a held share', (on) => deliverHeld(on), {
      outcome: (x) => deliverOutcome(x as DeliverResult),
      rows: (x) => deliverRows(x as DeliverResult),
    });
    reload();
    setBusy(false);
  };

  return (
    <div id={id}>
      <RoostCardView
        r={r} wall={wall} busy={busy} onConnect={onConnect} lastRead={lastRead}
        onDistribute={async () => {
          setBusy(true);
          await tx.run('Turning the Roost', (on) => distribute(on), {
            outcome: (x) => distributeOutcome(x as DistributeResult),
            rows: (x) => distributeRows(x as DistributeResult),
            note: (x) => distributeNote(x as DistributeResult),
          });
          reload();
          setBusy(false);
        }}
        onDeliver={doDeliver}
      />
    </div>
  );
}

/**
 * Which held legs a `deliverHeld` would move right now, and the button's
 * label for it. Null when nothing held can move. One call moves every leg
 * that can, so when more than one can go the label says so and carries the
 * total, the way the Distribute button carries its amount.
 */
function deliverable(r: RoostState): { label: string } | null {
  const legs: { name: string; held: Amount }[] = [];
  if (r.staking.held > 0n && r.staking.ready) legs.push({ name: 'Deliver to stakers', held: r.staking.held });
  if (r.nest.held > 0n && r.nest.ready) legs.push({ name: 'Deliver to brooding birds', held: r.nest.held });
  if (showLockers() && r.lockers.held > 0n && r.lockers.ready) legs.push({ name: 'Deliver to vault users', held: r.lockers.held });
  if (legs.length === 0) return null;
  if (legs.length === 1) return { label: legs[0].name };
  const total = legs.reduce((sum, l) => sum + l.held, 0n);
  return { label: legs.length === 2 ? `Deliver both, ${avians(total)}` : `Deliver all that can move, ${avians(total)}` };
}

/** "35% to stakers, 30% to brooding birds, 20% to vault users" for a week's three figures; two while veiled. */
const splitLine = (sp: { staking: number; nest: number; lockers: number }) =>
  `${formatBps(sp.staking)} to stakers, ${formatBps(sp.nest)} to brooding birds${showLockers() ? `, ${formatBps(sp.lockers)} to vault users` : ''}`;
/** "30 / 20 / 35", the same as bare figures; "30 / 20" while veiled. */
const splitShort = (sp: { staking: number; nest: number; lockers: number }) =>
  `${sp.staking / 100} / ${sp.nest / 100}${showLockers() ? ` / ${sp.lockers / 100}` : ''}`;

function RoostCardView({
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
  // The one line under the buttons (2026-09-25): when the next turn is, as a
  // countdown on the chain's clock, and nothing more. Due with nothing to
  // move, it says why Distribute is still off.
  const next = !due
    ? `Next distribution in ${formatCountdown(r.nextDistributionAt - now)}.`
    : something ? 'Next distribution due now.' : 'Next distribution due now; nothing has arrived to split yet.';

  return (
    <section className="panel" aria-labelledby="roost-h">
      <div className="row">
        <h3 id="roost-h">The Roost</h3>
        {lastRead ? <span className="tiny dim">{lastRead}</span> : null}
      </div>
      <p className="small dim" style={{ marginTop: 6 }}>
        What has arrived, and where it goes at the next turn.
      </p>

      {/*
        THE SPLIT, AS IT IS THIS WEEK (2026-09-20). Three figures that rotate
        weekly on a fixed three-week cycle from GENESIS, read from
        `currentSplit()`; two constants. Next week's from `splitAt(nextRotationAt())`,
        and the countdown on the same chain-time offset as the turn's.
      */}
      <div className="inset" style={{ marginTop: 14 }}>
        <div className="small">
          <strong className="strong">This week:</strong> {splitLine(r.splitBps)}.{' '}
          <strong className="strong">Always:</strong> {formatBps(r.splitBps.admin)} to the protocol, {formatBps(r.splitBps.burn)} burnt.
        </div>
        <div className="small" style={{ marginTop: 4 }}>
          Rotates in <span className="mono">{formatDaysHours(r.nextRotationAt - now)}</span>. Next week: {splitShort(r.nextSplitBps)}.
        </div>
        <div className="tiny dim" style={{ marginTop: 4 }}>
          The {showLockers() ? 'three ' : ''}figures move one place every week on a fixed cycle nobody controls.
        </div>
      </div>

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

      <h4 style={{ margin: '18px 0 8px' }}>The {showLockers() ? 'three' : 'two'} streams it feeds</h4>
      <Leg name="AVIAN stakers" share={r.splitBps.staking} leg={r.staking} />
      <Leg name="Brooding birds, through the nest" share={r.splitBps.nest} leg={r.nest} />
      {showLockers() ? <Leg name="Vault users" share={r.splitBps.lockers} leg={r.lockers} lockers /> : null}

      {/*
        Two different calls, and the copy must not blur them. DISTRIBUTE turns
        the Roost once a day: it splits what has arrived. DELIVER sends on what
        an earlier turn left waiting, the moment its stream can take it: any
        time, no interval, nothing split, the day's clock untouched.
      */}
      <div className="row row--wrap" style={{ marginTop: 18, gap: 8 }}>
        <WriteGate onConnect={onConnect}>
          <button type="button" className="btn" style={{ flex: '1 1 auto' }} disabled={!enabled || busy || tx.busy} onClick={onDistribute}>
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
      <p className="tiny dim" style={{ marginTop: 10 }}>{next}</p>
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

/**
 * One leg's line. The lockers' leg (2026-09-20) is held at the Roost until
 * the vault products exist, so its held figure is labelled for what it is
 * waiting for; its DELIVER follows the same rule as the others, and will not
 * fire before then.
 */
function Leg({ name, share, leg, lockers = false }: { name: string; share: number; leg: RoostState['staking']; lockers?: boolean }) {
  const line = leg.held > 0n
    ? (leg.ready ? `${avians(leg.held)} held. Deliverable now.`
      : lockers ? `Held for vault users: ${avians(leg.held)} are waiting for the vault products (coming after launch).`
        : `${avians(leg.held)} held. ${leg.reason}`)
    : (leg.ready ? 'Deliverable' : lockers ? 'Nothing held yet. The vault products come after launch.' : leg.reason);
  return (
    <div className="staked-row">
      <div style={{ minWidth: 0, flex: '1 1 auto' }}>
        <div className="small strong">{name} <span className="dim" style={{ fontWeight: 400 }}>{formatBps(share)} this week</span></div>
        <div className="tiny dim" style={{ marginTop: 2 }}>{line}</div>
      </div>
      {leg.ready ? <Tag tone="ok">Ready</Tag> : <Tag tone="warn">Held</Tag>}
    </div>
  );
}

/** The five legs, in this week's proportions (four while veiled): the shares are the amounts' own, so a turn that straddled a rotation still reads true. */
function distributeOutcome(x: DistributeResult): string {
  if (!x.allocated) return 'Held legs delivered. Nothing new was split.';
  const a = x.allocated;
  const pct = (part: Amount) => (a.inflow > 0n ? ` (${formatBps(Number((part * 10_000n) / a.inflow))})` : '');
  const lockers = showLockers() ? `${avians(a.toLockers)} to vault users${pct(a.toLockers)}, ` : '';
  return `${avians(a.inflow)} split: ${avians(a.toStaking)} to stakers${pct(a.toStaking)}, ${avians(a.toNest)} to brooding birds${pct(a.toNest)}, ${lockers}${avians(a.toBurn)} burnt${pct(a.toBurn)}, ${avians(a.toAdmin)} to the protocol${pct(a.toAdmin)}.`;
}

function distributeRows(x: DistributeResult) {
  return [
    ...visibleLegs(x.delivered).map((d) => ({ label: LEG_NAME[d.leg], value: `${avians(d.amount)} delivered`, tone: 'ok' as const })),
    ...visibleLegs(x.held).map((h) => ({ label: LEG_NAME[h.leg], value: `${avians(h.amount)} held: ${h.reason}`, tone: 'warn' as const })),
    ...(x.burned > 0n ? [{ label: 'Burnt', value: avians(x.burned), tone: 'dim' as const }] : []),
  ];
}

export function deliverOutcome(x: DeliverResult): string {
  const full = (d: DeliverResult['delivered'][number]) => (d.leg === 'staking'
    ? `${avians(d.amount)} are now streaming to stakers over seven days`
    : d.leg === 'nest' ? `${avians(d.amount)} are now streaming to brooding birds through the nest`
      : `${avians(d.amount)} are now streaming to vault users over seven days`);
  const short = (d: DeliverResult['delivered'][number]) =>
    `${avians(d.amount)} to ${d.leg === 'staking' ? 'stakers' : d.leg === 'nest' ? 'brooding birds' : 'vault users'}`;
  const delivered = visibleLegs(x.delivered);
  if (delivered.length === 0) return 'Nothing moved.';
  const [first, ...rest] = delivered;
  return rest.length === 0 ? `${full(first)}.` : `${full(first)}, and ${rest.map(short).join(', and ')}.`;
}

export function deliverRows(x: DeliverResult) {
  const legName = (l: RoostLegName) => LEG_NAME[l];
  return [
    ...visibleLegs(x.delivered).map((d) => ({ label: legName(d.leg), value: `${avians(d.amount)} delivered`, tone: 'ok' as const })),
    ...visibleLegs(x.held).map((h) => ({ label: legName(h.leg), value: `${avians(h.amount)} still held: ${h.reason}`, tone: 'warn' as const })),
  ];
}

function distributeNote(x: DistributeResult): string | undefined {
  return visibleLegs(x.held).length
    ? 'A held share is not lost. The Roost keeps it and delivers it at a later turn, once that stream can take it.'
    : undefined;
}
