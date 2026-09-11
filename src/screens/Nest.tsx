// The nest.
//
// The verb is "brood" and the place is the nest, because that is where a bird
// broods — the two words have to agree or the narrative does not. A bird
// resting idle in a wallet is the one that roosts.
//
// The layer beneath still says `roost` (`getRoost`, `RoostState`, `useRoost`).
// That is the seam onto `TheNest`, not a product word, and renaming it
// would touch every screen that reads staking state to change nothing anybody
// sees. `#/roost` and `#/incubator` both still resolve here, so links written
// under either older name keep working.
//
// Three things this screen has to say, in these words, before anything else:
// the tier cost is burned, the weight is lost on unstake, and a brooding
// bird's satchel is controlled by the staking contract.

import { useState } from 'react';
import { Icon } from '../components/Icon';
import {
  Avian, Box, EmptyState, ErrorState, Note, PanelSkeleton, StockDisclaimer, Tag,
} from '../components/Primitives';
import { WriteGate } from '../components/Wallet';
import { useTx, type TxRow } from '../components/Tx';
import { avians, avianNumber, formatCount, formatReward, formatSince } from '../lib/format';
import { href } from '../router';
import {
  approveAviansForRoost, claim, claimAll, readClaimAll, routeFor, satchelBlocksStaking,
  setRoostApproval, stake, unstake, useRoost, useWallet, useYourBirds,
  type Bird, type ClaimOutcome, type FixKind, type RewardStream, type Tier, type TokenId,
} from '../mock';

