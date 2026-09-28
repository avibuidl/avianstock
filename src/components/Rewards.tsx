// The Rewards sheet (2026-09-27 as a panel; a sheet since 2026-09-28, opened
// by "Manage rewards" in the birds' section head, by the band's "Claimable
// now" and by #/nest/rewards). Since 2026-09-28 it opens on the Sweeper
// itself: its collecting (one Collect per token, one for everything) and its
// grants in one section; staking's AVIAN is the Stake AVIAN card's, and the
// Nest's held-back shares are not offered here (the founder's pass). Everything a holder can collect, as rows of one shape: the token, the amount, its value,
// where it is, and its one button. Three sources, three reads, each loading
// and failing on its own: the stock in the birds' own wallets (the Sweeper,
// one call over every granted satchel), the Nest's held-back shares (one
// claim per token), and the AVIAN earned by staking (one claim).
//
// "Collect everything" runs them in turn, one transaction each, with the
// progress state the owner's seat control uses ("2 of 3"): one sweep for
// every token in the birds, then each Nest claim, then the staking claim. A
// refused signature stops the run where it is and says so; what was
// collected stays collected.

import { useEffect, useState } from 'react';
import s from '../screens/MyNest.module.css';
import { Icon } from './Icon';
import { Note, Tag } from './Primitives';
import { WriteGate } from './Wallet';
import { useTx, type FixHandlers } from './Tx';
import { SweeperSetup, sweepNote, sweepOutcome, sweepRows } from './Collect';
import { ACTION, WHERE, unreachable, type RewardRow } from '../lib/rewards';
import { avians, formatCount, formatEthSig, formatReward, formatUsd, shortAddress } from '../lib/format';
import {
  claim, claimStakingReward, sweep,
  type Address, type Async, type BroodState, type Polled, type SweepResult, type SweepState,
} from '../mock';

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

type Step = { label: string; /** The same, as the progress line says it mid-sentence. */ at: string; run: (on: Parameters<typeof sweep>[2]) => Promise<unknown>; outcome: (r: unknown) => string; rows?: (r: unknown) => ReturnType<typeof sweepRows>; note?: (r: unknown) => string | undefined };
type Run = { done: number; of: number; at: string; phase: 'signing' | 'pending' };
type Status = { state: 'running'; run: Run } | { state: 'done'; of: number } | { state: 'stopped'; done: number; of: number; at: string };

