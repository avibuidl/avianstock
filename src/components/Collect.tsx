// Collect from my birds — the Sweeper (HANDOVER section 5, "Collecting from
// many birds at once").
//
// A bird's satchel obeys only the bird's owner, so nothing can move its stock
// out for them; a holder who kept the stock in ten birds faces ten
// transactions. The Sweeper is the one exception a holder can choose to make.
// They grant it on each satchel — by calling THE SATCHEL's own
// `setPermissions([sweeper], [true])`, once per bird — and from then on one
// `sweep(ids, tokens)` moves every listed reward token out of every granted
// satchel into their own wallet. The grant is keyed by the bird's current
// owner, so it dies with a sale; the buyer grants afresh or not at all.
//
// Three steps, each offered only where it is missing:
//   1. `prepare(ids)` over the birds whose satchel is not deployed — one
//      transaction, anyone may, deploying grants nothing.
//   2. `setPermissions` on each deployed-but-not-granted satchel the holder
//      ticks — one signature per bird, once. Revoke beside it on granted ones.
//   3. `sweepable` as a bird × token table over the granted birds, then one
//      `sweep` over the ready birds with something to move.
//
// It is shown as a choice, not a step everyone must take: a holder whose
// broods all deliver to their wallet never needs it, so the panel does not
// exist for a wallet with no grant and no satchel holding a listed token.

import { useState } from 'react';
import { Box, Note, Tag } from './Primitives';
import { WriteGate } from './Wallet';
import { useTx, type TxRow } from './Tx';
import { avianNumber, formatCount, formatReward, shortAddress } from '../lib/format';
import {
  grantSweeper, prepareSatchels, sweep, useSweep,
  type Address, type Amount, type RewardToken, type SweepBird, type SweepResult, type TokenId,
} from '../mock';

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/** "12.4088 NVDA · 3.1 SPY", or null when a satchel holds nothing in these tokens. */
function holdingsLine(b: SweepBird, tokens: RewardToken[]): string | null {
  const parts = tokens
    .map((t, j) => (b.amounts[j] > 0n ? `${formatReward(b.amounts[j], t.decimals)} ${t.symbol}` : null))
    .filter((x): x is string => x !== null);
  return parts.length ? parts.join(', ') : null;
}

