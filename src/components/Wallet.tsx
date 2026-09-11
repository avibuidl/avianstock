// The wallet dialog and the network gate.
//
// EIP-6963 discovery, so a person with three wallets installed chooses; and the
// 4902 add-then-switch path spelled out, because it is two prompts and the
// place people give up.

import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { Address, Note, Tag } from './Primitives';
import {
  NETWORK, connect, disconnect, listWallets, switchNetwork,
  useConnection, type WalletInfo,
} from '../mock';

export function WalletDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const c = useConnection();
  const [wallets, setWallets] = useState<WalletInfo[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) listWallets().then(setWallets); }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="scrim" role="dialog" aria-modal="true" aria-labelledby="wallet-title" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <Tag tone="accent">Wallet</Tag>
          <span className="spacer" />
          <button type="button" className="btn btn--ghost btn--small" onClick={onClose} aria-label="Close">
            <Icon name="cross" size={14} />
          </button>
        </div>

        {c.status === 'no-wallet' ? (
          <>
            <h3 id="wallet-title" style={{ marginTop: 16 }}>No wallet found.</h3>
            <p className="small" style={{ marginTop: 10 }}>
              Nothing on this browser announced itself. Install a browser wallet, or open this page
              inside a wallet&rsquo;s own browser — a lot of minting happens that way.
            </p>
            <p className="small dim" style={{ marginTop: 10 }}>
              Reading the site works either way: the flock, the perch, the numbers and the contracts
              are all still here.
            </p>
          </>
        ) : c.status === 'connected' ? (
          <>
            <h3 id="wallet-title" style={{ marginTop: 16 }}>Connected.</h3>
            <dl className="kv" style={{ marginTop: 16 }}>
              <dt>Wallet</dt><dd>{c.wallet.name}</dd>
              <dt>Address</dt><dd><Address value={c.address} long /></dd>
              <dt>Network</dt><dd>{NETWORK.chainName} · {NETWORK.chainId}</dd>
            </dl>
            <button
              type="button"
              className="btn btn--ghost btn--wide"
              style={{ marginTop: 16 }}
              onClick={() => { disconnect(); onClose(); }}
            >
              Disconnect
            </button>
          </>
        ) : c.status === 'wrong-network' || c.status === 'unknown-network' ? (
          <NetworkPanel onDone={onClose} />
        ) : (
          <>
            <h3 id="wallet-title" style={{ marginTop: 16 }}>Which wallet?</h3>
            <p className="small dim" style={{ marginTop: 8 }}>
              Every wallet that announced itself on this browser.
            </p>
            <div className="stack" style={{ marginTop: 16, gap: 8 }}>
              {wallets.map((w) => (
                <button
                  key={w.rdns}
                  type="button"
                  className="btn btn--ghost btn--wide"
                  style={{ justifyContent: 'flex-start', gap: 12 }}
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    // Dismissing the wallet's prompt is a decision, not a
                    // failure. The chooser stays open so it can be made again.
                    try { await connect(w.rdns); onClose(); } catch { /* still disconnected */ }
                    setBusy(false);
                  }}
                >
                  <span
                    className="mono"
                    aria-hidden="true"
                    style={{
                      width: 28, height: 28, display: 'inline-flex', alignItems: 'center',
                      justifyContent: 'center', border: '1px solid var(--line-strong)', fontSize: 11,
                    }}
                  >
                    <WalletIcon wallet={w} />
                  </span>
                  {w.name}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * An EIP-6963 announcement is untrusted input from a browser extension. A real
 * wallet's icon is a `data:image/…` URI — rendered in an `<img>`, which cannot
 * execute script and cannot reach the network — and anything that is not one
 * renders as the two letters `provider.ts` fell back to. It is never markup.
 */
function WalletIcon({ wallet }: { wallet: WalletInfo }) {
  if (/^data:image\/(png|jpeg|gif|webp|svg\+xml);/i.test(wallet.icon)) {
    return <img src={wallet.icon} alt="" width={20} height={20} />;
  }
  return <>{wallet.icon}</>;
}

/** The switch, and the two-prompt version of it. */
export function NetworkPanel({ onDone }: { onDone?: () => void }) {
  const c = useConnection();
  const [busy, setBusy] = useState(false);
  const unknown = c.status === 'unknown-network';

  // Dismissing either prompt rejects, and that is an ordinary thing to do —
  // not an error to throw at the console. The panel stays where it is and the
  // copy already says you can start again from here.
  const go = async () => {
    setBusy(true);
    try {
      await switchNetwork();
      onDone?.();
    } catch {
      // Left on the wrong network, deliberately. Nothing to say that the
      // persistent bar and this panel are not already saying.
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="row" style={{ marginTop: 16 }}>
        {unknown ? <Tag tone="hot">Chain unknown to this wallet</Tag> : <Tag tone="bad">Wrong network</Tag>}
        <span className="spacer" />
        <span className="mono tiny dim">{unknown ? 'error 4902' : 'chain → 4663'}</span>
      </div>

      <h3 style={{ marginTop: 16 }}>
        {unknown
          ? 'Your wallet has never seen Robinhood Chain.'
          : 'Nothing here can be signed until you switch.'}
      </h3>

      <p className="small" style={{ marginTop: 10 }}>
        {unknown
          ? 'We’ll ask it to add the network, and then switch to it. That is two prompts, and the second only appears after you accept the first.'
          : 'Avian Stock is on Robinhood Chain, id 4663. We check the chain immediately before every transaction, not once when the page loads — a person can switch networks at any moment, and a mint sent to the wrong chain is a real loss.'}
      </p>

      {unknown ? (
        <div className="inset" style={{ marginTop: 16 }}>
          <dl className="kv" style={{ gridTemplateColumns: '110px 1fr' }}>
            <dt>Network</dt><dd>{NETWORK.chainName}</dd>
            <dt>Chain id</dt><dd>{NETWORK.chainId} · {NETWORK.chainIdHex}</dd>
            <dt>Currency</dt><dd>ETH · 18 decimals</dd>
            <dt>RPC</dt><dd style={{ fontSize: 11.5 }}>{NETWORK.rpcUrls[0]}</dd>
            <dt>Explorer</dt><dd style={{ fontSize: 11.5 }}>{NETWORK.blockExplorerUrls[0]}</dd>
          </dl>
        </div>
      ) : null}

      <button type="button" className="btn btn--wide" style={{ marginTop: 16 }} disabled={busy} onClick={go}>
        {busy ? 'Waiting for your wallet…' : unknown ? 'Add Robinhood Chain, then switch' : 'Switch to Robinhood Chain'}
      </button>

      {unknown ? (
        <div className="row" style={{ marginTop: 14, gap: 8 }}>
          <Tag>Step 1 · Add</Tag><Icon name="arrow" size={14} color="var(--ash)" /><Tag>Step 2 · Switch</Tag>
        </div>
      ) : null}

      <p className="tiny dim" style={{ marginTop: 12 }}>
        {unknown
          ? 'If you dismiss the first prompt nothing is lost — you can start again from here.'
          : 'Reading the site still works. Every button that would sign something is disabled, with the reason on it.'}
      </p>
    </>
  );
}

/** The persistent bar. Shown on every screen while the chain is wrong. */
export function NetworkBar({ onFix }: { onFix: () => void }) {
  const c = useConnection();
  if (c.status !== 'wrong-network' && c.status !== 'unknown-network') return null;
  return (
    <div className="warnbar" role="alert">
      <Note tone="bad">
        <strong className="strong">
          {c.status === 'unknown-network'
            ? 'Your wallet has never seen Robinhood Chain.'
            : 'You’re on another network. Avian Stock lives on Robinhood Chain.'}
        </strong>
      </Note>
      <span className="spacer" />
      <button type="button" className="btn btn--small" onClick={onFix}>
        {c.status === 'unknown-network' ? 'Add and switch' : 'Switch network'}
      </button>
    </div>
  );
}

/**
 * The in-place gate. Every write control is wrapped in one of these, so a
 * disabled button always says why rather than just being grey.
 */
export function WriteGate({
  children, onConnect,
}: { children: React.ReactNode; onConnect: () => void }) {
  const c = useConnection();
  if (c.status === 'connected') return <>{children}</>;

  const label = c.status === 'no-wallet' ? 'No wallet found'
    : c.status === 'connecting' ? 'Waiting for your wallet…'
      : c.status === 'disconnected' ? 'Connect a wallet'
        : 'Switch to Robinhood Chain';

  const why = c.status === 'no-wallet'
    ? 'Install a browser wallet, or open this page inside a wallet’s own browser.'
    : c.status === 'disconnected' ? 'Nothing is signed by connecting.'
      : c.status === 'connecting' ? 'The prompt is open in your wallet.'
        : 'Avian Stock is on Robinhood Chain, id 4663.';

  return (
    <div>
      <button
        type="button"
        className="btn btn--wide"
        onClick={onConnect}
        disabled={c.status === 'connecting' || c.status === 'no-wallet'}
      >
        {label}
      </button>
      <p className="tiny dim" style={{ marginTop: 8 }}>{why}</p>
    </div>
  );
}
