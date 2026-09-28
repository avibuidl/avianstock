// The reward streams, one row per listed token: on the Nest in full, and on
// the landing page's flywheel snapshot in compact form (2026-09-22). One
// component in two modes, so the two never disagree.
//
//   full: the symbol, "tokenized stock product" where it applies, the live
//     state, "Returned to the stream" and "Escrowed" (the Nest's own
//     bookkeeping), and the "Total paid to brooders" line.
//   compact: the symbol, whose stream it is, and the paid line; no state
//     line (2026-09-25) and no bookkeeping, which a visitor has no use for.
//
// The clock is the caller's: the Nest hands its rows the same `now` its
// birds' unsettled lines tick on (the block's clock plus the seconds since
// the read landed), and the landing block computes its own the same way.

import s from './Streams.module.css';
import { Tag, Unread } from './Primitives';
import { formatReward } from '../lib/format';
import { paidLine, streamStateLine, type StreamFor } from '../lib/stream';
import { href } from '../router';
import { ADDRESSES, useBrood, useNow, type BroodState, type FlywheelSnapshot, type Polled, type RewardStream } from '../mock';

export function StreamRow({
  stream, now, fly, compact = false, who = 'brooders',
}: { stream: RewardStream; now: number; fly: FlywheelSnapshot | undefined; compact?: boolean; who?: StreamFor }) {
  return (
    <div className={`reward-row${compact ? ` ${s.compact}` : ''}`}>
      <div className={`row ${s.head}`}>
        <Tag>{stream.token.symbol}</Tag>
        {/*
          AVIAN is listed too, since the Roost delivers it, and it is not a
          stock product: its row says whose it is, as the stakers' AVIAN row
          beside it does (2026-09-25).
        */}
        {who === 'stakers' ? <span className="small dim">to stakers</span>
          : stream.token.address.toLowerCase() !== ADDRESSES.Avians?.toLowerCase() ? <span className="small dim">tokenized stock product</span>
            : <span className="small dim">to brooders</span>}
        {compact ? null : (
          <>
            <span className="spacer" />
            <span className={`tiny dim ${s.state}`}>{streamStateLine(stream.periodFinish, now)}</span>
          </>
        )}
      </div>
      {compact ? null : (
        <div className="row" style={{ marginTop: 6, gap: 14 }}>
          <span className="tiny dim">Returned to the stream <span className="num">{formatReward(stream.totalReturned, stream.token.decimals)}</span></span>
          <span className="tiny dim">Escrowed <span className="num">{formatReward(stream.escrowed, stream.token.decimals)}</span></span>
        </div>
      )}
      <p className="tiny dim" style={{ margin: '6px 0 0' }}>{paidLine(stream, fly, who)}</p>
    </div>
  );
}

/**
 * The staking contract's stream, in the shape a Nest row takes (part 19):
 * AVIAN, the stream's own `periodFinish` and `totalPaid` from the
 * snapshot. The Nest's bookkeeping figures do not exist for it, and a
 * compact row never draws them.
 */
export function stakersStream(fly: FlywheelSnapshot): RewardStream {
  return {
    token: { address: ADDRESSES.Avians, symbol: 'AVIAN', decimals: 18 },
    rate: 0n,
    periodFinish: fly.stakers.periodFinish,
    escrowed: 0n,
    totalPaid: fly.stakers.totalPaid,
    totalReturned: 0n,
  };
}

/** The wall clock at the moment the nest was read: `chainNow` is the block's, so the difference is the skew. */
const readAt = new WeakMap<object, number>();
function wallAt(r: object): number {
  let t = readAt.get(r);
  if (t === undefined) { t = Math.floor(Date.now() / 1000); readAt.set(r, t); }
  return t;
}

/**
 * The streams on the landing page: the one block that shows the flywheel
 * turning, which tokens exist, whether each streams right now, when it
 * ends, what has been paid. Read signed out: the brood read takes a wallet
 * only for the holder's own birds. The value line comes from the snapshot,
 * which the section has read already; `fly` is that read.
 */
export function StreamsBlock({ fly, read }: { fly: FlywheelSnapshot | undefined; read?: Polled<BroodState> }) {
  // The Bird Engine page reads the brood once for this and its counters, and
  // hands it here; this one's own read then stands idle after its first.
  const own = useBrood({ paused: !!read });
  const brood = read ?? own;
  const wall = useNow(1000);
  const r = brood.data;
  const now = r ? r.chainNow + Math.max(0, wall - wallAt(r)) : wall;

  return (
    <div className={s.block}>
      {/*
        The heading, and on its right the card's two calls (2026-09-25): stake
        AVIAN on the Roost page, brood a bird on the Nest. Each only while
        there is a stream it would earn from.
      */}
      <div className={s.top}>
        <h4>The streams</h4>
        <span className={s.calls}>
          {fly ? <a className="btn btn--ghost btn--compact" href={href({ name: 'nest', at: 'stake' })}>Stake AVIAN</a> : null}
          {r && r.streams.length > 0 ? <a className="btn btn--ghost btn--compact" href={href({ name: 'nest', at: 'birds' })}>Brood a bird</a> : null}
        </span>
      </div>
      {!r ? (
        brood.error ? (
          <p className="small dim" style={{ marginTop: 8 }}>The streams could not be read. They come back with the next refresh.</p>
        ) : (
          <div className="reward-row" style={{ marginTop: 12 }}><Unread /></div>
        )
      ) : (
        <>
          {r.streams.length === 0 ? (
            // The Nest's rows only: the stakers' stream below is not the Nest's.
            <p className="small dim" style={{ marginTop: 8 }}>Nothing streams yet: no reward token is listed.</p>
          ) : (
            <div style={{ marginTop: 4 }}>
              {r.streams.map((st) => <StreamRow key={st.token.address} stream={st} now={now} fly={fly} compact />)}
            </div>
          )}
          {/*
            THE STAKERS' STREAM (part 19): the staking contract's own, which
            the Nest's listing never shows. After the Nest's rows, in the same
            row, whether or not the Nest lists anything.
          */}
          {fly ? <StreamRow stream={stakersStream(fly)} now={now} fly={fly} compact who="stakers" /> : null}
        </>
      )}
    </div>
  );
}
