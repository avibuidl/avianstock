// The Sweeper's set-up (HANDOVER section 5, "Collecting from many birds at
// once"), for My Nest's Rewards panel.
//
// A bird's satchel obeys only the bird's owner, so nothing can move its stock
// out for them; a holder who kept the stock in ten birds faces ten
// transactions. The Sweeper is the one exception a holder can choose to make.
// They grant it on each satchel, by calling THE SATCHEL's own
// `setPermissions([sweeper], [true])`, once per bird, and from then on one
// `sweep(ids, tokens)` moves every listed reward token out of every granted
// satchel into their own wallet. The grant is keyed by the bird's current
// owner, so it dies with a sale; the buyer grants afresh or not at all.
//
// Two steps, each offered only where it is missing: `prepare(ids)` over the
// birds whose satchel is not deployed (one transaction, anyone may, deploying
// grants nothing), then `setPermissions` on each deployed-but-not-granted
// satchel the holder ticks (one signature per bird, once), with Revoke beside
// each granted one. The sweep itself is the Rewards panel's row: what would
// move is drawn there, as one row per token, and collected from there. (The
// panel this file used to draw, with its own table of what a sweep would
// move, became those rows on 2026-09-27.)

import { useState } from 'react';
import { Box, Tag } from './Primitives';
import { WriteGate } from './Wallet';
import { useTx, type TxRow } from './Tx';
import { avianNumber, formatCount, formatReward, shortAddress } from '../lib/format';
import {
  grantSweeper, prepareSatchels,
  type Amount, type RewardToken, type SweepBird, type SweepResult, type SweepState, type TokenId,
} from '../mock';

/** "12.4088 NVDA, 3.1 SPY", or null when a satchel holds nothing in these tokens. */
function holdingsLine(b: SweepBird, tokens: RewardToken[]): string | null {
  const parts = tokens
    .map((t, j) => (b.amounts[j] > 0n ? `${formatReward(b.amounts[j], t.decimals)} ${t.symbol}` : null))
    .filter((x): x is string => x !== null);
  return parts.length ? parts.join(', ') : null;
}

/**
 * The grant, where it is missing. Draws nothing when every satchel with
 * stock in it is granted already; the Rewards panel's one line says why it
 * is here when it is.
 */
