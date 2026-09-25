// "Your seat" (2026-09-24): the two things on the Owner page that are the
// owner's and nobody else's.
//
// The seat moves in two ways only. The owner proposes a fresh key and the
// council seats it a day later; or, after thirty days without a word from
// the owner, the council seats one of its own choosing. So the control keeps
// the thirty days in view, offers the one press that resets them, and the
// one form that names a successor, which is also how the seat moves to a
// Safe one day and is drawn as ordinary for that reason.
//
// Both presses go to six contracts, one signature each, in turn. The count
// and the seat being signed for are shown beside the press, in the drawer's
// own dots, and a seat that already reads what is being sent is skipped and
// said so.

import { useState } from 'react';
import { Icon } from '../Icon';
import { ErrorState, Note, PanelSkeleton } from '../Primitives';
import { useTx } from '../Tx';
import { Addr, Control, Field, isAddressish } from './Bits';
import { formatDay } from '../../lib/format';
import { notHeldBy } from '../../lib/seat';
import {
  proposeOwner, seatRunFixture, stillHere, unveiled, useNow, useScenario, useSeat,
  type Address, type OnPhase, type OwnedSeat, type SeatRun, type SeatState,
} from '../../mock';
import a from '../../screens/Admin.module.css';
import s from './Seat.module.css';

const DAY = 86_400;
/** The warning tone starts this long before the council may act alone, and never sooner. */
const WARN_WITHIN = 5 * DAY;

