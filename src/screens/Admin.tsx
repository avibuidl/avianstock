// The owner's panel.
//
// WHAT THIS SCREEN IS. A place to make owner calls without hand-crafting
// calldata against five contracts. Nothing more.
//
// WHAT IT IS NOT. A security boundary. Every function it can reach is
// `onlyOwner` on its contract, and THAT is the control: it refuses a wallet
// that is not the owner whether or not this file exists, whether or not the
// nav link is drawn, and whether or not somebody types the URL. Hiding a
// control is presentation. Nothing in this application protects these
// contracts, and nothing here should ever be described as though it did.
//
// AND IT ASKS FOR NOTHING. An admin panel is a phishing target by its nature,
// so: no seed phrase, no private key, no signature to "log in", no secret of
// any kind. Connecting a wallet is not authentication anywhere on this site,
// and least of all here. Every action is a transaction to a named contract at
// an address from the deployment manifest, and the contract decides.

import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { Box, ErrorState, PanelSkeleton, Tag } from '../components/Primitives';
import { Collection } from '../components/admin/Collection';
import { Nest } from '../components/admin/Nest';
import { Ownership } from '../components/admin/Ownership';
import { PerchAndVault } from '../components/admin/PerchAndVault';
import { Sweeps } from '../components/admin/Sweeps';
import { TreasuryPanel } from '../components/admin/TreasuryPanel';
import { shortAddress } from '../lib/format';
import { useAdmin, useConnection } from '../mock';
import s from './Admin.module.css';

const SECTIONS = [
  { id: 'ownership', label: 'Ownership' },
  { id: 'sweeps', label: 'Sweeps' },
  { id: 'treasury', label: 'The Treasury' },
  { id: 'collection', label: 'The collection' },
  { id: 'nest', label: 'The nest' },
  { id: 'perch', label: 'The perch and the lock' },
] as const;

export function Admin({ onConnect }: { onConnect: () => void }) {
  const admin = useAdmin();
  const connection = useConnection();
  const [at, setAt] = useState<string>('ownership');

  // The account can change mid-session, and when it does the panel has to stop
  // pretending. `useAdmin` re-reads on the address, and the refusal below is
  // rendered from that read rather than from anything remembered here.
  useEffect(() => { setAt('ownership'); }, [connection.status]);

  if (connection.status !== 'connected') {
    return (
      <div className="page" style={{ maxWidth: 720 }}>
        <p className="eyebrow">Owner</p>
        <h2>Connect the owner&rsquo;s wallet.</h2>
        <p className="lede">
          This page makes owner calls to the five contracts. Connecting tells the page which address
          to read against — it proves nothing and authorises nothing, and the contracts refuse
          anyone who is not the owner regardless.
        </p>
        <button type="button" className="btn" style={{ marginTop: 20 }} onClick={onConnect}>
          <Icon name="wallet" size={14} /> Connect wallet
        </button>
      </div>
    );
  }

  if (admin.loading && !admin.data) {
    return (
      <div className="page" style={{ maxWidth: 720 }}>
        <PanelSkeleton lines={6} />
      </div>
    );
  }

  if (admin.error || !admin.data) {
    return (
      <div className="page" style={{ maxWidth: 720 }}>
        <ErrorState
          title="The owner reads failed."
          detail="Nothing is shown rather than a page of zeros, because a zero here would read as a real setting."
          onRetry={admin.reload}
        />
      </div>
    );
  }

  const a = admin.data;

  // The panel opens for the owner of any of the five, OR for a pending owner of
  // any of them. The second half is not a convenience: `acceptOwnership` is
  // called by the PENDING owner, so an owner-only rule would hide the one
  // control the incoming owner needs, on the only screen that has it.
  if (!a.isOwner && !a.isPendingOwner) {
    return <Refusal you={a.you} expected={a.ownership[0]?.owner ?? null} />;
  }

  return (
    <div className={s.wrap}>
      <nav className={s.toc} aria-label="Sections">
        {SECTIONS.map((sec) => (
          <button
            key={sec.id}
            type="button"
            className={`${s.tocItem}${at === sec.id ? ` ${s.tocItemOn}` : ''}`}
            onClick={() => {
              setAt(sec.id);
              document.getElementById(sec.id)?.scrollIntoView({ block: 'start' });
            }}
          >
            {sec.label}
          </button>
        ))}
      </nav>

      <div>
        <p className="eyebrow">Owner</p>
        <h2>The controls, and what each one costs.</h2>
        <p className="lede" style={{ maxWidth: 760 }}>
          Every function on this page is <span className="mono">onlyOwner</span> on its contract, and
          that is what refuses everyone else. This page exists so the calls do not have to be
          hand-built — it is not a lock, and it is not protecting anything.
        </p>

        <div className="row row--wrap" style={{ gap: 10, marginTop: 16 }}>
          <Tag tone={a.isOwner ? 'accent' : 'warn'}>
            <Icon name="wallet" size={11} />{' '}
            {a.isOwner ? 'Owner' : 'Pending owner'} · {shortAddress(a.you ?? '')}
          </Tag>
          {!a.ownersAgree ? <Tag tone="bad">The five disagree</Tag> : null}
        </div>

        {a.isPendingOwner && !a.isOwner ? (
          <div style={{ marginTop: 18 }}>
            <Box tone="accent" title="You are the incoming owner">
              <p className="small" style={{ margin: 0 }}>
                Ownership is two-step, so nothing is yours until you accept it. Until then the
                contracts refuse you every other call on this page, and the sections below say so
                rather than pretending otherwise.
              </p>
            </Box>
          </div>
        ) : null}

        <div style={{ marginTop: 28 }} id="ownership">
          <Ownership admin={a} />
        </div>

        {a.isOwner ? (
          <>
            <div style={{ marginTop: 40 }} id="sweeps"><Sweeps admin={a} /></div>
            <div style={{ marginTop: 40 }} id="treasury"><TreasuryPanel admin={a} /></div>
            <div style={{ marginTop: 40 }} id="collection"><Collection admin={a} /></div>
            <div style={{ marginTop: 40 }} id="nest"><Nest admin={a} /></div>
            <div style={{ marginTop: 40 }} id="perch"><PerchAndVault admin={a} /></div>
          </>
        ) : null}

        <p className="tiny dim" style={{ marginTop: 48 }}>
          Some owner work is deliberately not here and lives in the deploy scripts instead:
          validator list governance, per-account freezing, and starting a reward stream. Each is
          rare, close to irreversible, or better done where a second person reads it first.
        </p>
      </div>
    </div>
  );
}

/**
 * The refusal.
 *
 * It names the connected address and the expected owner, because "you are not
 * the owner" without either is indistinguishable from a bug — and because
 * there is nothing to hide: `owner()` is a public view on a public contract.
 */
function Refusal({ you, expected }: { you: string | null; expected: string | null }) {
  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <p className="eyebrow">Owner</p>
      <h2>This wallet is not the owner.</h2>
      <p className="lede">
        Nothing is hidden from you here that the chain does not already publish. The contracts
        refuse an owner call from any other address, and they would refuse one from this page as
        readily as from anywhere else.
      </p>
      <dl className="kv" style={{ marginTop: 24, gridTemplateColumns: '130px 1fr' }}>
        <dt>Connected</dt><dd>{you ?? 'nothing'}</dd>
        <dt>Owner</dt><dd>{expected ?? 'could not be read'}</dd>
      </dl>
      <p className="small dim" style={{ marginTop: 20 }}>
        Switch to the owner&rsquo;s wallet and this page will re-read on its own.
      </p>
    </div>
  );
}
