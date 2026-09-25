// The Roost, on the owner's panel (2026-09-18).
//
// Two things the owner needs to see and one they can do. The two addresses
// that must both be the Roost — the Perch's fee recipient and the Nest's cost
// sink — said loudly if they differ, because a fee going elsewhere is money
// the split never sees. And the admin's tenth, with the one call that takes it.

import { useState } from 'react';
import { Box, Note, Tag } from '../Primitives';
import { ActionButton, Addr, Control, Field, isAddressish, useAdminActions } from './Bits';
import { avians } from '../../lib/format';
import { claimRoostAdmin, unveiled, type AdminState, type Address } from '../../mock';
import { href } from '../../router';
import s from '../../screens/Admin.module.css';

export function RoostPanel({ admin }: { admin: AdminState }) {
  const actions = useAdminActions();
  const [to, setTo] = useState('');
  const r = admin.roost;
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const perchOk = same(admin.perch.feeRecipient, r.roost);
  const nestOk = same(r.costSink, r.roost);
  const destination = to.trim() || admin.you || '';
  const youAreAdmin = !!admin.you && same(admin.you, r.admin);

  return (
    <section aria-labelledby="roost-h">
      <h3 id="roost-h" style={{ fontSize: 20 }}>The Roost</h3>
      <p className="small dim" style={{ marginTop: 6 }}>
        Every Perch fee and every brooding cost lands here and is split by this week&rsquo;s
        figures{unveiled('vaults') ? ' (35 / 30 / 20, rotating weekly between AVIAN stakers, brooding birds and vault users)' : ', rotating weekly between AVIAN stakers and brooding birds'},
        10% to the admin, 5% burnt. The rule is fixed; nothing here sets it.{' '}
        <a href={href({ name: 'engine', at: 'roost' })}>The Bird Engine page</a> turns it.
      </p>

      {!perchOk || !nestOk ? (
        <div style={{ marginTop: 14 }}>
          <Box tone="bad">
            <Note tone="bad">
              <strong className="strong">
                {!perchOk && !nestOk ? 'Neither the Perch nor the Nest points at the Roost.'
                  : !perchOk ? 'The Perch is not sending its fees to the Roost.'
                    : 'The Nest is not sending tier costs to the Roost.'}
              </strong>{' '}
              <span className="small">
                {!perchOk ? <>The Perch&rsquo;s fee recipient is <Addr value={admin.perch.feeRecipient} />; the Roost is <Addr value={r.roost} />. Every fee is going somewhere the split never sees. Set it above.</> : null}
                {!nestOk ? <> The Nest&rsquo;s cost sink is <Addr value={r.costSink} />, not the Roost. The Roost is the council&rsquo;s to replace.</> : null}
              </span>
            </Note>
          </Box>
        </div>
      ) : null}

      <Control
        title="Where the fees land"
        now={<>
          Perch fees to <Addr value={admin.perch.feeRecipient} />{' '}
          {perchOk ? <Tag tone="ok">the Roost</Tag> : <Tag tone="bad">not the Roost</Tag>}
          <br />
          Tier costs to <Addr value={r.costSink} />{' '}
          {nestOk ? <Tag tone="ok">the Roost</Tag> : <Tag tone="bad">not the Roost</Tag>}
        </>}
        note="Both should read the Roost. The Perch's is a setter on this panel; the Roost is the council's to replace."
      />

      <Control
        title="The admin's tenth"
        now={<><span className="num">{avians(r.adminClaimable)}</span> unclaimed, <span className="num">{avians(r.adminClaimed)}</span> taken, ever</>}
        note={youAreAdmin
          ? 'The Roost’s admin is the Nest’s owner, read live: this wallet.'
          : `The Roost’s admin is the Nest’s owner, read live: ${r.admin}. This wallet is not it, and the contract will refuse.`}
      >
        <div className={s.form}>
          <Field label="Send it to" value={to} placeholder={admin.you ?? '0x…'} invalid={to !== '' && !isAddressish(to)} onChange={setTo} />
          <ActionButton
            actions={actions}
            action={{
              key: 'roost-claim',
              label: r.adminClaimable > 0n ? `Claim ${avians(r.adminClaimable)}` : 'Nothing to claim',
              disabled: r.adminClaimable === 0n || !isAddressish(destination) || !youAreAdmin,
              run: (on) => claimRoostAdmin(destination as Address, on),
              outcome: (x) => `${avians((x as { amount: bigint }).amount)} sent to ${destination}.`,
            }}
          />
        </div>
      </Control>
      {actions.confirmDialog}
    </section>
  );
}
