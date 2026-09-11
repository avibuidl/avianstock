// The perch — the part of this world that never closes.
//
// Three panels: sell a bird, buy the next one, buy the one you choose. Plus
// what the perch must hold against what it does hold.

import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import {
  Avian, Box, EmptyState, ErrorState, Note, PanelSkeleton, Tag,
} from '../components/Primitives';
import { ApprovalSheet } from '../components/ApprovalSheet';
import { WriteGate } from '../components/Wallet';
import { useTx } from '../components/Tx';
import { avians, avianNumber, formatCount } from '../lib/format';
import { traitNames } from '../art/traits';
import { href } from '../router';
import {
  approveAviansForPerch, buyNamed, buyNext, nextBirds, routeFor, sellToPerch,
  setPerchApproval, traitsForId, usePerch, useWallet, useYourBirds,
  type Amount, type FixKind, type TokenId,
} from '../mock';

/** 1 -> "st", 2 -> "nd", 100 -> "th". For "the 100th bird in this sale". */
function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return 'th';
  return ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
}

export function Perch({ onConnect }: { onConnect: () => void }) {
  const perch = usePerch();
  const wallet = useWallet();
  const yours = useYourBirds();
  const tx = useTx();

  const [selling, setSelling] = useState<TokenId[]>([]);
  // Ticked only when a bird in this sale is likely to be the hundredth. Reset
  // whenever the selection changes, so it can never carry over from a smaller
  // sale that did not reach the countdown.
  const [burnAck, setBurnAck] = useState(false);
  const [count, setCount] = useState(1);
  const [named, setNamed] = useState<TokenId | null>(null);
  const [next, setNext] = useState<TokenId[]>([]);
  const [busy, setBusy] = useState(false);
  // The amount the approval sheet is open for, or null when it is closed.
  const [approving, setApproving] = useState<Amount | null>(null);

  const p = perch.data;

  useEffect(() => {
    if (!p || p.poolSize === 0) { setNext([]); return; }
    nextBirds(Math.min(count, p.poolSize)).then(setNext, () => setNext([]));
  }, [p, count]);

  useEffect(() => { if (p && named !== null && !p.heldIds.includes(named)) setNamed(null); }, [p, named]);

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

  const onFix = (kind: FixKind, amount?: Amount) => {
    if (kind === 'refresh') perch.reload();
    if (kind === 'switch-network') onConnect();
    if (kind === 'approve') setApproving(amount && amount > 0n ? amount : null);
    if (kind === 'approve-operator') void approveBirds();
  };

  const approveBirds = async () => {
    setBusy(true);
    await tx.run('Approving the perch', (on) => setPerchApproval(true, on), {
      onFix,
      outcome: () => 'The perch can move your birds now. Nothing has moved yet.',
    });
    await wallet.reload();
    setBusy(false);
  };

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
          title="That read failed."
          detail="We could not reach the perch. Your birds are exactly where they were."
          onRetry={perch.reload}
        />
      </div>
    );
  }

  const route = routeFor(selling.length, wallet.data?.approvals.birdsToPerch ?? false, p.operatorWhitelisted);
  // The countdown lands inside this sale: bird number `depositsUntilNextBurn`
  // of the list is the one that would be the hundredth.
  const burnRisk = selling.length > 0 && p.depositsUntilNextBurn <= selling.length;
  const sellable = yours.data ?? [];

  const doSell = async () => {
    setBusy(true);
    await tx.run(`Selling ${selling.length === 1 ? 'a bird' : `${selling.length} birds`} to the perch`,
      (on) => sellToPerch(selling, { route: route.route }, on),
      {
        onFix,
        outcome: (r) => (r.burnt.length === 0
          ? `${avians(r.paid)} is in your wallet.`
          : r.burnt.length === 1
            ? `${avianNumber(r.burnt[0])} was the hundredth bird into the perch and was burnt. You were paid in full — ${avians(r.paid)} is in your wallet.`
            : `${r.burnt.map(avianNumber).join(' and ')} were hundredth birds into the perch and were burnt. You were paid in full — ${avians(r.paid)} is in your wallet.`),
        rows: (r) => (r.burnt.length === 0 ? [] : [
          ...selling.map((id) => ({
            label: avianNumber(id),
            value: r.burnt.includes(id) ? 'burnt' : 'in the perch',
            tone: (r.burnt.includes(id) ? 'warn' : 'ok') as 'warn' | 'ok',
          })),
          { label: 'Paid to you', value: avians(r.paid), tone: 'ok' as const },
        ]),
        note: (r) => (r.burnt.length === 0 ? undefined
          : 'One bird in every hundred sold to the perch is burnt. Its seller is paid the same as any other — nothing was deducted for it.'),
      });
    setSelling([]);
    setBurnAck(false);
    setBusy(false);
  };

  const doBuyNext = async () => {
    setBusy(true);
    await tx.run('Buying the next bird', (on) => buyNext(count, on), {
      context: { balance: wallet.data?.avians, price: p.buyNext * BigInt(count) },
      onFix,
      outcome: (r) => `${r.ids.map(avianNumber).join(', ')} — yours.`,
    });
    setBusy(false);
  };

  const doBuyNamed = async () => {
    if (named === null) return;
    setBusy(true);
    await tx.run(`Buying ${avianNumber(named)}`, (on) => buyNamed([named], on), {
      context: { balance: wallet.data?.avians, price: p.buyNamed },
      onFix,
      outcome: () => `${avianNumber(named)} — yours.`,
    });
    setNamed(null);
    setBusy(false);
  };

  return (
    <div className="page page--wide">
      <p className="eyebrow">The perch</p>
      <h2>It never closes.</h2>
      <p className="lede" style={{ maxWidth: 900 }}>
        It buys any bird for <span className="num">{avians(p.sell)}</span>, sells the next one out of
        its own holdings for <span className="num">{avians(p.buyNext)}</span>, and the one you choose for{' '}
        <span className="num">{avians(p.buyNamed)}</span>. Half of every fee is burned; half goes to
        the Treasury.
      </p>

      {!p.operatorWhitelisted ? (
        <div style={{ marginTop: 24 }}>
          <Box tone="warn">
            <Note tone="warn">
              <strong className="strong">The batch route is not approved on this deployment.</strong>{' '}
              <span className="small">
                We send each bird in directly instead — same price, same result, one transaction per
                bird. The operator has been told.
              </span>
            </Note>
          </Box>
        </div>
      ) : null}

      <div className="perch-grid">
        {/* ── sell ─────────────────────────────────────────────────────── */}
        <section className="panel" aria-labelledby="sell-h">
          <div className="row">
            <h3 id="sell-h">Sell a bird</h3>
            <span className="spacer" />
            <span className="num" style={{ color: 'var(--confirm)' }}>{avians(p.sell)}</span>
          </div>
          <p className="small dim" style={{ marginTop: 6 }}>
            You receive {avians(p.sell)} each, instantly. The perch&rsquo;s base is
            {' '}{avians(p.base)} and it keeps a 10% fee, so {avians(p.sell)} is what reaches you.
            Half of that fee is burned; half goes to the Treasury.
          </p>

          {/*
            THE HUNDREDTH BIRD.

            The perch burns one bird for every hundred deposited, and the count
            advances per bird rather than per transaction — so a sale of several
            can straddle the line, and the one that lands on it is the one at
            that position in the list.

            The warning is about LIKELIHOOD and says so. `depositsUntilNextBurn`
            was true when it was read; anyone else selling in between moves it,
            so a sale that looked safe can burn and a sale that looked doomed can
            miss. The receipt is the only truth, and it is what the drawer
            reports afterwards.
          */}
          <p className="tiny dim" style={{ marginTop: 10 }}>
            One bird in every {formatCount(p.burnEvery)} sold to the perch is burnt.{' '}
            {p.depositsUntilNextBurn === 1
              ? 'The next one in is the hundredth.'
              : `${formatCount(p.depositsUntilNextBurn)} more sales until the next one.`}{' '}
            The seller is paid the full {avians(p.sell)} either way.
          </p>

          {sellable.length === 0 ? (
            <div style={{ marginTop: 18 }}>
              <EmptyState title="You have no birds to sell.">
                Compose one, or buy one from the perch.
              </EmptyState>
            </div>
          ) : (
            <>
              <div className="tiles" style={{ marginTop: 18 }}>
                {sellable.map((b) => {
                  const on = selling.includes(b.id);
                  return (
                    <button
                      key={b.id}
                      type="button"
                      className={`tile${on ? ' tile--on' : ''}`}
                      aria-pressed={on}
                      onClick={() => {
                        setBurnAck(false);
                        setSelling((v) => (on ? v.filter((x) => x !== b.id) : [...v, b.id]));
                      }}
                    >
                      <Avian traits={b.traits} alt={avianNumber(b.id)} />
                      <span className="mono tiny dim" style={{ display: 'block', textAlign: 'center', marginTop: 4 }}>
                        #{formatCount(b.id)}
                      </span>
                      {on ? <span className="tile__mark" aria-hidden="true"><Icon name="check" size={11} /></span> : null}
                    </button>
                  );
                })}
              </div>

              <div className="row" style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
                <span className="small">{selling.length} selected</span>
                <span className="spacer" />
                <span className="num" style={{ fontSize: 17 }}>{avians(p.sell * BigInt(selling.length))}</span>
              </div>

              {selling.length > 0 ? (
                <p className="tiny dim" style={{ marginTop: 10 }}>{route.reason}</p>
              ) : null}

              {route.offerApproval ? (
                <div style={{ marginTop: 14 }}>
                  <WriteGate onConnect={onConnect}>
                    <button
                      type="button" className="btn btn--ghost btn--wide" disabled={busy || tx.busy}
                      onClick={approveBirds}
                    >
                      Approve the perch for your birds
                    </button>
                  </WriteGate>
                </div>
              ) : null}

              {burnRisk ? (
                <div style={{ marginTop: 14 }}>
                  <Box tone="warn">
                    <Note tone="warn">
                      <strong className="strong">
                        {avianNumber(selling[p.depositsUntilNextBurn - 1])} is likely to be burnt.
                      </strong>{' '}
                      <span className="small">
                        {selling.length === 1
                          ? 'The perch is one deposit from its hundredth.'
                          : `It is the ${formatCount(p.depositsUntilNextBurn)}${ordinal(p.depositsUntilNextBurn)} bird in this sale, and the perch is ${formatCount(p.depositsUntilNextBurn)} deposit${p.depositsUntilNextBurn === 1 ? '' : 's'} from its hundredth.`}{' '}
                        You are paid the full {avians(p.sell * BigInt(selling.length))}
                        {selling.length === 1 ? '' : ` for all ${formatCount(selling.length)}`}{' '}
                        either way — nothing is deducted for the burn.
                      </span>
                    </Note>
                    <p className="tiny dim" style={{ margin: '10px 0 0' }}>
                      Likely, not certain: if somebody else sells first the count moves and a
                      different bird lands on it. The receipt afterwards is the truth.
                    </p>
                    <p className="tiny dim" style={{ margin: '8px 0 0' }}>
                      A burnt bird&rsquo;s wallet is orphaned — whatever is inside it stays there
                      and nobody can reach it again. The same is true of a bird you send to brood.
                    </p>
                    <label className="row" style={{ gap: 8, marginTop: 12, alignItems: 'flex-start' }}>
                      <input
                        type="checkbox"
                        checked={burnAck}
                        onChange={(e) => setBurnAck(e.target.checked)}
                        style={{ marginTop: 3 }}
                      />
                      <span className="small">
                        I understand one of these birds is likely to be burnt.
                      </span>
                    </label>
                  </Box>
                </div>
              ) : null}

              <div style={{ marginTop: 14 }}>
                <WriteGate onConnect={onConnect}>
                  <button
                    type="button" className="btn btn--wide"
                    disabled={selling.length === 0 || busy || tx.busy || (burnRisk && !burnAck)}
                    onClick={doSell}
                  >
                    {selling.length === 0 ? 'Choose a bird' : `Sell ${selling.length === 1 ? 'it' : `${selling.length} birds`} — ${avians(p.sell * BigInt(selling.length))}`}
                  </button>
                </WriteGate>
              </div>
            </>
          )}
        </section>

        {/* ── buy next ─────────────────────────────────────────────────── */}
        <section className="panel" aria-labelledby="next-h">
          <div className="row">
            <h3 id="next-h">Buy this bird</h3>
            <span className="spacer" />
            <span className="num" style={{ color: 'var(--attention)' }}>{avians(p.buyNext)}</span>
          </div>
          <p className="small dim" style={{ marginTop: 6 }}>
            This is the lowest id the perch is holding. Which bird you get is not random, and not
            the most recently sold.
          </p>

          {p.poolSize === 0 || p.lowestId === null ? (
            <div style={{ marginTop: 18 }}>
              <EmptyState title="The perch is holding nothing right now.">
                It buys any bird at {avians(p.sell)}, so this fills up as soon as somebody sells.
              </EmptyState>
            </div>
          ) : (
            <>
              <div style={{ marginTop: 18 }}>
                <Avian traits={traitsForId(p.lowestId)} alt={avianNumber(p.lowestId)} />
              </div>
              <div className="row" style={{ marginTop: 12 }}>
                <a className="strong" href={href({ name: 'bird', id: p.lowestId })}>{avianNumber(p.lowestId)}</a>
                <span className="spacer" />
                <Tag>In the perch</Tag>
              </div>
              <p className="tiny dim" style={{ marginTop: 6 }}>
                {traitNames(traitsForId(p.lowestId)).join(' · ')}
              </p>

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

              {count > 1 && next.length > 1 ? (
                <p className="tiny dim" style={{ marginTop: 10 }}>
                  You would get {next.map((id) => `#${formatCount(id)}`).join(', ')} — the {count}{' '}
                  lowest, in order. You see exactly which birds before you sign.
                </p>
              ) : null}

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
                      : count === 1 ? `Buy ${avianNumber(p.lowestId)}` : `Buy ${count} birds`}
                  </button>
                </WriteGate>
              </div>
            </>
          )}
        </section>

        {/* ── buy named ────────────────────────────────────────────────── */}
        <section className="panel" aria-labelledby="named-h">
          <div className="row">
            <h3 id="named-h">Buy your choice bird</h3>
            <span className="spacer" />
            <span className="num" style={{ color: 'var(--attention)' }}>{avians(p.buyNamed)}</span>
          </div>
          <p className="small dim" style={{ marginTop: 6 }}>
            The extra {avians(p.buyNamed - p.buyNext)} is what picking costs. If the bird you picked
            leaves the pool before your transaction lands, the purchase is refused and nothing is
            taken.
          </p>

          {p.poolSize === 0 ? (
            <div style={{ marginTop: 18 }}>
              <EmptyState title="Nothing to pick from yet." />
            </div>
          ) : (
            <>
              <div className="row row--wrap" style={{ marginTop: 16, gap: 10 }}>
                <Tag>{formatCount(p.poolSize)} birds in the perch</Tag>
                <Tag>Lowest id {p.lowestId !== null ? formatCount(p.lowestId) : '—'}</Tag>
              </div>
              <div className="pool-grid" style={{ marginTop: 14 }}>
                {p.heldIds.slice(0, 12).map((id) => (
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
              </div>
              {p.poolSize > 12 ? (
                <p className="tiny dim" style={{ marginTop: 10 }}>
                  {formatCount(p.poolSize - 12)} more in the perch. <a href={href({ name: 'flock' })}>Filter the flock</a> to
                  find one.
                </p>
              ) : null}

              <div className="row" style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
                <span className="small">{named !== null ? avianNumber(named) : 'Nothing picked'}</span>
                <span className="spacer" />
                <span className="num" style={{ fontSize: 17 }}>{named !== null ? avians(p.buyNamed) : '—'}</span>
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
                    {named === null ? 'Pick a bird'
                      : allowanceToPerch < p.buyNamed ? 'Approve, then buy'
                        : `Buy ${avianNumber(named)}`}
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
          <p className="eyebrow" style={{ margin: 0 }}>The perch can always pay</p>
          <p className="small" style={{ marginTop: 10, maxWidth: 760 }}>
            The perch must hold <span className="num">{avians(p.backingRequired)}</span> against
            every bird that isn&rsquo;t already in it — {avians(p.base)} reserved apiece. Each
            buyback pays {avians(p.sell)} to the seller. It currently holds{' '}
            <span className="num">{avians(p.aviansHeld)}</span>.
          </p>
          <div className="bar" style={{ marginTop: 16 }} role="img"
            aria-label={`Holding ${avians(p.aviansHeld)} against a requirement of ${avians(p.backingRequired)}`}>
            <i style={{ width: `${p.aviansHeld === 0n ? 0 : Number((p.backingRequired * 1000n) / p.aviansHeld) / 10}%` }} />
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <span className="tiny dim">REQUIRED {avians(p.backingRequired)}</span>
            <span className="spacer" />
            <span className="tiny" style={{ color: 'var(--accent)' }}>HOLDS {avians(p.aviansHeld)}</span>
          </div>
        </div>
        <div className="inset">
          <p className="eyebrow" style={{ margin: 0 }}>Every fee, split</p>
          <div className="row" style={{ marginTop: 12 }}>
            <span className="small">Burned</span><span className="spacer" /><span className="num">50%</span>
          </div>
          <div className="row" style={{ marginTop: 6 }}>
            <span className="small">To the Treasury</span><span className="spacer" /><span className="num">50%</span>
          </div>
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
