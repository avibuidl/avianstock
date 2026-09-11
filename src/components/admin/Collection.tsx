// The collection: the two mint doors, the list, the price, the royalty, the
// art and enforcement.
//
// Three of the five irreversible actions on this panel are here. Each one names
// what becomes impossible afterwards and makes you type its name — a second
// click is not a confirmation, because a second click is what a mis-click
// already is.

import { useEffect, useState } from 'react';
import { Icon } from '../Icon';
import { Box, Note, Tag } from '../Primitives';
import {
  ActionButton, Addr, Control, Field, Problem, ReadOnlyBlock,
  addressList, isAddressish, seconds, useAdminActions, whole,
} from './Bits';
import { avians, formatBps, formatCount, parseAvians } from '../../lib/format';
import {
  configureTransferValidator, deleteDefaultRoyalty, encodeValidatorOperation,
  lockRenderer, lockTransferValidator, releaseFreeAllocation, setAllowlistRoot,
  setAllowlisted, setDefaultRoyalty, setFreeMintOpen, setMintOpen, setPrice,
  setRenderer, setTransferValidator,
  type AdminState, type Address, type Amount, type Hex, type ValidatorOperation,
} from '../../mock';
import s from '../../screens/Admin.module.css';

export function Collection({ admin }: { admin: AdminState }) {
  const c = admin.collection;
  const actions = useAdminActions();
  const now = Math.floor(Date.now() / 1000);

  return (
    <section aria-labelledby="col-h">
      <h3 id="col-h" style={{ fontSize: 20 }}>The collection</h3>

      <Control title="The paid mint" now={c.mintOpen ? 'open' : 'closed'}>
        <div className={s.form}>
          <ActionButton
            actions={actions}
            action={{
              key: 'mint-open',
              label: c.mintOpen ? 'Close the paid mint' : 'Open the paid mint',
              run: (on) => setMintOpen(!c.mintOpen, on),
              outcome: () => (c.mintOpen ? 'Closed.' : 'Open.'),
            }}
          />
        </div>
      </Control>

      <Control
        title="The free mint"
        now={c.freeMintOpen ? 'open' : 'closed'}
        note={<>{formatCount(c.freeMinted)} of {formatCount(c.freeAllocation)} claimed.</>}
      >
        <div className={s.form}>
          <ActionButton
            actions={actions}
            action={{
              key: 'free-open',
              label: c.freeMintOpen ? 'Close the free mint' : 'Open the free mint',
              run: (on) => setFreeMintOpen(!c.freeMintOpen, on),
              outcome: () => (c.freeMintOpen ? 'Closed.' : 'Open.'),
            }}
          />
        </div>
      </Control>

      <PriceControl admin={admin} actions={actions} />
      <AllowlistControl admin={admin} actions={actions} />

      <Control
        title="Release the free allocation"
        now={c.freeAllocationReleased ? 'released' : `${formatCount(c.freeAllocation - c.freeMinted)} unclaimed`}
        note={c.freeReleaseAvailableAt === 0
          ? 'The free mint has never opened, so the clock has not started.'
          : c.freeReleaseAvailableAt > now
            ? `Available in ${seconds(c.freeReleaseAvailableAt - now)}. The free mint has to have been open for ${seconds(c.freeReleaseDelay)} first.`
            : 'Available now.'}
      >
        <div className={s.form}>
          <ActionButton
            actions={actions}
            action={{
              key: 'release',
              label: 'Release to the paid mint',
              danger: true,
              disabled: c.freeAllocationReleased
                || c.freeReleaseAvailableAt === 0
                || c.freeReleaseAvailableAt > now,
              run: (on) => releaseFreeAllocation(on),
              outcome: (r) => `${formatCount(Number((r as { released: bigint }).released))} moved to the paid ceiling.`, /* count */
              irreversible: {
                word: 'release',
                consequence: <>
                  The free mint closes for good and the {formatCount(c.freeAllocation - c.freeMinted)}{' '}
                  unclaimed birds move to the paid ceiling. It cannot be reopened, and the birds
                  cannot be moved back.
                </>,
              },
            }}
          />
        </div>
      </Control>

      <RoyaltyControl admin={admin} actions={actions} />
      <RendererControl admin={admin} actions={actions} />
      <ValidatorControl admin={admin} actions={actions} />
      <ValidatorConfig admin={admin} actions={actions} />

      {actions.confirmDialog}
    </section>
  );
}

