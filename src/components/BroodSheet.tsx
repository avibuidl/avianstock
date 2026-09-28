// Brooding, from My Nest (2026-09-27). The Nest page's "Brood a bird" panel,
// as a sheet over the page: it opens from a card's Brood with that bird in
// it, or from the page's "Brood N" with every picked bird, each with its own
// tier and delivery choice, and one transaction for all of them. In
// `upgrade` mode it is one brooding bird and the tiers above its own, at the
// difference in cost.
//
// Nobody sends a bird anywhere. The only approval is AVIAN to the Nest for
// the tier costs: there is NO bird approval, and this sheet never asks for one.

import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { Avian, Tag } from './Primitives';
import { WriteGate } from './Wallet';
import { useTx, type FixHandlers } from './Tx';
import { nestNote, nestRows } from './Settle';
import { avians, avianNumber, shortAddress } from '../lib/format';
import { href } from '../router';
import {
  approveAviansForNest, brood, upgrade,
  type Amount, type BroodState, type NestEvents, type Tier, type TokenId,
} from '../mock';

type Choice = { tier: Tier; toWallet: boolean };

export function BroodSheet({
  ids, mode = 'brood', nest, approved, onConnect, onClose, onDone,
}: {
  ids: TokenId[];
  mode?: 'brood' | 'upgrade';
  nest: BroodState;
  /** AVIAN approved to the Nest, from the wallet read. */
  approved: Amount;
  onConnect: () => void;
  onClose: () => void;
  onDone: () => void;
}) {
  const tx = useTx();
  const [busy, setBusy] = useState(false);
  // Every bird in the sheet starts picked at tier 2, into the bird.
  const [choices, setChoices] = useState<Map<TokenId, Choice>>(() => new Map(ids.map((id) => [id, { tier: 2, toWallet: false }])));
  const [upTo, setUpTo] = useState<Tier | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const symbolOf = (token: string) => {
    const t = nest.listed.find((x) => x.address.toLowerCase() === token.toLowerCase());
    return t ? { symbol: t.symbol, decimals: t.decimals } : { symbol: shortAddress(token), decimals: 18 };
  };
  const onFix: FixHandlers = { approve: () => { void doApprove(); } };

  // Birds that can be brooded now: held, and either no brood or an ended one
  // (which `brood` settles on the way; the contract's `isBrooding` says so).
  const entries = ids.map((id) => nest.yours.find((e) => e.bird.id === id)).filter((e): e is NonNullable<typeof e> => !!e);
  const upgrading = mode === 'upgrade' ? entries[0] : undefined;
  const current = upgrading?.brood?.tier ?? 1;
  const higher = ([1, 2, 3] as Tier[]).filter((t) => t > current);
  const picked = entries.filter((e) => !e.brood || !e.brood.live).map((e) => [e.bird.id, choices.get(e.bird.id)!] as const);
  const burn = mode === 'upgrade'
    ? (upTo ? nest.tierCost[upTo] - nest.tierCost[current] : 0n)
    : picked.reduce((a, [, c]) => a + nest.tierCost[c.tier], 0n);
  const needsApproval = approved < burn;
  const setChoice = (id: TokenId, patch: Partial<Choice>) => setChoices((m) => {
    const next = new Map(m);
    next.set(id, { ...(next.get(id) ?? { tier: 2, toWallet: false }), ...patch });
    return next;
  });

  const doApprove = async () => {
    setBusy(true);
    await tx.run(`Approving ${avians(burn)}`, (on) => approveAviansForNest(burn, on), {
      onFix, outcome: () => `${avians(burn)} approved to the nest. Nothing has been paid yet.`,
    });
    setBusy(false);
    onDone();
  };

  const doBrood = async () => {
    setBusy(true);
    const list = picked.map(([id, c]) => ({ id, tier: c.tier, toWallet: c.toWallet }));
    const res = await tx.run(
      `Brooding ${list.length === 1 ? avianNumber(list[0].id) : `${list.length} birds`}`,
      (on) => brood(list, on),
      {
        context: { price: burn },
        onFix,
        outcome: (x) => `Brooding. ${avians((x as { paid: bigint }).paid)} paid to the Roost; it does not come back.`,
        rows: (x) => nestRows((x as { events: NestEvents }).events, symbolOf),
        note: (x) => nestNote((x as { events: NestEvents }).events),
      },
    );
    setBusy(false);
    if (res) { onDone(); onClose(); }
  };

  const doUpgrade = async () => {
    if (!upgrading || !upTo) return;
    setBusy(true);
    const res = await tx.run(`Upgrading ${avianNumber(upgrading.bird.id)} to tier ${upTo}`, (on) => upgrade(upgrading.bird.id, upTo, on), {
      context: { price: burn },
      onFix,
      outcome: (x) => `Tier ${upTo}. ${avians((x as { paid: bigint }).paid)} paid on to the Roost. What it had earned was settled first.`,
      rows: (x) => nestRows((x as { events: NestEvents }).events, symbolOf),
      note: (x) => nestNote((x as { events: NestEvents }).events),
    });
    setBusy(false);
    if (res) { onDone(); onClose(); }
  };

  const streaming = nest.listed.map((t) => t.symbol).join(', ');

  return (
    <div className="scrim scrim--fixed" role="dialog" aria-modal="true" aria-labelledby="brood-sheet-h" onClick={() => { if (!busy) onClose(); }}>
      <div className="modal modal--scroll" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <h3 id="brood-sheet-h" style={{ fontSize: 24 }}>
            {mode === 'upgrade' && upgrading ? `Upgrade ${avianNumber(upgrading.bird.id)}` : picked.length === 1 ? `Brood ${avianNumber(picked[0][0])}` : `Brood ${picked.length} birds`}
          </h3>
          <span className="spacer" />
          <button type="button" className="btn btn--ghost btn--small" onClick={onClose} aria-label="Close" disabled={busy}>
            <Icon name="cross" size={14} />
          </button>
        </div>
        <p className="small dim" style={{ marginTop: 6 }}>
          {mode === 'upgrade'
            ? 'A higher tier is a bigger share of every stream. You pay the difference; what the bird has earned is settled first.'
            : 'A tier is a share of every stream, paid in AVIAN to the Roost. The bird stays in your wallet the whole time.'}
        </p>
        <p className="tiny dim" style={{ marginTop: 8 }}>
          {nest.listed.length === 0
            ? <>Nothing streams yet: no reward token is listed. Weight is counted from the moment a bird broods.</>
            : <>Streaming now: {streaming}. <a href={href({ name: 'engine', at: 'streams' })}>See the Bird Engine</a>.</>}
        </p>

        {mode === 'upgrade' && upgrading ? (
          <div style={{ marginTop: 18 }}>
            <div className="row" style={{ gap: 12 }}>
              <Avian traits={upgrading.bird.traits} size={56} alt="" />
              <div>
                <span className="strong">{avianNumber(upgrading.bird.id)}</span>
                <div className="tiny dim" style={{ marginTop: 2 }}>Tier {current} now, {current}x weight</div>
              </div>
            </div>
            <div className="tiers" role="radiogroup" aria-label="The new tier" style={{ marginTop: 12 }}>
              {higher.map((t) => (
                <button
                  key={t} type="button" role="radio" aria-checked={upTo === t}
                  className={`tier${upTo === t ? ' tier--on' : ''}`}
                  onClick={() => setUpTo(t)}
                >
                  <div className="num" style={{ fontSize: 14 }}>+{avians(nest.tierCost[t] - nest.tierCost[current])}</div>
                  <div className="tiny dim" style={{ marginTop: 2 }}>Tier {t}, {t}x weight</div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="stack" style={{ gap: 10, marginTop: 18 }}>
            {picked.map(([id, c]) => {
              const e = entries.find((x) => x.bird.id === id)!;
              return (
                <div key={id} className="box box--accent" style={{ padding: 12 }}>
                  <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
                    <Avian traits={e.bird.traits} size={72} alt="" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="row">
                        <span className="strong">{avianNumber(id)}</span>
                        {e.brood ? <Tag tone="warn">Brood ended</Tag> : null}
                      </div>
                      <div className="tiers" role="radiogroup" aria-label={`Tier for ${avianNumber(id)}`} style={{ marginTop: 10 }}>
                        {([1, 2, 3] as Tier[]).map((t) => (
                          <button
                            key={t} type="button" role="radio" aria-checked={c.tier === t}
                            className={`tier${c.tier === t ? ' tier--on' : ''}`}
                            onClick={() => setChoice(id, { tier: t })}
                          >
                            <div className="num" style={{ fontSize: 14 }}>{avians(nest.tierCost[t])}</div>
                            <div className="tiny dim" style={{ marginTop: 2 }}>{t}x weight</div>
                          </button>
                        ))}
                      </div>
                      {/* The delivery choice: two plain options, the default first. */}
                      <div className="row row--wrap" style={{ gap: 8, marginTop: 10 }} role="radiogroup" aria-label={`Where ${avianNumber(id)}’s rewards go`}>
                        <button
                          type="button" role="radio" aria-checked={!c.toWallet}
                          className={`select select--tight${!c.toWallet ? ' select--on' : ''}`}
                          onClick={() => setChoice(id, { toWallet: false })}
                        >
                          Keep it in the bird
                        </button>
                        <button
                          type="button" role="radio" aria-checked={c.toWallet}
                          className={`select select--tight${c.toWallet ? ' select--on' : ''}`}
                          onClick={() => setChoice(id, { toWallet: true })}
                        >
                          Send it to my wallet
                        </button>
                      </div>
                      <p className="tiny dim" style={{ margin: '6px 0 0' }}>
                        {c.toWallet
                          ? 'Rewards are delivered to your wallet. Nothing goes with the bird if it is sold.'
                          : 'Rewards are delivered into the bird’s own wallet and go with it if it is sold.'}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* The cost, before the button, as AVIAN paid on to the Roost. */}
        <div className="row" style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
          <span className="small">
            {mode === 'upgrade'
              ? (upTo ? `Tier ${current} to tier ${upTo}` : 'Pick the new tier')
              : `${picked.length} ${picked.length === 1 ? 'bird' : 'birds'}, ${picked.reduce((a, [, c]) => a + c.tier, 0)}x weight`}
          </span>
          <span className="spacer" />
          <span className="num" style={{ fontSize: 17 }}>{avians(burn)}</span>
        </div>
        <div className="row row--wrap" style={{ rowGap: 2 }}>
          <span className="tiny dim">Paid to the Roost. It does not come back.</span>
          <span className="spacer" />
          <span className="tiny dim">Approved to the nest: {avians(approved)}</span>
        </div>

        {/* ONE APPROVAL, and it is for AVIAN. A bird broods where it is. */}
        <div style={{ marginTop: 16 }}>
          <WriteGate onConnect={onConnect}>
            {burn > 0n && needsApproval ? (
              <button type="button" className="btn btn--wide" disabled={busy || tx.busy} onClick={doApprove}>
                Approve {avians(burn)} to the nest
              </button>
            ) : mode === 'upgrade' ? (
              <button type="button" className="btn btn--wide" disabled={!upTo || busy || tx.busy} onClick={doUpgrade}>
                {upTo ? `Upgrade to tier ${upTo} for ${avians(burn)}` : 'Pick the new tier'}
              </button>
            ) : (
              <button type="button" className="btn btn--wide" disabled={picked.length === 0 || busy || tx.busy} onClick={doBrood}>
                {picked.length === 0 ? 'Nothing here can be brooded'
                  : `Brood ${picked.length === 1 ? avianNumber(picked[0][0]) : `${picked.length} birds`} for ${avians(burn)}`}
              </button>
            )}
          </WriteGate>
        </div>
        <p className="tiny dim" style={{ marginTop: 10 }}>
          {mode === 'upgrade' ? 'One transaction. The bird itself needs no approval.' : 'One transaction for all of them. The birds themselves need no approval.'}
        </p>
      </div>
    </div>
  );
}
