// The approval, asked for at the moment it is needed and never twice.
//
// Three routes, in the order they are worth offering:
//   permit  — one signature, no approval transaction at all
//   exact   — approve exactly what this costs
//   large   — approve once, mint repeatedly
//
// HANDOVER section 2 says to ask which they prefer rather than deciding for
// them, so this is a choice and not a default.

import { useState } from 'react';
import { Icon } from './Icon';
import { Tag } from './Primitives';
import { avians } from '../lib/format';
import { PRICE, type Amount } from '../mock';

export type ApprovalRoute = 'permit' | 'exact' | 'large';

const LARGE = PRICE * 100n;

export function ApprovalSheet({
  open, amount, what, action = 'mint', permitAvailable, busy, onClose, onApprove,
}: {
  open: boolean;
  amount: Amount;
  /** "the collection" / "the nest" / "the perch" */
  what: string;
  /** What the approval is FOR. The perch sells birds; it does not mint them. */
  action?: string;
  permitAvailable: boolean;
  busy: boolean;
  onClose: () => void;
  onApprove: (route: ApprovalRoute, amount: Amount) => void;
}) {
  const [route, setRoute] = useState<ApprovalRoute>(permitAvailable ? 'permit' : 'exact');
  if (!open) return null;

  const options: { id: ApprovalRoute; title: string; body: string; tag?: string }[] = [
    ...(permitAvailable ? [{
      id: 'permit' as const,
      title: 'One signature',
      body: `Your wallet signs a permit for exactly ${avians(amount)} and the site sends one transaction instead of two. No approval transaction, no extra gas.`,
      tag: 'Fewest steps',
    }] : []),
    {
      id: 'exact',
      title: `Approve ${avians(amount)}`,
      body: 'Exactly what this costs, and nothing beyond it. You approve again next time.',
    },
    {
      id: 'large',
      title: `Approve ${avians(LARGE)}`,
      body: `Approve once and ${action} repeatedly without approving again. A larger standing allowance to one contract.`,
    },
  ];

  return (
    <div className="scrim" role="dialog" aria-modal="true" aria-labelledby="approve-title" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <Tag tone="accent">Approval</Tag>
          <span className="spacer" />
          <button type="button" className="btn btn--ghost btn--small" onClick={onClose} aria-label="Close">
            <Icon name="cross" size={14} />
          </button>
        </div>

        <h3 id="approve-title" style={{ marginTop: 16 }}>One approval first, then the {action}.</h3>
        <p className="small" style={{ marginTop: 10 }}>
          {what} needs to be allowed to take AVIANS out of your wallet. Which way?
        </p>

        <div className="stack" style={{ marginTop: 16, gap: 8 }} role="radiogroup" aria-label="Approval route">
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={route === o.id}
              className={`box${route === o.id ? ' box--accent' : ''}`}
              style={{ textAlign: 'left', cursor: 'pointer', background: route === o.id ? undefined : 'transparent' }}
              onClick={() => setRoute(o.id)}
            >
              <div className="row">
                <span
                  aria-hidden="true"
                  style={{
                    width: 14, height: 14, flex: 'none',
                    border: `1px solid ${route === o.id ? 'var(--accent)' : 'var(--line-strong)'}`,
                    background: route === o.id ? 'var(--accent)' : 'transparent',
                  }}
                />
                <strong className="strong">{o.title}</strong>
                <span className="spacer" />
                {o.tag ? <Tag tone="ok">{o.tag}</Tag> : null}
              </div>
              <p className="small dim" style={{ marginTop: 8 }}>{o.body}</p>
            </button>
          ))}
        </div>

        <button
          type="button"
          className="btn btn--wide"
          style={{ marginTop: 16 }}
          disabled={busy}
          onClick={() => onApprove(route, route === 'large' ? LARGE : amount)}
        >
          {busy ? 'Waiting for your wallet…' : route === 'permit' ? 'Sign and mint' : 'Approve'}
        </button>

        {/* Only worth saying where a signature is one of the choices. */}
        {permitAvailable ? (
          <p className="tiny dim" style={{ marginTop: 12 }}>
            A permit signature is public the moment it is broadcast, so the contract carries on with
            whatever allowance actually exists if it does not land. You will never see &ldquo;your
            signature was rejected&rdquo; from us — you would see an allowance message instead.
          </p>
        ) : null}
      </div>
    </div>
  );
}