export function Nest({ onConnect }: { onConnect: () => void }) {
  const roost = useRoost();
  const yours = useYourBirds();
  const wallet = useWallet();
  const tx = useTx();

  const [tier, setTier] = useState<Tier>(2);
  const [picked, setPicked] = useState<TokenId[]>([]);
  const [busy, setBusy] = useState(false);
  // Birds chosen to come home. Never pre-filled: "all" is one click away and
  // has to BE a click, because the weight it gives up does not come back.
  const [homing, setHoming] = useState<TokenId[]>([]);
  const [homeAck, setHomeAck] = useState(false);

  const r = roost.data;
  const now = Math.floor(Date.now() / 1000);

  const approveBirds = async () => {
    setBusy(true);
    await tx.run('Approving the nest', (on) => setRoostApproval(true, on), {
      onFix,
      outcome: () => 'The nest can move your birds now. Nothing has moved yet.',
    });
    await wallet.reload();
    setBusy(false);
  };

  const onFix = (kind: FixKind) => {
    if (kind === 'refresh') { roost.reload(); yours.reload(); }
    if (kind === 'switch-network') onConnect();
    // The batch stake pulls the birds, so a missing operator approval arrives
    // as ERC721InsufficientApproval. The drawer offered the fix and this screen
    // dropped it, so the button did nothing.
    if (kind === 'approve-operator') void approveBirds();
  };

  if (roost.loading && !r) {
    return <div className="page page--wide"><div className="panel"><PanelSkeleton lines={6} art /></div></div>;
  }
  if (roost.error || !r) {
    return (
      <div className="page page--wide">
        <ErrorState title="That read failed." detail="We could not reach the nest. Nothing has moved."
          onRetry={roost.reload} />
      </div>
    );
  }

  const burn = r.tierCost[tier] * BigInt(picked.length);
  const approved = wallet.data?.approvals.aviansToStaking ?? 0n;
  const needsApproval = approved < burn;
  const route = routeFor(picked.length, wallet.data?.approvals.birdsToRoost ?? false, r.operatorWhitelisted);

  const available = (yours.data ?? []);
  const blocked = available.filter((b) => satchelBlocksStaking(b).length > 0 && picked.includes(b.id));

  const doStake = async () => {
    setBusy(true);
    await tx.run(`Sending ${picked.length === 1 ? 'a bird' : `${picked.length} birds`} to the nest`,
      (on) => stake(picked.map((id) => ({ id, tier })), { route: route.route }, on),
      { context: { price: burn, balance: wallet.data?.avians }, onFix,
        outcome: (x) => `Brooding. ${avians(x.burned)} burned — it does not come back.` });
    setPicked([]);
    setBusy(false);
  };

  /*
    ONE CALL FOR ALL OF THEM.

    `TheNest.unstake(uint256[])` has always been a batch and `unstake` in
    chain/writes.ts has always passed an array — the screen was the only thing
    that never sent more than one, a row at a time.

    Nothing is approved for this, unlike staking: the nest transfers the birds
    FROM ITSELF, and the collection skips validation when the caller is the
    holder. So there is no route to choose and no operator to allow.
  */
  const homingWeight = r.staked
    .filter((b) => homing.includes(b.id))
    .reduce((sum, b) => sum + (b.location.where === 'roost' ? b.location.tier : 0), 0);

  const doUnstake = async (ids: TokenId[]) => {
    setBusy(true);
    await tx.run(
      `Bringing ${ids.length === 1 ? 'a bird' : `${formatCount(ids.length)} birds`} home`,
      (on) => unstake(ids, on),
      {
        onFix,
        outcome: () => (ids.length === 1
          ? `${avianNumber(ids[0])} is home. Its satchel is yours again.`
          : `${formatCount(ids.length)} birds are home. Their satchels are yours again.`),
      },
    );
    setHoming([]);
    setHomeAck(false);
    setBusy(false);
  };

  // Everything the batch can pay: the listed streams, plus any retired token
  // still owing. `claimAll` returns a row for each, so the panel shows each.
  const claimable: RewardStream[] = [...r.streams, ...r.retired];
  const owedSomewhere = claimable.some((st) => st.earned > 0n);

  const doClaimAll = async () => {
    setBusy(true);
    await tx.run('Claiming every reward token', (on) => claimAll(on), {
      onFix,
      // The transaction can confirm while part of what was asked for did not
      // happen, so every one of these reads the RETURN VALUE. None of them may
      // be written before the call.
      outcome: (res) => claimAllHeadline(readClaimAll(res)),
      rows: (res) => readClaimAll(res).map(claimAllRow),
      note: (res) => skippedNote(readClaimAll(res)),
    });
    setBusy(false);
  };

  const doApprove = async () => {
    setBusy(true);
    await tx.run(`Approving ${avians(burn)}`, (on) => approveAviansForRoost(burn, on), {
      onFix, outcome: () => `${avians(burn)} approved. Nothing has been burned yet.`,
    });
    setBusy(false);
  };

  return (
    <div className="page page--wide">
      <p className="eyebrow">The nest</p>
      <h2>Send a bird to brood.</h2>
      <p className="lede" style={{ maxWidth: 900 }}>
        Brooding is custodial: the bird moves to the staking contract and comes back when you bring
        it home. Three tiers, chosen per stay.
      </p>

      <div className="says">
        <div>
          <h4>The tier cost is burned. It does not come back.</h4>
          <p className="small">
            Not escrowed, not refunded, not returned when the bird comes home. It is destroyed — the
            AVIANS supply falls by exactly that amount. Brooding the same bird again at the same tier
            costs the same AVIANS again.
          </p>
        </div>
        <div>
          <h4>The weight is lost on unstake.</h4>
          <p className="small">
            A brooding bird&rsquo;s weight counts toward the stream while it is there and stops the
            moment it leaves. Rewards already accrued are yours and stay claimable forever. The
            weight is gone.
          </p>
        </div>
        <div>
          <h4>A brooding bird&rsquo;s satchel is controlled by the staking contract.</h4>
          <p className="small">
            For the whole stay you cannot use that bird&rsquo;s wallet, sign for it, or move anything
            it holds. Nothing is lost — everything is reachable again the moment the bird comes home,
            and not one second before.
          </p>
        </div>
      </div>

      <div className="two-up">
        {/* ── send ─────────────────────────────────────────────────────── */}
        <section className="panel" aria-labelledby="send-h">
          <h3 id="send-h">Send a bird to brood</h3>

          <p className="eyebrow" style={{ margin: '20px 0 10px' }}>Choose a tier</p>
          <div className="tiers" role="radiogroup" aria-label="Tier">
            {([1, 2, 3] as Tier[]).map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={tier === t}
                className={`tier${tier === t ? ' tier--on' : ''}`}
                onClick={() => setTier(t)}
              >
                <div className="num" style={{ fontSize: 15 }}>{avians(r.tierCost[t])}</div>
                <div className="tiny dim" style={{ marginTop: 4 }}>burned</div>
                <div className="strong" style={{ marginTop: 10, fontWeight: 600 }}>Tier {t} · {t}x weight</div>
              </button>
            ))}
          </div>

          <p className="eyebrow" style={{ margin: '22px 0 10px' }}>Choose birds</p>
          {available.length === 0 ? (
            <EmptyState title="You have no birds in your wallet.">
              Compose one, or buy one from <a href={href({ name: 'perch' })}>the perch</a>.
            </EmptyState>
          ) : (
            <div className="row row--wrap" style={{ gap: 10 }}>
              {available.map((b) => {
                const on = picked.includes(b.id);
                const nested = satchelBlocksStaking(b);
                return (
                  <button
                    key={b.id}
                    type="button"
                    className={`tile${on ? ' tile--on' : ''}${nested.length ? ' tile--warn' : ''}`}
                    style={{ width: 96 }}
                    aria-pressed={on}
                    aria-label={`${avianNumber(b.id)}${nested.length ? ', its satchel holds other birds' : ''}`}
                    onClick={() => setPicked((v) => (on ? v.filter((x) => x !== b.id) : [...v, b.id]))}
                  >
                    <Avian traits={b.traits} alt="" />
                    <span className="mono tiny dim" style={{ display: 'block', textAlign: 'center', marginTop: 4 }}>
                      #{formatCount(b.id)}
                    </span>
                    {on ? <span className="tile__mark" aria-hidden="true"><Icon name="check" size={11} /></span> : null}
                  </button>
                );
              })}
            </div>
          )}

          {blocked.length > 0 ? (
            <div style={{ marginTop: 16 }}>
              <Box tone="warn">
                <Note tone="warn">
                  <strong className="strong">
                    {avianNumber(blocked[0].id)}&rsquo;s satchel holds {satchelBlocksStaking(blocked[0]).length} birds.
                  </strong>{' '}
                  <span className="small">
                    Brooding it locks them away until it comes home. Nothing is lost — but nothing
                    inside is reachable either.{' '}
                    <a href={href({ name: 'bird', id: blocked[0].id })}>Look inside first</a>
                  </span>
                </Note>
              </Box>
            </div>
          ) : null}

          <div className="row" style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
            <span className="small">{picked.length} {picked.length === 1 ? 'bird' : 'birds'} at Tier {tier}</span>
            <span className="spacer" />
            <span className="num" style={{ fontSize: 17 }}>{avians(burn)}</span>
          </div>
          <div className="row">
            <span className="tiny dim">burned, not held</span>
            <span className="spacer" />
            <span className="tiny dim">approved: {avians(approved)}</span>
          </div>

          {/*
            ONE PRIMARY BUTTON, AND IT IS ALWAYS THE NEXT THING TO DO.

            Two approvals stand between a wallet and a multi-bird stake, and
            they are unrelated: an AVIANS allowance for the tier burn, and an
            operator approval over the birds. The second used to sit below the
            fold as a ghost button while the primary said "Send to the nest",
            which is easy to miss and reads as optional. It takes the slot the
            AVIANS approval vacates instead, so the sequence is one button at a
            time: approve AVIANS, approve the birds, send.

            The push route is not taken away by that. It is still there, below,
            as the way to send several without approving anything — the batch is
            an offer of one transaction instead of many, and it stays an offer.
          */}
          <div style={{ marginTop: 16 }}>
            <WriteGate onConnect={onConnect}>
              {needsApproval && picked.length > 0 ? (
                <button type="button" className="btn btn--wide" disabled={busy || tx.busy} onClick={doApprove}>
                  Approve {avians(burn)} to the nest
                </button>
              ) : route.offerApproval ? (
                <button type="button" className="btn btn--wide" disabled={busy || tx.busy} onClick={approveBirds}>
                  Approve the nest for your birds
                </button>
              ) : (
                <button type="button" className="btn btn--wide" disabled={picked.length === 0 || busy || tx.busy} onClick={doStake}>
                  <Icon name="burn" size={16} color="var(--ink)" />
                  {picked.length === 0 ? 'Choose a bird' : `Send to the nest — burn ${avians(burn)}`}
                </button>
              )}
            </WriteGate>
          </div>

          {route.offerApproval ? (
            <div style={{ marginTop: 10 }}>
              <WriteGate onConnect={onConnect}>
                <button
                  type="button" className="btn btn--ghost btn--wide"
                  disabled={busy || tx.busy}
                  onClick={doStake}
                >
                  Send them in one at a time — burn {avians(burn)}
                </button>
              </WriteGate>
            </div>
          ) : null}

          {picked.length > 0 ? <p className="tiny dim" style={{ marginTop: 10 }}>{route.reason}</p> : null}
        </section>

        {/* ── brooding + claimable ─────────────────────────────────────── */}
        <div className="stack">
          <section className="panel" aria-labelledby="now-h">
            <div className="row">
              <h3 id="now-h">Brooding now</h3>
              <span className="spacer" />
              <Tag tone={r.yourWeight > 0n ? 'ok' : undefined}>
                Your weight {r.yourWeight.toString()} / {formatCount(Number(r.totalWeight))}
              </Tag>
            </div>

            {r.staked.length === 0 ? (
              <div style={{ marginTop: 16 }}>
                <EmptyState title="No bird of yours is in the nest">
                  A bird in the nest is counted for the stream. It comes home whenever you say.
                </EmptyState>
              </div>
            ) : (
              <>
                {r.staked.length > 1 ? (
                  <div className="row" style={{ marginTop: 14 }}>
                    <span className="tiny dim">
                      {homing.length === 0 ? 'Tick to bring several home in one transaction'
                        : `${formatCount(homing.length)} of ${formatCount(r.staked.length)} selected · ${homingWeight}x weight`}
                    </span>
                    <span className="spacer" />
                    <button
                      type="button" className="btn btn--ghost btn--small"
                      onClick={() => {
                        setHomeAck(false);
                        setHoming((v) => (v.length === r.staked.length ? [] : r.staked.map((b) => b.id)));
                      }}
                    >
                      {homing.length === r.staked.length ? 'Select none' : 'Select all'}
                    </button>
                  </div>
                ) : null}

                {r.staked.map((b) => (
                  <StakedRow
                    key={b.id}
                    bird={b}
                    now={now}
                    selectable={r.staked.length > 1}
                    selected={homing.includes(b.id)}
                    onToggle={() => {
                      setHomeAck(false);
                      setHoming((v) => (v.includes(b.id) ? v.filter((x) => x !== b.id) : [...v, b.id]));
                    }}
                    onFix={onFix}
                    onConnect={onConnect}
                  />
                ))}

                {/*
                  THE WEIGHT IS THE THING THAT DOES NOT COME BACK.

                  The bird does, and its satchel with it. What is gone is its
                  share of the stream and the AVIANS that bought that share,
                  which was burned when it went in and is not refunded on the
                  way out. Sending it back later costs the tier again. That is
                  worth a sentence and a tick for several birds at once; the
                  single row keeps its own button and does not ask.
                */}
                {homing.length > 1 ? (
                  <div style={{ marginTop: 14 }}>
                    <Box tone="warn">
                      <Note tone="warn">
                        <strong className="strong">
                          You are giving up {homingWeight}x weight.
                        </strong>{' '}
                        <span className="small">
                          {formatCount(homing.length)} birds come home and stop earning. The AVIANS
                          that bought their tiers was burned when they went in and does not come
                          back — sending them again costs the tier again.
                        </span>
                      </Note>
                      <label className="row" style={{ gap: 8, marginTop: 12, alignItems: 'flex-start' }}>
                        <input
                          type="checkbox"
                          checked={homeAck}
                          onChange={(e) => setHomeAck(e.target.checked)}
                          style={{ marginTop: 3 }}
                        />
                        <span className="small">
                          I understand the weight and the burn do not come back.
                        </span>
                      </label>
                    </Box>
                  </div>
                ) : null}

                {homing.length > 0 ? (
                  <div style={{ marginTop: 14 }}>
                    <WriteGate onConnect={onConnect}>
                      <button
                        type="button" className="btn btn--wide"
                        disabled={busy || tx.busy || (homing.length > 1 && !homeAck)}
                        onClick={() => doUnstake(homing)}
                      >
                        {homing.length === 1
                          ? `Bring ${avianNumber(homing[0])} home`
                          : `Bring ${formatCount(homing.length)} birds home`}
                      </button>
                    </WriteGate>
                  </div>
                ) : null}

                <p className="tiny dim" style={{ marginTop: 14 }}>
                  Bringing a bird home never touches a reward token. Even if every listed token is
                  frozen, the bird comes home.
                </p>
              </>
            )}
          </section>

          <section className="panel" aria-labelledby="claim-h">
            <div className="row">
              <h3 id="claim-h">Claimable</h3>
              <span className="spacer" />
              {r.listed.length === 0 ? <Tag>Nothing listed</Tag>
                : r.streams.some((x) => !x.transferable)
                  ? <Tag tone="hot">
                    {r.streams.filter((x) => !x.transferable).length} of {r.streams.length} paused
                  </Tag>
                  : <Tag tone="ok">{r.streams.length} streaming</Tag>}
            </div>

            {r.listed.length === 0 ? (
              <div style={{ marginTop: 14 }}>
                <Box tone="warn">
                  <Note tone="warn">
                    <strong className="strong">Nothing is streaming yet.</strong>{' '}
                    <span className="small">
                      No reward token has passed the staking contract&rsquo;s on-chain
                      transferability gate. Birds are held, weight is counted, and there are no
                      rewards. That is not a bug, and we would rather say so than show you an empty
                      panel that looks broken.
                    </span>
                  </Note>
                </Box>
              </div>
            ) : (
              <>
                <p className="small dim" style={{ marginTop: 6 }}>
                  One transaction claims everything you have accrued. A token that will not move is
                  skipped rather than blocking the others: the rest are still paid and its accrual
                  stays exactly where it was. A paused token cannot pay while it is paused, so that
                  one you have to come back for.
                </p>

                <div style={{ marginTop: 14 }}>
                  <WriteGate onConnect={onConnect}>
                    <button
                      type="button" className="btn btn--wide"
                      disabled={!owedSomewhere || busy || tx.busy}
                      onClick={doClaimAll}
                    >
                      {owedSomewhere ? 'Claim all' : 'Nothing to claim'}
                    </button>
                  </WriteGate>
                </div>

                <div style={{ marginTop: 12 }}>
                  {claimable.map((st) => (
                    <RewardRow
                      key={st.token.address}
                      stream={st}
                      retired={r.retired.includes(st)}
                      onFix={onFix}
                      onConnect={onConnect}
                    />
                  ))}
                </div>
                <p className="tiny dim" style={{ marginTop: 14 }}>
                  Shown truncated, never rounded up — a claim can never ask for more than exists.
                </p>
              </>
            )}

            <div style={{ marginTop: 16 }}>
              <StockDisclaimer alsoCovers={r.retired.map((st) => st.token.symbol)} />
            </div>
          </section>
        </div>
      </div>

      <div className="counters">
        <div>
          <div className="num" style={{ fontSize: 22 }}>{formatCount(r.totalStaked)}</div>
          <div className="tiny dim" style={{ marginTop: 4 }}>BIRDS BROODING RIGHT NOW</div>
        </div>
        <div>
          <div className="num" style={{ fontSize: 22 }}>{formatCount(Number(r.totalWeight))}</div>
          <div className="tiny dim" style={{ marginTop: 4 }}>TOTAL WEIGHT</div>
        </div>
        <div>
          <div className="num" style={{ fontSize: 22 }}>{avians(r.totalBurned)}</div>
          <div className="tiny dim" style={{ marginTop: 4 }}>BURNED BY TIERS, EVER</div>
        </div>
        <div>
          <div className="num" style={{ fontSize: 22 }}>{r.listed.length}</div>
          <div className="tiny dim" style={{ marginTop: 4 }}>REWARD TOKENS LISTED</div>
        </div>
      </div>
    </div>
  );
}