// ── price ─────────────────────────────────────────────────────────────────

function PriceControl({
  admin, actions,
}: { admin: AdminState; actions: ReturnType<typeof useAdminActions> }) {
  const [v, setV] = useState('');
  let parsed: Amount | null = null;
  try { parsed = v.trim() === '' ? null : parseAvians(v); } catch { parsed = null; }
  const tooLow = parsed !== null && parsed < admin.collection.minPrice;

  return (
    <Control
      title="Mint price"
      now={avians(admin.collection.price)}
      note={<>The collection will not go below {avians(admin.collection.minPrice)}, which is its own floor and not a setting.</>}
    >
      <div className={s.form}>
        <Field
          label="New price, AVIANS"
          value={v}
          placeholder="100,000"
          invalid={v.trim() !== '' && (parsed === null || tooLow)}
          onChange={setV}
        />
        <ActionButton
          actions={actions}
          action={{
            key: 'price',
            label: 'Set the price',
            disabled: parsed === null || tooLow,
            run: (on) => setPrice(parsed!, on),
            outcome: () => `Price is now ${avians(parsed!)}.`,
          }}
        />
      </div>
      {tooLow ? <Problem>That is below the collection&rsquo;s floor of {avians(admin.collection.minPrice)}.</Problem> : null}
    </Control>
  );
}

// ── the allowlist ─────────────────────────────────────────────────────────

function AllowlistControl({
  admin, actions,
}: { admin: AdminState; actions: ReturnType<typeof useAdminActions> }) {
  const [root, setRoot] = useState('');
  const [list, setList] = useState('');
  const validRoot = /^0x[0-9a-fA-F]{64}$/.test(root.trim());
  const accounts = addressList(list);

  return (
    <>
      <Control
        title="Allowlist root"
        now={<span title={admin.collection.allowlistRoot}>{admin.collection.allowlistRoot.slice(0, 18)}…</span>}
        note={<>Two ways onto the list, and this is the merkle one.</>}
      >
        <div className={s.form}>
          <Field
            wide
            label="New root, 32 bytes"
            value={root}
            placeholder="0x…"
            invalid={root.trim() !== '' && !validRoot}
            onChange={setRoot}
          />
          <ActionButton
            actions={actions}
            action={{
              key: 'root',
              label: 'Set the root',
              disabled: !validRoot,
              run: (on) => setAllowlistRoot(root.trim() as Hex, on),
              outcome: () => 'Root set.',
            }}
          />
        </div>
        <div style={{ marginTop: 12 }}>
          <Note tone="warn">
            <strong className="strong">Redeploy <span className="mono">proofs.json</span> in the
            same breath.</strong>{' '}
            A root that has moved on from the deployed proofs file is indistinguishable from{' '}
            <span className="mono">NotAllowlisted</span> for a collector: they are told they are not
            on the list, when in fact the file is stale.
          </Note>
        </div>
      </Control>

      <Control
        title="Allowlist, by address"
        note="The direct list, checked alongside the merkle root. One transaction sets or clears the whole batch."
      >
        <div className={s.form}>
          <Field
            wide
            label="Addresses"
            value={list}
            placeholder="0x… , 0x…"
            invalid={list.trim() !== '' && accounts === null}
            hint={accounts ? `${accounts.length} address${accounts.length === 1 ? '' : 'es'}` : 'comma or space separated'}
            onChange={setList}
          />
          <ActionButton
            actions={actions}
            action={{
              key: 'allow-add',
              label: 'Add them',
              disabled: !accounts,
              run: (on) => setAllowlisted(accounts!, true, on),
              outcome: () => `${accounts!.length} added.`,
            }}
          />
          <ActionButton
            ghost
            actions={actions}
            action={{
              key: 'allow-remove',
              label: 'Remove them',
              disabled: !accounts,
              run: (on) => setAllowlisted(accounts!, false, on),
              outcome: () => `${accounts!.length} removed.`,
            }}
          />
        </div>
      </Control>
    </>
  );
}

