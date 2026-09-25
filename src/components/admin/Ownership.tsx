// Ownership, read-only since 2026-09-24.
//
// First on the page, because it is the thing that can be wrong without anyone
// noticing: five contracts that no longer agree on who owns them, drawn loudly
// rather than as another row.
//
// The seat no longer moves from here. The owner proposes a fresh key on all
// six at once under "Your seat", at the foot of the page, and the council
// seats it a day later; `acceptOwnership` is disabled on every contract, so
// the Accept button and the per-contract hand-over form this panel had would
// only ever have been refused.
//
// `renounceOwnership` is here as a DISABLED row. It exists on all five and it
// reverts on all five, by design, so no owner can walk away and leave these
// contracts unattended. That is a property worth showing, not a gap to hide —
// but it is never offered as an action.

import { Icon } from '../Icon';
import { Box, Note, Tag } from '../Primitives';
import { Addr, Control } from './Bits';
import type { AdminState } from '../../mock';
import s from '../../screens/Admin.module.css';

export function Ownership({ admin }: { admin: AdminState }) {
  const you = admin.you?.toLowerCase() ?? null;

  return (
    <section aria-labelledby="own-h">
      <h3 id="own-h" style={{ fontSize: 20 }}>Ownership</h3>
      <p className="small dim" style={{ marginTop: 8 }}>
        The seat moves in two ways only: you propose a fresh key and the council seats it a day
        later, or, after thirty days without a word from you, the council seats one of its own
        choosing. Nobody accepts a transfer alone. Your part in both, proposing a key and
        saying you are still here, is under Your seat at the foot of the page.
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

      {admin.ownership.map((o) => (
        <Control
          key={o.contract}
          title={o.contract}
          now={<><Addr value={o.owner} />{you && o.owner.toLowerCase() === you ? ', you' : ''}</>}
        />
      ))}

      {/*
        The explanation sits ABOVE the button, the way every other control on
        this page explains itself, rather than beside it. In the row it was a
        block of prose bottom-aligned against a 46px button: text and controls
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
          seed phrase, a private key, or a signature to prove who you are: every action below is a
          transaction to a named contract, and the contract decides whether to accept it.
        </Note>
      </div>

    </section>
  );
}
