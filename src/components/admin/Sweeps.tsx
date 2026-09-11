// The sweeps: something arrived that should not have, get it out.
//
// Three functions on three contracts, never interchangeable, each labelled by
// the contract that actually holds the token. What each one refuses is read and
// shown BEFORE anything is signed, so the owner is not sent to sign a
// transaction that reverts.
//
// The token being swept is, by definition, one nobody vetted — a token in no
// list, sent by accident or on purpose. So everything it tells us about itself
// is treated as hostile: its symbol is clamped and rendered as a text node, and
// its `decimals` is either read or NULL. Never defaulted to 18, because a token
// claiming 77 decimals could otherwise make a large sweep look like nothing.

import { useState, type ReactNode } from 'react';
import { Box, Note, Tag } from '../Primitives';
import { ActionButton, Control, Field, Problem, isAddressish, useAdminActions } from './Bits';
import { avians, formatEth, formatReward } from '../../lib/format';
import {
  readForeignToken, rescueFromCollection, rescueFromPerch,
  type AdminState, type Address, type Amount, type ForeignToken,
} from '../../mock';
import s from '../../screens/Admin.module.css';

export function Sweeps({ admin }: { admin: AdminState }) {
  const actions = useAdminActions();
  const [address, setAddress] = useState('');
  const [token, setToken] = useState<ForeignToken | null>(null);
  const [looking, setLooking] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [to, setTo] = useState('');

  const valid = isAddressish(address);
  const destination = to.trim() || admin.you || '';
  const canSend = isAddressish(destination);

  const look = async () => {
    setLooking(true);
    setFailed(null);
    setToken(null);
    try {
      setToken(await readForeignToken(address.trim() as Address));
    } catch {
      setFailed('That token could not be read. It may not be a contract on this chain.');
    }
    setLooking(false);
  };

  const c = admin.collection;
  const sweepable = c.aviansHeld > c.requiredBacking ? c.aviansHeld - c.requiredBacking : 0n;

  return (
    <section aria-labelledby="sweep-h">
      <h3 id="sweep-h" style={{ fontSize: 20 }}>Sweeps</h3>
      <p className="small dim" style={{ marginTop: 8 }}>
        Three contracts can hold a token they were never meant to. Each has its own function and its
        own refusals, and they are not interchangeable.
      </p>

      <Control
        title="The collection, in AVIANS"
        now={`${avians(sweepable)} may leave`}
        note={<>
          The collection has to keep <span className="mono">requiredBacking()</span> in AVIANS behind
          the free mint. Only the excess can be swept, and the contract works out how much rather
          than trusting an amount from here.
        </>}
      >
        <dl className="kv" style={{ marginTop: 12, gridTemplateColumns: '150px 1fr' }}>
          <dt>Held</dt><dd>{avians(c.aviansHeld)}</dd>
          <dt>Required as backing</dt><dd>{avians(c.requiredBacking)}</dd>
          <dt>Sweepable</dt><dd>{avians(sweepable)}</dd>
        </dl>
        <div className={s.form}>
          <ActionButton
            actions={actions}
            action={{
              key: 'sweep-avians',
              label: 'Sweep the excess AVIANS',
              disabled: sweepable === 0n || !canSend,
              run: (on) => rescueFromCollection(admin.treasury.rows.find((r) => r.symbol === 'AVIANS')?.currency ?? null, destination as Address, on),
              outcome: () => 'Swept.',
            }}
          />
          <ActionButton
            ghost
            actions={actions}
            action={{
              key: 'sweep-eth',
              label: `Sweep ${formatEth(c.ethHeld)} ETH`,
              disabled: c.ethHeld === 0n || !canSend,
              run: (on) => rescueFromCollection(null, destination as Address, on),
              outcome: () => 'Swept.',
            }}
          />
        </div>
      </Control>

      <Control
        title="Any other token"
        note={<>
          A token nobody sent on purpose is in no list, so it has to be typed. Everything below is
          read off that contract and none of it is trusted: the symbol is clamped, and the decimals
          are shown only when they could be read.
        </>}
      >
        <div className={s.form}>
          <Field
            label="Token address"
            value={address}
            placeholder="0x…"
            invalid={address !== '' && !valid}
            onChange={(v) => { setAddress(v); setToken(null); setFailed(null); }}
          />
          <Field
            label="Send to"
            value={to}
            placeholder={admin.you ?? '0x…'}
            hint={to === '' ? 'Empty means the connected wallet.' : undefined}
            invalid={to !== '' && !isAddressish(to)}
            onChange={setTo}
          />
          <button
            type="button"
            className="btn btn--ghost btn--small"
            disabled={!valid || looking}
            onClick={() => void look()}
          >
            {looking ? 'Reading…' : 'Look it up'}
          </button>
        </div>

        {failed ? <Problem>{failed}</Problem> : null}

        {token ? (
          <TokenReport token={token} to={destination} canSend={canSend} actions={actions} />
        ) : null}
      </Control>

      <div style={{ marginTop: 16 }}>
        <Box title="What the perch refuses, and why">
          <p className="tiny dim" style={{ margin: 0 }}>
            AVIANS and the collection itself are refused by ADDRESS, not by balance — they are the
            pool, and sweeping either would take the backing out from under every bird in it. That
            refusal is in the contract and this panel only reports it.
          </p>
        </Box>
      </div>

      {actions.confirmDialog}
    </section>
  );
}

