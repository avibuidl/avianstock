// The nest — brooding, not custody (2026-09-11).
//
// Nobody sends a bird anywhere. A holder broods birds they hold, burning AVIAN
// for a tier each; rewards stream by weight into wherever the brood delivers —
// the bird's own wallet by default, the holder's by choice — and the brood ends
// the moment the bird changes hands. Anyone may settle. The only approval is
// AVIAN to the Nest for the tier costs: there is NO bird approval, and this
// screen never asks for one.
//
// HANDOVER section 5 names three things this screen must say. The three cards
// that carried them verbatim came out on 2026-09-18; what survives is the lede
// (where rewards go, and that a sale or transfer ends the brood) and the line
// under the cost ("Paid to the Roost. It does not come back"). The Treasury
// card sits where the cards were: it is where the streams come from.

import { useState } from 'react';
import { Icon } from '../components/Icon';
import {
  Avian, Box, EmptyState, ErrorState, Note, PanelSkeleton, Tag,
} from '../components/Primitives';
import { WriteGate } from '../components/Wallet';
import { useTx, type FixHandlers } from '../components/Tx';
import { SettleControl, nestNote, nestRows } from '../components/Settle';
import { StreamRow } from '../components/Streams';
import { NestCounters } from '../components/Counters';
import { avians, avianNumber, formatAgo, formatCount, formatReward, formatSince, shortAddress } from '../lib/format';
import { href } from '../router';
import {
  approveAviansForNest, brood, claim, deliverHeld, estimateUnsettled, redirect, upgrade,
  useBrood, useFlywheel, useNow, useRoost, useWallet,
  type BroodEntry, type DeliverResult, type NestEvents, type RewardStream, type Tier, type TokenId,
} from '../mock';

/** The tier's weight: 1, 2, 3. HANDOVER section 5's table. */
const WEIGHT: Record<Tier, bigint> = { 1: 1n, 2: 2n, 3: 3n };

type Choice = { tier: Tier; toWallet: boolean };