// ── royalty ───────────────────────────────────────────────────────────────

function RoyaltyControl({
  admin, actions,
}: { admin: AdminState; actions: ReturnType<typeof useAdminActions> }) {
  const r = admin.collection.royalty;
  const [receiver, setReceiver] = useState('');
  const [bps, setBps] = useState('');
  const bpsValue = whole(bps);
  const ok = isAddressish(receiver) && bpsValue !== null && bpsValue <= 10_000;

  return (
    <Control
      title="Default royalty"
      now={r.bps === 0 ? 'none' : <>{formatBps(r.bps)} to <Addr value={r.receiver} /></>}
      note="ERC-2981. A marketplace may honour it or ignore it; the collection only states it."
    >
      <div className={s.form}>
        <Field
          label="Receiver"
          value={receiver}
          placeholder="0x…"
          invalid={receiver !== '' && !isAddressish(receiver)}
          onChange={setReceiver}
        />
        <Field
          label="Royalty, bps"
          value={bps}
          placeholder="500"
          hint={bpsValue === null ? 'a whole number, 10,000 = 100%' : formatBps(bpsValue)}
          invalid={bps !== '' && (bpsValue === null || bpsValue > 10_000)}
          onChange={setBps}
        />
        <ActionButton
          actions={actions}
          action={{
            key: 'royalty',
            label: 'Set the royalty',
            disabled: !ok,
            run: (on) => setDefaultRoyalty(receiver.trim() as Address, bpsValue!, on),
            outcome: () => 'Royalty set.',
          }}
        />
        <ActionButton
          ghost
          actions={actions}
          action={{
            key: 'royalty-del',
            label: 'Remove it',
            disabled: r.bps === 0,
            run: (on) => deleteDefaultRoyalty(on),
            outcome: () => 'Royalty removed.',
          }}
        />
      </div>
    </Control>
  );
}

// ── the renderer, and the lock ────────────────────────────────────────────

function RendererControl({
  admin, actions,
}: { admin: AdminState; actions: ReturnType<typeof useAdminActions> }) {
  const c = admin.collection;
  const [next, setNext] = useState('');

  return (
    <Control
      title="Renderer"
      now={<>
        <Addr value={c.renderer} />
        {c.rendererLocked ? <> <Tag tone="ok"><Icon name="lock" size={11} /> locked</Tag></> : null}
      </>}
      note="Where the art comes from. Every token URI on the site is built by whatever this points at."
    >
      {c.rendererLocked ? (
        <p className="tiny dim" style={{ marginTop: 10 }}>
          Locked permanently. Nothing here can change it, and nothing ever will.
        </p>
      ) : (
        <div className={s.form}>
          <Field
            label="New renderer"
            value={next}
            placeholder="0x…"
            invalid={next !== '' && !isAddressish(next)}
            onChange={setNext}
          />
          <ActionButton
            actions={actions}
            action={{
              key: 'renderer',
              label: 'Point at it',
              disabled: !isAddressish(next),
              run: (on) => setRenderer(next.trim() as Address, on),
              outcome: () => 'Renderer set.',
            }}
          />
          <ActionButton
            actions={actions}
            action={{
              key: 'renderer-lock',
              label: 'Lock the renderer',
              danger: true,
              run: (on) => lockRenderer(c.renderer, on),
              outcome: () => 'Locked, permanently.',
              irreversible: {
                word: 'lock',
                consequence: <>
                  The art can never be re-pointed. <span className="mono">{c.renderer}</span> becomes
                  the renderer for every bird, forever — and if it is the wrong address, or it
                  breaks later, there is no way to replace it.
                </>,
              },
            }}
          />
        </div>
      )}
    </Control>
  );
}

