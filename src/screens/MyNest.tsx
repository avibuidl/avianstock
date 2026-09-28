// My Nest (2026-09-27): the holder's one page. One wallet, one place.
//
// My Birds, The Nest and The Roost were three pages; a holder's day was
// spread across them. Here they are one page in reading order: the summary
// band (four figures, each a link down the page), the birds (the spine: each
// card carries its own state and actions), what the brooding birds earn per
// day (Earning now, tokens and totals only), and the stake. The rewards
// (everything claimable, from the three places it lives, as rows of one
// shape) are a sheet since 2026-09-28, behind "Manage rewards" in the birds'
// section head, the band's "Claimable now", and #/nest/rewards. Each section
// loads on its own and shows its own failure; one slow read holds nothing
// else up.
//
// What is NOT here: the protocol's own figures and the streams' list, which
// are the Bird Engine's; buying birds, which is the Perch's. Nothing about
// the vault products or the trait market.
//
// The page owns the reads the sections share (the brood, the birds, the
// Roost's, the Sweeper's, the snapshot for prices) and hands each down, so a
// figure in the band and the same figure in a panel are one read.

import { useState } from 'react';
import s from './MyNest.module.css';
import { Address, Box, EmptyState, ErrorState, PanelSkeleton } from '../components/Primitives';
import { WriteGate } from '../components/Wallet';
import { useTx, type FixHandlers } from '../components/Tx';
import { BirdCard } from '../components/BirdCard';
import { BirdSheet } from '../components/BirdSheet';
import { BroodSheet } from '../components/BroodSheet';
import { EarningPanel } from '../components/Earning';
import { RewardsPanel } from '../components/Rewards';
import { SellSheet } from '../components/SellSheet';
import { SettleControl, nestRows as settleRows } from '../components/Settle';
import { SettleSheet } from '../components/SettleSheet';
import { StakingCard } from '../components/StakingCard';
import { avians, avianNumber, formatCount, shortAddress } from '../lib/format';
import { birdRows, type RewardRow } from '../lib/rewards';
import { href, useOpenAt } from '../router';
import {
  ADDRESSES, redirect,
  useBrood, useConnection, useFlywheel, useNow, usePerch, useRoostScreen, useSweep, useWallet, useYourBirds,
  type Address as Addr, type Bird, type NestEvents, type TokenId,
} from '../mock';

const readAt = new WeakMap<object, number>();
function wallAt(r: object): number {
  let t = readAt.get(r);
  if (t === undefined) { t = Math.floor(Date.now() / 1000); readAt.set(r, t); }
  return t;
}


