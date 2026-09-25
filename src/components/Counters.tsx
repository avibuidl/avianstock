// The Nest's and the Roost's figures (2026-09-25), shared so the pages that
// show them cannot disagree. Two looks over the same figures:
//
//   * the strip (`NestCounters`, `RoostCounters`): the Nest page's and the
//     Roost page's row of counters, as they always were;
//   * the card (`NestFigures`, `RoostFigures`): the homepage Flywheel
//     section's card, its heading and its grid of cells, drawn with that
//     section's own stylesheet, for the Bird Engine page.
//
// Each takes a read that has landed; the caller owns the read and its states.

import type { ReactNode } from 'react';
import f from './Flywheel.module.css';
import { avians, formatCount } from '../lib/format';
import { unveiled, type BroodState, type RoostState } from '../mock';

function Counter({ value, label, size = 22 }: { value: string; label: string; size?: number }) {
  return (
    <div>
      <div className="num" style={{ fontSize: size }}>{value}</div>
      <div className="label" style={{ marginTop: 4 }}>{label}</div>
    </div>
  );
}

/** Birds brooding, their weight, what brooding has paid the Roost, and the listed tokens. */
export function NestCounters({ r }: { r: BroodState }) {
  return (
    <div className="counters">
      <Counter value={formatCount(r.totalBrooding)} label="Birds brooding" />
      <Counter value={formatCount(Number(r.totalWeight))} /* count */ label="Total weight" />
      <Counter value={avians(r.totalForwarded)} label="Total brooding fees paid to the Roost" />
      <Counter value={String(r.listed.length)} label="Reward tokens listed" />
    </div>
  );
}

/**
 * What the Roost has paid each way, and burnt. The vault users' figure only
 * once the founder has unveiled the vault products (the veil, as the Roost
 * card reads it); three across until then.
 */
export function RoostCounters({ r }: { r: RoostState }) {
  const lockers = unveiled('vaults');
  return (
    <div className={`counters${lockers ? '' : ' counters--3'}`}>
      <Counter size={20} value={avians(r.toStaking)} label="Total paid to stakers" />
      <Counter size={20} value={avians(r.toNest)} label="To brooding birds, ever" />
      {lockers ? <Counter size={20} value={avians(r.toLockers)} label="To vault users, ever" /> : null}
      <Counter size={20} value={avians(r.burned)} label="Total burnt" />
    </div>
  );
}

// ── the card look, the homepage Flywheel section's ─────────────────────────

function Cell({ fig, label, wide }: { fig: ReactNode; label: string; wide?: boolean }) {
  return (
    <div className={`${f.cell}${wide ? ` ${f.wide}` : ''}`}>
      <div className={f.fig}>{fig}</div>
      <div className={`label ${f.lbl}`}>{label}</div>
    </div>
  );
}

/** The Nest's four figures as a card: two counts, the listed tokens, then what brooding has paid, wide. */
export function NestFigures({ r }: { r: BroodState }) {
  return (
    <div className={f.group}>
      <h4>The Nest</h4>
      <div className={f.cells}>
        <Cell fig={formatCount(r.totalBrooding)} label="birds brooding" />
        <Cell fig={formatCount(Number(r.totalWeight))} /* count */ label="total weight" />
        <Cell fig={String(r.listed.length)} label="reward tokens listed" />
        <Cell fig={avians(r.totalForwarded)} label="in brooding fees" />
      </div>
    </div>
  );
}

/** The Roost's paid-out figures as a card; the burnt figure wide while the vault users' is veiled. */
export function RoostFigures({ r }: { r: RoostState }) {
  const lockers = unveiled('vaults');
  return (
    <div className={f.group}>
      <h4>Paid out by the Roost</h4>
      <div className={f.cells}>
        <Cell fig={avians(r.toStaking)} label="to stakers" />
        <Cell fig={avians(r.toNest)} label="to brooding birds" />
        {lockers ? <Cell fig={avians(r.toLockers)} label="to vault users" /> : null}
        <Cell wide={!lockers} fig={avians(r.burned)} label="burnt" />
      </div>
    </div>
  );
}