// ── the transfer validator, and its lock ──────────────────────────────────

function ValidatorControl({
  admin, actions,
}: { admin: AdminState; actions: ReturnType<typeof useAdminActions> }) {
  const c = admin.collection;
  const [next, setNext] = useState('');

  return (
    <Control
      title="Transfer validator"
      now={<>
        <Addr value={c.transferValidator} />
        {c.transferValidatorLocked ? <> <Tag tone="ok"><Icon name="lock" size={11} /> locked</Tag></> : null}
      </>}
      note="Enforcement. It decides which operators may move a bird, which is what makes the batch routes work — or not."
    >
      {c.transferValidatorLocked ? (
        <p className="tiny dim" style={{ marginTop: 10 }}>
          Locked permanently. Nothing here can change it.
        </p>
      ) : (
        <div className={s.form}>
          <Field
            label="New validator"
            value={next}
            placeholder="0x…"
            invalid={next !== '' && !isAddressish(next)}
            onChange={setNext}
          />
          <ActionButton
            actions={actions}
            action={{
              key: 'validator',
              label: 'Point at it',
              disabled: !isAddressish(next),
              run: (on) => setTransferValidator(next.trim() as Address, on),
              outcome: () => 'Validator set.',
            }}
          />
          <ActionButton
            actions={actions}
            action={{
              key: 'validator-lock',
              label: 'Lock the validator',
              danger: true,
              disabled: !c.transferValidator,
              run: (on) => lockTransferValidator(c.transferValidator!, on),
              outcome: () => 'Locked, permanently.',
              irreversible: {
                word: 'lock',
                consequence: <>
                  Enforcement can never be re-pointed.{' '}
                  <span className="mono">{c.transferValidator}</span> becomes the validator forever.
                  If it is later deprecated or broken, the collection cannot move to another one.
                </>,
              },
            }}
          />
        </div>
      )}
    </Control>
  );
}

// ── configureTransferValidator, composed ──────────────────────────────────

const OPERATIONS = [
  { kind: 'createList', label: 'Create a list', needs: 'name' },
  { kind: 'applyListToCollection', label: 'Apply a list to the collection', needs: 'list' },
  { kind: 'setSecurityLevel', label: 'Set the security level', needs: 'level' },
  { kind: 'setTokenType', label: 'Set the token type to ERC-721', needs: 'none' },
  { kind: 'addToWhitelist', label: 'Add operators to the whitelist', needs: 'list+accounts' },
  { kind: 'removeFromWhitelist', label: 'Remove operators from the whitelist', needs: 'list+accounts' },
  { kind: 'addToAuthorizers', label: 'Add authorizers', needs: 'list+accounts' },
  { kind: 'removeFromAuthorizers', label: 'Remove authorizers', needs: 'list+accounts' },
] as const;

