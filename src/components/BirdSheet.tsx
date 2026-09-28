// A bird's own sheet (lifted out of screens/YourBirds.tsx on 2026-09-27):
// its satchel and the send form, in a dialog over My Nest, opened from a
// card's picture or its menu. This is where the one thing this site must
// refuse to do lives: a send that would put a bird inside its own ownership
// loop is checked before every send and refused with the reason.

import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { Avian, Note, Tag } from './Primitives';
import { WriteGate } from './Wallet';
import { useTx } from './Tx';
import { SettleControl } from './Settle';
import { CycleRefusal } from '../screens/CycleRefusal';
import { avians, avianNumber, formatEth, formatReward } from '../lib/format';
import { href } from '../router';
import {
  checkTransferSafety, transferBird,
  type Address as Addr, type Amount, type Bird, type BroodEntry, type TransferSafety,
} from '../mock';

export function BirdSheet({
  bird, entry, sellPrice, symbolOf, onConnect, onClose, onChanged, onSent, onRedirect,
}: {
  bird: Bird; entry: BroodEntry | null; sellPrice?: Amount;
  symbolOf: (token: string) => { symbol: string; decimals: number };
  onConnect: () => void; onClose: () => void; onChanged: () => void;
  /** The bird left the wallet: its id and whether it was brooding, for the page to offer its settle. */
  onSent: (id: number, wasBrooding: boolean) => void;
  /** Turn a brood's rewards to the other destination: offered beside Settle, in the settle's confirmation only (2026-09-28). */
  onRedirect?: () => void;
}) {
  const tx = useTx();
  const [to, setTo] = useState('');
  const [safety, setSafety] = useState<TransferSafety | null>(null);
  const [checking, setChecking] = useState(false);
  const [refusal, setRefusal] = useState<Extract<TransferSafety, { ok: false }> | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const valid = /^0x[0-9a-fA-F]{40}$/.test(to);
  const doCheck = async () => {
    if (!valid) return;
    setChecking(true);
    setSafety(await checkTransferSafety(bird.id, to as Addr));
    setChecking(false);
  };
  const doSend = async () => {
    const safe = await checkTransferSafety(bird.id, to as Addr);
    if (!safe.ok) { setRefusal(safe); return; }
    setBusy(true);
    const wasBrooding = !!bird.brood?.live;
    const r = await tx.run(`Sending ${avianNumber(bird.id)}`, (on) => transferBird(bird.id, to as Addr, on), {
      outcome: (x) => {
        const ev = x as { expired: number[]; hookFailed: number[] };
        return ev.expired.length
          ? `${avianNumber(bird.id)} sent. Its brooding ended with the transfer, and its satchel went with it.`
          : `${avianNumber(bird.id)} sent. Its satchel went with it.`;
      },
      rows: (x) => {
        const ev = x as { expired: number[]; hookFailed: number[] };
        const rows = ev.expired.map((id) => ({ label: avianNumber(id), value: 'brooding ended: it changed hands', tone: 'warn' as const }));
        rows.push(...ev.hookFailed.map((id) => ({ label: avianNumber(id), value: 'nest hook failed: its brood did not end on chain', tone: 'warn' as const })));
        return rows;
      },
      note: () => (wasBrooding
        ? 'What it earned before it moved comes to your wallet when anyone next settles it. You can do that from My Nest. The new holder starts fresh.'
        : undefined),
    });
    setBusy(false);
    if (r) { onSent(bird.id, wasBrooding); onChanged(); onClose(); }
  };

  const nested = bird.satchel.holds.filter((h) => h.kind === 'avian').map((h) => (h as { id: number }).id);
  const unsettled = (entry?.lines ?? []).filter((l) => l.unsettled > 0n);

  return (
    <>
      <div className="scrim scrim--fixed" role="dialog" aria-modal="true" aria-labelledby="bird-sheet-h" onClick={onClose}>
        <div className="modal modal--scroll" onClick={(e) => e.stopPropagation()}>
          <div className="row">
            <h3 id="bird-sheet-h" style={{ fontSize: 24 }}>{avianNumber(bird.id)}</h3>
            <span className="spacer" />
            <a className="small" href={href({ name: 'bird', id: bird.id })}>Open its page</a>
            <button type="button" className="btn btn--ghost btn--small" onClick={onClose} aria-label="Close">
              <Icon name="cross" size={14} />
            </button>
          </div>
          <div className="stack" style={{ marginTop: 16 }}>
            <section className="panel" aria-labelledby="satchel-h">
              <div className="row">
                <h3 id="satchel-h" style={{ fontSize: 20 }}>Its satchel</h3>
                <span className="spacer" />
                {bird.satchel.deployed ? <Tag tone="ok">Deployed</Tag> : <Tag>Not deployed yet</Tag>}
              </div>
              <p className="small dim" style={{ marginTop: 8 }}>
                The bird&rsquo;s own wallet. Whoever holds the bird controls it.
              </p>
              <p className="mono" style={{ marginTop: 10, fontSize: 12.5, overflowWrap: 'anywhere', color: 'var(--text-strong)' }}>
                {bird.satchel.address}
              </p>
              {!bird.satchel.deployed ? (
                <p className="tiny dim" style={{ marginTop: 8 }}>
                  It can receive assets before it is deployed. Deploying costs about 105,000 gas, and
                  anyone may do it.
                </p>
              ) : null}

              <h4 style={{ margin: '18px 0 0' }}>Inside it</h4>
              {bird.satchel.holds.length === 0 ? (
                <p className="small dim" style={{ marginTop: 8 }}>Nothing yet.</p>
              ) : (
                bird.satchel.holds.map((h, i) => (
                  <div key={i} className="hold-row">
                    {h.kind === 'avian' ? (
                      <>
                        <Avian traits={[0, 0, 0, 0, 0, 0]} size={44} alt="" className="hold-art" />
                        <a className="small strong" href={href({ name: 'bird', id: h.id })}>{avianNumber(h.id)}</a>
                        <span className="spacer" /><span className="tiny dim">a bird</span>
                      </>
                    ) : h.kind === 'erc20' ? (
                      <>
                        <Tag>{h.symbol}</Tag>
                        <span className="small num">{formatReward(h.amount, h.decimals)}</span>
                        <span className="spacer" /><span className="tiny dim">a token</span>
                      </>
                    ) : h.kind === 'eth' ? (
                      <>
                        <Tag>ETH</Tag>
                        <span className="small num">{formatEth(h.amount)}</span>
                        <span className="spacer" /><span className="tiny dim">gas</span>
                      </>
                    ) : (
                      <>
                        <Tag>NFT</Tag>
                        <span className="small">{h.collection} #{h.id}</span>
                        <span className="spacer" /><span className="tiny dim">an NFT</span>
                      </>
                    )}
                  </div>
                ))
              )}

              {entry?.brood ? (
                <div style={{ marginTop: 16 }}>
                  <div className="row">
                    <h4 style={{ margin: 0 }}>
                      {entry.brood.live ? `Brooding, tier ${entry.brood.tier}` : 'Brooding ended'}
                    </h4>
                    <span className="spacer" />
                    <span className="tiny dim">
                      {entry.brood.delivery.toWallet ? 'Rewards to your wallet' : 'Rewards to this satchel'}
                    </span>
                  </div>
                  {entry.lines.length === 0 ? (
                    <p className="small dim" style={{ marginTop: 8 }}>Nothing streams yet, so nothing has accrued. Its weight is counted.</p>
                  ) : (
                    entry.lines.map((l) => (
                      <div key={l.token.address} className="hold-row">
                        <Tag>{l.token.symbol}</Tag>
                        <span className="small">
                          <span className="num">{formatReward(l.unsettled, l.token.decimals)}</span>
                          <span className="dim"> unsettled</span>
                        </span>
                        <span className="spacer" />
                        <span className="small">
                          <span className="num">{formatReward(l.settled, l.token.decimals)}</span>
                          <span className="dim"> {entry.brood!.delivery.toWallet ? 'in your wallet' : 'settled here'}</span>
                        </span>
                      </div>
                    ))
                  )}
                  {unsettled.length > 0 || !entry.brood.live ? (
                    <div style={{ marginTop: 12 }}>
                      <SettleControl
                        ids={[bird.id]}
                        label={entry.brood.live ? 'Settle what it has earned' : 'Settle the ended brood'}
                        symbolOf={symbolOf} onConnect={onConnect} onDone={onChanged} ghost
                        settleLabel={entry.brood.live ? (entry.brood.delivery.toWallet ? 'Settle to my wallet' : 'Settle to its satchel') : undefined}
                        extra={entry.brood.live && onRedirect ? (
                          <button type="button" className="btn btn--ghost btn--small" disabled={busy || tx.busy} onClick={onRedirect}>
                            {entry.brood.delivery.toWallet ? 'Send to its satchel' : 'Send to my wallet'}
                          </button>
                        ) : undefined}
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}

              {nested.length > 0 ? (
                <p className="tiny dim" style={{ marginTop: 14 }}>
                  {nested.length === 1 ? 'The bird' : `The ${nested.length} birds`} inside can be moved by
                  whoever holds this bird, brooding or not.
                </p>
              ) : null}
              <p className="tiny dim" style={{ marginTop: 14 }}>
                Sending this bird sends its satchel and everything in it, settled rewards included.
              </p>
              {sellPrice !== undefined ? (
                <p className="small" style={{ marginTop: 10 }}>
                  <span className="dim">The perch would pay </span>
                  <span className="num">{avians(sellPrice)}</span>
                </p>
              ) : null}
            </section>

            <section className="panel" aria-labelledby="send-h">
              <h3 id="send-h" style={{ fontSize: 20 }}>Send {avianNumber(bird.id)}</h3>
              <p className="small dim" style={{ margin: '6px 0 0' }}>To another wallet, or into another bird&rsquo;s satchel.</p>
              <h4 style={{ margin: '16px 0 8px' }}>To</h4>
              <div className={`field${safety && !safety.ok ? ' field--bad' : ''}`}>
                <input
                  value={to}
                  onChange={(e) => { setTo(e.target.value); setSafety(null); }}
                  placeholder="0x…"
                  aria-label="Destination address"
                  spellCheck={false}
                />
                <button
                  type="button" className="btn btn--small"
                  style={{ borderLeft: '1px solid var(--line-strong)' }}
                  disabled={checking || !valid}
                  onClick={doCheck}
                >
                  {checking ? 'Checking…' : 'Check'}
                </button>
              </div>

              {safety ? (
                <div style={{ marginTop: 12 }}>
                  {safety.ok ? (
                    <Note tone="ok">Checked. Sending there cannot trap the bird.</Note>
                  ) : (
                    <Note tone="bad">
                      {safety.reason === 'own-account'
                        ? 'That is this bird’s own satchel. It would be stuck there forever.'
                        : safety.reason === 'collection-address'
                          ? 'That is the collection’s own address. Nothing recovers a bird sent there.'
                          : 'This would trap both birds forever.'}
                    </Note>
                  )}
                </div>
              ) : null}

              {bird.brood?.live ? (
                <div style={{ marginTop: 12 }}>
                  <Note tone="warn">
                    <span className="small">
                      <strong className="strong">This bird is brooding.</strong> If you sell or move
                      this bird, its brooding ends; what it has earned so far comes to your wallet
                      when anyone next settles it, and the buyer starts fresh.
                    </span>
                  </Note>
                </div>
              ) : null}

              <div style={{ marginTop: 16 }}>
                <WriteGate onConnect={onConnect}>
                  <button type="button" className="btn btn--wide" disabled={busy || tx.busy || !valid} onClick={doSend}>
                    Send the bird
                  </button>
                </WriteGate>
              </div>
              <p className="tiny dim" style={{ marginTop: 12 }}>
                Before every send we check that the destination is not a satchel that would put
                this bird inside its own ownership loop. A bird in such a loop can never be moved
                again, and the chain only catches the simplest case.
              </p>
            </section>
          </div>
        </div>
      </div>

      {refusal ? (
        <CycleRefusal
          bird={bird}
          safety={refusal}
          onClose={() => setRefusal(null)}
          onLookInside={() => { setRefusal(null); onClose(); location.hash = href({ name: 'bird', id: bird.id }); }}
        />
      ) : null}
    </>
  );
}
