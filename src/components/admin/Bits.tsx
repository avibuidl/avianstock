// The pieces every section of the admin panel is built from.
//
// Three ideas, and the rest is layout:
//
//   1. A CONTROL always shows what the value is now, read live, beside the
//      field that changes it. A panel that offers a setter without showing the
//      current value is asking the owner to remember.
//   2. A FIELD validates against a number that was READ, never against a
//      literal. Every cap, floor and bound on this screen comes off a contract.
//   3. An IRREVERSIBLE action makes you type its name. Not a second click —
//      a second click is what a mis-click already is.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../Icon';
import { Note, Tag } from '../Primitives';
import { useTx } from '../Tx';
import { shortAddress } from '../../lib/format';
import type { OnPhase } from '../../mock';
import s from '../../screens/Admin.module.css';

// ── a control ─────────────────────────────────────────────────────────────

export function Control({
  title, now, children, note,
}: { title: string; now?: ReactNode; children?: ReactNode; note?: ReactNode }) {
  return (
    <div className={s.control}>
      <div className={s.controlHead}>
        <h4 className={s.controlTitle}>{title}</h4>
        {now !== undefined ? <span className={s.now}>{now}</span> : null}
      </div>
      {note ? <p className="tiny dim" style={{ margin: '8px 0 0' }}>{note}</p> : null}
      {children}
    </div>
  );
}

export function Field({
  label, value, onChange, placeholder, hint, wide, disabled, invalid,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; hint?: ReactNode; wide?: boolean;
  disabled?: boolean; invalid?: boolean;
}) {
  return (
    <label className={`${s.field}${wide ? ` ${s.fieldWide}` : ''}`}>
      <span className={s.label}>{label}</span>
      <span className={`field${invalid ? ' field--bad' : ''}`}>
        <input
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => onChange(e.target.value)}
        />
      </span>
      {hint ? <span className={`tiny dim ${s.hint}`}>{hint}</span> : null}
    </label>
  );
}

export function Toggle({
  label, checked, onChange, disabled,
}: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={s.field} style={{ flex: '0 0 auto' }}>
      <span className={s.label}>{label}</span>
      <button
        type="button"
        className={`select${checked ? ' select--on' : ''}`}
        aria-pressed={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      >
        <Icon name={checked ? 'check' : 'cross'} size={12} /> {checked ? 'Yes' : 'No'}
      </button>
    </label>
  );
}

export function Problem({ children }: { children: ReactNode }) {
  return <p className={s.bad}>{children}</p>;
}

/** Calldata, or anything else that must be visible and unreachable. */
export function ReadOnlyBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginTop: 12 }}>
      <span className={s.label}>{label}</span>
      <div className={s.calldata}>{children}</div>
    </div>
  );
}

// ── sending one ───────────────────────────────────────────────────────────

export type Action = {
  /** Distinguishes this button from the others while one is in flight. */
  key: string;
  label: string;
  run: (on: OnPhase) => Promise<unknown>;
  outcome?: (r: unknown) => string;
  /** Type-to-confirm. The word is the action's own name. */
  irreversible?: { word: string; consequence: ReactNode };
  disabled?: boolean;
  danger?: boolean;
};

export function useAdminActions() {
  const tx = useTx();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Action | null>(null);

  const fire = async (a: Action) => {
    setBusy(a.key);
    await tx.run(a.label, (on) => a.run(on), {
      outcome: a.outcome ? (r) => a.outcome!(r) : undefined,
    });
    setBusy(null);
  };

  const start = (a: Action) => {
    if (a.irreversible) setConfirming(a);
    else void fire(a);
  };

  return {
    busy,
    blocked: !!busy || tx.busy,
    start,
    confirmDialog: confirming ? (
      <ConfirmDialog
        action={confirming}
        onCancel={() => setConfirming(null)}
        onConfirm={() => { const a = confirming; setConfirming(null); void fire(a); }}
      />
    ) : null,
  };
}