export function Nest({ onConnect }: { onConnect: () => void }) {
  const wallet = useWallet();
  const tx = useTx();
  // The "paid to brooders, ever" line under each stream values the Nest's
  // own total at today's price, from the flywheel snapshot's read.
  const fly = useFlywheel();

  // The birds picked to brood, each with its own tier and delivery choice.
  const [choices, setChoices] = useState<Map<TokenId, Choice>>(new Map());
  const [busy, setBusy] = useState(false);
  // Re-read every few seconds while this screen is on and the tab is visible,
  // not while a transaction from here is in flight. The Roost is read through
  // the same `getRoost` the Roost screen uses, for the held brooding leg.
  const paused = busy || tx.busy;
  const nest = useBrood({ paused });
  const roost = useRoost({ paused });
  const wall = useNow(1000);

  const r = nest.data;
  // The chain's clock, carried forward by the wall clock since the read: the
  // stream countdowns and the ticking unsettled lines run on it.
  const now = r ? r.chainNow + Math.max(0, wall - wallAtN(r)) : wall;
  const lastRead = nest.stale && nest.readAt !== null ? `last read ${formatAgo(wall - nest.readAt)} ago` : null;

  const symbolOf = (token: string) => {
    const t = r?.listed.find((x) => x.address.toLowerCase() === token.toLowerCase());
    return t ? { symbol: t.symbol, decimals: t.decimals } : { symbol: shortAddress(token), decimals: 18 };
  };

  // The drawer's fix this screen owns; the rest are the site's and the drawer's.
  const onFix: FixHandlers = { approve: () => { void doApprove(); } };

  if (nest.loading && !r) {
    return <div className="page page--wide"><div className="panel"><PanelSkeleton lines={6} art /></div></div>;
  }
  if (nest.error || !r) {
    return (
      <div className="page page--wide">
        <ErrorState title="The nest could not be read." detail="Nothing has moved. Try again in a moment."
          onRetry={nest.reload} />
      </div>
    );
  }

  // Birds that can be brooded now: held, and either no brood or an ended one
  // (which `brood` settles on the way — the contract's `isBrooding` says so).
  const broodable = r.yours.filter((e) => !e.brood || !e.brood.live);
  const brooding = r.yours.filter((e) => e.brood?.live);
  const ended = r.yours.filter((e) => e.brood && !e.brood.live);
  const picked = [...choices.entries()].filter(([id]) => broodable.some((e) => e.bird.id === id));
  const burn = picked.reduce((a, [, c]) => a + r.tierCost[c.tier], 0n);
  const approved = wallet.data?.approvals.aviansToNest ?? 0n;
  const needsApproval = approved < burn;
  const settleAll = r.yours.filter((e) => e.brood && e.lines.some((l) => l.unsettled > 0n)).map((e) => e.bird.id);

  const doBrood = async () => {
    setBusy(true);
    const entries = picked.map(([id, c]) => ({ id, tier: c.tier, toWallet: c.toWallet }));
    const res = await tx.run(
      `Brooding ${entries.length === 1 ? avianNumber(entries[0].id) : `${entries.length} birds`}`,
      (on) => brood(entries, on),
      {
        context: { price: burn, balance: wallet.data?.avians },
        onFix,
        outcome: (x) => `Brooding. ${avians((x as { paid: bigint }).paid)} paid to the Roost; it does not come back.`,
        rows: (x) => nestRows((x as { events: NestEvents }).events, symbolOf),
        note: (x) => nestNote((x as { events: NestEvents }).events),
      },
    );
    if (res) setChoices(new Map());
    setBusy(false);
  };

  const doApprove = async () => {
    setBusy(true);
    await tx.run(`Approving ${avians(burn)}`, (on) => approveAviansForNest(burn, on), {
      onFix, outcome: () => `${avians(burn)} approved. Nothing has been paid yet.`,
    });
    await wallet.reload();
    setBusy(false);
  };

  const toggle = (id: TokenId) => setChoices((m) => {
    const next = new Map(m);
    if (next.has(id)) next.delete(id); else next.set(id, { tier: 2, toWallet: false });
    return next;
  });
  const setChoice = (id: TokenId, patch: Partial<Choice>) => setChoices((m) => {
    const next = new Map(m);
    next.set(id, { ...(next.get(id) ?? { tier: 2, toWallet: false }), ...patch });
    return next;
  });

  return (
    <div className="page page--wide">
      <h2>The nest</h2>
      <p className="lede" style={{ maxWidth: 820 }}>
        Brooding is staking without moving birds. Brood a bird by paying for a tier. AVIAN and
        stock tokens stream into the brooding bird&rsquo;s own wallet, until you sell or move it.
      </p>

      <div className="two-up">
        {/* ── brood ────────────────────────────────────────────────────── */}
        <section className="panel" aria-labelledby="brood-h">
          <h3 id="brood-h">Brood a bird</h3>
          <p className="small dim" style={{ margin: '6px 0 16px' }}>Pick the birds, then a tier for each.</p>
          {broodable.length === 0 ? (
            <EmptyState title={r.yours.length === 0 ? 'No birds in this wallet.' : 'Every bird you hold is already brooding.'}>
              {r.yours.length === 0
                ? <><a href={href({ name: 'compose' })}>Compose one</a>, or buy one from <a href={href({ name: 'perch' })}>the perch</a>.</>
                : <>Upgrade a tier on the right, or settle what they have earned.</>}
            </EmptyState>
          ) : (
            <div className="stack" style={{ gap: 10 }}>
              {broodable.map(({ bird, brood: ended_ }) => {
                const c = choices.get(bird.id);
                const on = !!c;
                return (
                  <div key={bird.id} className={`box${on ? ' box--accent' : ''}`} style={{ padding: 12 }}>
                    <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
                      <button
                        type="button"
                        className={`tile${on ? ' tile--on' : ''}`}
                        style={{ width: 72, flex: 'none' }}
                        aria-pressed={on}
                        aria-label={`Brood ${avianNumber(bird.id)}`}
                        onClick={() => toggle(bird.id)}
                      >
                        <Avian traits={bird.traits} alt="" />
                        {on ? <span className="tile__mark" aria-hidden="true"><Icon name="check" size={11} /></span> : null}
                      </button>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="row">
                          <span className="strong">{avianNumber(bird.id)}</span>
                          {ended_ ? <Tag tone="warn">Brood ended</Tag> : null}
                        </div>
                        {on ? (
                          <>
                            <div className="tiers" role="radiogroup" aria-label={`Tier for ${avianNumber(bird.id)}`} style={{ marginTop: 10 }}>
                              {([1, 2, 3] as Tier[]).map((t) => (
                                <button
                                  key={t} type="button" role="radio" aria-checked={c!.tier === t}
                                  className={`tier${c!.tier === t ? ' tier--on' : ''}`}
                                  onClick={() => setChoice(bird.id, { tier: t })}
                                >
                                  <div className="num" style={{ fontSize: 14 }}>{avians(r.tierCost[t])}</div>
                                  <div className="tiny dim" style={{ marginTop: 2 }}>{t}x weight</div>
                                </button>
                              ))}
                            </div>
                            {/* The delivery choice: two plain options, the default first. */}
                            <div className="row row--wrap" style={{ gap: 8, marginTop: 10 }} role="radiogroup" aria-label={`Where ${avianNumber(bird.id)}’s rewards go`}>
                              <button
                                type="button" role="radio" aria-checked={!c!.toWallet}
                                className={`select select--tight${!c!.toWallet ? ' select--on' : ''}`}
                                onClick={() => setChoice(bird.id, { toWallet: false })}
                              >
                                Keep it in the bird
                              </button>
                              <button
                                type="button" role="radio" aria-checked={c!.toWallet}
                                className={`select select--tight${c!.toWallet ? ' select--on' : ''}`}
                                onClick={() => setChoice(bird.id, { toWallet: true })}
                              >
                                Send it to my wallet
                              </button>
                            </div>
                            <p className="tiny dim" style={{ margin: '6px 0 0' }}>
                              {c!.toWallet
                                ? 'Rewards are delivered to your wallet. Nothing goes with the bird if it is sold.'
                                : 'Rewards are delivered into the bird’s own wallet and go with it if it is sold.'}
                            </p>
                          </>
                        ) : null}
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
              {picked.length} {picked.length === 1 ? 'bird' : 'birds'}
              {picked.length ? `, ${picked.reduce((a, [, c]) => a + c.tier, 0)}x weight` : ''}
            </span>
            <span className="spacer" />
            <span className="num" style={{ fontSize: 17 }}>{avians(burn)}</span>
          </div>
          <div className="row row--wrap" style={{ rowGap: 2 }}>
            <span className="tiny dim">Paid to the Roost. It does not come back.</span>
            <span className="spacer" />
            <span className="tiny dim">Approved to the nest: {avians(approved)}</span>
          </div>

          {/*
            ONE APPROVAL, and it is for AVIAN. There is no bird approval to
            the nest and no route to choose: a bird broods where it is.
          */}
          <div style={{ marginTop: 16 }}>
            <WriteGate onConnect={onConnect}>
              {needsApproval && picked.length > 0 ? (
                <button type="button" className="btn btn--wide" disabled={busy || tx.busy} onClick={doApprove}>
                  Approve {avians(burn)} to the nest
                </button>
              ) : (
                <button type="button" className="btn btn--wide" disabled={picked.length === 0 || busy || tx.busy} onClick={doBrood}>
                  {picked.length === 0 ? 'Pick a bird above'
                    : `Brood ${picked.length === 1 ? avianNumber(picked[0][0]) : `${picked.length} birds`} for ${avians(burn)}`}
                </button>
              )}
            </WriteGate>
          </div>
          <p className="tiny dim" style={{ marginTop: 10 }}>
            One transaction for all of them. The birds themselves need no approval.
          </p>
        </section>

        {/* ── brooding now, and what has ended ─────────────────────────── */}
        <div className="stack">
          <section className="panel" aria-labelledby="now-h">
            {/*
              The heading, and "Settle all" on its right (2026-09-25; the weight
              tag that stood there went). Pressed, the control becomes its
              preview, which wraps under the heading at the card's width.
            */}
            <div className="row row--wrap now-head">
              <h3 id="now-h">Brooding now</h3>
              <span className="spacer" />
              {settleAll.length > 1 ? (
                <SettleControl
                  ids={settleAll} label={`Settle all ${formatCount(settleAll.length)}`} compact
                  symbolOf={symbolOf} onConnect={onConnect} onDone={() => nest.reload()}
                />
              ) : null}
            </div>

            {r.listed.length === 0 ? (
              <div style={{ marginTop: 12 }}>
                <Note>
                  <span className="small">
                    Nothing streams yet: no reward token is listed. Weight is counted from the
                    moment a bird broods; rewards begin when a token is listed.
                  </span>
                </Note>
              </div>
            ) : null}

            {brooding.length === 0 && ended.length === 0 ? (
              <div style={{ marginTop: 16 }}>
                <EmptyState title="None of your birds is brooding.">
                  Pick one on the left. It stays in your wallet the whole time.
                </EmptyState>
              </div>
            ) : (
              <>
                {settleAll.length > 1 ? (
                  <p className="tiny dim" style={{ marginTop: 10 }}>
                    {formatCount(settleAll.length)} birds have rewards accrued and not yet delivered.
                  </p>
                ) : null}

                {[...brooding, ...ended].map((e) => (
                  <BroodRow
                    key={e.bird.id} entry={e} now={now} tierCost={r.tierCost}
                    streams={r.streams} totalWeight={r.totalWeight} chainNowAtRead={r.chainNow}
                    approved={approved} symbolOf={symbolOf}
                    onFix={onFix} onConnect={onConnect} onChanged={() => { nest.reload(); wallet.reload(); }}
                  />
                ))}
                <p className="tiny dim" style={{ marginTop: 14 }}>
                  Any stock token paused by its issuer is held, still owed to the bird, and lands on
                  a later settle after it is unpaused.
                </p>
              </>
            )}
          </section>

          {/* ── held for you ─────────────────────────────────────────────── */}
          {r.claimable.length > 0 ? (
            <section className="panel" aria-labelledby="claim-h">
              <h3 id="claim-h">Held for you</h3>
              <p className="small dim" style={{ marginTop: 8 }}>
                Earned by a bird you sold, before it moved. The delivery to your wallet did not go
                through when it was settled (a paused token, usually), so it waits here.
              </p>
              {r.claimable.map((c) => (
                <ClaimRow key={c.token.address} token={c.token} amount={c.amount} onFix={onFix} onConnect={onConnect} onChanged={() => nest.reload()} />
              ))}
            </section>
          ) : null}

          {/* ── a held brooding leg at the Roost, deliverable now ───────── */}
          {roost.data && roost.data.nest.held > 0n && roost.data.nest.ready ? (
            <Box tone="ok">
              <div className="row row--wrap" style={{ gap: 10 }}>
                <span className="small" style={{ flex: '1 1 260px' }}>
                  <strong className="strong">{avians(roost.data.nest.held)} are waiting at the Roost for brooding birds.</strong>{' '}
                  Delivering starts them streaming to every brooding bird, by weight. Anyone may press it.
                </span>
                <WriteGate onConnect={onConnect}>
                  <button
                    type="button" className="btn btn--small" disabled={busy || tx.busy}
                    onClick={async () => {
                      setBusy(true);
                      await tx.run('Delivering a held share', (on) => deliverHeld(on), {
                        onFix,
                        outcome: (x) => {
                          const d = (x as DeliverResult).delivered.find((e) => e.leg === 'nest');
                          return d ? `${avians(d.amount)} are now streaming to brooding birds through the nest.` : 'Nothing moved.';
                        },
                      });
                      nest.reload(); roost.reload();
                      setBusy(false);
                    }}
                  >
                    <Icon name="arrow" size={14} color="var(--ink)" />
                    Deliver to brooding birds
                  </button>
                </WriteGate>
              </div>
            </Box>
          ) : null}

          {/* ── the streams ──────────────────────────────────────────────── */}
          {r.streams.length > 0 ? (
            <section className="panel" aria-labelledby="streams-h">
              <div className="row">
                <h3 id="streams-h">The streams</h3>
                {lastRead ? <span className="tiny dim">{lastRead}</span> : null}
              </div>
              {r.streams.map((s) => <StreamRow key={s.token.address} stream={s} now={now} fly={fly.data} />)}
            </section>
          ) : null}
        </div>
      </div>

      <NestCounters r={r} />
    </div>
  );
}

// ── one brooding (or ended) bird ──────────────────────────────────────────

function BroodRow({
  entry, now, tierCost, approved, symbolOf, onFix, onConnect, onChanged, streams, totalWeight, chainNowAtRead,
}: {
  entry: BroodEntry; now: number; tierCost: Record<Tier, bigint>; approved: bigint;
  streams: RewardStream[]; totalWeight: bigint; chainNowAtRead: number;
  symbolOf: (token: string) => { symbol: string; decimals: number };
  onFix: FixHandlers; onConnect: () => void; onChanged: () => void;
}) {
  const tx = useTx();
  const [busy, setBusy] = useState(false);
  const [upTo, setUpTo] = useState<Tier | null>(null);
  const { bird, lines } = entry;
  const b = entry.brood!;
  const unsettled = lines.some((l) => l.unsettled > 0n);
  // A live brood's unsettled line, carried forward from the last read by the
  // stream's arithmetic: `rate × weight / totalWeight / 1e18` a second while
  // the stream is live. What a settle moves is the chain's figure.
  const unsettledNow = (l: BroodEntry['lines'][number]): bigint => {
    const stream = streams.find((x) => x.token.address.toLowerCase() === l.token.address.toLowerCase());
    if (!b.live || !stream) return l.unsettled;
    return estimateUnsettled({
      unsettledAtRead: l.unsettled, rate: stream.rate, weight: WEIGHT[b.tier], totalWeight,
      periodFinish: stream.periodFinish, chainNowAtRead, now,
    });
  };
  const higher = ([1, 2, 3] as Tier[]).filter((t) => t > b.tier);
  const upgradeBurn = upTo ? tierCost[upTo] - tierCost[b.tier] : 0n;

  // The allowance for the difference, from this row. It used to be a disabled
  // button reading "Approve … first" with nowhere to do that — the only
  // approval control on the page belongs to the brood picker, and a holder
  // upgrading a bird has picked nothing. Found on the launch dry run.
  const doApproveUpgrade = async () => {
    setBusy(true);
    await tx.run(`Approving ${avians(upgradeBurn)}`, (on) => approveAviansForNest(upgradeBurn, on), {
      onFix, outcome: () => `${avians(upgradeBurn)} approved to the nest. Nothing has been paid yet.`,
    });
    setBusy(false);
    onChanged();
  };

  const doUpgrade = async () => {
    if (!upTo) return;
    setBusy(true);
    await tx.run(`Upgrading ${avianNumber(bird.id)} to tier ${upTo}`, (on) => upgrade(bird.id, upTo, on), {
      context: { price: upgradeBurn },
      onFix,
      outcome: (x) => `Tier ${upTo}. ${avians((x as { paid: bigint }).paid)} paid on to the Roost. What it had earned was settled first.`,
      rows: (x) => nestRows((x as { events: NestEvents }).events, symbolOf),
      note: (x) => nestNote((x as { events: NestEvents }).events),
    });
    setUpTo(null);
    setBusy(false);
    onChanged();
  };

  const doRedirect = async () => {
    setBusy(true);
    const to = !b.delivery.toWallet;
    await tx.run(`Redirecting ${avianNumber(bird.id)}’s rewards`, (on) => redirect(bird.id, to, on), {
      onFix,
      outcome: () => (to ? 'Now delivered to your wallet.' : 'Now delivered into the bird.'),
      rows: (x) => nestRows((x as { events: NestEvents }).events, symbolOf),
      note: () => 'What had accrued so far was settled to the old destination first, in the same transaction.',
    });
    setBusy(false);
    onChanged();
  };

  return (
    <div className="staked-row" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <Avian traits={bird.traits} size={64} alt="" />
      <div style={{ flex: 1, minWidth: 220 }}>
        <div className="row row--wrap" style={{ gap: 8 }}>
          <a className="strong" href={href({ name: 'bird', id: bird.id })} style={{ fontWeight: 600 }}>
            {avianNumber(bird.id)}
          </a>
          {b.live
            ? <Tag tone="ok">Tier {b.tier}, {b.tier}x</Tag>
            : <Tag tone="warn">Brood ended</Tag>}
          <span className="tiny dim">
            {b.live
              ? `Brooding for ${formatSince(now - b.activatedAt)}. Rewards to ${b.delivery.toWallet ? 'your wallet' : 'its satchel'}.`
              : `Ended ${b.expiredAt ? formatSince(now - b.expiredAt) + ' ago' : 'when it changed hands'}. Brooded by ${shortAddress(b.activator)}.`}
          </span>
        </div>

        {lines.length > 0 ? (
          <div style={{ marginTop: 8 }}>
            {lines.map((l) => (
              <div key={l.token.address} className="row" style={{ gap: 10, padding: '4px 0' }}>
                <Tag>{l.token.symbol}</Tag>
                <span className="small"><span className="num">{formatReward(unsettledNow(l), l.token.decimals)}</span> <span className="dim">unsettled</span></span>
                <span className="small"><span className="num">{formatReward(l.settled, l.token.decimals)}</span> <span className="dim">{b.delivery.toWallet ? 'in your wallet' : 'in its satchel'}</span></span>
                {!b.live && (l.pending.toActivator > 0n || l.pending.returned > 0n) ? (
                  <span className="tiny dim">
                    at settle: {formatReward(l.pending.toActivator, l.token.decimals)} to {shortAddress(b.activator)}, {formatReward(l.pending.returned, l.token.decimals)} back to the stream
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        <div className="row row--wrap" style={{ gap: 8, marginTop: 10 }}>
          {unsettled || !b.live ? (
            <SettleControl
              ids={[bird.id]} label={b.live ? 'Settle' : 'Settle the ended brood'}
              symbolOf={symbolOf} onConnect={onConnect} onDone={onChanged} ghost
            />
          ) : null}

          {b.live && higher.length > 0 ? (
            upTo === null ? (
              <button type="button" className="btn btn--ghost btn--small" disabled={busy || tx.busy} onClick={() => setUpTo(higher[0])}>
                Upgrade
              </button>
            ) : (
              <span className="row" style={{ gap: 6 }}>
                {higher.map((t) => (
                  <button key={t} type="button" className={`select select--tight${upTo === t ? ' select--on' : ''}`} onClick={() => setUpTo(t)}>
                    Tier {t} for {avians(tierCost[t] - tierCost[b.tier])}
                  </button>
                ))}
                <WriteGate onConnect={onConnect}>
                  <button
                    type="button" className="btn btn--small" disabled={busy || tx.busy}
                    onClick={approved < upgradeBurn ? doApproveUpgrade : doUpgrade}
                  >
                    {approved < upgradeBurn ? `Approve ${avians(upgradeBurn)}` : upTo ? `Upgrade to tier ${upTo} for ${avians(upgradeBurn)}` : 'Upgrade'}
                  </button>
                </WriteGate>
                <button type="button" className="btn btn--ghost btn--small" onClick={() => setUpTo(null)}>Not now</button>
              </span>
            )
          ) : null}

          {/* Only the option that is NOT set is offered; the contract refuses the other. */}
          {b.live ? (
            <WriteGate onConnect={onConnect}>
              <button type="button" className="btn btn--ghost btn--small" disabled={busy || tx.busy} onClick={doRedirect}
                title="What has accrued so far goes to the old destination first.">
                {b.delivery.toWallet ? 'Deliver into the bird instead' : 'Deliver to my wallet instead'}
              </button>
            </WriteGate>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ── a held-back share, and a stream ───────────────────────────────────────

function ClaimRow({
  token, amount, onFix, onConnect, onChanged,
}: {
  token: { address: `0x${string}`; symbol: string; decimals: number }; amount: bigint;
  onFix: FixHandlers; onConnect: () => void; onChanged: () => void;
}) {
  const tx = useTx();
  const [busy, setBusy] = useState(false);
  return (
    <div className="reward-row">
      <div className="row">
        <Tag>{token.symbol}</Tag>
        <span className="num" style={{ fontSize: 16 }}>{formatReward(amount, token.decimals)}</span>
        <span className="spacer" />
        <WriteGate onConnect={onConnect}>
          <button
            type="button" className="btn btn--small" disabled={busy || tx.busy}
            onClick={async () => {
              setBusy(true);
              await tx.run(`Claiming ${token.symbol}`, (on) => claim(token.address, on), {
                context: { rewardSymbol: token.symbol },
                onFix,
                outcome: (x) => `${formatReward((x as { amount: bigint }).amount, token.decimals)} ${token.symbol} claimed.`,
              });
              setBusy(false);
              onChanged();
            }}
          >
            Claim
          </button>
        </WriteGate>
      </div>
    </div>
  );
}

/** The wall clock at the moment the nest was read: `chainNow` is the block's, so the difference is the skew. */
const readAtN = new WeakMap<object, number>();
function wallAtN(r: object): number {
  let t = readAtN.get(r);
  if (t === undefined) { t = Math.floor(Date.now() / 1000); readAtN.set(r, t); }
  return t;
}

