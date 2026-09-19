// Your birds, their satchels, and the transfer screen — which is where the one
// thing this site must refuse to do lives.

import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import {
  Address, Avian, Box, EmptyState, ErrorState, Note, PanelSkeleton, Tag,
} from '../components/Primitives';
import { WriteGate } from '../components/Wallet';
import { useTx } from '../components/Tx';
import { CycleRefusal } from './CycleRefusal';
import { avians, avianNumber, formatCount, formatEth, formatReward, shortAddress } from '../lib/format';
import { href, navigate } from '../router';
import { SettleControl } from '../components/Settle';
import { CollectPanel } from '../components/Collect';
import { SellSheet } from '../components/SellSheet';
import {
  checkTransferSafety, transferBird, useConnection, useBrood,
  usePerch, useYourBirds, type Address as Addr, type Amount, type Bird, type BroodEntry,
  type TransferSafety,
} from '../mock';

export function YourBirds({ onConnect }: { onConnect: () => void }) {
  const yours = useYourBirds();
  // The brood read: every bird with its brood and its per-token accrual, so
  // the settle-all button can pick only the birds with something earned.
  const brood = useBrood();
  const perch = usePerch();
  const c = useConnection();
  const tx = useTx();

  const [selected, setSelected] = useState<number | null>(null);
  const [to, setTo] = useState('');
  const [safety, setSafety] = useState<TransferSafety | null>(null);
  const [checking, setChecking] = useState(false);
  const [refusal, setRefusal] = useState<{ bird: Bird; safety: Extract<TransferSafety, { ok: false }> } | null>(null);
  const [busy, setBusy] = useState(false);
  /** A brooding bird this session just transferred away — its settle is offered once. */
  const [justSent, setJustSent] = useState<number | null>(null);
  /** The birds the sell sheet opened on (one from a card's Sell, or the picked set); null when it is closed. */
  const [sellingIds, setSellingIds] = useState<number[] | null>(null);
  /**
   * Birds picked for one sale, by the square on each card. The picture still
   * opens the bird's sheet; the square is the only thing that picks. The set
   * survives a reload of the list and is read through it below, so a bird
   * that has been sold or sent cannot stay picked.
   */
  const [picked, setPicked] = useState<Set<number>>(() => new Set());

  // The bird's sheet closes on Escape, on the scrim, or on its own button —
  // and takes the half-typed destination with it, so the next bird's send
  // form starts clean.
  const closeSheet = () => { setSelected(null); setTo(''); setSafety(null); };
  useEffect(() => {
    if (selected === null) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeSheet(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  if (c.status !== 'connected') {
    return (
      <div className="page">
        <h2>My birds</h2>
        <p className="lede">Connect a wallet to see the birds it holds.</p>
        <div style={{ marginTop: 24, maxWidth: 380 }}>
          <WriteGate onConnect={onConnect}><span /></WriteGate>
        </div>
      </div>
    );
  }

  if (yours.loading && !yours.data) {
    return <div className="page page--wide"><div className="panel"><PanelSkeleton lines={5} art /></div></div>;
  }
  if (yours.error) {
    return (
      <div className="page page--wide">
        <ErrorState title="Your birds could not be read." detail="They are where they were. Try again in a moment."
          onRetry={yours.reload} />
      </div>
    );
  }

  const birds = yours.data ?? [];
  const sellPrice = perch.data?.sell;
  const entries: BroodEntry[] = brood.data?.yours ?? [];
  const symbolOf = (token: string) => {
    const t = brood.data?.listed.find((x) => x.address.toLowerCase() === token.toLowerCase());
    return t ? { symbol: t.symbol, decimals: t.decimals } : { symbol: shortAddress(token), decimals: 18 };
  };
  // "Settle all my brooding birds": the ids with something earned, only.
  const settleAll = entries
    .filter((e) => e.brood && e.lines.some((l) => l.unsettled > 0n))
    .map((e) => e.bird.id);
  const brooding = birds.filter((b) => b.brood?.live).length;
  // Only a bird held by the wallet itself can go to the perch: one inside
  // another bird's satchel is that bird's to move. The picked set is read
  // through the live list, so a stale id is simply not there.
  const forSale = birds.filter((b) => picked.has(b.id) && b.location.where === 'wallet');
  const togglePick = (id: number) => setPicked((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  // The bird whose sheet is open — none until a card is tapped. (When the
  // sheet was a column beside the cards it defaulted to the first bird; a
  // dialog that opens itself on arrival would be a surprise.)
  const current = selected === null ? undefined : birds.find((b) => b.id === selected);

  const doCheck = async () => {
    if (!current || !/^0x[0-9a-fA-F]{40}$/.test(to)) return;
    setChecking(true);
    const r = await checkTransferSafety(current.id, to as Addr);
    setSafety(r);
    setChecking(false);
  };

  const doSend = async () => {
    if (!current) return;
    const safe = await checkTransferSafety(current.id, to as Addr);
    if (!safe.ok) { setRefusal({ bird: current, safety: safe }); return; }
    setBusy(true);
    const wasBrooding = !!current.brood?.live;
    const r = await tx.run(`Sending ${avianNumber(current.id)}`, (on) => transferBird(current.id, to as Addr, on), {
      outcome: (x) => {
        const ev = x as { expired: number[]; hookFailed: number[] };
        return ev.expired.length
          ? `${avianNumber(current.id)} sent. Its brooding ended with the transfer, and its satchel went with it.`
          : `${avianNumber(current.id)} sent. Its satchel went with it.`;
      },
      rows: (x) => {
        const ev = x as { expired: number[]; hookFailed: number[] };
        const rows = ev.expired.map((id) => ({ label: avianNumber(id), value: 'brooding ended: it changed hands', tone: 'warn' as const }));
        rows.push(...ev.hookFailed.map((id) => ({ label: avianNumber(id), value: 'nest hook failed: its brood did not end on chain', tone: 'warn' as const })));
        return rows;
      },
      note: () => (wasBrooding
        ? 'What it earned before it moved comes to your wallet when anyone next settles it. You can do that below. The new holder starts fresh.'
        : undefined),
    });
    // A settle of the bird you just sent is offered, not sent: it pays YOU
    // the pre-transfer share, so it is worth a signature.
    if (r && wasBrooding) setJustSent(current.id);
    setTo(''); setSafety(null);
    setBusy(false);
  };

  return (
    <div className="page page--wide">
      <div className="row row--wrap" style={{ gap: 16 }}>
        <div>
          <h2>My birds</h2>
          <p className="lede" style={{ marginTop: 8 }}>
            {birds.length === 0 ? 'None in this wallet yet.'
              : brooding === 0 ? `${formatCount(birds.length)} in this wallet.`
                : `${formatCount(birds.length)} in this wallet, ${formatCount(brooding)} brooding.`}
          </p>
        </div>
        <span className="spacer" />
        {forSale.length > 0 ? (
          // The address gives way to the sale while anything is picked: one
          // button for the lot, and a way to unpick them all.
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn--ghost btn--small" onClick={() => setPicked(new Set())}>
              Clear
            </button>
            <button type="button" className="btn btn--small" onClick={() => setSellingIds(forSale.map((b) => b.id))}>
              Sell {forSale.length === 1 ? avianNumber(forSale[0].id) : `${formatCount(forSale.length)} birds`}
              {sellPrice !== undefined ? ` for ${avians(sellPrice * BigInt(forSale.length))}` : ''}
            </button>
          </div>
        ) : (
          <span className="wchip"><Address value={c.address} /></span>
        )}
      </div>

      {justSent !== null ? (
        <div style={{ marginTop: 16, maxWidth: 620 }}>
          <Box tone="warn" title={`${avianNumber(justSent)} was brooding`}>
            <p className="small" style={{ margin: 0 }}>
              Its brooding ended with the transfer. What it earned before it moved comes to your
              wallet when it is settled, and the buyer starts fresh.
            </p>
            <div style={{ marginTop: 12 }}>
              <SettleControl
                ids={[justSent]} label={`Settle ${avianNumber(justSent)} now`}
                symbolOf={symbolOf} onConnect={onConnect} onDone={() => { setJustSent(null); brood.reload(); }}
              />
            </div>
          </Box>
        </div>
      ) : null}

      {birds.length === 0 ? (
        <div style={{ marginTop: 32, maxWidth: 620 }}>
          <EmptyState title="No birds in this wallet yet.">
            <a href={href({ name: 'compose' })}>Compose one</a>, or buy one from{' '}
            <a href={href({ name: 'perch' })}>the perch</a>.
          </EmptyState>
        </div>
      ) : (
        <div>
          <div>
            {birds.length > 0 ? (
              <div className="bird-cards">
                {birds.map((b) => (
                  <BirdCard
                    key={b.id}
                    bird={b}
                    picked={picked.has(b.id)}
                    onPick={b.location.where === 'wallet' ? () => togglePick(b.id) : undefined}
                    onSelect={() => setSelected(b.id)}
                    onSell={() => setSellingIds([b.id])}
                  />
                ))}
              </div>
            ) : null}

            {settleAll.length > 0 ? (
              <div style={{ marginTop: 20 }}>
                <div className="row" style={{ gap: 12 }}>
                  <span className="small">
                    {formatCount(settleAll.length)} of your birds {settleAll.length === 1 ? 'has' : 'have'} rewards accrued and not yet delivered.
                  </span>
                  <span className="spacer" />
                  <SettleControl
                    ids={settleAll}
                    label={`Settle all ${formatCount(settleAll.length)}`}
                    symbolOf={symbolOf} onConnect={onConnect} onDone={() => { brood.reload(); yours.reload(); }}
                  />
                </div>
              </div>
            ) : null}

            {/*
              The Sweeper. Draws nothing on a deployment without one, and
              nothing for a wallet with no grant and no satchel holding a
              listed token — HANDOVER section 5 says it is a choice, not a
              step everyone must take.
            */}
            <CollectPanel onConnect={onConnect} />
          </div>
        </div>
      )}

      {/*
        The bird's own sheet: its satchel and the send form, in a dialog over
        the page, opened by a tap on a card. It used to be a 400px column
        beside the cards, which gave a third of the page to one bird.
      */}
      {current ? (
        <div className="scrim scrim--fixed" role="dialog" aria-modal="true" aria-labelledby="bird-sheet-h" onClick={closeSheet}>
          <div className="modal modal--scroll" onClick={(e) => e.stopPropagation()}>
            <div className="row">
              <h3 id="bird-sheet-h" style={{ fontSize: 24 }}>{avianNumber(current.id)}</h3>
              <span className="spacer" />
              <a className="small" href={href({ name: 'bird', id: current.id })}>Open its page</a>
              <button type="button" className="btn btn--ghost btn--small" onClick={closeSheet} aria-label="Close">
                <Icon name="cross" size={14} />
              </button>
            </div>
            <div className="stack" style={{ marginTop: 16 }}>
              <SatchelPanel
                bird={current}
                entry={entries.find((e) => e.bird.id === current.id) ?? null}
                sellPrice={sellPrice}
                symbolOf={symbolOf}
                onConnect={onConnect}
                onSettled={() => { brood.reload(); yours.reload(); }}
              />

              <section className="panel" aria-labelledby="send-h">
                <h3 id="send-h" style={{ fontSize: 20 }}>Send {avianNumber(current.id)}</h3>
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
                    disabled={checking || !/^0x[0-9a-fA-F]{40}$/.test(to)}
                    onClick={doCheck}
                  >
                    {checking ? 'Checking…' : 'Check'}
                  </button>
                </div>

                {safety ? (
                  <div style={{ marginTop: 12 }}>
                    {safety.ok ? (
                      <Note tone="ok">
                        Checked. Sending there cannot trap the bird.
                      </Note>
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

                {current.brood?.live ? (
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
                    <button
                      type="button" className="btn btn--wide"
                      disabled={busy || tx.busy || !/^0x[0-9a-fA-F]{40}$/.test(to)}
                      onClick={doSend}
                    >
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
      ) : null}

      {sellingIds !== null ? (
        <SellSheet
          initial={sellingIds}
          onConnect={onConnect}
          onClose={() => setSellingIds(null)}
          onSold={() => { yours.reload(); brood.reload(); setPicked(new Set()); }}
        />
      ) : null}

      {refusal ? (
        <CycleRefusal
          bird={refusal.bird}
          safety={refusal.safety}
          onClose={() => setRefusal(null)}
          onLookInside={() => { navigate({ name: 'bird', id: refusal.bird.id }); setRefusal(null); }}
        />
      ) : null}
    </div>
  );
}

function BirdCard({
  bird, picked, onPick, onSelect, onSell,
}: { bird: Bird; picked?: boolean; onPick?: () => void; onSelect?: () => void; onSell: () => void }) {
  const nested = bird.satchel.holds.filter((h) => h.kind === 'avian').length;
  const loc = bird.location;
  return (
    <article className={`bird-card${picked ? ' bird-card--on' : ''}`}>
      {/* The square that picks the bird for a sale. Only on a bird the wallet
          holds itself; a bird inside another bird's satchel has no square. */}
      {onPick ? (
        <button
          type="button"
          className={`bird-card__pick${picked ? ' bird-card__pick--on' : ''}`}
          aria-pressed={picked}
          aria-label={picked ? `Take ${avianNumber(bird.id)} out of the sale` : `Put ${avianNumber(bird.id)} in the sale`}
          onClick={onPick}
        >
          {picked ? <Icon name="check" size={12} /> : null}
        </button>
      ) : null}
      <button
        type="button"
        onClick={onSelect}
        disabled={!onSelect}
        style={{ display: 'block', width: '100%', padding: 0, border: 0, background: 'transparent', cursor: onSelect ? 'pointer' : 'default' }}
        aria-label={`Select ${avianNumber(bird.id)}`}
      >
        <Avian traits={bird.traits} alt={avianNumber(bird.id)} />
      </button>
      <div style={{ padding: '12px 14px 14px' }}>
        {/* The card is the flock tile's width now; "Brooding · tier 3" drops under the name rather than past the edge. */}
        <div className="row row--wrap" style={{ rowGap: 6 }}>
          <a className="strong" href={href({ name: 'bird', id: bird.id })} style={{ fontWeight: 600 }}>
            {avianNumber(bird.id)}
          </a>
          <span className="spacer" />
          {bird.brood?.live ? <Tag tone="ok">Brooding, tier {bird.brood.tier}</Tag>
            : bird.brood ? <Tag tone="warn">Brood ended</Tag>
              : nested ? <Tag tone="hot">Holds {nested} {nested === 1 ? 'bird' : 'birds'}</Tag>
                : <Tag>In your wallet</Tag>}
        </div>
        {loc.where === 'wallet' ? (
          // Side by side, each half the card; a live brood has no first
          // button (the tag above already says it is brooding, and at which
          // tier), and then Sell takes the whole row. An ended brood's button
          // says "Settle": the nest settles it on the way to brooding again.
          <div className="bird-card__actions" style={{ marginTop: 12 }}>
            {bird.brood?.live ? null : (
              <a className="btn btn--ghost btn--small" href={href({ name: 'nest' })}>
                {bird.brood ? 'Settle' : 'Brood'}
              </a>
            )}
            <button type="button" className="btn btn--ghost btn--small" onClick={onSell}>
              Sell
            </button>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function SatchelPanel({
  bird, entry, sellPrice, symbolOf, onConnect, onSettled,
}: {
  bird: Bird; entry: BroodEntry | null; sellPrice?: Amount;
  symbolOf: (token: string) => { symbol: string; decimals: number };
  onConnect: () => void; onSettled: () => void;
}) {
  const nested = bird.satchel.holds.filter((h) => h.kind === 'avian').map((h) => (h as { id: number }).id);
  const unsettled = (entry?.lines ?? []).filter((l) => l.unsettled > 0n);
  return (
    <section className="panel" aria-labelledby="satchel-h">
      <div className="row">
        <h3 id="satchel-h" style={{ fontSize: 20 }}>Its satchel</h3>
        <span className="spacer" />
        <Tag>{avianNumber(bird.id)}</Tag>
      </div>
      <p className="small dim" style={{ marginTop: 8 }}>
        The bird&rsquo;s own wallet. Whoever holds the bird controls it.
      </p>

      <div className="inset" style={{ marginTop: 14 }}>
        <div className="row">
          <span className="label">Address</span>
          <span className="spacer" />
          {bird.satchel.deployed ? <Tag tone="ok">Deployed</Tag> : <Tag>Not deployed yet</Tag>}
        </div>
        <p className="mono" style={{ marginTop: 6, fontSize: 12.5, overflowWrap: 'anywhere', color: 'var(--text-strong)' }}>
          {bird.satchel.address}
        </p>
        {!bird.satchel.deployed ? (
          <p className="tiny dim" style={{ marginTop: 8 }}>
            It can receive assets before it is deployed. Deploying costs about 105,000 gas, and
            anyone may do it.
          </p>
        ) : null}
      </div>

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
                symbolOf={symbolOf} onConnect={onConnect} onDone={onSettled} ghost
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
  );
}