/**
 * A sentence in the action column.
 *
 * The column is right-aligned because it holds buttons, and a wrapped sentence
 * right-aligned is ragged down its left edge and hard to read. The block stays
 * flush right with the buttons above and below it; the words inside it read
 * left, the way words do.
 */
function Reason({ tone, children }: { tone?: 'bad'; children: ReactNode }) {
  return (
    <span
      className={`tiny${tone === 'bad' ? '' : ' dim'}`}
      style={{
        display: 'inline-block',
        textAlign: 'left',
        maxWidth: '30ch',
        color: tone === 'bad' ? 'var(--refusal)' : undefined,
      }}
    >
      {children}
    </span>
  );
}

function TokenReport({
  token, to, canSend, actions,
}: {
  token: ForeignToken; to: string; canSend: boolean;
  actions: ReturnType<typeof useAdminActions>;
}) {
  // `symbol` came out of a contract nobody vetted. It is placed as a text node,
  // clamped upstream to 16 characters, and never rendered as markup — the
  // build fails on `dangerouslySetInnerHTML` anywhere in this application, and
  // this field is the reason that check exists.
  const untrusted = token.decimals === null || token.decimals !== 18;

  const amount = (v: Amount): string => {
    if (token.decimals === null) return `${v.toString()} base units (decimals could not be read)`;
    if (token.decimals !== 18) return `${formatReward(v, token.decimals)} · ${v.toString()} base units`;
    return formatReward(v, 18);
  };

  return (
    <>
      <div className="row row--wrap" style={{ gap: 10, marginTop: 14 }}>
        <Tag>{token.symbol}</Tag>
        <span className="mono tiny dim">{token.address}</span>
        {untrusted ? <Tag tone="warn">decimals {token.decimals ?? 'unreadable'}</Tag> : null}
      </div>

      {untrusted ? (
        <div style={{ marginTop: 12 }}>
          <Note tone="warn">
            This token does not use 18 decimals, or would not say. Both the formatted figure and the
            raw base units are shown below, so a token that lies about its scale cannot make a large
            amount look small.
          </Note>
        </div>
      ) : null}

      <div className="scroll-x" style={{ marginTop: 14 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Held by</th>
              <th className="right">Balance</th>
              <th className="right" />
            </tr>
          </thead>
          <tbody>
            {token.holdings.map((h) => (
              <tr key={h.holder}>
                <td>{h.holder}</td>
                <td className="num">{amount(h.balance)}</td>
                <td style={{ textAlign: 'right' }}>
                  {h.refusal ? (
                    <Reason tone="bad">{h.refusal}</Reason>
                  ) : h.holder === 'ThePerch' ? (
                    <ActionButton
                      ghost
                      actions={actions}
                      action={{
                        key: 'sweep-perch',
                        label: 'Sweep from the perch',
                        disabled: h.balance === 0n || !canSend,
                        run: (on) => rescueFromPerch(token.address, to as Address, on),
                        outcome: (r) => `${amount((r as { amount: Amount }).amount)} swept.`,
                      }}
                    />
                  ) : h.holder === 'AvianStock' ? (
                    <ActionButton
                      ghost
                      actions={actions}
                      action={{
                        key: 'sweep-collection',
                        label: 'Sweep from the collection',
                        disabled: h.balance === 0n || !canSend,
                        run: (on) => rescueFromCollection(token.address, to as Address, on),
                        outcome: () => 'Swept.',
                      }}
                    />
                  ) : (
                    <Reason>
                      Withdraw it from the Treasury section — it goes through{' '}
                      <span className="mono">claimAdmin</span>, not a sweep.
                    </Reason>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {token.treasuryClaimable !== null && token.treasuryClaimable > 0n ? (
        <p className="tiny dim" style={{ marginTop: 10 }}>
          The Treasury counts {amount(token.treasuryClaimable)} of this as the admin&rsquo;s
          outstanding claim. Every ERC-20 that arrives there is 100% the admin&rsquo;s, so this is
          a withdrawal rather than a rescue.
        </p>
      ) : null}
    </>
  );
}