export function SweeperSetup({ s, onConnect, onChanged }: { s: SweepState; onConnect: () => void; onChanged: () => void }) {
  const tx = useTx();
  const [ticked, setTicked] = useState<Set<TokenId>>(new Set());
  const [busy, setBusy] = useState(false);

  const notDeployed = s.birds.filter((b) => !b.deployed);
  const deployedNotGranted = s.birds.filter((b) => b.deployed && !b.granted);
  const granted = s.birds.filter((b) => b.granted);
  const tickedIds = deployedNotGranted.map((b) => b.id).filter((id) => ticked.has(id));

  const doPrepare = async () => {
    setBusy(true);
    const ids = notDeployed.map((b) => b.id);
    await tx.run(`Deploying ${ids.length === 1 ? 'one satchel' : `${formatCount(ids.length)} satchels`}`,
      (on) => prepareSatchels(ids, on), {
        outcome: (r) => (r.deployed.length === 0
          ? 'Every satchel was already deployed. Nothing changed.'
          : `${r.deployed.length === 1 ? 'One satchel is' : `${formatCount(r.deployed.length)} satchels are`} deployed. Nothing is granted yet; that is the next step, and optional.`),
        rows: (r) => ids.map((id) => ({
          label: avianNumber(id),
          value: r.deployed.includes(id) ? 'satchel deployed' : 'already deployed',
          tone: (r.deployed.includes(id) ? 'ok' : 'dim') as TxRow['tone'],
        })),
      });
    setBusy(false);
    onChanged();
  };

  // One transaction per bird, sent TO THE SATCHEL. Sequential: a refusal or a
  // rejected signature stops the queue where it is, and the rest stay ticked.
  const doGrant = async () => {
    setBusy(true);
    const done = new Set<TokenId>();
    for (const id of tickedIds) {
      const bird = deployedNotGranted.find((b) => b.id === id)!;
      const r = await tx.run(`Granting the sweeper on ${avianNumber(id)}`, (on) => grantSweeper(id, true, on), {
        outcome: () => `${avianNumber(id)}: the Sweeper is granted on its satchel.`,
        rows: () => [
          { label: 'Satchel', value: shortAddress(bird.satchel), tone: 'ok' as const },
          { label: 'Allows', value: 'the Sweeper to move reward tokens to this bird’s owner, on the owner’s call', tone: 'ok' as const },
        ],
        note: () => 'The grant belongs to the bird’s current owner, so it ends the moment the bird is sold. It can be revoked here at any time.',
      });
      if (!r) break;
      done.add(id);
    }
    setTicked((prev) => new Set([...prev].filter((id) => !done.has(id))));
    setBusy(false);
    onChanged();
  };

  const doRevoke = async (b: SweepBird) => {
    setBusy(true);
    await tx.run(`Revoking the sweeper on ${avianNumber(b.id)}`, (on) => grantSweeper(b.id, false, on), {
      outcome: () => `${avianNumber(b.id)}: the grant is revoked. Its satchel answers only to you again.`,
    });
    setBusy(false);
    onChanged();
  };

  return (
    <div>
      {notDeployed.length > 0 ? (
        <div style={{ marginTop: 14 }}>
          <Box tone="warn">
          <div className="row">
            <h4 style={{ margin: 0 }}>Not deployed yet</h4>
            <span className="spacer" />
            <span className="tiny dim">{formatCount(notDeployed.length)} of {formatCount(s.birds.length)}</span>
          </div>
          <p className="tiny dim" style={{ marginTop: 4 }}>
            A satchel can hold reward tokens before it is deployed, but it can only grant the
            Sweeper once it is. One transaction deploys all of these; it grants nothing by itself.
          </p>
          {notDeployed.map((b) => (
            <div key={b.id} className="hold-row">
              <span className="small strong">{avianNumber(b.id)}</span>
              <span className="tiny dim">{holdingsLine(b, s.tokens) ?? 'nothing inside yet'}</span>
              <span className="spacer" />
              <Tag>Not deployed</Tag>
            </div>
          ))}
          <div style={{ marginTop: 10 }}>
            <WriteGate onConnect={onConnect}>
              <button type="button" className="btn btn--ghost btn--small" disabled={busy || tx.busy} onClick={doPrepare}>
                Deploy {notDeployed.length === 1 ? 'the satchel' : `${formatCount(notDeployed.length)} satchels`} in one transaction
              </button>
            </WriteGate>
          </div>
          </Box>
        </div>
      ) : null}

      {deployedNotGranted.length > 0 ? (
        <div style={{ marginTop: 14 }}>
          <div className="row">
            <h4 style={{ margin: 0 }}>Approve Sweeper</h4>
            <span className="spacer" />
            <span className="tiny dim">{formatCount(deployedNotGranted.length)} of {formatCount(s.birds.length)}</span>
          </div>
          <p className="tiny dim" style={{ marginTop: 4 }}>
            One signature per bird, once. The grant lets the Sweeper do one thing: move reward
            tokens from that satchel to whoever holds the bird, when they ask. It ends when the
            bird changes hands.
          </p>
          <div className="row" style={{ marginTop: 8, gap: 8 }}>
            <button
              type="button" className="btn btn--ghost btn--compact"
              onClick={() => setTicked(new Set(deployedNotGranted.map((b) => b.id)))}
              disabled={tickedIds.length === deployedNotGranted.length}
            >
              Select all
            </button>
            {tickedIds.length ? (
              <button type="button" className="btn btn--ghost btn--compact" onClick={() => setTicked(new Set())}>Clear</button>
            ) : null}
          </div>
          {deployedNotGranted.map((b) => (
            <label key={b.id} className="hold-row" style={{ cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={ticked.has(b.id)}
                onChange={(e) => setTicked((prev) => {
                  const next = new Set(prev);
                  if (e.target.checked) next.add(b.id); else next.delete(b.id);
                  return next;
                })}
                aria-label={`Grant on ${avianNumber(b.id)}`}
              />
              <span className="small strong">{avianNumber(b.id)}</span>
              <span className="tiny dim">{holdingsLine(b, s.tokens) ?? 'nothing inside yet'}</span>
              <span className="spacer" />
              <span className="mono tiny dim">{shortAddress(b.satchel)}</span>
            </label>
          ))}
          <div style={{ marginTop: 10 }}>
            <WriteGate onConnect={onConnect}>
              <button type="button" className="btn btn--ghost btn--small" disabled={busy || tx.busy || tickedIds.length === 0} onClick={doGrant}>
                {tickedIds.length === 0 ? 'Tick the birds to approve on'
                  : tickedIds.length === 1 ? `Approve sweeper on ${avianNumber(tickedIds[0])}`
                    : `Approve sweeper on ${formatCount(tickedIds.length)} birds`}
              </button>
            </WriteGate>
          </div>
        </div>
      ) : null}

      {granted.length > 0 ? (
        <div style={{ marginTop: 14 }}>
          <div className="row">
            <h4 style={{ margin: 0 }}>Approved satchels</h4>
            <span className="spacer" />
            <span className="tiny dim">{formatCount(granted.length)} of {formatCount(s.birds.length)}</span>
          </div>
          {granted.map((b) => (
            <div key={b.id} className="hold-row">
              <span className="small strong">{avianNumber(b.id)}</span>
              <span className="tiny dim">{holdingsLine(b, s.tokens) ?? 'nothing inside'}</span>
              <span className="spacer" />
              <button type="button" className="btn btn--ghost btn--compact" disabled={busy || tx.busy} onClick={() => doRevoke(b)}>Revoke</button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ── the receipt ───────────────────────────────────────────────────────────

export type Fmt = (token: string, amount: Amount) => string;

export function sweepOutcome(r: SweepResult, fmt: Fmt): string {
  if (r.totals.length === 0) {
    return r.skipped.length
      ? 'Nothing moved: every delivery was skipped. The reward tokens are still in the birds.'
      : 'Nothing was in the satchels to move.';
  }
  const sums = r.totals.map((t) => fmt(t.token, t.amount)).join(', ');
  return r.skipped.length
    ? `${sums} is in your wallet. Some deliveries were skipped; they are still in the birds.`
    : `${sums} is in your wallet.`;
}

export function sweepRows(r: SweepResult, fmt: Fmt, symbolOf: (token: string) => { symbol: string }): TxRow[] {
  const rows: TxRow[] = r.totals.map((t) => ({ label: fmt(t.token, t.amount), value: 'swept to your wallet', tone: 'ok' as const }));
  // Skipped, said plainly and with the reason; never "failed": the stock is
  // still in the bird. Token zero is the whole bird; otherwise one token of it.
  for (const k of r.skipped) {
    rows.push(k.token === null
      ? { label: avianNumber(k.id), value: 'skipped: not deployed or not granted', tone: 'warn' }
      : { label: `${avianNumber(k.id)}, ${symbolOf(k.token).symbol}`, value: 'skipped: would not move right now; still in the bird', tone: 'warn' });
  }
  return rows;
}

export function sweepNote(r: SweepResult): string | undefined {
  const wholeBird = r.skipped.some((k) => k.token === null);
  const oneToken = r.skipped.some((k) => k.token !== null);
  if (wholeBird && oneToken) return 'A bird was passed over because its satchel is not deployed or has not granted the Sweeper, and a token would not move right now (paused, or your wallet is on its blocklist). Both are still in the birds; nothing was lost.';
  if (wholeBird) return 'A bird was passed over: its satchel is not deployed or has not granted the Sweeper (the grant ends when a bird changes hands). Deploy or grant above and sweep again.';
  if (oneToken) return 'A token would not move right now: the issuer has paused it, or your wallet is on its blocklist. It is still in the bird, and a later sweep will bring it when the token moves again.';
  return undefined;
}