export function ActionButton({
  action, actions, ghost,
}: {
  action: Action;
  actions: ReturnType<typeof useAdminActions>;
  ghost?: boolean;
}) {
  const cls = action.danger ? 'btn btn--danger btn--small'
    : ghost ? 'btn btn--ghost btn--small' : 'btn btn--small';
  return (
    <button
      type="button"
      className={cls}
      disabled={action.disabled || actions.blocked}
      onClick={() => actions.start(action)}
    >
      {actions.busy === action.key ? 'Sending…' : action.label}
    </button>
  );
}

/**
 * The five that cannot be undone.
 *
 * The dialog names what becomes impossible afterwards, in plain words, and
 * will not enable its button until the action's own name is typed. There is no
 * "advanced mode" anywhere that skips this.
 */
function ConfirmDialog({
  action, onConfirm, onCancel,
}: { action: Action; onConfirm: () => void; onCancel: () => void }) {
  const [typed, setTyped] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const word = action.irreversible!.word;

  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  // The dialog role goes on the DIALOG, not on the backdrop behind it.
  // `aria-modal` tells a screen reader that everything outside the element
  // carrying it is inert; on the scrim that is the whole page INCLUDING the
  // dialog, which is the opposite of what it should say.
  return (
    <div className={s.scrim}>
      <div className={s.dialog} role="dialog" aria-modal="true" aria-labelledby="confirm-h">
        <Tag tone="bad">Cannot be undone</Tag>
        <h3 id="confirm-h" style={{ fontSize: 19, marginTop: 12 }}>{action.label}</h3>
        <div style={{ marginTop: 12 }}>
          <Note tone="bad">{action.irreversible!.consequence}</Note>
        </div>
        <label className={s.field} style={{ marginTop: 18 }}>
          <span className={s.label}>Type {word} to confirm</span>
          <span className="field">
            <input
              ref={input}
              value={typed}
              spellCheck={false}
              autoComplete="off"
              onChange={(e) => setTyped(e.target.value)}
            />
          </span>
        </label>
        <div className="row" style={{ marginTop: 18, gap: 10 }}>
          <button type="button" className="btn btn--ghost btn--small" onClick={onCancel}>
            Cancel
          </button>
          <span className="spacer" />
          <button
            type="button"
            className="btn btn--danger btn--small"
            disabled={typed.trim() !== word}
            onClick={onConfirm}
          >
            {action.label}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── small formatters, shared by the sections ──────────────────────────────

/** An address as a text node, never as markup, and always the full one on hover. */
export function Addr({ value }: { value: string | null }) {
  if (!value) return <span className="dim">none</span>;
  return <span className="mono" title={value}>{shortAddress(value)}</span>;
}

/** 86,400 -> "24 hours". Seconds are what the contract takes; this is the gloss. */
export function seconds(n: number): string {
  if (n === 0) return 'none';
  const d = Math.floor(n / 86_400);
  if (d >= 1 && n % 86_400 === 0) return `${d} day${d === 1 ? '' : 's'}`;
  const h = Math.floor(n / 3_600);
  if (h >= 1 && n % 3_600 === 0) return `${h} hour${h === 1 ? '' : 's'}`;
  const m = Math.floor(n / 60);
  if (m >= 1 && n % 60 === 0) return `${m} minute${m === 1 ? '' : 's'}`;
  return `${n} seconds`;
}

/** A whole number typed into a field, or null when it is not one. */
export function whole(v: string): number | null {
  const clean = v.replace(/[\s,_]/g, '');
  if (!/^\d+$/.test(clean)) return null;
  const n = Number(clean); /* count */
  return Number.isSafeInteger(n) ? n : null;
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
export const isAddressish = (v: string): boolean => ADDRESS_RE.test(v.trim());

/** A comma or newline separated list of addresses, or null if any is malformed. */
export function addressList(v: string): `0x${string}`[] | null {
  const parts = v.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
  if (parts.length === 0 || parts.some((x) => !isAddressish(x))) return null;
  return parts as `0x${string}`[];
}
