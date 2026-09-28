// Settle: deliver what birds have accrued, showing what will land first.
//
// `settle(ids)` is permissionless and nobody gains by it — a brooding bird's
// accrual can only reach its destination, an expired brood's can only reach
// its activator and the stream — so the site offers it wherever it shows a
// bird (HANDOVER section 5: "settle every bird you show"). It is a
// transaction the holder signs, so it is OFFERED, never sent on a page load:
// the streaming feel comes from `earned` shown as "unsettled" beside the
// delivered balance, which costs no gas.
//
// The moves come from `pending` — the same arithmetic the contract runs —
// and are shown before the wallet opens. The receipt afterwards is read for
// what actually happened: a `RewardHeld` inside a confirmed settle is a
// partial outcome, said as one.

import { useEffect, useState , type ReactNode } from 'react';
import { Box, Note } from './Primitives';
import { WriteGate } from './Wallet';
import { useTx, type TxRow } from './Tx';
import { formatReward, shortAddress } from '../lib/format';
import { avianNumber } from '../lib/format';
import {
  settle, simulateSettle, useAddress,
  type NestEvents, type SettleMove, type SettlePreview, type TokenId,
} from '../mock';

/** Receipt rows for whatever the Nest said. Shared with every write that can carry its events. */
export function nestRows(ev: NestEvents, symbolOf: (token: string) => { symbol: string; decimals: number }): TxRow[] {
  const rows: TxRow[] = [];
  const fmt = (token: string, amount: bigint) => {
    const m = symbolOf(token);
    return `${formatReward(amount, m.decimals)} ${m.symbol}`;
  };
  for (const e of ev.brooded) {
    rows.push({ label: `${avianNumber(e.id)}, tier ${e.tier}`, value: e.toWallet ? 'brooding, rewards to your wallet' : 'brooding, rewards to its satchel', tone: 'ok' });
  }
  for (const e of ev.upgraded) rows.push({ label: `${avianNumber(e.id)}`, value: `tier ${e.fromTier} to tier ${e.toTier}`, tone: 'ok' });
  for (const e of ev.redirected) rows.push({ label: `${avianNumber(e.id)}`, value: e.toWallet ? 'rewards now to your wallet' : 'rewards now to its satchel', tone: 'ok' });
  for (const e of ev.expired) rows.push({ label: `${avianNumber(e.id)}`, value: 'brooding ended: it changed hands', tone: 'warn' });
  for (const e of ev.settled) rows.push({ label: `${avianNumber(e.id)}, ${fmt(e.token, e.amount)}`, value: `to ${shortAddress(e.to)}`, tone: 'ok' });
  for (const e of ev.expirySettled) {
    if (e.toActivator > 0n) rows.push({ label: `${avianNumber(e.id)}, ${fmt(e.token, e.toActivator)}`, value: `to ${shortAddress(e.activator)}, earned before it moved`, tone: 'ok' });
    if (e.returned > 0n) rows.push({ label: `${avianNumber(e.id)}, ${fmt(e.token, e.returned)}`, value: 'returned to the stream', tone: 'dim' });
  }
  for (const e of ev.returned) rows.push({ label: fmt(e.token, e.amount), value: e.folded ? 'folded into the running stream' : 'released as surplus', tone: 'dim' });
  for (const e of ev.held) {
    rows.push(e.id === 0
      ? { label: fmt(e.token, e.amount), value: 'held for you; claim it from the nest', tone: 'warn' }
      : { label: `${avianNumber(e.id)}, ${fmt(e.token, e.amount)}`, value: 'not transferable now; still owed to the bird', tone: 'warn' });
  }
  for (const e of ev.paid) rows.push({ label: fmt(e.token, e.amount), value: `paid to ${shortAddress(e.user)}`, tone: 'ok' });
  for (const id of ev.hookFailed) rows.push({ label: avianNumber(id), value: 'nest hook failed: its brood did not end on chain', tone: 'warn' });
  return rows;
}

/** The footnote a settle receipt carries when it was not a plain delivery. */
export function nestNote(ev: NestEvents): string | undefined {
  const heldForYou = ev.held.some((h) => h.id === 0);
  const heldForBird = ev.held.some((h) => h.id !== 0);
  const split = ev.expirySettled.length > 0;
  if (ev.hookFailed.length) return 'A transfer hook into the nest failed. That brood is still open on chain and will expire on the next settle the contract sees as a change of hands. Tell the operator.';
  if (heldForYou) return 'A reward token refused your wallet. The amount is held for you and nothing is lost. Claim it from the nest page once the token moves again.';
  if (heldForBird) return 'A reward token is not transferable right now. The amount is still owed to the bird and will land on a later settle.';
  if (split) return 'This bird had changed hands. What it earned before that went to the wallet that brooded it; what the stream allotted after went back to the stream. The new holder broods afresh.';
  return undefined;
}