function StakedRow({
  bird, now, selectable, selected, onToggle, onFix, onConnect,
}: {
  bird: Bird; now: number;
  /** Only worth a checkbox when there is more than one bird to choose between. */
  selectable: boolean; selected: boolean; onToggle: () => void;
  onFix: (k: FixKind) => void; onConnect: () => void;
}) {
  const tx = useTx();
  const [busy, setBusy] = useState(false);
  const loc = bird.location.where === 'roost' ? bird.location : null;

  return (
    <div className="staked-row">
      {selectable ? (
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={`Bring ${avianNumber(bird.id)} home`}
          style={{ flex: 'none' }}
        />
      ) : null}
      <Avian traits={bird.traits} size={64} alt="" />
      <div>
        <a className="strong" href={href({ name: 'bird', id: bird.id })} style={{ fontWeight: 600 }}>
          {avianNumber(bird.id)}
        </a>
        <div className="tiny dim">
          Tier {loc?.tier} · {loc?.tier}x weight · brooding {formatSince(now - (loc?.since ?? now))}
        </div>
      </div>
      <span className="spacer" />
      <WriteGate onConnect={onConnect}>
        <button
          type="button" className="btn btn--ghost btn--small" disabled={busy || tx.busy}
          onClick={async () => {
            setBusy(true);
            await tx.run(`Bringing ${avianNumber(bird.id)} home`, (on) => unstake([bird.id], on), {
              onFix, outcome: () => `${avianNumber(bird.id)} is home. Its satchel is yours again.`,
            });
            setBusy(false);
          }}
        >
          Bring home
        </button>
      </WriteGate>
    </div>
  );
}

