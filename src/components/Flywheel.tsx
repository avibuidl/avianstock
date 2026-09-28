// The flywheel snapshot (2026-09-22): the landing page's live figures, under
// the heading "The Bird Engine" since 2026-09-25, the name of the page that
// holds the machinery behind them.
//
// One read at one block, refreshed on the quiet timer, drawn as three cards
// in the order value moves: the birds, AVIAN, the Roost; then every token
// the Nest has ever paid out, as chips, with one total. Every dollar figure
// is derived here from `usd.usdPerEth` and is simply absent when the
// deployment has no dollar source; a null price hides its value the same
// way. Nothing about the vault products or the Roost's third leg is drawn,
// and the three Roost figures are not made to sum to anything.

import type { ReactNode } from 'react';
import s from './Flywheel.module.css';
import { Tag, Unread } from './Primitives';
import { StreamsBlock } from './Streams';
import {
  avians, formatCompact, formatCount, formatCountdown, formatEthSig, formatShare, formatUsd,
  formatUsdPrice, usdOf,
} from '../lib/format';
import { href } from '../router';
import { canSwap, useFlywheel, useNow, type FlywheelSnapshot } from '../mock';

const WAD = 10n ** 18n;

/** The wall clock at the moment a snapshot landed, so the countdown runs on the chain's clock plus the seconds since. */
const landed = new WeakMap<FlywheelSnapshot, number>();
function wallAt(f: FlywheelSnapshot): number {
  let t = landed.get(f);
  if (t === undefined) { t = Math.floor(Date.now() / 1000); landed.set(f, t); }
  return t;
}

/**
 * `onTrade` opens the site's one trade modal, the same one a refusal's "Get
 * AVIAN" fix opens; App.tsx holds it and hands the callback down, as it does
 * to the Sidebar.
 */
