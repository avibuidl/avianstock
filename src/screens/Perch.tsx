// The perch — the part of this world that never closes.
//
// Two panels: buy the next bird, buy the one you choose — plus what the perch
// must hold against what it does hold. Selling to it happens from My Birds
// (components/SellSheet.tsx), where the birds are.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import {
  Avian, Box, EmptyState, ErrorState, Note, PanelSkeleton, Tag, Unread,
} from '../components/Primitives';
import { ApprovalSheet } from '../components/ApprovalSheet';
import { WriteGate } from '../components/Wallet';
import { useTx, type FixHandlers } from '../components/Tx';
import { avians, avianNumber, formatBps, formatCount } from '../lib/format';
import { traitNames } from '../art/traits';
import { href } from '../router';
import {
  approveAviansForPerch, buyNamed, buyNext, nextBirds,
  traitsForId, usePerch, useRoost, useWallet, warmTraits,
  type Amount, type TokenId,
} from '../mock';

/** Tiles drawn per page of the picker: what `getPerch` warms on its own. */
const PICKER_PAGE = 240;
const NO_BIRDS: TokenId[] = [];

export function Perch({ onConnect }: { onConnect: () => void }) {
  const perch = usePerch();
  const wallet = useWallet();
  // The four shares of every fee are the Roost's, read rather than written
  // down: this page used to say "50% burned, 50% to the Treasury" from a
  // literal a week after the contracts stopped doing that.
  const roost = useRoost();
  const tx = useTx();

  const [count, setCount] = useState(1);
  const [named, setNamed] = useState<TokenId | null>(null);
  const [next, setNext] = useState<TokenId[]>([]);
  const [busy, setBusy] = useState(false);
  // The amount the approval sheet is open for, or null when it is closed.
  const [approving, setApproving] = useState<Amount | null>(null);
  // The picker draws the perch's whole holding, but the trait cache behind
  // `traitsForId` is warmed a page at a time as the box is scrolled —
  // thousands of `traitsOf` in one call is more than a node will run. `shown`
  // is how many tiles are drawn so far; the sentinel at the end asks for more.
  const [shown, setShown] = useState(PICKER_PAGE);
  const poolBox = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  // "Buy this bird" keeps its size when the count goes past one: the block
  // that shows the single bird is measured while it is on screen, and the
  // grid that replaces it is given exactly that height.
  const nextBlock = useRef<HTMLDivElement>(null);
  const [nextBlockH, setNextBlockH] = useState<number | null>(null);

  const p = perch.data;

  useEffect(() => {
    if (!p || p.poolSize === 0) { setNext([]); return; }
    nextBirds(Math.min(count, p.poolSize)).then(setNext, () => setNext([]));
  }, [p, count]);

  useEffect(() => { if (p && named !== null && !p.heldIds.includes(named)) setNamed(null); }, [p, named]);

  // The next page of the picker, when its end scrolls into view.
  const held = p?.heldIds ?? NO_BIRDS;
  useEffect(() => {
    const box = poolBox.current;
    const end = sentinel.current;
    if (!box || !end || shown >= held.length) return;
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      void warmTraits(held.slice(shown, shown + PICKER_PAGE)).then(() => setShown((s) => s + PICKER_PAGE));
    }, { root: box, rootMargin: '120px' });
    io.observe(end);
    return () => io.disconnect();
  }, [held, shown]);

  useLayoutEffect(() => {
    const block = nextBlock.current;
    if (!block) return;
    const measure = () => setNextBlockH(block.getBoundingClientRect().height);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(block);
    return () => ro.disconnect();
  }, [count, p?.lowestId]);

  /*
    BUYING FROM THE PERCH IS A `transferFrom` OF AVIANS.

    `ThePerch.buyNext` and `ThePerch.buy` both pull the price with
    `SafeTransferLib.safeTransferFrom(avians, msg.sender, ...)`, so the wallet
    needs an allowance to the perch — a different contract from the collection
    the mint approves, so the mint's approval does not carry.

    Nothing here read that allowance. Both buy buttons went straight to the
    wallet, the transfer failed, and the drawer's Approve button called an
    `onFix` that handled two kinds and silently dropped this one.
  */
  const allowanceToPerch = wallet.data?.approvals.aviansToPerch ?? 0n;

  // The drawer's fix this screen owns; the rest are the site's and the drawer's.
  const onFix: FixHandlers = { approve: (amount) => setApproving(amount && amount > 0n ? amount : null) };

  const doApprove = async (amount: Amount) => {
    setApproving(null);
    setBusy(true);
    await tx.run(`Approving ${avians(amount)}`, (on) => approveAviansForPerch(amount, on), {
      context: { balance: wallet.data?.avians, price: amount },
      onFix,
      outcome: () => `${avians(amount)} approved. Nothing has moved yet.`,
    });
    await wallet.reload();
    setBusy(false);
  };

  if (perch.loading && !p) {
    return <div className="page page--wide"><div className="panel"><PanelSkeleton lines={6} art /></div></div>;
  }
  if (perch.error || !p) {
    return (
      <div className="page page--wide">
        <ErrorState
          title="The perch could not be read."
          detail="Nothing has moved. Try again in a moment."
          onRetry={perch.reload}
        />
      </div>
    );
  }

  const doBuyNext = async () => {
    setBusy(true);
    await tx.run(count === 1 ? 'Buying the next bird' : `Buying the next ${count} birds`, (on) => buyNext(count, on), {
      context: { balance: wallet.data?.avians, price: p.buyNext * BigInt(count) },
      onFix,
      outcome: (r) => `${r.ids.map(avianNumber).join(', ')}: yours. In your wallet now.`,
    });
    setBusy(false);
  };

  const doBuyNamed = async () => {
    if (named === null) return;
    setBusy(true);
    await tx.run(`Buying ${avianNumber(named)}`, (on) => buyNamed([named], on), {
      context: { balance: wallet.data?.avians, price: p.buyNamed },
      onFix,
      outcome: () => `${avianNumber(named)}: yours. In your wallet now.`,
    });
    setNamed(null);
    setBusy(false);
  };

  return (
    <div className="page page--wide">
      <h2>The perch</h2>
      <p className="lede" style={{ maxWidth: 820 }}>
        The pool that buys birds back. It pays <span className="num">{avians(p.sell)}</span> for any
        bird, always, and sells the next one for <span className="num">{avians(p.buyNext)}</span> or
        one you pick for <span className="num">{avians(p.buyNamed)}</span>. One bird in every
        hundred sold to it is burnt; the seller is paid in full either way. To sell a bird, open{' '}
        <a href={href({ name: 'birds' })}>My Birds</a>.
      </p>

      {!p.operatorWhitelisted ? (
        <div style={{ marginTop: 24 }}>
          <Box tone="warn">
            <Note tone="warn">
              <strong className="strong">The batch route is not approved on this deployment.</strong>{' '}
              <span className="small">
                Each bird is sent in directly instead: same price, same result, one transaction per
                bird. The operator has been told.
              </span>
            </Note>
          </Box>
        </div>
      ) : null}

      <div className="perch-grid">
        {/* ── buy next ─────────────────────────────────────────────────── */}
        <section className="panel" aria-labelledby="next-h">
          <div className="row">
            <h3 id="next-h">Buy the next bird</h3>
            <span className="spacer" />
            <span className="num" style={{ color: 'var(--attention)' }}>{avians(p.buyNext)}</span>
          </div>
          <p className="small dim" style={{ marginTop: 6 }}>
            The perch sells its lowest-numbered bird first. This is the one you get.
          </p>

          {p.poolSize === 0 || p.lowestId === null ? (
            <div style={{ marginTop: 18 }}>
              <EmptyState title="The perch holds no birds right now.">
                It buys any bird for {avians(p.sell)}, so this fills as soon as somebody sells one.
              </EmptyState>
            </div>
          ) : (
            <>
              {/*
                One bird: its picture, large. More than one: the birds you
                would get, in the picker's grid — the lowest ids in order,
                one more appearing with each press of "+". What you see is
                exactly what the purchase delivers, so there is nothing to
                say about it in words.
              */}
              {count === 1 || next.length < 2 ? (
                <div ref={nextBlock} style={{ marginTop: 18 }}>
                  <Avian traits={traitsForId(p.lowestId)} alt={avianNumber(p.lowestId)} />
                  <div className="row" style={{ marginTop: 12 }}>
                    <a className="strong" href={href({ name: 'bird', id: p.lowestId })}>{avianNumber(p.lowestId)}</a>
                    <span className="spacer" />
                    <Tag>In the perch</Tag>
                  </div>
                  <p className="tiny dim" style={{ marginTop: 6 }}>
                    {traitNames(traitsForId(p.lowestId)).join(', ')}
                  </p>
                </div>
              ) : (
                <div
                  className="pool-grid pool-scroll"
                  // The single bird's block's height, so the card does not shrink.
                  style={{ marginTop: 18, height: nextBlockH ?? undefined, maxHeight: 'none', alignContent: 'start' }}
                  aria-label={`The ${count} birds you would get`}
                >
                  {next.map((id) => (
                    <a key={id} className="tile" href={href({ name: 'bird', id })}>
                      <Avian traits={traitsForId(id)} alt={avianNumber(id)} />
                      <span className="mono tiny dim" style={{ display: 'block', textAlign: 'center', marginTop: 4 }}>
                        #{formatCount(id)}
                      </span>
                    </a>
                  ))}
                </div>
              )}

              <div className="row" style={{ marginTop: 18 }}>
                <span className="small dim">How many</span>
                <span className="spacer" />
                <button type="button" className="btn btn--ghost btn--small" aria-label="One fewer"
                  onClick={() => setCount((v) => Math.max(1, v - 1))}>
                  <Icon name="minus" size={14} />
                </button>
                <span className="num" style={{ fontSize: 17, minWidth: 28, textAlign: 'center' }}>{count}</span>
                <button type="button" className="btn btn--ghost btn--small" aria-label="One more"
                  onClick={() => setCount((v) => Math.min(p.poolSize, v + 1))}>
                  <Icon name="plus" size={14} />
                </button>
              </div>

              <div className="row" style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
                <span className="small">You pay</span>
                <span className="spacer" />
                <span className="num" style={{ fontSize: 17 }}>{avians(p.buyNext * BigInt(count))}</span>
              </div>

              <div style={{ marginTop: 14 }}>
                <WriteGate onConnect={onConnect}>
                  <button
                    type="button" className="btn btn--wide" disabled={busy || tx.busy}
                    onClick={() => (allowanceToPerch < p.buyNext * BigInt(count)
                      ? setApproving(p.buyNext * BigInt(count))
                      : doBuyNext())}
                  >
                    {allowanceToPerch < p.buyNext * BigInt(count) ? 'Approve, then buy'
                      : count === 1 ? `Buy ${avianNumber(p.lowestId)} for ${avians(p.buyNext)}`
                        : `Buy ${count} birds for ${avians(p.buyNext * BigInt(count))}`}
                  </button>
                </WriteGate>
              </div>
            </>
          )}
        </section>

        {/* ── buy named ────────────────────────────────────────────────── */}
        <section className="panel" aria-labelledby="named-h">
          <div className="row">
            <h3 id="named-h">Buy a bird you pick</h3>
            <span className="spacer" />
            <span className="num" style={{ color: 'var(--attention)' }}>{avians(p.buyNamed)}</span>
          </div>
          <p className="small dim" style={{ marginTop: 6 }}>
            Picking costs {avians(p.buyNamed - p.buyNext)} more. If someone buys your pick first,
            the purchase is refused and nothing is taken.
          </p>

          {p.poolSize === 0 ? (
            <div style={{ marginTop: 18 }}>
              <EmptyState title="Nothing to pick from yet." />
            </div>
          ) : (
            <>
              <div className="row row--wrap" style={{ marginTop: 16, gap: 10 }}>
                <Tag>{formatCount(p.poolSize)} birds in the perch</Tag>
                {p.lowestId !== null ? <Tag>Lowest id {formatCount(p.lowestId)}</Tag> : null}
              </div>
              {/*
                Every bird the perch holds, in a box three rows tall that
                scrolls without a scrollbar — the buyer scrolls the pictures,
                not a control beside them. The whole list is here, not the
                first twelve: a buyer choosing a bird has to be able to see
                what there is to choose from.
              */}
              <div
                ref={poolBox}
                className="pool-grid pool-scroll"
                // The same height as the other card's picture block, whatever
                // the perch holds: the card keeps its size, and the two match.
                style={{ marginTop: 14, height: nextBlockH ?? undefined, maxHeight: nextBlockH ? 'none' : undefined, alignContent: 'start' }}
                tabIndex={0} aria-label="Every bird in the perch. Scroll for more."
              >
                {p.heldIds.slice(0, shown).map((id) => (
                  <button
                    key={id}
                    type="button"
                    className={`tile${named === id ? ' tile--on' : ''}`}
                    aria-pressed={named === id}
                    onClick={() => setNamed(named === id ? null : id)}
                  >
                    <Avian traits={traitsForId(id)} alt={avianNumber(id)} />
                    <span className="mono tiny dim" style={{ display: 'block', textAlign: 'center', marginTop: 4 }}>
                      #{formatCount(id)}
                    </span>
                  </button>
                ))}
                <div ref={sentinel} aria-hidden="true" style={{ gridColumn: '1 / -1', height: 1 }} />
              </div>
              {p.poolSize > 12 ? (
                <p className="tiny dim" style={{ marginTop: 10 }}>
                  All {formatCount(p.poolSize)} are above; scroll the pictures for the rest, or{' '}
                  <a href={href({ name: 'flock' })}>filter the flock</a> to find one by its traits.
                </p>
              ) : null}

              <div className="row" style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
                <span className="small">{named !== null ? avianNumber(named) : 'Nothing picked yet'}</span>
                <span className="spacer" />
                {named !== null ? <span className="num" style={{ fontSize: 17 }}>{avians(p.buyNamed)}</span> : null}
              </div>

              <div style={{ marginTop: 14 }}>
                <WriteGate onConnect={onConnect}>
                  <button
                    type="button" className="btn btn--wide"
                    disabled={named === null || busy || tx.busy}
                    onClick={() => (allowanceToPerch < p.buyNamed
                      ? setApproving(p.buyNamed)
                      : doBuyNamed())}
                  >
                    {named === null ? 'Pick a bird above'
                      : allowanceToPerch < p.buyNamed ? 'Approve, then buy'
                        : `Buy ${avianNumber(named)} for ${avians(p.buyNamed)}`}
                  </button>
                </WriteGate>
              </div>

            </>
          )}
        </section>
      </div>

      {/* ── solvency ───────────────────────────────────────────────────── */}
      <div className="panel solvency">
        <div>
          <h4>The perch can always pay.</h4>
          <p className="small" style={{ marginTop: 10, maxWidth: 760 }}>
            It holds {avians(p.base)} for every bird that is not already in it. Fees charged on
            every buy and sell are sent to the Roost to be split between AVIANS token staker
            rewards, brooder rewards, protocol revenue, and burns.
          </p>
          <div className="bar" style={{ marginTop: 16 }} role="img"
            aria-label={`Holding ${avians(p.aviansHeld)} against a requirement of ${avians(p.backingRequired)}`}>
            <i style={{ width: `${p.aviansHeld === 0n ? 0 : Number((p.backingRequired * 1000n) / p.aviansHeld) / 10}%` }} />
          </div>
          <div className="row row--wrap" style={{ marginTop: 8, rowGap: 4 }}>
            <span className="label">Required</span>
            <span className="num" style={{ fontSize: 13 }}>{avians(p.backingRequired)}</span>
            <span className="spacer" />
            <span className="label">Holds</span>
            <span className="num" style={{ fontSize: 13, color: 'var(--accent)' }}>{avians(p.aviansHeld)}</span>
          </div>
        </div>
        {/*
          The fee is the 10% or 15% between the sell price and the buy prices,
          and all of it goes to the Roost. The four shares are the Roost's
          constants, read: STAKING_BPS and the rest.
        */}
        <div className="inset">
          <h4>Where the fees go</h4>
          <p className="tiny dim" style={{ margin: '6px 0 0' }}>
            The whole fee, to the Roost, which splits it once a day.
          </p>
          <FeeShare label="AVIANS stakers" bps={roost.data?.splitBps.staking} />
          <FeeShare label="Brooding birds" bps={roost.data?.splitBps.nest} />
          <FeeShare label="Burnt" bps={roost.data?.splitBps.burn} />
          <FeeShare label="The protocol" bps={roost.data?.splitBps.admin} />
        </div>
      </div>

      {/*
        The same sheet the mint uses, minus the permit: `ThePerch` has no
        `buyWithPermit`, so a signature cannot pay for a bird and offering one
        would be a route to nowhere.
      */}
      <ApprovalSheet
        open={approving !== null}
        amount={approving ?? 0n}
        what="The perch"
        action="buy"
        permitAvailable={false}
        busy={busy}
        onClose={() => setApproving(null)}
        onApprove={(_route, amount) => doApprove(amount)}
      />
    </div>
  );
}

function FeeShare({ label, bps }: { label: string; bps: number | undefined }) {
  return (
    <div className="row" style={{ marginTop: 8 }}>
      <span className="small">{label}</span>
      <span className="spacer" />
      <span className="num">{bps === undefined ? <Unread /> : formatBps(bps)}</span>
    </div>
  );
}
