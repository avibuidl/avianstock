// One transaction drawer for the whole site: waiting for your wallet →
// pending → confirmed → failed, with the human sentence and the smallest fix.
//
// Screens call `run()` and never build a message themselves; the sentence
// comes from the mock layer's `explain`, which is the only place one is written.

import {
  createContext, useCallback, useContext, useMemo, useState, type ReactNode,
} from 'react';
import { Icon } from './Icon';
import { Tag } from './Primitives';
import {
  ContractError, errorDetail, explain, type ExplainContext, type FixKind,
  type Hex, type OnPhase, type TxPhase,
} from '../mock';

/**
 * A batch call can succeed while part of what was asked for did not happen, so
 * one sentence is not always the whole outcome. A screen that has a per-item
 * result supplies these rows and the drawer lists them; every other write
 * carries none and is unchanged.
 */
export type TxRow = {
  label: string;
  value: string;
  /** ok = it happened, warn = it did not, dim = there was nothing to do. */
  tone: 'ok' | 'warn' | 'dim';
};

export type TxState = {
  label: string;
  phase: TxPhase | 'idle' | 'failed';
  hash?: Hex;
  error?: unknown;
  detail?: string;
  /** What arrived, in a sentence the screen supplies. */
  outcome?: string;
  /** The same thing item by item, when one sentence cannot carry it. */
  rows?: TxRow[];
  /** A footnote under those rows — what a collector should do about them. */
  note?: string;
};

type FixHandler = (kind: FixKind, amount?: bigint) => void;

type Ctx = {
  state: TxState;
  busy: boolean;
  run: <T>(
    label: string,
    fn: (on: OnPhase) => Promise<T>,
    opts?: {
      context?: ExplainContext;
      outcome?: (r: T) => string;
      rows?: (r: T) => TxRow[];
      note?: (r: T) => string | undefined;
      onFix?: FixHandler;
    },
  ) => Promise<T | undefined>;
  dismiss: () => void;
};

const TxContext = createContext<Ctx | null>(null);

export function TxProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TxState>({ label: '', phase: 'idle' });
  const [ctx, setCtx] = useState<ExplainContext>({});
  const [fix, setFix] = useState<{ handler?: FixHandler }>({});

  const run: Ctx['run'] = useCallback(async (label, fn, opts) => {
    setCtx(opts?.context ?? {});
    setFix({ handler: opts?.onFix });
    setState({ label, phase: 'signing' });
    try {
      const result = await fn((phase, hash) => setState((s) => ({ ...s, phase, hash: hash ?? s.hash })));
      // CONFIRMED. Nothing below may unmake that.
      //
      // These three are the caller's own formatters, and they used to run
      // inside this try — so a mistake in one turned a transaction that had
      // landed into "that didn't go through and nothing was taken". The label
      // on its own is still true without them.
      let outcome: string | undefined;
      let rows: TxRow[] | undefined;
      let note: string | undefined;
      try {
        outcome = opts?.outcome?.(result);
        rows = opts?.rows?.(result);
        note = opts?.note?.(result);
      } catch { /* the heading falls back to `${label} — done.` */ }
      setState((s) => ({ ...s, phase: 'confirmed', outcome, rows, note }));
      return result;
    } catch (e) {
      setState((s) => ({ ...s, phase: 'failed', error: e, detail: errorDetail(e) ?? undefined }));
      return undefined;
    }
  }, []);

  const dismiss = useCallback(() => setState({ label: '', phase: 'idle' }), []);
  const busy = state.phase === 'signing' || state.phase === 'pending';

  const value = useMemo(() => ({ state, busy, run, dismiss }), [state, busy, run, dismiss]);

  return (
    <TxContext.Provider value={value}>
      {children}
      <TxDrawer state={state} ctx={ctx} onDismiss={dismiss} onFix={fix.handler} />
    </TxContext.Provider>
  );
}

export function useTx(): Ctx {
  const c = useContext(TxContext);
  if (!c) throw new Error('useTx outside TxProvider');
  return c;
}

