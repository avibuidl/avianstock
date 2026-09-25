// The council card (2026-09-24): the protocol's second key, read-only.
//
// The same card in two places, so the two can never disagree: on the public
// site under the Treasury card, and at the foot of the Owner page with one
// line above it saying that none of it is the owner's to press. The site
// never sends a council call; the multisig does, and then the delay does.
//
// What it says is the whole of what the council may do. The countdowns run
// on the chain's clock carried forward by the wall clock, as the Roost's and
// the Treasury's do, so a fork an hour ahead does not make them wrong.

import s from './Council.module.css';
import { Address, ErrorState, Note, PanelSkeleton } from './Primitives';
import { formatCountdown, formatDaysHours, shortAddress } from '../lib/format';
import { useCouncil, useNow, type CouncilState } from '../mock';

/** The wall clock when a read landed: `chainNow` is the block's, so the difference is the skew. */
const landed = new WeakMap<CouncilState, number>();
function wallAt(c: CouncilState): number {
  let t = landed.get(c);
  if (t === undefined) { t = Math.floor(Date.now() / 1000); landed.set(c, t); }
  return t;
}

/** "2d 4h" above a day, then the ticking clock, so the last day counts down in front of you. */
function waitReads(seconds: number): string {
  if (seconds <= 0) return 'the wait is over';
  return seconds >= 86_400 ? `in ${formatDaysHours(seconds)}` : `in ${formatCountdown(seconds)}`;
}

/**
 * Every address inside a change's sentence, short. The sentence is one line
 * about a contract, not a place to read forty-two characters, and at 375px a
 * whole address would break mid-word. The full text stays in the row's title.
 */
function shorten(says: string): string {
  return says.replace(/0x[0-9a-fA-F]{40}/g, (a) => shortAddress(a));
}

/** "3 days" / "1 day", from the contract's own seconds. */
function days(seconds: number): string {
  const d = Math.round(seconds / 86_400); /* count */
  return `${d} day${d === 1 ? '' : 's'}`;
}

export function CouncilCard({ owner = false }: { owner?: boolean }) {
  const council = useCouncil();
  const wall = useNow(1000);
  const c = council.data;
  const now = c ? c.chainNow + Math.max(0, wall - wallAt(c)) : wall;

  return (
    <section className="panel" aria-labelledby="council-h">
      <h3 id="council-h" style={{ fontSize: 20 }}>The council</h3>

      {owner ? (
        <p className="small" style={{ margin: '8px 0 0' }}>
          None of this is yours to press. Changes go through the multisig and its wait.
        </p>
      ) : null}

      <p className={`small dim ${s.sentence}`}>
        The owner runs the collection day to day. The council can replace the Treasury, the
        Perch, the Nest and the Roost, change the royalty, and move the admin key to a fresh
        wallet. Nothing else. Every change waits the delay in public first.
      </p>

      {council.loading && !c ? (
        <div style={{ marginTop: 16 }}><PanelSkeleton lines={3} /></div>
      ) : council.error && !c ? (
        <div style={{ marginTop: 16 }}>
          <ErrorState title="The council could not be read." onRetry={council.reload} />
        </div>
      ) : !c ? null : (
        <>
          {/*
            A seat never named: its pointers are frozen where they were, which
            is worth saying quietly rather than loudly. One line per seat,
            named, because the others may still answer to the council.
          */}
          {c.unnamedOn.map((seat) => (
            <div key={seat} style={{ marginTop: 16 }}>
              <Note tone="warn">
                <span className="small">No council is named on {seat}; its structural pointers cannot move.</span>
              </Note>
            </div>
          ))}
          {c.council === null ? null : (
        <>
          <dl className={`kv ${s.facts}`}>
            <dt>Council</dt>
            <dd><Address value={c.council} /></dd>
            <dt>Multisig</dt>
            <dd>{c.multisig ? <Address value={c.multisig} /> : <span className="dim">not read</span>}</dd>
            <dt>Waits</dt>
            <dd>{days(c.structuralDelay)} for a replacement, {days(c.rescueDelay)} for the key</dd>
          </dl>

          <div className={s.pending}>
            <h4>Pending</h4>
            {c.pending.length === 0 ? (
              <p className="small dim" style={{ margin: '8px 0 0' }}>No change is pending.</p>
            ) : (
              <div className={s.rows}>
                {c.pending.map((p) => (
                  <div key={`${p.id}:${p.index}`} className={`${s.row}${p.kind === 'rescue' ? ` ${s.rescue}` : ''}`} title={p.says}>
                    <span className={`small ${s.says}`}>{shorten(p.says)}</span>
                    <span className={s.wait}>{waitReads(p.readyAt - now)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
          )}
        </>
      )}
    </section>
  );
}