const WORDS = ['none', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const words = (n: number) => WORDS[n] ?? String(n); /* count */
const ORDINAL = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'];

/** A seat's name, or its place in the six while the founder keeps it veiled. */
function nameOf(seat: OwnedSeat, i: number): string {
  return seat.veil && !unveiled(seat.veil) ? `the ${ORDINAL[i] ?? `${i + 1}th`} seat` : seat.name;
}
const upper = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** "the Nest", "the Nest and the Treasury", "the Perch, the Nest and the Treasury". */
function listed(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** The wall clock when a read landed, so the chain's clock can be carried forward. */
const landed = new WeakMap<SeatState, number>();
function wallAt(r: SeatState): number {
  let t = landed.get(r);
  if (t === undefined) { t = Math.floor(Date.now() / 1000); landed.set(r, t); }
  return t;
}

type Status =
  | { state: 'running'; run: SeatRun }
  | { state: 'done'; kind: SeatRun['kind']; sent: number; skipped: number }
  | { state: 'stopped'; kind: SeatRun['kind']; done: number; of: number; at: string }
  /** Refused before anything was sent: the wallet does not hold these seats. */
  | { state: 'refused'; kind: SeatRun['kind']; seats: string[] };

export function YourSeat({ you }: { you: string | null }) {
  const seat = useSeat();
  const tx = useTx();
  const wall = useNow(30_000);
  useScenario(); // the mock's mid-way scene is a scenario, so follow it
  const [key, setKey] = useState('');
  const [status, setStatus] = useState<Status | null>(null);

  const r = seat.data;
  if (seat.loading && !r) return <Control title="Your seat"><div style={{ marginTop: 12 }}><PanelSkeleton lines={3} /></div></Control>;
  if (!r) {
    return (
      <Control title="Your seat">
        <div style={{ marginTop: 12 }}>
          <ErrorState title="The seat's clocks could not be read." onRetry={seat.reload} />
        </div>
      </Control>
    );
  }

  const now = r.chainNow + Math.max(0, wall - wallAt(r));
  const n = r.seats.length;
  const all = words(n);

  // The earliest of the six is the one that counts: the council may act on
  // that seat first, so that is the date the owner has to beat.
  const lastSeen = Math.min(...r.seats.map((x) => x.lastSeenAt));
  const silentAt = Math.min(...r.seats.map((x) => x.silentAt));
  const warn = silentAt - now <= WARN_WITHIN;
  const clock = `Last heard from ${formatDay(lastSeen, now)} · the council may act alone from ${formatDay(silentAt, now)}`;

  // A run in flight is this control's own; the mock's fifth scene shows one frozen.
  const fixture = seatRunFixture();
  const shown: Status | null = status ?? (fixture ? { state: 'running', run: fixture } : null);
  const running = shown?.state === 'running';
  const blocked = running || tx.busy;

  const typed = key.trim();
  const valid = isAddressish(typed);
  const isYou = valid && !!you && typed.toLowerCase() === you.toLowerCase();

  /** Send to each seat in turn, one signature each; stop at the first that does not go. */
  async function runOn(
    kind: SeatRun['kind'],
    targets: { seat: OwnedSeat; i: number }[],
    skipped: number,
    send: (seat: OwnedSeat, on: OnPhase) => Promise<unknown>,
    finished: string,
  ) {
    const of = targets.length;
    if (of === 0) { setStatus({ state: 'done', kind, sent: 0, skipped }); return; }
    // Nothing is sent unless the wallet holds every seat it would send to.
    const foreign = new Set(notHeldBy(you, targets.map((t) => t.seat)));
    if (foreign.size) {
      setStatus({ state: 'refused', kind, seats: targets.filter((t) => foreign.has(t.seat)).map((t) => nameOf(t.seat, t.i)) });
      return;
    }
    const label = kind === 'still' ? 'Still here' : 'Propose';
    for (let k = 0; k < of; k++) {
      const { seat: target, i } = targets[k];
      const at = nameOf(target, i);
      setStatus({ state: 'running', run: { kind, done: k, of, at, phase: 'signing' } });
      const out = await tx.run(`${label}: ${at}, ${k + 1} of ${of}`, (on) => send(target, (phase, hash) => {
        setStatus({ state: 'running', run: { kind, done: k, of, at, phase } });
        on(phase, hash);
      }), {
        outcome: () => (k === of - 1 ? finished : `${upper(at)}: done, ${k + 1} of ${of}.`),
      });
      if (out === undefined) {
        setStatus({ state: 'stopped', kind, done: k, of, at });
        seat.reload();
        return;
      }
    }
    setStatus({ state: 'done', kind, sent: of, skipped });
    seat.reload();
  }

  const pressStillHere = () => {
    const today = formatDay(now, now);
    const targets = r.seats.map((x, i) => ({ seat: x, i })).filter(({ seat: x }) => formatDay(x.lastSeenAt, now) !== today);
    void runOn('still', targets, n - targets.length, (x, on) => stillHere(x.id, on), `Heard from on all ${all}.`);
  };

  const pressPropose = () => {
    const to = typed as Address;
    const targets = r.seats.map((x, i) => ({ seat: x, i })).filter(({ seat: x }) => x.proposed?.toLowerCase() !== to.toLowerCase());
    void runOn('propose', targets, n - targets.length, (x, on) => proposeOwner(x.id, to, on), `Proposed on all ${all}.`);
  };

  return (
    <Control title="Your seat">
      {warn ? (
        <div className={s.line}><Note tone="warn"><span className="small">{clock}</span></Note></div>
      ) : (
        <p className={`small dim ${s.line}`}>{clock}</p>
      )}

      <div className={s.part}>
        <div className={a.form}>
          <button type="button" className="btn btn--small" disabled={blocked} onClick={pressStillHere}>
            {shown?.state === 'running' && shown.run.kind === 'still' ? 'Sending…' : 'Still here'}
          </button>
        </div>
        <Progress status={shown} kind="still" all={all} />
        <p className="tiny dim" style={{ margin: '8px 0 0' }}>
          Resets the thirty-day clock on all {all} contracts. Once a month is plenty.
        </p>
      </div>

      <div className={s.part}>
        <div className={a.form}>
          <Field
            label="Propose a fresh key"
            value={key}
            placeholder="0x…"
            invalid={typed !== '' && (!valid || isYou)}
            disabled={running}
            onChange={setKey}
          />
          <button type="button" className="btn btn--small" disabled={blocked || !valid || isYou} onClick={pressPropose}>
            {shown?.state === 'running' && shown.run.kind === 'propose' ? 'Sending…' : 'Propose'}
          </button>
        </div>
        {isYou ? <p className="tiny" style={{ margin: '8px 0 0', color: 'var(--attention)' }}>That is the wallet in the seat now.</p> : null}
        <Progress status={shown} kind="propose" all={all} />
        <p className="tiny dim" style={{ margin: '8px 0 0' }}>
          Names a wallet; the council seats it a day later. Nobody can accept a transfer alone.
        </p>
        {/* Mid-proposal the six disagree by construction, one seat at a time: the
            progress line says where it stands, and the list waits until it is done. */}
        {shown?.state === 'running' && shown.run.kind === 'propose' ? null : <Proposed seats={r.seats} all={all} />}
      </div>
    </Control>
  );
}

/** "3 of 6 · the Treasury: waiting for your wallet", in the drawer's dots; then what came of it. */
function Progress({ status, kind, all }: { status: Status | null; kind: SeatRun['kind']; all: string }) {
  if (!status || (status.state === 'running' ? status.run.kind : status.kind) !== kind) return null;

  if (status.state === 'running') {
    const { done, of, at, phase } = status.run;
    return (
      <div className={s.progress} role="status" aria-live="polite">
        <span className="steps" aria-hidden="true" style={{ gap: 4 }}>
          {Array.from({ length: of }, (_, i) => (
            <span key={i} className={`steps__dot${i < done ? ' steps__dot--done' : i === done ? ' steps__dot--on' : ''}`} />
          ))}
        </span>
        <span className="small">
          <span className="mono">{done} of {of}</span>
          <span className="dim"> · {at}: {phase === 'signing' ? 'waiting for your wallet' : 'pending'}</span>
        </span>
      </div>
    );
  }

  if (status.state === 'refused') {
    return (
      <div className={s.progress}>
        <Note tone="warn">
          <span className="small">
            This wallet does not hold {listed(status.seats)}. Nothing was sent.
          </span>
        </Note>
      </div>
    );
  }

  if (status.state === 'stopped') {
    const left = status.of - status.done;
    return (
      <div className={s.progress}>
        <Note tone="warn">
          <span className="small">
            Stopped at {status.done} of {status.of}: {status.at} was not sent. Press{' '}
            {kind === 'still' ? 'Still here' : 'Propose'} again for the {left === 1 ? 'last one' : `other ${words(left)}`};
            the ones already done are skipped.
          </span>
        </Note>
      </div>
    );
  }

  const { sent, skipped } = status;
  const said = kind === 'still'
    ? (sent === 0 ? `All ${all} already read today. Nothing was sent.`
      : `Heard from on all ${all}, just now.${skipped ? ` ${upper(words(skipped))} already read today and ${skipped === 1 ? 'was' : 'were'} skipped.` : ''}`)
    : (sent === 0 ? `All ${all} already name this key. Nothing was sent.`
      : `Proposed on all ${all}, just now.${skipped ? ` ${upper(words(skipped))} already named it and ${skipped === 1 ? 'was' : 'were'} skipped.` : ''}`);
  return (
    <div className={s.progress}>
      <Icon name="check" size={13} color="var(--confirm)" />
      <span className="small">{said}</span>
    </div>
  );
}

/** "Proposed: 0x12F0…89ab (on all six)", or, when the six disagree, each seat's own. */
function Proposed({ seats, all }: { seats: OwnedSeat[]; all: string }) {
  const keys = seats.map((x) => x.proposed?.toLowerCase() ?? null);
  if (keys.every((k) => k === null)) return null;

  if (keys.every((k) => k === keys[0])) {
    return (
      <p className={`small ${s.proposed}`}>
        Proposed: <Addr value={seats[0].proposed} /> <span className="dim">(on all {all})</span>
      </p>
    );
  }

  return (
    <div className={s.proposed}>
      <p className="small" style={{ margin: 0 }}>Proposed, not the same on all {all}:</p>
      <dl className={`kv ${s.list}`}>
        {seats.map((x, i) => (
          <div key={x.id} style={{ display: 'contents' }}>
            <dt>{upper(nameOf(x, i))}</dt>
            <dd>{x.proposed ? <Addr value={x.proposed} /> : <span className="dim">nothing proposed</span>}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
