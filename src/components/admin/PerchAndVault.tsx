// The two small ones: where the perch sends its fees, and the liquidity lock.
//
// The vault's `withdraw` is the fifth irreversible action on this panel and the
// least obvious one — nothing about the name says "single use", but the
// contract refuses a second position, so the NFT leaving is the end of the
// vault's life.

import { useState } from 'react';
import { Icon } from '../Icon';
import { Note, Tag } from '../Primitives';
import {
  ActionButton, Addr, Control, Field, isAddressish, seconds, useAdminActions, whole,
} from './Bits';
import { formatCount, formatDays } from '../../lib/format';
import {
  collectFees, extendLock, setFeeRecipient, withdrawPosition,
  type AdminState, type Address,
} from '../../mock';
import s from '../../screens/Admin.module.css';

export function PerchAndVault({ admin }: { admin: AdminState }) {
  const actions = useAdminActions();
  const [recipient, setRecipient] = useState('');
  const [to, setTo] = useState('');
  const [until, setUntil] = useState('');

  const now = Math.floor(Date.now() / 1000);
  const v = admin.vault;
  const destination = to.trim() || admin.you || '';
  const canSend = isAddressish(destination);
  const newUnlock = whole(until);
  const later = newUnlock !== null && !!v && newUnlock > v.unlockAt;

  return (
    <section aria-labelledby="pv-h">
      <h3 id="pv-h" style={{ fontSize: 20 }}>The perch, and the lock</h3>

      <Control
        title="Where the perch sends its fees"
        now={<Addr value={admin.perch.feeRecipient} />}
        note="Half of every perch fee is burned; this is where the other half goes."
      >
        <div className={s.form}>
          <Field
            label="Recipient"
            value={recipient}
            placeholder="0x…"
            invalid={recipient !== '' && !isAddressish(recipient)}
            onChange={setRecipient}
          />
          <ActionButton
            actions={actions}
            action={{
              key: 'fee-recipient',
              label: 'Set it',
              disabled: !isAddressish(recipient),
              run: (on) => setFeeRecipient(recipient.trim() as Address, on),
              outcome: () => 'Fee recipient set.',
            }}
          />
        </div>
      </Control>

      {!v ? (
        <Control title="The liquidity lock" now="no vault on this deployment">
          <p className="tiny dim" style={{ marginTop: 10 }}>
            This deployment&rsquo;s manifest says the pool has not been launched, so there is no
            vault and no position to lock.
          </p>
        </Control>
      ) : (
        <>
          <Control
            title="The liquidity lock"
            now={<>
              position #{formatCount(v.tokenId)}
              {v.isLocked
                ? <> <Tag tone="ok"><Icon name="lock" size={11} /> locked</Tag></>
                : <> <Tag tone="warn">unlocked</Tag></>}
            </>}
            note={v.isLocked
              ? `Unlocks in ${formatDays(Math.max(0, v.unlockAt - now))}. Minimum was ${formatDays(v.lockSeconds)}.`
              : 'The lock has expired. The position can leave.'}
          >
            <div className={s.form}>
              <Field
                label="Send fees / position to"
                value={to}
                placeholder={admin.you ?? '0x…'}
                hint={to === '' ? 'Empty means the connected wallet.' : undefined}
                invalid={to !== '' && !isAddressish(to)}
                onChange={setTo}
              />
              <ActionButton
                actions={actions}
                action={{
                  key: 'collect',
                  label: 'Collect the fees',
                  disabled: !canSend,
                  run: (on) => collectFees(destination as Address, on),
                  outcome: () => 'Fees collected. The position stays where it is.',
                }}
              />
            </div>
            <p className="tiny dim" style={{ marginTop: 10 }}>
              Collecting fees takes nothing out of the position itself — it decreases liquidity by
              zero and takes only what the pool has accrued.
            </p>
          </Control>

          <Control
            title="Extend the lock"
            now={new Date(v.unlockAt * 1000).toISOString().slice(0, 16).replace('T', ' ')}
            note="The unlock date only ever moves further out. The contract refuses anything earlier, which is what makes the lock mean something."
          >
            <div className={s.form}>
              <Field
                label="New unlock, unix seconds"
                value={until}
                placeholder={String(v.unlockAt + 86_400 * 365)}
                hint={newUnlock === null ? 'a whole number of seconds'
                  : later ? `${seconds(newUnlock - v.unlockAt)} further out`
                    : 'has to be later than the current one'}
                invalid={until !== '' && !later}
                onChange={setUntil}
              />
              <ActionButton
                actions={actions}
                action={{
                  key: 'extend',
                  label: 'Extend the lock',
                  danger: true,
                  disabled: !later,
                  run: (on) => extendLock(newUnlock!, on),
                  outcome: () => 'Extended.',
                  irreversible: {
                    word: 'extend',
                    consequence: <>
                      The unlock date moves to{' '}
                      <span className="mono">
                        {newUnlock ? new Date(newUnlock * 1000).toISOString().slice(0, 16).replace('T', ' ') : ''}
                      </span>{' '}
                      and can never move back. The liquidity stays locked for the whole of it,
                      whatever happens.
                    </>,
                  },
                }}
              />
            </div>
          </Control>

          <Control
            title="Withdraw the position"
            now={v.isLocked ? 'locked' : 'available'}
            note="Single use. The vault takes one position, once."
          >
            <div className={s.form}>
              <ActionButton
                actions={actions}
                action={{
                  key: 'withdraw',
                  label: 'Withdraw the position',
                  danger: true,
                  disabled: v.isLocked || !canSend,
                  run: (on) => withdrawPosition(destination as Address, on),
                  outcome: () => 'The position has left the vault.',
                  irreversible: {
                    word: 'withdraw',
                    consequence: <>
                      The vault does not accept a second position, so once position{' '}
                      #{formatCount(v.tokenId)} leaves, this vault is spent — and the on-chain proof
                      the Contracts page shows becomes a proof about a vault that is empty.
                    </>,
                  },
                }}
              />
            </div>
            {v.isLocked ? (
              <div style={{ marginTop: 12 }}>
                <Note tone="info">
                  The contract refuses this until the lock expires. That is not this panel being
                  careful; it is the lock.
                </Note>
              </div>
            ) : null}
          </Control>
        </>
      )}

      {actions.confirmDialog}
    </section>
  );
}
