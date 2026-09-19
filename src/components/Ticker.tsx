// The price band: every listed stock token, in ETH, scrolling right to left.
//
// A figure to watch, not a quote: each price is a pool's mid-price at one
// block (`chain/prices.ts`), refreshed every fifteen seconds while the tab is
// visible. Up and down are against the previous refresh. There is no USD
// figure because nothing the site may reach knows one, and the Treasury's
// floor price is the owner's guardrail, not a market — it is not here.
//
// It is NOT a live region. Prices must never be announced on every tick; a
// screen reader finds the band by its caption and reads it when asked.

import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { formatPrice } from '../lib/format';
import { useNow, usePrices, useScenario } from '../mock';

/** Pixels per second. Slow enough to read, fast enough to be seen moving. */
const SPEED = 40;

export function Ticker() {
  const { board, previous, readAt } = usePrices();
  const now = useNow(1000);
  // The dev switcher's stand-in for the OS setting; the CSS handles the real one.
  const forcedStatic = useScenario().ticker === 'reduced-motion';
  const viewport = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLUListElement>(null);
  const [copies, setCopies] = useState(2);
  const [duration, setDuration] = useState(40);

  const items = board?.prices ?? [];
  const count = items.length;

  // The loop is seamless when the copies together are wider than the viewport
  // and each copy travels exactly its own width. The speed is constant
  // whatever is listed, so the duration comes from the measured width.
  useLayoutEffect(() => {
    const t = track.current;
    const v = viewport.current;
    if (!t || !v || count === 0) return;
    const w = t.scrollWidth;
    if (w === 0) return;
    setCopies(Math.max(2, Math.ceil(v.clientWidth / w) + 1));
    setDuration(Math.max(8, Math.round(w / SPEED)));
  }, [count, board?.blockNumber]);

  if (!board || count === 0) return null;

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

  return (
    <section className={`ticker${forcedStatic ? ' ticker--static' : ''}`} aria-labelledby="ticker-caption">
      <p id="ticker-caption" className="sr-only">
        Stock-token prices in ETH, read from Uniswap pools on this chain, {ago} seconds ago.
      </p>
      <div
        className="ticker__viewport"
        ref={viewport}
        tabIndex={0}
        style={{ '--ticker-duration': `${duration}s` } as CSSProperties}
      >
        {Array.from({ length: copies }, (_, i) => (
          <ul
            key={i}
            className="ticker__track"
            ref={i === 0 ? track : undefined}
            aria-hidden={i > 0 ? 'true' : undefined}
          >
            {rows}
          </ul>
        ))}
      </div>
    </section>
  );
}