function RewardRow({
  stream, retired, onFix, onConnect,
}: {
  stream: RewardStream; retired: boolean;
  onFix: (k: FixKind) => void; onConnect: () => void;
}) {
  const tx = useTx();
  const [busy, setBusy] = useState(false);
  const dead = !stream.transferable;

  return (
    <div className="reward-row">
      <div className="row">
        <Tag>{stream.token.symbol}</Tag>
        <span className="small dim">
          tokenized stock product{retired ? ' · no longer streaming' : ''}
        </span>
        <span className="spacer" />
        <span className="num" style={{ fontSize: 16, color: dead ? 'var(--text-dim)' : undefined }}>
          {formatReward(stream.earned, stream.token.decimals)}
        </span>
        <WriteGate onConnect={onConnect}>
          <button
            type="button"
            className="btn btn--ghost btn--small"
            disabled={busy || tx.busy || stream.earned === 0n}
            onClick={async () => {
              setBusy(true);
              await tx.run(`Claiming ${stream.token.symbol}`, (on) => claim(stream.token.address, on), {
                context: { rewardSymbol: stream.token.symbol },
                onFix,
                outcome: () => `${formatReward(stream.earned, stream.token.decimals)} ${stream.token.symbol} claimed.`,
              });
              setBusy(false);
            }}
          >
            Claim
          </button>
        </WriteGate>
      </div>
      {dead ? (
        <div style={{ marginTop: 10 }}>
          <Note tone="bad">
            <span className="small">
              This reward token is not transferable right now. Your rewards are safe and can be
              claimed later — and your bird can still come home.
            </span>
          </Note>
        </div>
      ) : null}
    </div>
  );
}

