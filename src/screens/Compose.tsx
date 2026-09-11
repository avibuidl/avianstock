// Compose and mint — the heart of the product.
//
// Six choices against the locked owlish base, a live preview of the actual
// drawing the chain will return, and the register's answer before anything is
// signed. Both doors live here: the flocklist's free one and the paid one.

import { useCallback, useEffect, useState } from 'react';
import s from './Compose.module.css';
import { Icon } from '../components/Icon';
import {
  Avian, Box, ErrorState, Note, PanelSkeleton, Swatch, Tag,
} from '../components/Primitives';
import { ApprovalSheet, type ApprovalRoute } from '../components/ApprovalSheet';
import { WriteGate } from '../components/Wallet';
import { useTx } from '../components/Tx';
import { CATEGORIES } from '../art/traits';
import { comboHex, packCombo, type TraitIndices } from '../art/render';
import { avians, avianNumber, formatCount } from '../lib/format';
import { href, navigate } from '../router';
import {
  PRICE, approveAviansForMint, comboTaken, isMock, mint, mintFree, mintMany,
  nearestAvailable, signMintPermit, useCollection, useRefreshNonce, useScenario, useWallet,
  type Amount, type CategoryId, type FixKind,
} from '../mock';

const START: TraitIndices = [1, 4, 14, 1, 3, 4];