export function RewardsPanel({
  rows, brood, sweep: sw, onAddToken, onConnect, onChanged, onClose,
}: {
  rows: RewardRow[];
  brood: Polled<BroodState>;
  /** Undefined on a deployment without a Sweeper: the birds' rows are simply absent. */
  sweep: Async<SweepState | undefined>;
  onAddToken: (address: Address) => void;
  onConnect: () => void;
  onChanged: () => void;
  onClose: () => void;
}) {
  const tx = useTx();
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const onFix: FixHandlers = {};

  const tokens = [...(sw.data?.tokens ?? []), ...(brood.data?.listed ?? [])];
  const symbolOf = (token: string) => {
    const t = tokens.find((x) => x.address.toLowerCase() === token.toLowerCase());
    return t ? { symbol: t.symbol, decimals: t.decimals } : { symbol: shortAddress(token), decimals: 18 };
  };
  const fmt = (token: string, amount: bigint) => { const m = symbolOf(token); return `${formatReward(amount, m.decimals)} ${m.symbol}`; };

  const birdRows = rows.filter((r) => r.source === 'birds');

  /** One row's step: a sweep of that token from its birds, or the claim. */
  const stepFor = (r: RewardRow): Step => (r.source === 'birds'
    ? {
      label: `Collecting ${r.token.symbol} from ${r.ids.length === 1 ? 'one bird' : `${formatCount(r.ids.length)} birds`}`,
      at: `collecting ${r.token.symbol} from ${r.ids.length === 1 ? 'one bird' : `${formatCount(r.ids.length)} birds`}`,
      run: (on) => sweep(r.ids, [r.token.address], on),
      outcome: (x) => sweepOutcome(x as SweepResult, fmt),
      rows: (x) => sweepRows(x as SweepResult, fmt, symbolOf),
      note: (x) => sweepNote(x as SweepResult),
    }
    : r.source === 'nest'
      ? {
        label: `Claiming ${r.token.symbol} held by the Nest`,
        at: `claiming ${r.token.symbol} held by the Nest`,
        run: (on) => claim(r.token.address, on),
        outcome: (x) => `${formatReward((x as { amount: bigint }).amount, r.token.decimals)} ${r.token.symbol} claimed.`,
      }
      : {
        label: 'Claiming your staking AVIAN',
        at: 'claiming your staking AVIAN',
        run: (on) => claimStakingReward(on),
        outcome: (x) => `${avians((x as { paid: bigint }).paid)} is in your wallet.`,
      });

  /** Everything the Sweeper can reach, in one run: one sweep for all the birds' tokens. */
  const allSteps = (): Step[] => {
    const steps: Step[] = [];
    if (birdRows.length) {
      const ids = [...new Set(birdRows.flatMap((r) => r.ids))];
      const addrs = birdRows.map((r) => r.token.address);
      steps.push({
        label: `Collecting from ${ids.length === 1 ? 'one bird' : `${formatCount(ids.length)} birds`}`,
        at: `collecting from ${ids.length === 1 ? 'one bird' : `${formatCount(ids.length)} birds`}`,
        run: (on) => sweep(ids, addrs, on),
        outcome: (x) => sweepOutcome(x as SweepResult, fmt),
        rows: (x) => sweepRows(x as SweepResult, fmt, symbolOf),
        note: (x) => sweepNote(x as SweepResult),
      });
    }
    return steps;
  };

  const runOne = async (key: string, step: Step) => {
    setBusy(key);
    await tx.run(step.label, (on) => step.run(on), { onFix, outcome: step.outcome, rows: step.rows, note: step.note });
    setBusy(null);
    onChanged();
  };

  const runAll = async () => {
    const steps = allSteps();
    setBusy('all');
    for (let k = 0; k < steps.length; k++) {
      const step = steps[k];
      setStatus({ state: 'running', run: { done: k, of: steps.length, at: step.at, phase: 'signing' } });
      const out = await tx.run(step.label, (on) => step.run((phase, hash) => {
        setStatus({ state: 'running', run: { done: k, of: steps.length, at: step.at, phase: phase === 'confirmed' ? 'pending' : phase } });
        on(phase, hash);
      }), { onFix, outcome: step.outcome, rows: step.rows, note: step.note });
      if (out === undefined) { setStatus({ state: 'stopped', done: k, of: steps.length, at: step.at }); setBusy(null); onChanged(); return; }
    }
    setStatus({ state: 'done', of: steps.length });
    setBusy(null);
    onChanged();
  };

  const addToken = () => {
    const a = tokenInput.trim();
    if (!ADDRESS_RE.test(a)) return;
    onAddToken(a as Address);
    setTokenInput('');
  };

  const cannotReach = sw.data ? unreachable(sw.data, brood.data?.listed.length ?? sw.data.tokens.length) : [];
  const steps = allSteps().length;
  const blocked = busy !== null || tx.busy;

  // While "Collect everything" runs the sheet stays: no close, no backdrop, no Escape, until the run finishes or stops.
  const locked = busy === 'all';
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !locked) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, locked]);

  return (
    <div className="scrim scrim--fixed" role="dialog" aria-modal="true" aria-labelledby="rewards-h" onClick={locked ? undefined : onClose}>
      <div className="modal modal--scroll" onClick={(e) => e.stopPropagation()}>
      <div className="row row--wrap" style={{ gap: 12 }}>
        <h3 id="rewards-h" style={{ fontSize: 24 }}>Manage rewards</h3>
        <span className="spacer" />
        <button type="button" className="btn btn--ghost btn--small" onClick={onClose} disabled={locked} aria-label="Close">
          <Icon name="cross" size={14} />
        </button>
      </div>
      <p className="small dim" style={{ marginTop: 6 }}>
        The Sweeper brings the tokens in your birds’ wallets to yours.
      </p>

      {/* ── the Sweeper: its collecting, then its grants ── */}
      <div className="row row--wrap" style={{ gap: 12, marginTop: 18 }}>
        <h4 style={{ margin: 0 }}>The Sweeper</h4>
        <span className="spacer" />
        <WriteGate onConnect={onConnect}>
          <button type="button" className="btn btn--compact" disabled={blocked || steps === 0} onClick={runAll}>
            {busy === 'all' ? 'Collecting…' : 'Collect everything'}
          </button>
        </WriteGate>
      </div>

      {status?.state === 'running' ? (
        <div className={s.progress} role="status" aria-live="polite">
          <span className="steps" aria-hidden="true" style={{ gap: 4 }}>
            {Array.from({ length: status.run.of }, (_, i) => (
              <span key={i} className={`steps__dot${i < status.run.done ? ' steps__dot--done' : i === status.run.done ? ' steps__dot--on' : ''}`} />
            ))}
          </span>
          <span className="small">
            <span className="mono">{status.run.done} of {status.run.of}</span>
            <span className="dim"> · {status.run.at}: {status.run.phase === 'signing' ? 'waiting for your wallet' : 'pending'}</span>
          </span>
        </div>
      ) : status?.state === 'stopped' ? (
        <div className={s.progress}>
          <Note tone="warn"><span className="small">Stopped at {status.done} of {status.of}: {status.at} was not sent. What came before is collected; press again for the rest.</span></Note>
        </div>
      ) : status?.state === 'done' ? (
        <div className={s.progress}>
          <Icon name="check" size={13} color="var(--confirm)" />
          <span className="small">Collected, {status.of === 1 ? 'one transaction' : `${formatCount(status.of)} transactions`}.</span>
        </div>
      ) : null}

      <div className={s.rows}>
        {/* The birds' rows, from the Sweeper's read: one Collect per token. */}
        {sw.loading && !sw.data ? <RowSkeleton /> : sw.error ? (
          <FailedRow what="What is in your birds’ wallets" onRetry={sw.reload} />
        ) : birdRows.map((r) => (
          <Row key={`birds:${r.token.address}`} r={r} busy={blocked} onConnect={onConnect} onPress={() => runOne(`birds:${r.token.address}`, stepFor(r))} />
        ))}
        {birdRows.length === 0 && !(sw.loading && !sw.data) && !sw.error ? (
          <div className={s.rowEmpty}><span className="small dim">Nothing to collect right now. Stock lands here as your birds earn.</span></div>
        ) : null}
      </div>

      {/* The Sweeper's grants: what it can reach, and the birds it cannot yet. */}
      {sw.data ? (
        <div className={s.setup}>
          <p className="tiny dim" style={{ margin: 0 }}>
            {cannotReach.length > 0 ? (
              <>
                {cannotReach.length === 1 ? 'One bird holds' : `${formatCount(cannotReach.length)} birds hold`} stock the Sweeper cannot reach yet
                ({cannotReach.map((id) => `#${formatCount(id)}`).join(', ')}). Grant it once per bird, and one Collect brings everything.
                Optional: a bird that delivers rewards to your wallet never needs it.
              </>
            ) : sw.data.birds.some((b) => b.granted) ? (
              <>You have approved the Sweeper to transfer tokens from {formatCount(sw.data.birds.filter((b) => b.granted).length)} of your birds.</>
            ) : (
              <>You have not approved the Sweeper on any of your birds yet. Approve it once per bird, and one Collect brings everything.</>
            )}
          </p>
          <>
          <SweeperSetup s={sw.data} onConnect={onConnect} onChanged={onChanged} />
          <div className="row row--wrap" style={{ marginTop: 14, gap: 8 }}>
            <div className="field" style={{ flex: '1 1 240px' }}>
              <input
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addToken(); } }}
                placeholder="A token no longer listed, by address"
                aria-label="Add a token by address"
                spellCheck={false}
              />
              <button type="button" className="btn btn--small" style={{ borderLeft: '1px solid var(--line-strong)' }} disabled={!ADDRESS_RE.test(tokenInput.trim())} onClick={addToken}>
                Add
              </button>
            </div>
          </div>
          </>
        </div>
      ) : null}
      </div>
    </div>
  );
}