export function MyNest({ onConnect, at }: { onConnect: () => void; at?: 'birds' | 'rewards' | 'stake' }) {
  // 'rewards' is not a place on the page but the sheet, open on arrival.
  useOpenAt(at === 'rewards' ? undefined : at);
  const [rewardsOpen, setRewardsOpen] = useState(at === 'rewards');
  const c = useConnection();
  const tx = useTx();
  const connected = c.status === 'connected';
  // The reads, each on its own timer, paused while a transaction from here is in flight.
  const yours = useYourBirds();
  const brood = useBrood({ paused: tx.busy });
  const roost = useRoostScreen({ paused: tx.busy });
  const perch = usePerch();
  const wallet = useWallet();
  const fly = useFlywheel();
  const [extra, setExtra] = useState<Addr[]>([]);
  const sweep = useSweep(extra);
  const wall = useNow(1000);

  const [picked, setPicked] = useState<Set<TokenId>>(() => new Set());
  const [sellingIds, setSellingIds] = useState<TokenId[] | null>(null);
  const [broodIds, setBroodIds] = useState<TokenId[] | null>(null);
  const [upgradeId, setUpgradeId] = useState<TokenId | null>(null);
  const [settleIds, setSettleIds] = useState<TokenId[] | null>(null);
  const [openId, setOpenId] = useState<TokenId | null>(null);
  /** A brooding bird this session just sent away: its settle is offered once. */
  const [justSent, setJustSent] = useState<TokenId | null>(null);
  const [busy, setBusy] = useState(false);

  const birds: Bird[] = yours.data ?? [];
  const nest = brood.data;
  const now = nest ? nest.chainNow + Math.max(0, wall - wallAt(nest)) : wall;
  const entryOf = (id: TokenId) => nest?.yours.find((e) => e.bird.id === id) ?? null;
  const symbolOf = (token: string) => {
    const t = nest?.listed.find((x) => x.address.toLowerCase() === token.toLowerCase());
    return t ? { symbol: t.symbol, decimals: t.decimals } : { symbol: shortAddress(token), decimals: 18 };
  };
  const reloadAll = () => { yours.reload(); brood.reload(); roost.reload(); sweep.reload(); wallet.reload(); };
  const onFix: FixHandlers = {};

  // The rewards the Sweeper can bring, in one shape. Staking's AVIAN is the
  // Stake AVIAN card's, and the Nest's held-back shares are not offered here
  // (the founder's pass, 2026-09-28).
  const rows: RewardRow[] = sweep.data ? birdRows(sweep.data, fly.data, ADDRESSES.Avians) : [];
  const sellPrice = perch.data?.sell;
  const approved = wallet.data?.approvals.aviansToNest ?? 0n;
  // Birds picked by the square on each card, read through the live list so a
  // sold or sent bird cannot stay picked. Only a bird the wallet holds itself
  // can go to the Perch or brood; one inside another bird's satchel is that
  // bird's to move.
  const pickedBirds = birds.filter((b) => picked.has(b.id) && b.location.where === 'wallet');
  const pickedBroodable = pickedBirds.filter((b) => !b.brood?.live);
  const togglePick = (id: TokenId) => setPicked((set) => { const next = new Set(set); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const settleAll = (nest?.yours ?? []).filter((e) => e.brood && e.lines.some((l) => l.unsettled > 0n)).map((e) => e.bird.id);

  const doRedirect = async (bird: Bird) => {
    const b = bird.brood;
    if (!b) return;
    setBusy(true);
    const to = !b.delivery.toWallet;
    await tx.run(`Redirecting ${avianNumber(bird.id)}’s rewards`, (on) => redirect(bird.id, to, on), {
      onFix,
      outcome: () => (to ? 'Now delivered to your wallet.' : 'Now delivered into the bird.'),
      rows: (x) => settleRows((x as { events: NestEvents }).events, symbolOf),
      note: () => 'What had accrued so far was settled to the old destination first, in the same transaction.',
    });
    setBusy(false);
    reloadAll();
  };

  const openBird = openId === null ? undefined : birds.find((b) => b.id === openId);
  // A settle from one card: its confirmation names the destination and offers the other one.
  const settleOne = settleIds?.length === 1 ? birds.find((b) => b.id === settleIds[0]) : undefined;
  const settleLive = settleOne?.brood?.live ? settleOne.brood : null;

  return (
    <div className="page page--wide">
      <div className={s.head}>
        <div>
          <h2>My Nest</h2>
          <p className="lede">Your birds, what they earn, and your AVIAN stake.</p>
        </div>
        <span className="spacer" />
        {connected ? <span className="wchip"><Address value={c.address} /></span> : null}
      </div>

      {!connected ? (
        <div style={{ marginTop: 20, maxWidth: 380 }}>
          <WriteGate onConnect={onConnect}><span /></WriteGate>
          <p className="small dim" style={{ marginTop: 10 }}>
            New here? <a href={href({ name: 'landing', at: 'join' })}>The six steps</a>, on the homepage.
          </p>
        </div>
      ) : null}

      {/* ── my birds, the spine ─────────────────────────────────────────── */}
      <section className={`${s.sec} anchor`} id="birds" aria-labelledby="birds-h">
        <div className={s.secHead}>
          <h3 id="birds-h">My birds</h3>
          <span className="spacer" />
          {!connected ? null : pickedBirds.length > 0 ? (
            // The set: one press each for the lot, and a way to unpick them all.
            <span className={s.secRight}>
              <button type="button" className="btn btn--ghost btn--compact" onClick={() => setPicked(new Set())}>Clear</button>
              {pickedBroodable.length > 0 ? (
                <button type="button" className="btn btn--ghost btn--compact" disabled={!nest} onClick={() => setBroodIds(pickedBroodable.map((b) => b.id))}>
                  Brood {pickedBroodable.length === 1 ? avianNumber(pickedBroodable[0].id) : `${formatCount(pickedBroodable.length)} birds`}
                </button>
              ) : null}
              <button type="button" className="btn btn--compact" onClick={() => setSellingIds(pickedBirds.map((b) => b.id))}>
                Sell {pickedBirds.length === 1 ? avianNumber(pickedBirds[0].id) : `${formatCount(pickedBirds.length)} birds`}
                {sellPrice !== undefined ? ` for ${avians(sellPrice * BigInt(pickedBirds.length))}` : ''}
              </button>
              <button type="button" className="btn btn--ghost btn--compact" onClick={() => setRewardsOpen(true)}>Manage rewards</button>
            </span>
          ) : (
            <span className={s.secRight}>
              <button type="button" className="btn btn--ghost btn--compact" onClick={() => setRewardsOpen(true)}>Manage rewards</button>
            </span>
          )}
        </div>

        {!connected ? (
          <p className={`small dim ${s.shape}`}>The birds this wallet holds, each with its state and its own actions: brood, settle, sell.</p>
        ) : yours.loading && !yours.data ? (
          <div className={`bird-cards ${s.cards}`} role="status" aria-live="polite">
            <span className="sr-only">Loading your birds</span>
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className={s.cardSkeleton} aria-hidden="true">
                <div className={s.art} />
                <div className={s.cardBody}><PanelSkeleton lines={3} /><div style={{ height: 44 }} /></div>
              </div>
            ))}
          </div>
        ) : yours.error && !yours.data ? (
          <div className={s.shape}>
            <ErrorState title="Your birds could not be read." detail="They are where they were. Try again in a moment." onRetry={yours.reload} />
          </div>
        ) : birds.length === 0 ? (
          <div className={s.shape}>
            <EmptyState title="No birds in this wallet yet.">
              <a href={href({ name: 'compose' })}>Compose one</a>, or buy one from{' '}
              <a href={href({ name: 'perch' })}>the Perch</a>.
            </EmptyState>
          </div>
        ) : (
          <>
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
                      symbolOf={symbolOf} onConnect={onConnect} onDone={() => { setJustSent(null); reloadAll(); }}
                    />
                  </div>
                </Box>
              </div>
            ) : null}
            <div className={`bird-cards ${s.cards}`}>
              {birds.map((b) => (
                <BirdCard
                  key={b.id}
                  bird={b}
                  entry={entryOf(b.id)}
                  now={now}
                  picked={picked.has(b.id)}
                  onPick={b.location.where === 'wallet' ? () => togglePick(b.id) : undefined}
                  busy={busy || tx.busy}
                  actions={{
                    onOpen: () => setOpenId(b.id),
                    onBrood: () => setBroodIds([b.id]),
                    onSettle: () => setSettleIds([b.id]),
                    onSell: () => setSellingIds([b.id]),
                    onUpgrade: () => setUpgradeId(b.id),
                  }}
                />
              ))}
            </div>
            {brood.error && !nest ? (
              <p className="tiny dim" style={{ marginTop: 10 }}>
                What each bird has earned could not be read. The birds are where they were.{' '}
                <button type="button" className="btn btn--ghost btn--compact" onClick={brood.reload}>Try again</button>
              </p>
            ) : nest && nest.listed.length === 0 ? (
              <p className="tiny dim" style={{ marginTop: 10 }}>Nothing streams yet: no reward token is listed. Weight is counted from the moment a bird broods.</p>
            ) : null}
          </>
        )}
      </section>

      {/* ── earning now, beside the stake ───────────────────────────────── */}
      {!connected ? (
        <div className={s.pair}>
          <EarningPanel id="earning" brood={brood} fly={fly.data} now={now} connected={false} />
          <section className="panel anchor" id="stake" aria-labelledby="stake-h">
            <h3 id="stake-h">Stake AVIAN</h3>
            <p className={`small dim ${s.shape}`}>Your stake, what it earns, and the stream&rsquo;s end. Stake and withdraw whenever you like: no lock, no cooldown, no fee.</p>
          </section>
        </div>
      ) : (
        <div className={s.pair}>
          <EarningPanel id="earning" brood={brood} fly={fly.data} now={now} connected settleAll={{ count: settleAll.length, onPress: () => setSettleIds(settleAll) }} />
          <StakingCard id="stake" read={roost} connected={connected} onConnect={onConnect} />
        </div>
      )}

      {/* ── the sheets ──────────────────────────────────────────────────── */}
      {rewardsOpen && connected ? (
        <RewardsPanel
          rows={rows}
          brood={brood}
          sweep={sweep}
          onAddToken={(a) => setExtra((prev) => (prev.some((x) => x.toLowerCase() === a.toLowerCase()) ? prev : [...prev, a]))}
          onConnect={onConnect}
          onChanged={reloadAll}
          onClose={() => setRewardsOpen(false)}
        />
      ) : null}
      {openBird ? (
        <BirdSheet
          bird={openBird}
          entry={entryOf(openBird.id)}
          sellPrice={sellPrice}
          symbolOf={symbolOf}
          onConnect={onConnect}
          onClose={() => setOpenId(null)}
          onChanged={reloadAll}
          onSent={(id, wasBrooding) => { if (wasBrooding) setJustSent(id); }}
          onRedirect={() => { void doRedirect(openBird); }}
        />
      ) : null}
      {sellingIds !== null ? (
        <SellSheet
          initial={sellingIds}
          onConnect={onConnect}
          onClose={() => setSellingIds(null)}
          onSold={() => { reloadAll(); setPicked(new Set()); }}
        />
      ) : null}
      {broodIds !== null && nest ? (
        <BroodSheet
          ids={broodIds}
          nest={nest}
          approved={approved}
          onConnect={onConnect}
          onClose={() => setBroodIds(null)}
          onDone={() => { reloadAll(); setPicked(new Set()); }}
        />
      ) : null}
      {upgradeId !== null && nest ? (
        <BroodSheet
          ids={[upgradeId]}
          mode="upgrade"
          nest={nest}
          approved={approved}
          onConnect={onConnect}
          onClose={() => setUpgradeId(null)}
          onDone={reloadAll}
        />
      ) : null}
      {settleIds !== null ? (
        <SettleSheet
          ids={settleIds}
          symbolOf={symbolOf}
          onConnect={onConnect}
          onClose={() => setSettleIds(null)}
          onDone={reloadAll}
          settleLabel={settleLive ? (settleLive.delivery.toWallet ? 'Settle to my wallet' : 'Settle to its satchel') : undefined}
          extra={settleLive && settleOne ? (
            <button
              type="button" className="btn btn--ghost btn--small" disabled={busy || tx.busy}
              onClick={() => { setSettleIds(null); void doRedirect(settleOne); }}
            >
              {settleLive.delivery.toWallet ? 'Send to its satchel' : 'Send to my wallet'}
            </button>
          ) : undefined}
        />
      ) : null}
    </div>
  );
}