export function Compose({ onConnect }: { onConnect: () => void }) {
  const collection = useCollection();
  const wallet = useWallet();
  const scenario = useScenario();
  const tx = useTx();
  // Every write bumps this, so the tray is re-checked whenever anything else is.
  const nonce = useRefreshNonce();

  const [traits, setTraits] = useState<TraitIndices>(START);
  const [batch, setBatch] = useState<TraitIndices[]>([]);
  // Birds the register took while they sat in the tray. Kept so their removal
  // can be reported rather than just happening.
  const [lost, setLost] = useState<TraitIndices[]>([]);
  const [approving, setApproving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [alts, setAlts] = useState<TraitIndices[] | null>(null);

  const [status, setStatus] = useState<{ taken: boolean; tokenId?: number } | null>(null);
  const [checking, setChecking] = useState(true);

  // The register's answer for what is on screen. There is no way to reserve a
  // combination, so this is a courtesy, not a guarantee — and the copy says so.
  useEffect(() => {
    let alive = true;
    setChecking(true);
    setAlts(null);
    comboTaken(traits).then(
      (r) => { if (alive) { setStatus(r); setChecking(false); } },
      () => { if (alive) { setStatus(null); setChecking(false); } },
    );
    return () => { alive = false; };
  }, [traits, scenario.combo, scenario.data]);

  useEffect(() => {
    if (status?.taken) nearestAvailable(traits, 3).then(setAlts, () => setAlts(null));
  }, [status?.taken, traits]);

  /*
    THE TRAY IS NOT A RESERVATION.

    Nothing on chain holds a combination for anyone, so a bird queued here can
    be minted by somebody else while it waits — and a batch containing one is
    refused whole, taking the birds beside it with it. The register is asked
    about every bird in the tray on the same beat everything else re-reads, and
    a combination that has gone is dropped.

    Dropped by VALUE, not by index: the check is asynchronous and the tray can
    be added to while it is in flight, so removing "the ones that were taken"
    has to mean those exact combinations and not those positions.
  */
  useEffect(() => {
    if (batch.length === 0) return undefined;
    let alive = true;
    const asked = batch;
    Promise.all(asked.map((t) => comboTaken(t).then((r) => r.taken, () => false)))
      .then((taken) => {
        if (!alive || !taken.some(Boolean)) return;
        const gone = asked.filter((_, i) => taken[i]);
        const keys = new Set(gone.map((t) => t.join(',')));
        setBatch((b) => b.filter((t) => !keys.has(t.join(','))));
        setLost((l) => [...l, ...gone]);
      });
    return () => { alive = false; };
  }, [batch, nonce, scenario.combo, scenario.data]);

  const c = collection.data;
  const w = wallet.data;

  const freeStatus = w?.freeMintStatus ?? null;
  // Until the wallet has been read we do not know whether this door is
  // open to THIS wallet, and an unread wallet must never read as allowlisted.
  const freeOpen = !!c?.freeMintOpen && !!w && freeStatus === null;
  const paidOpen = !!c?.mintOpen;

  const price = c?.price ?? PRICE;
  /*
    THE BATCH IS WHAT IS IN THE TRAY, AND NOTHING ELSE.

    It used to be the tray PLUS whatever happened to be on the easel, which
    meant adding one bird queued two: the one chosen and the one the easel
    moved on to, charged for and minted without ever having been picked. The
    count was honest about the transaction and the transaction was wrong.

    So the tray is the batch. Add a bird and it goes in; the easel moves to a
    fresh composition so the next one can be built, and that composition is
    minted only if it is added too. With an empty tray the button mints the one
    bird on the easel, which is the ordinary single mint.
  */
  const count = batch.length > 0 ? batch.length : 1;
  const needed = price * BigInt(count);
  const allowance = w?.approvals.aviansToCollection ?? 0n;
  const balance = w?.avians ?? 0n;
  const needsApproval = allowance < needed;
  const shortOfBalance = balance < needed;

  const onFix = useCallback((kind: FixKind, amount?: Amount) => {
    if (kind === 'approve') { setApproving(true); return; }
    if (kind === 'recompose') { nearestAvailable(traits, 3).then(setAlts, () => setAlts(null)); return; }
    if (kind === 'get-avians') { navigate({ name: 'first-light' }); return; }
    if (kind === 'perch') { navigate({ name: 'perch' }); return; }
    if (kind === 'switch-network') { onConnect(); return; }
    void amount;
  }, [traits, onConnect]);

  const explainCtx = { price: needed, balance, allowance, walletLimit: c?.walletLimit };

  // Avians is a solady ERC-20 with EIP-2612, so a permit is always available
  // against a real deployment. The scenario axis is the mock's way of walking
  // the approve-only path, and it does not speak for a chain.
  const permitAvailable = isMock() ? scenario.approvalRoute === 'permit' : true;

  /**
   * `withPermit` is the route the person picked in the sheet, not a guess.
   *
   * The signature is asked for INSIDE `tx.run`, which is already showing
   * "waiting for your wallet" by then and which reports whatever comes back.
   * It used to be signed outside with `.catch(() => undefined)`, so a refused
   * or failed signature was discarded and the mint went out anyway — with no
   * allowance behind it, to fail on the allowance. The one thing that could not
   * be learned from that screen was that the signature was the problem.
   */
  const doMint = async (withPermit: boolean) => {
    setBusy(true);
    if (batch.length > 0) {
      const r = await tx.run('Minting the batch', async (on) => {
        const permit = withPermit ? await signMintPermit(count) : undefined;
        // The tray, in the order it was composed. The easel is not in it.
        return mintMany(batch, { permit }, on);
      }, {
        context: explainCtx,
        onFix,
        outcome: (x) => `${x.tokenIds.length} birds minted — ${x.tokenIds.map(avianNumber).join(', ')}.`,
      });
      // ONLY on success. A refused mint — a rejected signature, a short
      // allowance, a combination that went — used to empty the tray anyway, so
      // the fix for a one-bird problem was to compose all of them again.
      if (r) setBatch([]);
    } else {
      const r = await tx.run('Minting your Avian', async (on) => {
        const permit = withPermit ? await signMintPermit(1) : undefined;
        return mint(traits, { permit }, on);
      }, {
        context: explainCtx,
        onFix,
        outcome: (x) => `${avianNumber(x.tokenId)} is yours. It has its own satchel from this moment.`,
      });
      if (r) setTraits(nextComposition(traits, batch));
    }
    setBusy(false);
  };

  const doFree = async () => {
    setBusy(true);
    await tx.run('Claiming your free Avian', (on) => mintFree(traits, w?.proof ?? [], on), {
      context: explainCtx,
      onFix,
      outcome: (x) => `${avianNumber(x.tokenId)} is yours — a real Avian, same register, same perch.`,
    });
    setBusy(false);
  };

  const doApprove = async (route: ApprovalRoute, amount: Amount) => {
    setApproving(false);
    if (route === 'permit') { await doMint(true); return; }
    setBusy(true);
    await tx.run(`Approving ${avians(amount)}`, (on) => approveAviansForMint(amount, on), {
      context: explainCtx,
      onFix,
      outcome: () => `${avians(amount)} approved. Nothing has moved yet.`,
    });
    setBusy(false);
  };

  if (collection.loading && !c) {
    return <div className={s.work}><div className="panel"><PanelSkeleton art lines={4} /></div><div className="panel"><PanelSkeleton lines={8} /></div></div>;
  }
  if (collection.error) {
    return (
      <div className="page">
        <ErrorState
          title="That read failed."
          detail="We could not ask the collection whether the doors are open. Nothing is wrong with your wallet or your birds."
          onRetry={collection.reload}
        />
      </div>
    );
  }
  if (!c) return null;

  const doorsShut = !paidOpen && !c.freeMintOpen;
  const capReached = !!w && w.mintedBy >= c.walletLimit;
  // An explanation is not a button: on a phone it goes inline, where it can
  // be as tall as it needs to be, rather than into the docked action bar.
  const inlineOnly = (doorsShut || c.paidRemaining === 0 || capReached) && !freeOpen;

  return (
    <>
      <DoorBar collection={c} freeOpen={freeOpen} paidOpen={paidOpen} freeStatus={freeStatus} />

      <div className={s.work}>
        <div className={s.preview}>
          <div className={`panel panel--tight${status?.taken ? ' panel--bad' : ''}`}>
            <div className="row" style={{ marginBottom: 14 }}>
              <p className="eyebrow" style={{ margin: 0 }}>
                {freeOpen ? 'Your free Avian — not claimed yet' : 'Your Avian — not minted yet'}
              </p>
              <span className="spacer" />
              {checking ? <Tag>Checking…</Tag>
                : status?.taken ? <Tag tone="bad">Taken</Tag>
                  : <Tag tone="ok">Available</Tag>}
            </div>

            <Avian traits={traits} alt="The bird you are composing" />

            <div style={{ marginTop: 16 }}>
              {checking ? (
                <p className="small dim" style={{ margin: 0 }}>Asking the register…</p>
              ) : status?.taken ? (
                <Note tone="bad">
                  This exact bird already exists{status.tokenId ? ` — ${avianNumber(status.tokenId)} got there first` : ''}.
                  Change any one of your six choices and it&rsquo;s yours again.{' '}
                  {status.tokenId ? <a href={href({ name: 'bird', id: status.tokenId })}>See {avianNumber(status.tokenId)}</a> : null}
                </Note>
              ) : c.paidRemaining === 0 && !freeOpen ? (
                <Note tone="warn">
                  Nobody has composed this one — and now nobody will. All 5,555 are minted.
                </Note>
              ) : (
                <Note tone="ok">Nobody has this bird. Yours if you want it.</Note>
              )}
            </div>

            <dl className="kv" style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
              {CATEGORIES.map((cat, i) => (
                <div key={cat.key} style={{ display: 'contents' }}>
                  <dt>{cat.display}</dt>
                  <dd>{cat.traits[traits[i]].display}</dd>
                </div>
              ))}
            </dl>

            <div className="row" style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
              <span className="tiny dim">REGISTER KEY</span>
              <span className="spacer" />
              <span className="mono" style={{ fontSize: 13 }}>{comboHex(packCombo(traits))}</span>
            </div>
          </div>

          {status?.taken && alts && alts.length > 0 ? (
            <div className="panel panel--tight" style={{ marginTop: 18 }}>
              <p className="eyebrow" style={{ margin: 0 }}>Nearest still available</p>
              <p className="tiny dim" style={{ margin: '6px 0 0' }}>
                One choice changed. All of these are free right now.
              </p>
              <div className={s.alts}>
                {alts.map((alt) => {
                  // `alts` arrives from a chain read, and the six choices can
                  // have moved while it was in flight — a mint lands, the
                  // composer advances, and an alternative that differed in one
                  // category now differs in none. `findIndex` returns -1 for
                  // that, and CATEGORIES[-1] is a crash on the screen a person
                  // is already recovering from. Drop the stale row instead.
                  const changed = alt.findIndex((v, i) => v !== traits[i]);
                  if (changed < 0) return null;
                  return (
                    <button
                      key={alt.join('-')}
                      type="button"
                      onClick={() => setTraits(alt)}
                      style={{ background: 'transparent', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left' }}
                    >
                      <Avian traits={alt} alt={`An available alternative with ${CATEGORIES[changed].display} ${CATEGORIES[changed].traits[alt[changed]].display}`} />
                      <p className="tiny" style={{ marginTop: 8 }}>
                        <span className="dim">{CATEGORIES[changed].display}</span><br />
                        <span className="strong">{CATEGORIES[changed].traits[alt[changed]].display}</span>
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* The free door is open, but not to this wallet. Say which of the
              three reasons it is, and point at the other door. */}
          {!freeOpen && c.freeMintOpen && freeStatus ? (
            <div style={{ marginTop: 18 }}>
              <FreeDoorShut reason={freeStatus} collection={c} />
            </div>
          ) : null}

          {freeOpen ? (
            <FreeDoorCard collection={c} allowlistProof={(w?.proof?.length ?? 0)} />
          ) : (
            <PriceBlock price={price} balance={balance} allowance={allowance} needed={needed} known={!!w} />
          )}

          <div className={`${s.desktopActions}${inlineOnly ? ` ${s.inlineOnly}` : ''}`}>
            <Actions
              soldOut={c.paidRemaining === 0}
              capReached={capReached}
              walletLimit={c.walletLimit}
              doorsShut={doorsShut}
              freeOpen={freeOpen}
              paidOpen={paidOpen}
              freeStatus={freeStatus}
              taken={!!status?.taken}
              checking={checking}
              busy={busy || tx.busy}
              needsApproval={needsApproval}
              shortOfBalance={shortOfBalance}
              batch={batch}
              lost={lost}
              onClearBatch={() => { setBatch([]); setLost([]); }}
              onDismissLost={() => setLost([])}
              needed={needed}
              onConnect={onConnect}
              onMint={() => (needsApproval && !shortOfBalance ? setApproving(true) : doMint(false))}
              onFree={doFree}
              onAddToBatch={() => {
                setBatch((b) => [...b, traits]);
                setTraits((t) => nextComposition(t, [...batch, t]));
              }}
              onRemoveFromBatch={(i) => setBatch((b) => b.filter((_, j) => j !== i))}
            />
          </div>
        </div>

        <div>
          <Pickers traits={traits} onChange={setTraits} />
          <p className="tiny dim" style={{ marginTop: 24 }}>
            Seventy traits over one locked owlish base. Nothing is reserved while you decide — if
            someone else composes this bird first, it&rsquo;s theirs.
          </p>
        </div>
      </div>

      {inlineOnly ? null : (
      <div className={s.stickyBar}>
        <Actions
          compact
          soldOut={c.paidRemaining === 0}
              capReached={capReached}
              walletLimit={c.walletLimit}
              doorsShut={doorsShut}
          freeOpen={freeOpen}
          paidOpen={paidOpen}
          freeStatus={freeStatus}
          taken={!!status?.taken}
          checking={checking}
          busy={busy || tx.busy}
          needsApproval={needsApproval}
          shortOfBalance={shortOfBalance}
          batch={batch}
          lost={lost}
          onClearBatch={() => { setBatch([]); setLost([]); }}
          onDismissLost={() => setLost([])}
          needed={needed}
          onConnect={onConnect}
          onMint={() => (needsApproval && !shortOfBalance ? setApproving(true) : doMint(false))}
          onFree={doFree}
          onAddToBatch={() => {
                setBatch((b) => [...b, traits]);
                setTraits((t) => nextComposition(t, [...batch, t]));
              }}
          onRemoveFromBatch={(i) => setBatch((b) => b.filter((_, j) => j !== i))}
        />
      </div>
      )}

      <ApprovalSheet
        open={approving}
        amount={needed}
        what="The collection"
        permitAvailable={permitAvailable}
        busy={busy}
        onClose={() => setApproving(false)}
        onApprove={doApprove}
      />
    </>
  );
}

// ── the doors ─────────────────────────────────────────────────────────────

function DoorBar({
  collection: c, freeOpen, paidOpen, freeStatus,
}: {
  collection: NonNullable<ReturnType<typeof useCollection>['data']>;
  freeOpen: boolean; paidOpen: boolean; freeStatus: string | null;
}) {
  return (
    <div className={s.doorbar}>
      {freeOpen ? <Tag tone="ok">Flocklist door open</Tag>
        : c.freeMintOpen ? <Tag tone="hot">Flocklist door open</Tag>
          : <Tag>Flocklist door closed</Tag>}
      {paidOpen ? <Tag tone="ok">Paid door open</Tag> : <Tag>Paid door closed</Tag>}

      <span className="small">
        <span className="num">{formatCount(c.paidRemaining)}</span> of{' '}
        {formatCount(c.freeAllocationReleased ? c.maxSupply : 3555)} paid birds left
      </span>
      {!c.freeAllocationReleased ? (
        <>
          <span className="dim" aria-hidden="true">·</span>
          <span className="small">
            <span className="num">{formatCount(c.reservedFree)}</span> free birds still reserved for
            the flocklist
          </span>
        </>
      ) : null}
      <span className="spacer" />
      {!freeOpen && c.freeMintOpen && freeStatus ? (
        <span className="small dim">
          {freeStatus === 'NotAllowlisted' ? 'This wallet is not on the flocklist.'
            : freeStatus === 'FreeMintAlreadyClaimed' ? 'You have claimed your free bird.'
              : freeStatus === 'FreeAllocationExhausted' ? `All ${formatCount(c.freeAllocation)} free birds are claimed.` : ''}
        </span>
      ) : null}
    </div>
  );
}

/** The flocklist door is open, and this wallet cannot go through it. */
function FreeDoorShut({
  reason, collection: c,
}: {
  reason: string;
  collection: NonNullable<ReturnType<typeof useCollection>['data']>;
}) {
  // The price is the owner's to raise, so it is read here rather than written
  // down — this sentence used to promise 100,000 AVIANS whatever `price()` said.
  const copy = reason === 'NotAllowlisted' ? {
    title: "This wallet isn't on the flocklist.",
    body: `That door is ${formatCount(c.freeAllocation)} birds, one per listed wallet — but the paid mint is a separate door, and your bird is composed exactly the same way.`,
  } : reason === 'FreeMintAlreadyClaimed' ? {
    title: "You've already claimed yours.",
    body: `One per wallet on the list. You can compose as many more as you like at ${avians(c.price)} each.`,
  } : reason === 'FreeAllocationExhausted' ? {
    title: `All ${formatCount(c.freeAllocation)} flocklist birds are claimed.`,
    body: 'The paid mint is the door now.',
  } : {
    title: 'The flocklist door is closed.',
    body: 'The paid mint is a separate door.',
  };

  return (
    <Box tone="warn">
      <Note tone="warn">
        <strong className="strong">{copy.title}</strong>{' '}
        <span className="small">{copy.body}</span>
      </Note>
    </Box>
  );
}

function FreeDoorCard({
  collection: c, allowlistProof,
}: { collection: NonNullable<ReturnType<typeof useCollection>['data']>; allowlistProof: number }) {
  return (
    <>
      <div className="box box--ok" style={{ marginTop: 18 }}>
        <Note tone="ok">
          <strong className="strong">You&rsquo;re on the list.</strong> One free Avian, and it&rsquo;s
          a real one — same register, same satchel, same perch as every other bird.
        </Note>
        <dl className="kv" style={{ marginTop: 14, gridTemplateColumns: '120px 1fr' }}>
          <dt>On the list by</dt><dd>Merkle proof · {allowlistProof} nodes</dd>
          <dt>Free birds left</dt><dd>{formatCount(c.reservedFree)} of {formatCount(c.freeAllocation)}</dd>
        </dl>
      </div>
      <div className="inset" style={{ marginTop: 18 }}>
        <div className={s.costline}>
          <span className="small">Cost</span>
          <span className="num" style={{ fontSize: 18, color: 'var(--confirm)' }}>No AVIANS</span>
        </div>
        <p className="tiny dim" style={{ margin: 0 }}>
          The collection holds {avians(c.minPrice)} behind every free bird and sends it to the perch when
          you claim, so the perch will buy this one back at the same 90,000 AVIANS as any paid bird.
          It counts toward your wallet limit like any other bird.
        </p>
      </div>
    </>
  );
}

function PriceBlock({
  price, balance, allowance, needed, known,
}: { price: Amount; balance: Amount; allowance: Amount; needed: Amount; known: boolean }) {
  const short = balance < needed;
  return (
    <div className="inset" style={{ marginTop: 18 }}>
      <div className={s.costline}>
        <span className="small">Price</span>
        <span className="num" style={{ fontSize: 18 }}>{avians(price)}</span>
      </div>
      <p className="tiny dim" style={{ margin: '0 0 12px' }}>
        Goes straight to the perch, not to us. We can&rsquo;t hold it and we can&rsquo;t redirect it.
      </p>
      {/*
        No wallet, or a read that has not landed, is NOT a zero balance. A
        dash says "we have not asked"; "0 AVIANS" would be a claim about
        somebody's wallet that we are in no position to make.
      */}
      <div className={s.costline} style={{ borderTop: '1px solid var(--line)' }}>
        <span className="small dim">You hold</span>
        <span className="num" style={{ color: known && short ? 'var(--attention)' : undefined }}>
          {known ? avians(balance) : '—'}
        </span>
      </div>
      <div className={s.costline} style={{ paddingTop: 0 }}>
        <span className="small dim">Approved to the collection</span>
        <span className="num" style={{ color: !known ? undefined : allowance >= needed ? 'var(--confirm)' : 'var(--attention)' }}>
          {known ? avians(allowance) : '—'}
        </span>
      </div>
    </div>
  );
}

// ── the actions ───────────────────────────────────────────────────────────

function Actions(p: {
  compact?: boolean;
  soldOut?: boolean; capReached?: boolean; walletLimit?: number;
  doorsShut: boolean; freeOpen: boolean; paidOpen: boolean; freeStatus: string | null;
  taken: boolean; checking: boolean; busy: boolean;
  needsApproval: boolean; shortOfBalance: boolean;
  batch: TraitIndices[]; needed: Amount;
  /** Combinations the register took while they sat in the tray. */
  lost: TraitIndices[];
  onClearBatch: () => void; onDismissLost: () => void;
  onConnect: () => void; onMint: () => void; onFree: () => void;
  onAddToBatch: () => void; onRemoveFromBatch: (i: number) => void;
}) {
  if (p.doorsShut) {
    return (
      <div style={{ marginTop: p.compact ? 0 : 18 }}>
        <Box tone="warn">
          <Note tone="warn">
            <strong className="strong">The doors aren&rsquo;t open.</strong> Nothing to do here yet —
            and we won&rsquo;t post a date we might have to move.
          </Note>
          <p className="small" style={{ marginTop: 10 }}>
            <a href={href({ name: 'first-light' })}>See how the opening works</a>
          </p>
        </Box>
      </div>
    );
  }

  // The cap is on the collection and we read it rather than assume it — so we
  // can say so before a transaction rather than after one.
  if (p.capReached && !p.freeOpen) {
    return (
      <div style={{ marginTop: p.compact ? 0 : 18 }}>
        <Box tone="warn">
          <Note tone="warn">
            <strong className="strong">
              This wallet has minted its limit{p.walletLimit ? ` of ${formatCount(p.walletLimit)}` : ''}.
            </strong>{' '}
            <span className="small">
              The limit is set on the collection, and we read it rather than assume it.
            </span>
          </Note>
          <p className="small" style={{ marginTop: 10 }}>
            <a href={href({ name: 'perch' })}>The perch will still sell you one.</a>
          </p>
        </Box>
      </div>
    );
  }

  if (p.soldOut && !p.freeOpen) {
    return (
      <div style={{ marginTop: p.compact ? 0 : 18 }}>
        <Box tone="warn">
          <Note tone="warn">
            <strong className="strong">Sold out.</strong>{' '}
            <span className="small">
              All 5,555 are composed. The 1,860,685 combinations nobody chose stay unchosen forever.
            </span>
          </Note>
          <p className="small" style={{ marginTop: 10 }}>
            The perch is still open, and so is the secondary market.{' '}
            <a href={href({ name: 'perch' })}>Buy one from the perch</a>
          </p>
        </Box>
      </div>
    );
  }

  const label = p.freeOpen ? 'Claim your free Avian'
    : p.batch.length > 0
      ? `Mint ${p.batch.length} bird${p.batch.length === 1 ? '' : 's'} — ${avians(p.needed)}`
      : p.shortOfBalance ? `You need ${avians(p.needed)}`
        : p.needsApproval ? 'Approve, then mint'
          : 'Mint this Avian';

  return (
    <div style={{ marginTop: p.compact ? 0 : 18 }}>
      {p.compact ? (
        <div className="row" style={{ marginBottom: 10 }}>
          <span className="tiny dim">
            {/* `needed` is the price, or the batch total when there are several
                — either way it is what leaves the wallet, read rather than written. */}
            {p.freeOpen ? 'No AVIANS — a real Avian either way' : `${avians(p.needed)} · to the perch, not to us`}
          </span>
        </div>
      ) : null}

      <WriteGate onConnect={p.onConnect}>
        <div className="row" style={{ gap: 12 }}>
          <button
            type="button"
            className="btn"
            style={{ flex: 1 }}
            disabled={p.busy || p.taken || p.checking || (!p.freeOpen && !p.paidOpen)}
            onClick={p.freeOpen ? p.onFree : p.onMint}
          >
            {p.busy ? 'Waiting for your wallet…' : label}
          </button>
          {!p.freeOpen && p.paidOpen && !p.compact ? (
            <button type="button" className="btn btn--ghost btn--small" style={{ minHeight: 48 }} disabled={p.taken || p.checking} onClick={p.onAddToBatch}>
              <Icon name="plus" size={14} /> Add to the batch
            </button>
          ) : null}
        </div>
      </WriteGate>

      {p.taken ? (
        <p className="tiny dim" style={{ marginTop: 10 }}>
          Disabled because the register already holds this combination.
        </p>
      ) : null}

      {/*
        Said, not silently done. A bird disappearing out of a tray with no
        explanation reads as a bug in the site rather than as what it is.
      */}
      {p.lost.length > 0 && !p.compact ? (
        <div style={{ marginTop: 14 }}>
          <Box tone="warn">
            <Note tone="warn">
              <span className="small">
                {p.lost.length === 1
                  ? 'Somebody minted one of the combinations in your batch, so it has been removed.'
                  : `Somebody minted ${formatCount(p.lost.length)} of the combinations in your batch, so they have been removed.`}
              </span>
            </Note>
            <div className={s.tray} style={{ marginTop: 10 }}>
              {p.lost.map((t, i) => (
                <span key={`${t.join('-')}-${i}`} className={s.trayItem} style={{ opacity: 0.45 }}>
                  <Avian traits={t} size={56} alt="A combination that was minted by someone else" />
                </span>
              ))}
            </div>
            <p className="tiny dim" style={{ margin: '10px 0 0' }}>
              Nothing here was ever reserved — the register answers first come, first served, and a
              batch holding a taken combination is refused whole. The rest are untouched.
            </p>
            <button
              type="button" className="btn btn--ghost btn--small"
              style={{ marginTop: 12 }} onClick={p.onDismissLost}
            >
              Dismiss
            </button>
          </Box>
        </div>
      ) : null}

      {!p.freeOpen && p.batch.length > 0 && !p.compact ? (
        <div className="inset" style={{ marginTop: 14 }}>
          <div className="row">
            <span className="small strong">
              {p.batch.length} in this transaction
            </span>
            <span className="spacer" />
            <span className="num">{avians(p.needed)}</span>
            <button
              type="button"
              className="btn btn--ghost btn--small"
              style={{ marginLeft: 12 }}
              onClick={p.onClearBatch}
            >
              Clear
            </button>
          </div>
          <div className={s.tray}>
            {p.batch.map((t, i) => (
              <span key={`${t.join('-')}-${i}`} className={s.trayItem}>
                <Avian traits={t} size={56} alt={`Bird ${i + 1} in the batch`} />
                <button type="button" aria-label={`Remove bird ${i + 1} from the batch`} onClick={() => p.onRemoveFromBatch(i)}>
                  <Icon name="cross" size={11} />
                </button>
              </span>
            ))}
          </div>
          <p className="tiny dim" style={{ marginTop: 12 }}>
            One transaction, all or nothing — either every bird here is minted or none of them are,
            and one approval covers the lot. The bird above is not in it until you add it.
          </p>
        </div>
      ) : null}
    </div>
  );
}

// ── the pickers ───────────────────────────────────────────────────────────

function Pickers({ traits, onChange }: { traits: TraitIndices; onChange: (t: TraitIndices) => void }) {
  const set = (cat: number, index: number) => {
    const next = traits.slice() as number[];
    next[cat] = index;
    onChange(next as unknown as TraitIndices);
  };

  return (
    <div>
      {CATEGORIES.map((cat, ci) => (
        <section key={cat.key} className={s.picker} aria-labelledby={`cat-${cat.key}`}>
          <div className={s.pickerHead}>
            <span className="numbox" aria-hidden="true">{ci + 1}</span>
            <h4 id={`cat-${cat.key}`} style={{ fontSize: 15 }}>{cat.display}</h4>
            <span className="tiny dim">{cat.traits.length} to choose from</span>
            <span className="spacer" />
            <span className="mono" style={{ color: 'var(--accent)', fontSize: 13 }}>
              {cat.traits[traits[ci]].display}
            </span>
          </div>
          <div className="strip" role="group" aria-label={cat.display}>
            {cat.traits.map((t) => (
              <Swatch
                key={t.index}
                category={cat.id as CategoryId}
                index={t.index}
                selected={traits[ci] === t.index}
                traitOnly
                label={`${cat.display}: ${t.display}`}
                onClick={() => set(ci, t.index)}
              />
            ))}
          </div>
          {cat.traits[traits[ci]].lore ? (
            <p className="tiny dim" style={{ marginTop: 10, maxWidth: 640 }}>
              <span className="strong">{cat.traits[traits[ci]].display}</span> — {cat.traits[traits[ci]].lore}
            </p>
          ) : null}
        </section>
      ))}
    </div>
  );
}

// ── helpers ───────────────────────────────────────────────────────────────

/** After a mint, move one choice so the composer is not showing a bird that
    now belongs to someone — even if that someone is you. */
function bump(t: TraitIndices, cat: number): TraitIndices {
  const next = t.slice() as number[];
  next[cat] = (next[cat] + 1) % CATEGORIES[cat].traits.length;
  return next as unknown as TraitIndices;
}

/**
 * What goes on the easel once the bird that was on it has been added to the
 * batch — or minted.
 *
 * It has to DIFFER FROM EVERY BIRD IN THE TRAY. "Add to the batch" used to
 * leave the same composition on the easel, so the tray and the easel held one
 * bird between them while the panel counted two, and the transaction that
 * followed was `mintMany` with the same combination twice — refused before the
 * wallet even opened.
 *
 * Walking the last category first keeps the change small and visible (the
 * headwear moves along one); the outer loop is the guarantee, not the
 * intention, and only runs for a tray deep enough to have used a whole
 * category up.
 */
function nextComposition(t: TraitIndices, batch: TraitIndices[]): TraitIndices {
  const taken = new Set(batch.map((b) => b.join(',')));
  let next = t;
  for (let cat = CATEGORIES.length - 1; cat >= 0; cat -= 1) {
    for (let i = 0; i < CATEGORIES[cat].traits.length; i += 1) {
      next = bump(next, cat);
      if (!taken.has(next.join(','))) return next;
    }
  }
  return next;
}


