// The price band: every listed stock token, in ETH, scrolling right to left.
//
// A figure to watch, not a quote: each price is a pool's mid-price at one
// block (`chain/prices.ts`), refreshed every fifteen seconds while the tab is
// visible. Up and down are against the previous refresh. There is no USD
// figure because nothing the site may reach knows one, and the Treasury's
// floor price is the owner's guardrail, not a market — it is not here.
//
// THE COUNCIL'S HALF (2026-09-25). While the council has a change waiting
// (scheduled, not executed, not cancelled: the list the card on the Owner
// page reads), the band splits in two equal halves with a hairline between
// them: the waiting changes on the left, each its one sentence and its
// countdown, and the prices on the right, scrolling as always. The left half
// scrolls too when there is more than one change or the one does not fit.
// When the list empties the split goes by itself on the next read, and the
// prices take the whole band again. The band's height is the same either way.
//
// It is NOT a live region. Prices must never be announced on every tick; a
// screen reader finds the band by its caption and reads it when asked.

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { formatPrice, formatWait, shortAddress } from '../lib/format';
import { useCouncil, useNow, usePrices, useScenario, type CouncilChange, type CouncilState } from '../mock';

/** Pixels per second. Slow enough to read, fast enough to be seen moving. */
const SPEED = 40;

/** The wall clock when a council read landed, so the chain's clock can be carried forward. */
const landed = new WeakMap<CouncilState, number>();
function wallAt(c: CouncilState): number {
  let t = landed.get(c);
  if (t === undefined) { t = Math.floor(Date.now() / 1000); landed.set(c, t); }
  return t;
}

/** A change's sentence with its addresses short, and its wait. */
function changeReads(p: CouncilChange, now: number): { says: string; wait: string } {
  const left = p.readyAt - now;
  return {
    says: p.says.replace(/0x[0-9a-fA-F]{40}/g, (a) => shortAddress(a)),
    wait: left > 0 ? `in ${formatWait(left)}` : 'lands any moment',
  };
}

/**
 * One marquee: its items in as many copies as the viewport needs for a
 * seamless loop, at a constant speed. With `still` allowed and one copy that
 * fits, it stands still instead.
 */
function Marquee({
  items, measureKey, allowStill, label,
}: { items: ReactNode; measureKey: string; allowStill: boolean; label?: string }) {
  const viewport = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLUListElement>(null);
  const [copies, setCopies] = useState(2);
  const [duration, setDuration] = useState(40);
  const [still, setStill] = useState(false);

  // The loop is seamless when the copies together are wider than the viewport
  // and each copy travels exactly its own width. The speed is constant
  // whatever is listed, so the duration comes from the measured width.
  useLayoutEffect(() => {
    const t = track.current;
    const v = viewport.current;
    if (!t || !v) return;
    const measure = () => {
      const w = t.scrollWidth;
      if (w === 0) return;
      const fits = allowStill && w <= v.clientWidth;
      setStill(fits);
      setCopies(fits ? 1 : Math.max(2, Math.ceil(v.clientWidth / w) + 1));
      setDuration(Math.max(8, Math.round(w / SPEED)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(v);
    return () => ro.disconnect();
  }, [measureKey, allowStill]);

  return (
    <div
      className={`ticker__viewport${still ? ' ticker__viewport--still' : ''}`}
      ref={viewport}
      tabIndex={0}
      aria-label={label}
      style={{ '--ticker-duration': `${duration}s` } as CSSProperties}
    >
      {Array.from({ length: copies }, (_, i) => (
        <ul
          key={i}
          className="ticker__track"
          ref={i === 0 ? track : undefined}
          aria-hidden={i > 0 ? 'true' : undefined}
        >
          {items}
        </ul>
      ))}
    </div>
  );
}

export function Ticker() {
  const { board, previous, readAt } = usePrices();
  const council = useCouncil();
  const now = useNow(1000);
  // The dev switcher's stand-in for the OS setting; the CSS handles the real one.
  const forcedStatic = useScenario().ticker === 'reduced-motion';

  const items = board?.prices ?? [];
  const count = items.length;

  // No read, a failed read, or an empty list: no split. That is the everyday state.
  const c = council.data;
  const pending = c?.pending ?? [];
  const split = pending.length > 0;
  const chainNow = c ? c.chainNow + Math.max(0, now - wallAt(c)) : now;

  if (count === 0 && !split) return null;

  const ago = readAt === null ? 0 : Math.max(0, now - readAt);
  const rows = items.map((p) => {
    const before = previous.get(p.address.toLowerCase());
    const dir = before === undefined || before === p.ethPerToken ? null
      : p.ethPerToken > before ? 'up' : 'down';
    return (
      <li key={p.address} className="ticker__item">
        <span className="ticker__sym">{p.symbol}</span>
        <span className="num ticker__price">{formatPrice(p.ethPerToken)} ETH</span>
        {dir ? (
          <>
            <span className={`ticker__mark ticker__mark--${dir}`} aria-hidden="true" />
            <span className="sr-only">{dir}</span>
          </>
        ) : null}
      </li>
    );
  });

  const changes = pending.map((p) => {
    const r = changeReads(p, chainNow);
    return (
      <li key={`${p.id}:${p.index}`} className={`ticker__item ticker__change${p.kind === 'rescue' ? ' ticker__change--rescue' : ''}`}>
        <span className="ticker__says">{r.says}</span>
        <span className="dim" aria-hidden="true">&middot;</span>
        <span className="num ticker__price">{r.wait}</span>
      </li>
    );
  });

  return (
    <section
      className={`ticker${split ? ' ticker--split' : ''}${forcedStatic ? ' ticker--static' : ''}`}
      aria-labelledby="ticker-caption"
    >
      <p id="ticker-caption" className="sr-only">
        {`${split ? `${pending.length === 1 ? 'One change' : `${pending.length} changes`} waiting at the council, then s` : 'S'}tock-token prices in ETH, read from Uniswap pools on this chain, ${ago} seconds ago.`}
      </p>

      {split ? (
        <div className="ticker__half ticker__half--council">
          <span className="ticker__sym ticker__label" aria-hidden="true">Council</span>
          <Marquee
            items={changes}
            measureKey={pending.map((p) => `${p.id}:${p.index}`).join('|')}
            allowStill={pending.length === 1}
            label="Changes waiting at the council"
          />
        </div>
      ) : null}

      {count > 0 ? (
        <div className="ticker__half">
          <Marquee
            items={rows}
            measureKey={`${count}:${board?.blockNumber ?? ''}:${split ? 'half' : 'whole'}`}
            allowStill={false}
          />
        </div>
      ) : null}
    </section>
  );
}
