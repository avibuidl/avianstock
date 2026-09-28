// The frame's left edge: the wordmark, the pages one per line, the wallet at
// the bottom. On a wide screen it is a column the page never runs under;
// below the breakpoint it folds into a drawer that slides in from the left
// over the content, and a thin strip at the top keeps the mark, the burger
// and the wallet where a thumb reaches them.
//
// The order in the DOM is the order on the keyboard: wordmark, links, the
// trade action, wallet, then the page. Nothing here is reordered by CSS.

import { useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from './Icon';
import { Address } from './Primitives';
import { shortAddress } from '../lib/format';
import { href, useRoute, type Route } from '../router';
import { NETWORK, canSwap, useConnection, useOwnerStatus } from '../mock';

// Each page is a block: a small line drawing, then the name, tracked and in
// capitals, in a bordered box; the current one is filled in the accent. The
// icons are the site's own 16px set, one per page.
const NAV: { label: string; route: Route; icon: IconName; needsWallet?: boolean }[] = [
  { label: 'Compose', route: { name: 'compose' }, icon: 'plus' },
  { label: 'The Flock', route: { name: 'flock' }, icon: 'search' },
  { label: 'The Perch', route: { name: 'perch' }, icon: 'cycle' },
  // My Birds, The Nest and The Roost became one page, My Nest, on 2026-09-27.
  // In the list for everyone: disconnected, it shows its own shape.
  { label: 'My Nest', route: { name: 'nest' }, icon: 'nest' },
  { label: 'The Bird Engine', route: { name: 'engine' }, icon: 'cog' },
  { label: 'Docs', route: { name: 'docs' }, icon: 'book' },
];

export function Sidebar({ onWallet, onTrade }: { onWallet: () => void; onTrade: () => void }) {
  const route = useRoute();
  const c = useConnection();
  const [open, setOpen] = useState(false);
  const burger = useRef<HTMLButtonElement>(null);
  const first = useRef<HTMLAnchorElement>(null);
  // My Birds keeps its place in the order rather than being appended, so the
  // list does not reshuffle the moment a wallet connects.
  const nav = NAV.filter((n) => !n.needsWallet || c.status === 'connected');

  // The owner's link. Drawn only for the owner or an incoming one — and that is
  // PRESENTATION, not access control: `#/admin` is reachable by typing it, the
  // page says plainly that it is not the owner's wallet, and every call behind
  // it is refused by the contract rather than by this line. A link nobody else
  // needs is simply noise in everybody else's nav.
  const owner = useOwnerStatus();
  const showAdmin = !!owner.data && (owner.data.isOwner || owner.data.isPendingOwner);
  const links = [...nav, ...(showAdmin ? [{ label: 'Owner', route: { name: 'admin' } as Route, icon: 'sliders' as IconName }] : [])];

  const close = () => setOpen(false);

  // The rail (app.css) opens on :hover and :focus-within. After a page or a
  // control is picked the pointer is still on the column and the link still
  // has focus, so it stayed open until the pointer wandered off. `shut`
  // overrides both from the click until the pointer leaves or focus comes
  // back in; the link is blurred so a Tab afterwards starts from the page.
  const [shut, setShut] = useState(false);
  const shutRail = (e: React.MouseEvent<HTMLElement>) => {
    if (!(e.target as HTMLElement).closest('a, button')) return;
    setShut(true);
    (document.activeElement as HTMLElement | null)?.blur();
  };

  // The drawer: Escape closes it and hands focus back to the burger; opening
  // it puts focus on the first page. A followed link closes it through the
  // route change below, so a tap on "Docs" does not leave it hanging open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); burger.current?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    first.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  useEffect(() => { setOpen(false); }, [route.name]);

  const brand = (
    <a className="brand" href={href({ name: 'landing' })} aria-label="Avian Stock, home">
      {/* A 16x16 drawing: only integer sizes, never smoothed. */}
      <img className="px" src="./logo/mark.svg" width={32} height={32} alt="" />
      <span className="brand__wordmark">Avian Stock</span>
    </a>
  );

  return (
    <>
      {/* The strip: below the breakpoint only (CSS hides it above). */}
      <div className="topbar">
        {brand}
        <button
          ref={burger}
          type="button"
          className="wchip topbar__burger"
          aria-expanded={open}
          aria-controls="site-nav"
          aria-label={open ? 'Close the menu' : 'Open the menu'}
          onClick={() => setOpen((v) => !v)}
        >
          <Icon name={open ? 'cross' : 'menu'} size={14} />
        </button>
        <span className="spacer" />
        <WalletChip onClick={onWallet} />
      </div>

      {open ? <div className="side__scrim" onClick={close} aria-hidden="true" /> : null}

      <aside
        id="site-nav"
        className={`side${open ? ' side--open' : ''}${shut ? ' side--shut' : ''}`}
        aria-label="Site"
        onClickCapture={shutRail}
        onMouseLeave={() => setShut(false)}
        onFocus={() => setShut(false)}
      >
        {brand}
        <nav className="side__nav" aria-label="Pages">
          {links.map((n, i) => (
            <a
              key={n.label}
              ref={i === 0 ? first : undefined}
              href={href(n.route)}
              // The name, whether or not the label is drawn: on the rail
              // (app.css) the span is display: none, which takes it out of
              // the accessibility tree as well as off the screen.
              aria-label={n.label}
              aria-current={route.name === n.route.name ? 'page' : undefined}
              onClick={close}
            >
              <Icon name={n.icon} size={14} />
              <span>{n.label}</span>
            </a>
          ))}
          {/*
            A button, not a link, because it opens a dialog and goes nowhere —
            but it sits among the pages so it folds into the drawer with them.
            Absent on a deployment with no pool.
          */}
          {canSwap() ? (
            <button
              type="button"
              className="side__navAction"
              aria-label="Trade AVIAN"
              onClick={() => { close(); onTrade(); }}
            >
              <Icon name="swap" size={14} />
              <span>Trade AVIAN</span>
            </button>
          ) : null}
        </nav>
        <div className="side__wallet">
          <WalletChip onClick={onWallet} />
        </div>
      </aside>
    </>
  );
}

/** The wallet control: the foot of the sidebar on a wide screen, the strip below the breakpoint. */
function WalletChip({ onClick }: { onClick: () => void }) {
  const c = useConnection();

  if (c.status === 'connected') {
    return (
      <button type="button" className="wchip" onClick={onClick} aria-label={`Wallet ${shortAddress(c.address)}, ${NETWORK.chainName}`}>
        <span className="dot" aria-hidden="true" />
        <Address value={c.address} />
        <span className="wchip__net">{NETWORK.chainName}</span>
      </button>
    );
  }

  if (c.status === 'wrong-network' || c.status === 'unknown-network') {
    return (
      <button type="button" className="wchip wchip--bad" onClick={onClick} aria-label={`Wallet ${shortAddress(c.address)}, wrong network`}>
        <span className="dot dot--bad" aria-hidden="true" />
        <Address value={c.address} />
        <span className="wchip__net" style={{ color: 'var(--refusal)' }}>Wrong network</span>
      </button>
    );
  }

  if (c.status === 'connecting') {
    return (
      <span className="wchip" aria-label="Waiting for your wallet"><Icon name="dots" size={14} /><span className="wchip__text">Waiting for your wallet…</span></span>
    );
  }

  return (
    <button type="button" className="btn btn--small" onClick={onClick} aria-label={c.status === 'no-wallet' ? 'No wallet found' : 'Connect wallet'}>
      <Icon name="wallet" size={14} /><span>{c.status === 'no-wallet' ? 'No wallet found' : 'Connect wallet'}</span>
    </button>
  );
}
