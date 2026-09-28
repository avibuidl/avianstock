// Earning now (2026-09-28): what a wallet's brooding birds have earned and
// not yet settled, token by token, all together, growing as you watch. The
// founder wants to WATCH the earning happen, so each row's one figure is
// the amount, ticking with the page's second clock (the same `now` the
// cards carry forward), snapping to the chain's word when a read lands and
// carrying on from there; its value ticks with it. No total above the rows,
// by the founder's decision (2026-09-28).
// Tokens and totals only, by the founder's decision: no bird's picture,
// name or figure is here. One row per token the Nest streams, AVIAN among
// them, with the tag, the amount and symbol, its value, and when the stream
// ends; one quiet line under. Sorted by value, highest first.
//
// The arithmetic is lib/earning.ts, over the brood read the page already
// owns. The digits come from the rate (enough to move each second, never
// fewer than four), held between reads, in tabular figures on a column
// sized to the largest amount, so nothing jitters as the digits change.
// After a settle the figure keeps ticking from the old read until the next
// lands, which is the site's rule everywhere.

import s from '../screens/MyNest.module.css';
import { ErrorState, Tag } from './Primitives';
import { earningRows, walletWeight, type EarningRow } from '../lib/earning';
import { formatDaysHours, formatEthSig, formatReward, formatUsd } from '../lib/format';
import { href } from '../router';
import { ADDRESSES, type BroodState, type FlywheelSnapshot, type Polled } from '../mock';

export function EarningPanel({
  id, brood, fly, now, connected, settleAll,
}: {
  id?: string; brood: Polled<BroodState>; fly: FlywheelSnapshot | undefined; now: number; connected: boolean;
  /** "Settle all" at the head's far right (2026-09-28, from the birds' section head): every bird with something accrued. */
  settleAll?: { count: number; onPress: () => void };
}) {
  const head = (
    <div className="row">
      <h3 id="earning-h">Earning now</h3>
      <span className="spacer" />
      {settleAll && settleAll.count > 1 ? (
        <button type="button" className="btn btn--ghost btn--compact" onClick={settleAll.onPress}>Settle all</button>
      ) : null}
    </div>
  );

  if (!connected) {
    return (
      <section className="panel anchor" id={id} aria-labelledby="earning-h">
        {head}
        <p className={`small dim ${s.shape}`}>What your brooding birds have earned, growing as you watch.</p>
      </section>
    );
  }
  // The same footprint whether the read has landed or not: three rows.
  if (brood.loading && !brood.data) {
    return (
      <section className="panel anchor" id={id} aria-labelledby="earning-h" role="status" aria-live="polite">
        {head}
        <div className={s.erows} aria-hidden="true">
          {[0, 1, 2].map((i) => <div key={i} className={s.erow}><span className="skel" style={{ width: 44, height: 20, display: 'inline-block' }} /><span className="skel" style={{ width: '60%', height: 12, display: 'inline-block' }} /><span className="skel" style={{ width: '40%', height: 12, display: 'inline-block' }} /><span className="skel" style={{ width: '70%', height: 12, display: 'inline-block' }} /></div>)}
        </div>
        <span className="sr-only">Loading what your birds earn</span>
      </section>
    );
  }
  if (!brood.data) {
    return (
      <section className="panel anchor" id={id} aria-labelledby="earning-h">
        {head}
        <div className={s.shape}>
          <ErrorState title="What your birds earn could not be read." detail="They are brooding as they were. Try again in a moment." onRetry={brood.reload} />
        </div>
      </section>
    );
  }

  const nest = brood.data;
  const brooding = walletWeight(nest) > 0n;
  if (!brooding) {
    return (
      <section className="panel anchor" id={id} aria-labelledby="earning-h">
        {head}
        <p className={`small dim ${s.shape}`}>
          Nothing is brooding. <a href={href({ name: 'nest', at: 'birds' })}>Brood a bird</a> and it earns here.
        </p>
      </section>
    );
  }

  const rows = earningRows(nest, fly, ADDRESSES.Avians, now);

  return (
    <section className="panel anchor" id={id} aria-labelledby="earning-h">
      {head}
      <div className={s.erows}>
        {rows.length === 0 ? (
          <div className={s.rowEmpty}><span className="small dim">Nothing streams yet: no reward token is listed.</span></div>
        ) : rows.map((r) => <Row key={r.token.address} r={r} now={now} />)}
      </div>
      <p className={`tiny dim ${s.enote}`}>Earned by your brooding birds and not yet settled; settling delivers it to the birds’ wallets. An estimate between reads.</p>
    </section>
  );
}

function Row({ r, now }: { r: EarningRow; now: number }) {
  const value = r.amount === 0n ? '' : r.usd !== null ? formatUsd(r.usd) : r.eth !== null ? formatEthSig(r.eth) : '';
  const ends = r.state === 'running' ? `stream ends in ${formatDaysHours(r.periodFinish - now)}`
    : r.state === 'ended' ? 'stream ended' : 'nothing streams yet';
  return (
    <div className={s.erow}>
      <span className={s.etok}><Tag>{r.token.symbol}</Tag></span>
      <span className={`num ${s.eamt}`}>{formatReward(r.amount, r.token.decimals, r.places)} {r.token.symbol}</span>
      <span className={s.eval}>{value}</span>
      <span className={`small dim ${s.eends}`}>{ends}</span>
    </div>
  );
}
