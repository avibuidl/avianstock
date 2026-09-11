// Ownership, which is two-step on all five.
//
// First on the page, because it is the thing that can be wrong without anyone
// noticing: a hand-off in flight, or five contracts that no longer agree on who
// owns them. Both are drawn loudly rather than as another row.
//
// `renounceOwnership` is here as a DISABLED row. It exists on all five and it
// reverts on all five, by design, so no owner can walk away and leave these
// contracts unattended. That is a property worth showing, not a gap to hide —
// but it is never offered as an action.

import { useState } from 'react';
import { Icon } from '../Icon';
import { Box, Note, Tag } from '../Primitives';
import {
  ActionButton, Addr, Control, Field, isAddressish, useAdminActions,
} from './Bits';
import { acceptOwnership, transferOwnership, type AdminContract, type AdminState } from '../../mock';
import s from '../../screens/Admin.module.css';

export function Ownership({ admin }: { admin: AdminState }) {
  const actions = useAdminActions();
  const [to, setTo] = useState<Record<string, string>>({});
  const you = admin.you?.toLowerCase() ?? null;

  return (
    <section aria-labelledby="own-h">
      <h3 id="own-h" style={{ fontSize: 20 }}>Ownership</h3>
      <p className="small dim" style={{ marginTop: 8 }}>
        Every one of these is <span className="mono">Ownable2Step</span>: a transfer names a
        pending owner and nothing changes until that address accepts.
      </p>

      {!admin.ownersAgree ? (
        <div style={{ marginTop: 16 }}>
          <Box tone="bad" title="These five do not agree on who owns them">
            <p className="small" style={{ margin: 0 }}>
              That is either a deploy still in progress or a mistake, and both are worth stopping
              for. The owner of each is below.
            </p>
          </Box>
        </div>
      ) : null}

      {admin.ownership.some((o) => o.pendingOwner) ? (
        <div style={{ marginTop: 16 }}>
          <Box tone="warn" title="A hand-off is in flight">
            <p className="small" style={{ margin: 0 }}>
              {admin.ownership.filter((o) => o.pendingOwner).map((o) => o.contract).join(', ')}
              {' '}has a pending owner. Ownership changes the moment that address accepts, and not
              before.
            </p>
          </Box>
        </div>
      ) : null}

      {admin.ownership.map((o) => {
        const yoursPending = !!you && o.pendingOwner?.toLowerCase() === you;
        const yours = !!you && o.owner.toLowerCase() === you;
        const typed = to[o.contract] ?? '';
        const valid = isAddressish(typed);
        return (
          <Control
            key={o.contract}
            title={o.contract}
            now={<><Addr value={o.owner} />{yours ? ' · you' : ''}</>}
            note={o.pendingOwner
              ? <>Pending: <span className="mono">{o.pendingOwner}</span>{yoursPending ? ' — that is you.' : ''}</>
              : undefined}
          >
            <div className={s.form}>
              {yoursPending ? (
                <ActionButton
                  actions={actions}
                  action={{
                    key: `accept:${o.contract}`,
                    label: `Accept ${o.contract}`,
                    run: (on) => acceptOwnership(o.contract as AdminContract, on),
                    outcome: () => `You are the owner of ${o.contract}.`,
                  }}
                />
              ) : null}

              {yours ? (
                <>
                  <Field
                    label="Hand over to"
                    value={typed}
                    placeholder="0x…"
                    invalid={typed !== '' && !valid}
                    onChange={(v) => setTo({ ...to, [o.contract]: v })}
                  />
                  <ActionButton
                    ghost
                    actions={actions}
                    action={{
                      key: `transfer:${o.contract}`,
                      label: 'Start the transfer',
                      disabled: !valid,
                      run: (on) => transferOwnership(o.contract as AdminContract, typed.trim() as `0x${string}`, on),
                      outcome: () => 'Named as pending owner. Nothing has changed until they accept.',
                    }}
                  />
                </>
              ) : null}

              {!yours && !yoursPending ? (
                <span className="tiny dim">
                  This wallet is neither the owner nor the pending owner of this one.
                </span>
              ) : null}
            </div>
          </Control>
        );
      })}

      {/*
        The explanation sits ABOVE the button, the way every other control on
        this page explains itself, rather than beside it. In the row it was a
        block of prose bottom-aligned against a 46px button — text and controls
        do not share a baseline, and putting them on one line only looked like
        they should.
      */}
      <Control
        title="Renounce ownership"
        now="disabled on all five"
        note={<>
          <Tag tone="ok">Guaranteed</Tag>{' '}
          The function exists and always reverts. No owner of these contracts can abandon them,
          so a collector never ends up holding a bird whose collection has nobody left to answer
          for it.
        </>}
      >
        <div className={s.form}>
          <button type="button" className="btn btn--small" disabled>
            <Icon name="lock" size={12} /> Renounce
          </button>
        </div>
      </Control>

      <div style={{ marginTop: 16 }}>
        <Note tone="info">
          Connecting a wallet is not signing in, here least of all. Nothing on this page asks for a
          seed phrase, a private key, or a signature to prove who you are — every action below is a
          transaction to a named contract, and the contract decides whether to accept it.
        </Note>
      </div>

      {actions.confirmDialog}
    </section>
  );
}