export function FlywheelSnapshotSection({ onTrade }: { onTrade: () => void }) {
  const fly = useFlywheel();
  const wall = useNow(1000);
  const f = fly.data;
  const usd = f?.usd?.usdPerEth ?? null;
  const dollars = (eth: bigint | null) => (eth !== null && usd !== null ? usdOf(eth, usd) : null);

  // The Roost's countdown, on the same footing as the Roost screen's: the
  // block's clock plus the seconds since the read landed.
  const chainNow = f ? f.readAt + Math.max(0, wall - wallAt(f)) : 0;
  const next = f?.roost.nextDistributeAt ?? null;
  const due = next !== null && next <= chainNow;

  const cap = f && f.avian.ethPerAvian !== null ? (f.avian.totalSupply * f.avian.ethPerAvian) / WAD : null;
  const capUsd = dollars(cap);
  const priceUsd = dollars(f?.avian.ethPerAvian ?? null);
  const paidEth = f && f.paid.length > 0 && f.paid.every((p) => p.ethValue !== null)
    ? f.paid.reduce((a, p) => a + (p.ethValue ?? 0n), 0n)
    : null;
  const paidUsd = dollars(paidEth);

  return (
    <>
      <h2>The Bird Engine</h2>

      {fly.error && !f ? (
        <p className="small dim" style={{ marginTop: 16 }}>
          The chain could not be read for this. The figures come back with the next refresh.
        </p>
      ) : null}

      <div className={s.groups}>
        <div className={s.group}>
          <h4>Birds</h4>
          <div className={s.cells}>
            <Cell wide fig={f ? <>{formatCount(f.birds.minted)} <span className={s.of}>/ {formatCount(f.birds.maxSupply)}</span></> : <Unread />} label="minted" />
            <Cell fig={f ? formatCount(f.birds.burned) : <Unread />} label={f?.birds.burned === 1 ? 'bird burnt' : 'birds burnt'} />
            <Cell fig={f ? formatCount(f.birds.brooding) : <Unread />} label="brooding now" />
            <Cell
              wide
              fig={f ? formatCount(f.birds.onPerch) : <Unread />}
              label="on the perch"
              sub={f ? <>It buys one back at <span className="num">{avians(f.birds.perchBuysAt)}</span>.</> : undefined}
            />
          </div>
          <div className={s.actions}>
            <a className="btn btn--compact" href={href({ name: 'compose' })}>Mint a bird</a>
          </div>
        </div>

        <div className={s.group}>
          <h4>AVIAN</h4>
          <div className={s.cells}>
            <Cell
              wide
              fig={!f ? <Unread />
                : f.avian.ethPerAvian === null ? <span className={s.none}>No price this refresh.</span>
                  : formatEthSig(f.avian.ethPerAvian)}
              label="price"
              sub={priceUsd !== null ? <><span className="num">{formatUsdPrice(priceUsd)}</span> at today&rsquo;s pool prices</> : undefined}
            />
            <Cell fig={f ? formatCompact(f.avian.totalSupply) : <Unread />} label="supply now" />
            <Cell
              fig={f ? formatCompact(f.avian.burned) : <Unread />}
              label="total burnt"
              sub={f ? <><span className="num">{formatShare(f.avian.burned, f.avian.originalSupply)}</span> of {formatCompact(f.avian.originalSupply)}</> : undefined}
            />
            <Cell
              fig={!f ? <Unread />
                : cap === null ? <span className={s.none}>No price this refresh.</span>
                  : capUsd !== null ? formatUsd(capUsd) : formatEthSig(cap)}
              label="market cap"
              sub={cap !== null && capUsd !== null ? <span className="num">{formatEthSig(cap)}</span> : undefined}
            />
            <Cell fig={f ? formatCompact(f.avian.staked) : <Unread />} label="staked now" />
          </div>
          <div className={s.actions}>
            {/* No pool on this deployment: nothing to get it from, so no button rather than a dead one. */}
            {canSwap() ? <button type="button" className="btn btn--compact" onClick={onTrade}>Get AVIAN</button> : null}
            <a className="btn btn--ghost btn--compact" href={href({ name: 'nest', at: 'stake' })}>Stake</a>
          </div>
        </div>

        <div className={s.group}>
          <h4>The Roost</h4>
          <div className={s.cells}>
            <Cell
              wide
              fig={f ? `${formatCompact(f.roost.allocated)} AVIAN` : <Unread />}
              label="split so far"
              // The Treasury's tenth buys AVIAN and sends it here, so some of
              // what the Roost splits was bought rather than paid in fees.
              sub={f && f.avian.boughtForRoost > 0n
                ? <>of which <span className="num">{formatCompact(f.avian.boughtForRoost)}</span> AVIAN bought by the Treasury</>
                : undefined}
            />
            <Cell fig={f ? formatCompact(f.roost.toStaking) : <Unread />} label="to stakers" />
            <Cell fig={f ? formatCompact(f.roost.toNest) : <Unread />} label="to brooding birds" />
            <Cell fig={f ? formatCompact(f.roost.burned) : <Unread />} label="burnt" />
            <Cell
              fig={!f ? <Unread />
                : next === null ? <span className={s.none}>Not yet</span>
                  : due ? <span className={s.none}>Due now</span>
                    : formatCountdown(next - chainNow)}
              label="next turn"
            />
          </div>
          <div className={s.actions}>
            <a className="btn btn--ghost btn--compact" href={href({ name: 'engine', at: 'roost' })}>See the Roost</a>
          </div>
        </div>
      </div>

      <div className={s.paid}>
        <h4>Total paid out</h4>
        {!f ? (
          <div className={s.chips}><span className={s.chip}><Unread /></span></div>
        ) : f.paid.length === 0 ? (
          <p className="small dim" style={{ marginTop: 8 }}>Nothing has been paid out yet.</p>
        ) : (
          <>
            <div className={s.chips}>
              {f.paid.map((p) => {
                const d = dollars(p.ethValue);
                return (
                  <span key={p.token} className={s.chip}>
                    <Tag>{p.symbol}</Tag>
                    <span className={s.amt}>{formatCompact(p.amount, p.decimals)}</span>
                    {p.ethValue !== null ? (
                      <span className={s.val}>{formatEthSig(p.ethValue)}{d !== null ? ` (${formatUsd(d)})` : ''}</span>
                    ) : null}
                  </span>
                );
              })}
            </div>
            {paidEth !== null ? (
              <p className={`small ${s.total}`}>
                Paid to holders, ever: <span className="num">{formatEthSig(paidEth)}</span>
                {paidUsd !== null ? <> <span className="num">({formatUsd(paidUsd)})</span></> : null} at today&rsquo;s prices.
              </p>
            ) : null}
          </>
        )}
      </div>

      <p className={`tiny dim ${s.foot}`}>
        {f
          ? <>Read from the chain at block {formatCount(f.blockNumber)} and valued at today&rsquo;s pool prices: a measurement, not a promise.</>
          : <>Read from the chain at one block and valued at today&rsquo;s pool prices: a measurement, not a promise.</>}
      </p>

      {/* The Nest's streams, in compact form: the one block that shows the
          flywheel turning. The same rows the Nest draws, from the same read. */}
      <StreamsBlock fly={f} />
    </>
  );
}

function Cell({ fig, label, sub, wide }: { fig: ReactNode; label: string; sub?: ReactNode; wide?: boolean }) {
  return (
    <div className={`${s.cell}${wide ? ` ${s.wide}` : ''}`}>
      <div className={s.fig}>{fig}</div>
      <div className={`label ${s.lbl}`}>{label}</div>
      {sub ? <div className={s.sub}>{sub}</div> : null}
    </div>
  );
}
