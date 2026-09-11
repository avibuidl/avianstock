import { useState } from 'react';
import { Icon } from './Icon';
import { Address } from './Primitives';
import { href, useRoute, type Route } from '../router';
import { canSwap, useConnection, useOwnerStatus } from '../mock';

const NAV: { label: string; route: Route; needsWallet?: boolean }[] = [
  { label: 'Compose', route: { name: 'compose' } },
  { label: 'The Flock', route: { name: 'flock' } },
  { label: 'The Perch', route: { name: 'perch' } },
  { label: 'My Birds', route: { name: 'birds' }, needsWallet: true },
  { label: 'The Nest', route: { name: 'nest' } },
  { label: 'Contracts', route: { name: 'contracts' } },
  { label: 'Docs', route: { name: 'docs' } },
];

export function Header({ onWallet, onTrade }: { onWallet: () => void; onTrade: () => void }) {
  const route = useRoute();
  const c = useConnection();
  const [open, setOpen] = useState(false);
  // My Birds keeps its place in the order rather than being appended, so the
  // nav does not reshuffle the moment a wallet connects.
  const nav = NAV.filter((n) => !n.needsWallet || c.status === 'connected');

  // The owner's link. Drawn only for the owner or an incoming one — and that is
  // PRESENTATION, not access control: `#/admin` is reachable by typing it, the
  // page says plainly that it is not the owner's wallet, and every call behind
  // it is refused by the contract rather than by this line. A link nobody else
  // needs is simply noise in everybody else's nav.
  const owner = useOwnerStatus();
  const showAdmin = !!owner.data && (owner.data.isOwner || owner.data.isPendingOwner);

  return (
    <header className="site">
      <a className="site__brand" href={href({ name: 'landing' })} aria-label="Avian Stock, home">
        {/* A 16x16 drawing: only integer sizes, never smoothed. */}
        <img className="px" src="./logo/mark.svg" width={32} height={32} alt="" />
        <span className="site__wordmark">Avian Stock</span>
      </a>

      <button
        type="button"
        className="wchip site__burger"
        aria-expanded={open}
        aria-label={open ? 'Close the menu' : 'Open the menu'}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name={open ? 'cross' : 'sliders'} size={14} />
      </button>

      <nav className={`site__nav${open ? ' site__nav--open' : ''}`}>
        {[...nav, ...(showAdmin ? [{ label: 'Owner', route: { name: 'admin' } as Route }] : [])].map((n) => (
          <a
            key={n.label}
            href={href(n.route)}
            aria-current={route.name === n.route.name ? 'page' : undefined}
            onClick={() => setOpen(false)}
          >
            {n.label}
          </a>
        ))}
        {/*
          A button, not a link, because it opens a dialog and goes nowhere — but
          it sits inside the nav so it collapses into the burger with everything
          else on a phone instead of competing with the wallet chip for the
          header's last few pixels. Absent on a deployment with no pool.
        */}
        {canSwap() ? (
          <button
            type="button"
            className="site__navAction"
            onClick={() => { setOpen(false); onTrade(); }}
          >
            Trade AVIANS
          </button>
        ) : null}
      </nav>

      <span className="spacer" />
      <WalletChip onClick={onWallet} />
    </header>
  );
}

function WalletChip({ onClick }: { onClick: () => void }) {
  const c = useConnection();

  if (c.status === 'connected') {
    return (
      <button type="button" className="wchip" onClick={onClick}>
        <span className="dot" aria-hidden="true" />
        <Address value={c.address} />
        <span className="wchip__net">Robinhood Chain</span>
      </button>
    );
  }

  if (c.status === 'wrong-network' || c.status === 'unknown-network') {
    return (
      <button type="button" className="wchip wchip--bad" onClick={onClick}>
        <span className="dot dot--bad" aria-hidden="true" />
        <Address value={c.address} />
        <span className="wchip__net" style={{ color: 'var(--refusal)' }}>Wrong network</span>
      </button>
    );
  }

  if (c.status === 'connecting') {
    return (
      <span className="wchip"><Icon name="dots" size={14} /> Waiting for your wallet…</span>
    );
  }

  return (
    <button type="button" className="btn btn--small" onClick={onClick}>
      <Icon name="wallet" size={14} /> {c.status === 'no-wallet' ? 'No wallet found' : 'Connect wallet'}
    </button>
  );
}