function TxDrawer({
  state, ctx, onDismiss, onFix,
}: { state: TxState; ctx: ExplainContext; onDismiss: () => void; onFix?: FixHandler }) {
  if (state.phase === 'idle') return null;

  const failed = state.phase === 'failed';
  const done = state.phase === 'confirmed';
  const e = failed ? explain(state.error, ctx) : null;
  // Broadcast but unconfirmed is not a refusal, and must not be dressed as
  // one: a red panel over the word "Refused" is what a person reads first,
  // and they would read it while the transaction was still in flight.
  const unresolved = !!e?.sent;

  return (
    <aside
      className={`drawer${done ? ' drawer--ok' : ''}${failed && !unresolved ? ' drawer--bad' : ''}${unresolved ? ' drawer--waiting' : ''}`}
      role={failed ? 'alert' : 'status'}
      aria-live="polite"
    >
      <div className="row">
        {unresolved ? <Tag tone="hot">Sent</Tag>
          : failed ? <Tag tone="bad">Refused</Tag>
            : done ? <Tag tone="ok">Confirmed</Tag>
              : <Tag tone="accent">{state.phase === 'signing' ? 'Your wallet' : 'Pending'}</Tag>}
        <span className="spacer" />
        <button type="button" className="btn btn--ghost btn--small" onClick={onDismiss} aria-label="Dismiss">
          <Icon name="cross" size={14} />
        </button>
      </div>

      {!failed && !done ? <Phases phase={state.phase as TxPhase} /> : null}

      <h4 style={{ marginTop: 14 }}>
        {failed ? e!.title
          : done ? state.outcome ?? `${state.label} — done.`
            : state.phase === 'signing' ? 'Waiting for your wallet.' : `${state.label}…`}
      </h4>

      {/*
        A confirmed transaction says what it did in the heading above — the
        caller's `outcome` sentence — and any rows below. There is nothing left
        for a second line to add, so it does not draw one.
      */}
      {done ? null : (
        <p className="small" style={{ marginTop: 8 }}>
          {failed ? e!.sentence
            : state.phase === 'signing'
              ? 'Nothing has been sent yet. Cancelling here costs nothing.'
              : 'Sent. We are not going to guess how long it takes.'}
        </p>
      )}

      {done && state.rows?.length ? (
        <ul className="txrows">
          {state.rows.map((r) => (
            <li key={r.label}>
              <Icon
                name={r.tone === 'ok' ? 'check' : r.tone === 'warn' ? 'warn' : 'minus'}
                size={13}
                color={r.tone === 'ok' ? 'var(--confirm)' : r.tone === 'warn' ? 'var(--attention)' : 'var(--text-dim)'}
              />
              <span className="small">{r.label}</span>
              <span className="spacer" />
              <span className={`mono tiny${r.tone === 'dim' ? ' dim' : ''}`}>{r.value}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {done && state.note ? (
        <p className="tiny dim" style={{ marginTop: 10 }}>{state.note}</p>
      ) : null}

      {state.hash ? (
        <div className="row" style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
          <span className="tiny dim">TRANSACTION</span>
          <span className="spacer" />
          <span className="mono tiny" style={{ color: 'var(--text)' }}>
            {state.hash.slice(0, 10)}…{state.hash.slice(-8)}
          </span>
        </div>
      ) : null}

      {failed ? (
        <>
          {e!.fix && onFix ? (
            <button
              type="button"
              className="btn btn--small"
              style={{ marginTop: 14 }}
              onClick={() => { onFix(e!.fix!.kind, e!.fix!.amount); onDismiss(); }}
            >
              {e!.fix.label}
            </button>
          ) : null}
          {state.detail ? (
            <div className="row" style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
              <span className="tiny dim">DECODED</span>
              <span className="spacer" />
              <span className="mono tiny dim">{state.detail}</span>
            </div>
          ) : null}
          {e!.sent ? null : (
            <p className="tiny dim" style={{ marginTop: 10 }}>
              Nothing was taken.
            </p>
          )}
        </>
      ) : null}
    </aside>
  );
}

function Phases({ phase }: { phase: TxPhase }) {
  const at = phase === 'signing' ? 0 : phase === 'pending' ? 1 : 2;
  return (
    <div className="steps" style={{ marginTop: 14 }} aria-hidden="true">
      {['Your wallet', 'Pending', 'Confirmed'].map((label, i) => (
        <span key={label} className="row" style={{ gap: 6 }}>
          <span className={`steps__dot${i === at ? ' steps__dot--on' : i < at ? ' steps__dot--done' : ''}`} />
          <span className="tiny" style={{ color: i <= at ? 'var(--text)' : 'var(--text-dim)' }}>{label}</span>
          {i < 2 ? <span className="tiny dim" style={{ margin: '0 4px' }}>→</span> : null}
        </span>
      ))}
    </div>
  );
}

export { ContractError };