export function SettleControl({
  ids, label, symbolOf, onConnect, onDone, ghost, disabled, compact, autoPreview, extra, settleLabel,
}: {
  ids: TokenId[];
  label: string;
  symbolOf: (token: string) => { symbol: string; decimals: number };
  onConnect: () => void;
  onDone?: () => void;
  ghost?: boolean;
  disabled?: boolean;
  /** The site's compact CTA size (the homepage Bird Engine's), for a press that sits in a line of text. */
  compact?: boolean;
  /** Open on the preview, no first press: the settle sheet on My Nest (2026-09-27). */
  autoPreview?: boolean;
  /** One more press beside Settle in the preview: "Send to my wallet" or "Send to its satchel" (2026-09-28). */
  extra?: ReactNode;
  /** The settle press's own words in the preview, "Settle to its satchel"; "Settle" without. */
  settleLabel?: string;
}) {
  const tx = useTx();
  const who = useAddress();
  const [preview, setPreview] = useState<SettlePreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [busy, setBusy] = useState(false);

  const doPreview = async () => {
    if (!who) return;
    setPreviewing(true);
    try { setPreview(await simulateSettle(who, ids)); } catch { setPreview({ ids: [], moves: [] }); }
    setPreviewing(false);
  };
  useEffect(() => { if (autoPreview) void doPreview(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const doSettle = async () => {
    if (!preview) return;
    setBusy(true);
    await tx.run(`Settling ${preview.ids.length === 1 ? avianNumber(preview.ids[0]) : `${preview.ids.length} birds`}`,
      (on) => settle(preview.ids, on), {
        outcome: (r) => {
          const ev = (r as { events: NestEvents }).events;
          const n = ev.settled.length + ev.expirySettled.length + ev.paid.length;
          return n === 0 ? 'Nothing was owed. Nothing moved.' : 'Settled.';
        },
        rows: (r) => nestRows((r as { events: NestEvents }).events, symbolOf),
        note: (r) => nestNote((r as { events: NestEvents }).events),
      });
    setPreview(null);
    setBusy(false);
    onDone?.();
  };

  const moveLine = (m: SettleMove) => {
    const amt = `${formatReward(m.amount, m.token.decimals)} ${m.token.symbol}`;
    const where = m.kind === 'to-satchel' ? `to ${avianNumber(m.id)}’s satchel`
      : m.kind === 'to-wallet' ? 'to your wallet'
        : m.kind === 'to-activator' ? `to ${shortAddress(m.to)}, earned before it moved`
          : 'back to the stream';
    return `${avianNumber(m.id)}: ${amt} ${where}`;
  };

  if (preview === null) {
    return (
      <WriteGate onConnect={onConnect}>
        <button
          type="button"
          className={`btn ${compact ? 'btn--compact' : 'btn--small'}${ghost ? ' btn--ghost' : ''}`}
          disabled={disabled || previewing || ids.length === 0}
          onClick={doPreview}
        >
          {previewing ? 'Checking what would land…' : label}
        </button>
      </WriteGate>
    );
  }

  return (
    <Box tone={preview.moves.length ? 'accent' : undefined}>
      {preview.moves.length === 0 ? (
        <Note>
          <span className="small">Nothing to deliver yet. Nothing has accrued since the last settle.</span>
        </Note>
      ) : (
        <>
          <p className="small strong" style={{ margin: 0 }}>Settling now would move:</p>
          <ul className="txrows" style={{ marginTop: 8 }}>
            {preview.moves.map((m, i) => <li key={i}><span className="small">{moveLine(m)}</span></li>)}
          </ul>
          <p className="tiny dim" style={{ margin: '8px 0 0' }}>
            Read from the nest this block. The receipt afterwards is what actually happened.
          </p>
        </>
      )}
      <div className="row row--wrap" style={{ gap: 8, marginTop: 12 }}>
        {preview.moves.length ? (
          <WriteGate onConnect={onConnect}>
            <button type="button" className="btn btn--small" disabled={busy || tx.busy} onClick={doSettle}>
              {settleLabel ?? 'Settle'}
            </button>
          </WriteGate>
        ) : null}
        {extra}
        <button type="button" className="btn btn--ghost btn--small" onClick={() => setPreview(null)}>
          {preview.moves.length ? 'Cancel' : 'Close'}
        </button>
      </div>
    </Box>
  );
}