function ValidatorConfig({
  admin, actions,
}: { admin: AdminState; actions: ReturnType<typeof useAdminActions> }) {
  const [at, setAt] = useState(0);
  const [name, setName] = useState('');
  const [listId, setListId] = useState('');
  const [level, setLevel] = useState('3');
  const [accounts, setAccounts] = useState('');

  const chosen = OPERATIONS[at];
  const id = whole(listId);
  const lvl = whole(level);
  const list = addressList(accounts);

  const op = build();
  function build(): ValidatorOperation | null {
    switch (chosen.kind) {
      case 'createList': return name.trim() ? { kind: 'createList', name: name.trim() } : null;
      case 'applyListToCollection': return id === null ? null : { kind: 'applyListToCollection', listId: BigInt(id) };
      case 'setSecurityLevel': return lvl === null ? null : { kind: 'setSecurityLevel', level: lvl };
      case 'setTokenType': return { kind: 'setTokenType' };
      case 'addToWhitelist': return id === null || !list ? null : { kind: 'addToWhitelist', listId: BigInt(id), accounts: list };
      case 'removeFromWhitelist': return id === null || !list ? null : { kind: 'removeFromWhitelist', listId: BigInt(id), accounts: list };
      case 'addToAuthorizers': return id === null || !list ? null : { kind: 'addToAuthorizers', listId: BigInt(id), accounts: list };
      case 'removeFromAuthorizers': return id === null || !list ? null : { kind: 'removeFromAuthorizers', listId: BigInt(id), accounts: list };
    }
  }

  // The preview. Encoding now crosses a lazily loaded module boundary, so it
  // is asynchronous — and it is deliberately re-run on every edit, because the
  // whole point of showing calldata is that it matches the fields above it.
  const [calldata, setCalldata] = useState<string | null>(null);
  const key = op ? JSON.stringify(op, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)) : '';
  useEffect(() => {
    let alive = true;
    if (!op) { setCalldata(null); return () => { alive = false; }; }
    encodeValidatorOperation(op).then(
      (data) => { if (alive) setCalldata(data); },
      () => { if (alive) setCalldata(null); },
    );
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const needsList = chosen.needs === 'list' || chosen.needs === 'list+accounts';
  const needsAccounts = chosen.needs === 'list+accounts';

  return (
    <Control
      title="Configure the validator"
      now={admin.collection.transferValidator ? 'through the collection' : 'no validator set'}
      note={<>
        The collection forwards thirteen validator configuration selectors and refuses everything
        else. These eight are composed from the fields below — there is no free-text calldata field
        on this page, and there will not be one.
      </>}
    >
      <div className={s.form}>
        <label className={s.field}>
          <span className={s.label}>Operation</span>
          <select className="select" value={at} onChange={(e) => setAt(whole(e.target.value) ?? 0)}>
            {OPERATIONS.map((o, i) => <option key={o.kind} value={i}>{o.label}</option>)}
          </select>
        </label>

        {chosen.kind === 'createList' ? (
          <Field label="List name" value={name} placeholder="Avian Stock" onChange={setName} />
        ) : null}

        {needsList ? (
          <Field
            label="List id"
            value={listId}
            placeholder="1"
            invalid={listId !== '' && id === null}
            onChange={setListId}
          />
        ) : null}

        {chosen.kind === 'setSecurityLevel' ? (
          <Field
            label="Level"
            value={level}
            hint="3 is the runbook's: operator whitelist, authorizers on, freezing off."
            invalid={lvl === null}
            onChange={setLevel}
          />
        ) : null}
      </div>

      {needsAccounts ? (
        <div className={s.form}>
          <Field
            wide
            label="Accounts"
            value={accounts}
            placeholder="0x… , 0x…"
            invalid={accounts.trim() !== '' && !list}
            hint={list ? `${list.length} address${list.length === 1 ? '' : 'es'}` : 'comma or space separated'}
            onChange={setAccounts}
          />
        </div>
      ) : null}

      {calldata ? (
        <ReadOnlyBlock label="Calldata, before it is signed">{calldata}</ReadOnlyBlock>
      ) : null}

      <div className={s.form}>
        <ActionButton
          actions={actions}
          action={{
            key: 'validator-config',
            label: 'Send it',
            disabled: !op || !admin.collection.transferValidator,
            run: (on) => configureTransferValidator(op!, on),
            outcome: () => `${chosen.label} — sent.`,
          }}
        />
      </div>

      <div style={{ marginTop: 14 }}>
        <Box title="What is deliberately not here">
          <p className="tiny dim" style={{ margin: 0 }}>
            The other five forwardable selectors are list ownership —{' '}
            <span className="mono">createListCopy</span>,{' '}
            <span className="mono">reassignOwnershipOfList</span>,{' '}
            <span className="mono">renounceOwnershipOfList</span> — and per-account freezing.
            Governance and punishment, both rare and both close to irreversible. They stay in{' '}
            <span className="mono">ConfigureEnforcement.s.sol</span>, where a second person sees
            them before they are sent.
          </p>
        </Box>
      </div>
    </Control>
  );
}