function Row({ r, busy, onConnect, onPress }: { r: RewardRow; busy: boolean; onConnect: () => void; onPress: () => void }) {
  const value = r.usd !== null ? formatUsd(r.usd) : r.eth !== null ? formatEthSig(r.eth) : '';
  return (
    <div className={s.row}>
      <span className={s.rowToken}><Tag>{r.token.symbol}</Tag></span>
      <span className={s.rowAmount}>{formatReward(r.amount, r.token.decimals)}</span>
      <span className={s.rowValue}>{value}</span>
      <span className={`small dim ${s.rowWhere}`}>{WHERE[r.source]}</span>
      <span className={s.rowAction}>
        <WriteGate onConnect={onConnect}>
          <button type="button" className="btn btn--ghost btn--compact" disabled={busy} onClick={onPress}>{ACTION[r.source]}</button>
        </WriteGate>
      </span>
    </div>
  );
}

/** A row's footprint while its read is out, so nothing moves when it lands. */
function RowSkeleton() {
  return (
    <div className={s.row} aria-hidden="true">
      <span className={s.rowToken}><span className="skel" style={{ width: 44, height: 20, display: 'inline-block' }} /></span>
      <span className="skel" style={{ width: '60%', height: 12, display: 'inline-block' }} />
      <span className="skel" style={{ width: '40%', height: 12, display: 'inline-block' }} />
      <span className="skel" style={{ width: '70%', height: 12, display: 'inline-block' }} />
      <span className={s.rowAction}><span className="skel" style={{ width: 64, height: 32, display: 'inline-block' }} /></span>
    </div>
  );
}

function FailedRow({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div className={`${s.row} ${s.rowFailed}`}>
      <span className="small" style={{ gridColumn: '1 / -2' }}>
        <Icon name="warn" size={13} color="var(--attention)" /> {what} could not be read. It is where it was.
      </span>
      <span className={s.rowAction}>
        <button type="button" className="btn btn--ghost btn--compact" onClick={onRetry}>Try again</button>
      </span>
    </div>
  );
}