// ── reading a batch result ───────────────────────────────────────────────
//
// All three of these take the ZIPPED result, never the transaction's success.
// A claimAll that confirms having paid nothing at all is a normal outcome.

function claimAllHeadline(rows: ClaimOutcome[]): string {
  const paid = rows.filter((o) => o.kind === 'paid').length;
  const skipped = rows.filter((o) => o.kind === 'skipped').length;
  const idle = rows.filter((o) => o.kind === 'nothing-owed').length;

  if (paid === 0 && skipped === 0) return 'Nothing was owed in any token.';
  if (paid === 0) {
    return `Nothing was paid. ${skipped === 1 ? 'One token' : `All ${skipped} tokens`} would not move.`;
  }
  const parts = [`${paid} ${paid === 1 ? 'token' : 'tokens'} paid`];
  if (skipped) parts.push(`${skipped} skipped`);
  if (idle) parts.push(`${idle} had nothing owed`);
  return `${parts.join('. ')}.`;
}

function claimAllRow(o: ClaimOutcome): TxRow {
  if (o.kind === 'paid') {
    return { label: o.symbol, value: formatReward(o.paid, o.decimals), tone: 'ok' };
  }
  if (o.kind === 'skipped') return { label: o.symbol, value: 'Skipped', tone: 'warn' };
  return { label: o.symbol, value: 'Nothing owed', tone: 'dim' };
}

/** The sentence that used to appear only when a claim threw. */
function skippedNote(rows: ClaimOutcome[]): string | undefined {
  const n = rows.filter((o) => o.kind === 'skipped').length;
  if (n === 0) return undefined;
  return `${n === 1 ? 'This reward token is' : 'These reward tokens are'} not transferable right now.`
    + ' Your rewards are safe and can be claimed later — and your bird can still come home.';
}