export function CollectPanel({ onConnect }: { onConnect: () => void }) {
  const [extra, setExtra] = useState<Address[]>([]);
  const state = useSweep(extra);
  const tx = useTx();
  const [ticked, setTicked] = useState<Set<TokenId>>(new Set());
  const [busy, setBusy] = useState(false);
  const [tokenInput, setTokenInput] = useState('');

  // No Sweeper on this deployment, still reading, or nothing here for this
  // wallet: the panel does not exist. A wall of setup for a holder whose
  // broods deliver to their wallet would be the wrong thing to draw.
  if (state.error) {
    return (
      <section className="panel" aria-labelledby="collect-h" style={{ marginTop: 24 }}>
        <h3 id="collect-h" style={{ fontSize: 20 }}>Collect from my birds</h3>
        <div style={{ marginTop: 10 }}>
          <Note tone="warn">
            <span className="small">
              The Sweeper could not be read. Your birds and everything in their satchels are
              where they were.{' '}
              <button type="button" className="btn btn--ghost btn--small" onClick={state.reload}>Try again</button>
            </span>
          </Note>
        </div>
      </section>
    );
  }
  const s = state.data;
  if (!s || !s.relevant) return null;

  const symbolOf = (token: string) => {
    const t = s.tokens.find((x) => x.address.toLowerCase() === token.toLowerCase());
    return t ? { symbol: t.symbol, decimals: t.decimals } : { symbol: shortAddress(token), decimals: 18 };
  };
  const fmt = (token: string, amount: Amount) => {
    const m = symbolOf(token);
    return `${formatReward(amount, m.decimals)} ${m.symbol}`;
  };

  const notDeployed = s.birds.filter((b) => !b.deployed);
  const deployedNotGranted = s.birds.filter((b) => b.deployed && !b.granted);
  const granted = s.birds.filter((b) => b.granted);
  const tickedIds = deployedNotGranted.map((b) => b.id).filter((id) => ticked.has(id));

  // Step 3: the birds a sweep would move something out of, and the per-token
  // totals the button names. A token column is included when any granted
  // bird holds it; a bird when any of its columns is non-zero.
  const readyIds = granted.filter((b) => b.amounts.some((x) => x > 0n)).map((b) => b.id);
  const columnTotals = s.tokens.map((_, j) => granted.reduce((a, b) => a + (b.amounts[j] ?? 0n), 0n));
  const tokensToSweep = s.tokens.filter((_, j) => columnTotals[j] > 0n).map((t) => t.address);
  const nothingToMove = readyIds.length === 0 || tokensToSweep.length === 0;

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
  };

  const doRevoke = async (b: SweepBird) => {
    setBusy(true);
    await tx.run(`Revoking the sweeper on ${avianNumber(b.id)}`, (on) => grantSweeper(b.id, false, on), {
      outcome: () => `${avianNumber(b.id)}: the grant is revoked. Its satchel answers only to you again.`,
    });
    setBusy(false);
  };

  const doSweep = async () => {
    setBusy(true);
    await tx.run(`Collecting from ${readyIds.length === 1 ? 'one bird' : `${formatCount(readyIds.length)} birds`}`,
      (on) => sweep(readyIds, tokensToSweep, on), {
        outcome: (r) => sweepOutcome(r, fmt),
        rows: (r) => sweepRows(r, fmt, symbolOf),
        note: (r) => sweepNote(r),
      });
    setBusy(false);
  };

  const addToken = () => {
    const a = tokenInput.trim();
    if (!ADDRESS_RE.test(a)) return;
    if (!s.tokens.some((t) => t.address.toLowerCase() === a.toLowerCase())
      && !extra.some((x) => x.toLowerCase() === a.toLowerCase())) {
      setExtra((prev) => [...prev, a as Address]);
    }
    setTokenInput('');
  };

  return (
    <section className="panel" aria-labelledby="collect-h" style={{ marginTop: 24 }}>
      <div className="row">
        <h3 id="collect-h" style={{ fontSize: 20 }}>Collect from my birds</h3>
        <span className="spacer" />
        <Tag tone={granted.length ? 'ok' : undefined}>
          {granted.length === 0 ? 'Nothing granted' : `${formatCount(granted.length)} granted`}
        </Tag>
      </div>
      <p className="small dim" style={{ marginTop: 8 }}>
        Each bird&rsquo;s wallet answers only to you, so collecting reward tokens from ten birds is
        ten transactions. Grant the Sweeper once per bird and it becomes one. Optional: a bird that
        delivers rewards to your wallet never needs it.
      </p>

      {/* ── 1. deploy ─────────────────────────────────────────────────── */}
      {notDeployed.length > 0 ? (
        <div style={{ marginTop: 18 }}>
          <div className="row">
            <h4 style={{ margin: 0 }}>Not deployed yet</h4>
            <span className="spacer" />
            <span className="tiny dim">{formatCount(notDeployed.length)} of {formatCount(s.birds.length)}</span>
          </div>
          <p className="small dim" style={{ marginTop: 6 }}>
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
          <div style={{ marginTop: 12 }}>
            <WriteGate onConnect={onConnect}>
              <button type="button" className="btn btn--small" disabled={busy || tx.busy} onClick={doPrepare}>
                Deploy {notDeployed.length === 1 ? 'the satchel' : `${formatCount(notDeployed.length)} satchels`} in one transaction
              </button>
            </WriteGate>
          </div>
        </div>
      ) : null}

      {/* ── 2. grant ──────────────────────────────────────────────────── */}
      {deployedNotGranted.length > 0 ? (
        <div style={{ marginTop: 18 }}>
          <div className="row">
            <h4 style={{ margin: 0 }}>Deployed, not granted</h4>
            <span className="spacer" />
            <span className="tiny dim">{formatCount(deployedNotGranted.length)} of {formatCount(s.birds.length)}</span>
          </div>
          <p className="small dim" style={{ marginTop: 6 }}>
            One signature per bird, once. The grant lets the Sweeper do exactly one thing: move
            reward tokens from that satchel to whoever holds the bird, when they ask. It has no
            owner and no upgrade path, and the grant ends when the bird changes hands.
          </p>
          <div className="row" style={{ marginTop: 10, gap: 8 }}>
            <button
              type="button" className="btn btn--ghost btn--small"
              onClick={() => setTicked(new Set(deployedNotGranted.map((b) => b.id)))}
              disabled={tickedIds.length === deployedNotGranted.length}
            >
              Select all
            </button>
            {tickedIds.length ? (
              <button type="button" className="btn btn--ghost btn--small" onClick={() => setTicked(new Set())}>
                Clear
              </button>
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
          <div style={{ marginTop: 12 }}>
            <WriteGate onConnect={onConnect}>
              <button type="button" className="btn btn--small" disabled={busy || tx.busy || tickedIds.length === 0} onClick={doGrant}>
                {tickedIds.length === 0 ? 'Tick the birds to grant on'
                  : tickedIds.length === 1 ? `Grant on ${avianNumber(tickedIds[0])}, one signature`
                    : `Grant on ${formatCount(tickedIds.length)} birds, ${formatCount(tickedIds.length)} signatures`}
              </button>
            </WriteGate>
          </div>
        </div>
      ) : null}

      {/* ── 3. granted, and the sweep ─────────────────────────────────── */}
      <div style={{ marginTop: 18 }}>
        <div className="row">
          <h4 style={{ margin: 0 }}>Granted</h4>
          <span className="spacer" />
          <span className="tiny dim">{formatCount(granted.length)} of {formatCount(s.birds.length)}</span>
        </div>

        {granted.length === 0 ? (
          <p className="small dim" style={{ marginTop: 6 }}>
            None of your satchels has granted the Sweeper yet. Until one does, the reward tokens
            inside a bird move only when you move them, one bird at a time.
          </p>
        ) : (
          <>
            <p className="small dim" style={{ marginTop: 6 }}>
              What a sweep would move right now. A token that refuses to move (paused, or your
              wallet is on its blocklist) is skipped for that bird and stays inside it.
            </p>
            <div className="scroll-x" style={{ marginTop: 10 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Bird</th>
                    {s.tokens.map((t) => <th key={t.address} className="right">{t.symbol}</th>)}
                    <th className="right"><span className="sr-only">Revoke</span></th>
                  </tr>
                </thead>
                <tbody>
                  {granted.map((b) => (
                    <tr key={b.id}>
                      <td><span className="small strong">{avianNumber(b.id)}</span></td>
                      {s.tokens.map((t, j) => (
                        <td key={t.address} className="num">
                          {b.amounts[j] > 0n ? formatReward(b.amounts[j], t.decimals) : <span className="dim">0</span>}
                        </td>
                      ))}
                      <td>
                        <button
                          type="button" className="btn btn--ghost btn--small"
                          disabled={busy || tx.busy}
                          onClick={() => doRevoke(b)}
                        >
                          Revoke
                        </button>
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td><span className="label">Would move</span></td>
                    {s.tokens.map((t, j) => (
                      <td key={t.address} className="num">
                        {columnTotals[j] > 0n ? formatReward(columnTotals[j], t.decimals) : <span className="dim">0</span>}
                      </td>
                    ))}
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="row row--wrap" style={{ marginTop: 12, gap: 8 }}>
              <div className="field" style={{ flex: '1 1 260px' }}>
                <input
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addToken(); } }}
                  placeholder="Token address, 0x…"
                  aria-label="Add a token by address"
                  spellCheck={false}
                />
                <button
                  type="button" className="btn btn--small"
                  style={{ borderLeft: '1px solid var(--line-strong)' }}
                  disabled={!ADDRESS_RE.test(tokenInput.trim())}
                  onClick={addToken}
                >
                  Add
                </button>
              </div>
            </div>
            <p className="tiny dim" style={{ marginTop: 6 }}>
              The columns are the nest&rsquo;s listed reward tokens. A token that was listed once
              and is not any more can still sit in a satchel: add it by address and it is swept too.
            </p>

            <div style={{ marginTop: 14 }}>
              <WriteGate onConnect={onConnect}>
                <button type="button" className="btn btn--wide" disabled={busy || tx.busy || nothingToMove} onClick={doSweep}>
                  {nothingToMove
                    ? 'Nothing to collect right now'
                    : `Collect from ${readyIds.length === 1 ? avianNumber(readyIds[0]) : `${formatCount(readyIds.length)} birds`}`}
                </button>
              </WriteGate>
            </div>
            {nothingToMove ? (
              <p className="tiny dim" style={{ marginTop: 8 }}>
                Every granted satchel is empty in every token here. The button wakes when a settle
                delivers something into one of them.
              </p>
            ) : null}
          </>
        )}
      </div>

      {granted.length === 0 && deployedNotGranted.length === 0 && notDeployed.length === 0 ? (
        <div style={{ marginTop: 12 }}>
          <Box><span className="small dim">No birds in this wallet right now.</span></Box>
        </div>
      ) : null}
    </section>
  );
}

// ── the receipt ───────────────────────────────────────────────────────────

type Fmt = (token: string, amount: Amount) => string;

function sweepOutcome(r: SweepResult, fmt: Fmt): string {
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

function sweepRows(r: SweepResult, fmt: Fmt, symbolOf: (token: string) => { symbol: string }): TxRow[] {
  const rows: TxRow[] = r.totals.map((t) => ({ label: fmt(t.token, t.amount), value: 'swept to your wallet', tone: 'ok' as const }));
  // Skipped, said plainly and with the reason; never "failed" — the stock is
  // still in the bird. Token zero is the whole bird; otherwise one token of it.
  for (const k of r.skipped) {
    rows.push(k.token === null
      ? { label: avianNumber(k.id), value: 'skipped: not deployed or not granted', tone: 'warn' }
      : { label: `${avianNumber(k.id)}, ${symbolOf(k.token).symbol}`, value: 'skipped: would not move right now; still in the bird', tone: 'warn' });
  }
  return rows;
}

function sweepNote(r: SweepResult): string | undefined {
  const wholeBird = r.skipped.some((k) => k.token === null);
  const oneToken = r.skipped.some((k) => k.token !== null);
  if (wholeBird && oneToken) return 'A bird was passed over because its satchel is not deployed or has not granted the Sweeper, and a token would not move right now (paused, or your wallet is on its blocklist). Both are still in the birds; nothing was lost.';
  if (wholeBird) return 'A bird was passed over: its satchel is not deployed or has not granted the Sweeper (the grant ends when a bird changes hands). Deploy or grant above and sweep again.';
  if (oneToken) return 'A token would not move right now: the issuer has paused it, or your wallet is on its blocklist. It is still in the bird, and a later sweep will bring it when the token moves again.';
  return undefined;
}
