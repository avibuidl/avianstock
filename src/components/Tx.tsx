// One transaction drawer for the whole site: waiting for your wallet →
// pending → confirmed → failed, with the human sentence and the smallest fix.
//
// Screens call `run()` and never build a message themselves; the sentence
// comes from the mock layer's `explain`, which is the only place one is written.

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react';
import { Icon } from './Icon';
import { Tag } from './Primitives';
import {
  ContractError, errorDetail, explain, refreshAll, type ExplainContext,
  type Hex, type OnPhase, type TxPhase,
} from '../mock';
import { handlersFor, runFix, type FixHandler, type FixHandlers } from '../lib/fixes';

export type { FixHandler, FixHandlers };

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
      /** The screen's fixes, by kind. See `lib/fixes.ts`. */
      onFix?: FixHandlers;
    },
  ) => Promise<T | undefined>;
  dismiss: () => void;
};

type Run = Parameters<Ctx['run']>;

const TxContext = createContext<Ctx | null>(null);

/**
 * `siteFixes` are the fixes no one screen owns: opening the trade modal for
 * "Get AVIAN", opening the wallet dialog for "Switch to Robinhood Chain".
 * The app supplies them once, and every screen's refusals get them.
 */
export function TxProvider({ children, siteFixes }: { children: ReactNode; siteFixes?: FixHandlers }) {
  const [state, setState] = useState<TxState>({ label: '', phase: 'idle' });
  const [ctx, setCtx] = useState<ExplainContext>({});
  const [fix, setFix] = useState<{ handler?: FixHandlers }>({});
  // The last write, so "Try again" can send it again exactly as it was: a
  // signature refused in the wallet, a deadline that passed while it waited.
  const last = useRef<Run | null>(null);

  const run: Ctx['run'] = useCallback(async (label, fn, opts) => {
    last.current = [label, fn, opts] as Run;
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

  // The drawer's own two: re-run the last write, and re-read every panel.
  // Last in the chain, so a screen that knows better goes first.
  const builtIn = useMemo<FixHandlers>(() => ({
    retry: () => { const l = last.current; if (l) void run(...l); },
    refresh: () => refreshAll(),
  }), [run]);

  const value = useMemo(() => ({ state, busy, run, dismiss }), [state, busy, run, dismiss]);

  return (
    <TxContext.Provider value={value}>
      {children}
      <TxDrawer state={state} ctx={ctx} onDismiss={dismiss} fixes={[fix.handler, siteFixes, builtIn]} />
    </TxContext.Provider>
  );
}

export function useTx(): Ctx {
  const c = useContext(TxContext);
  if (!c) throw new Error('useTx outside TxProvider');
  return c;
}

function TxDrawer({
  state, ctx, onDismiss, fixes,
}: { state: TxState; ctx: ExplainContext; onDismiss: () => void; fixes: (FixHandlers | undefined)[] }) {
  // A confirmed drawer goes on its own, three seconds after it lands, and
  // the pointer resting on it (or focus inside it) holds it; once they leave
  // it goes a second later. Nothing else goes by itself: in flight it is the
  // one sign the transaction exists, and a refusal carries the fix and the
  // decoded reason, which are there to be read and pressed.
  //
  // The pointer can already be on the spot when the drawer lands there (it
  // sat on the sell sheet's scrim, say), and no enter event reaches React
  // for that, so the timer asks the browser as well before it dismisses.
  const box = useRef<HTMLElement>(null);
  const [held, setHeld] = useState(false);
  const wasHeld = useRef(false);
  useEffect(() => {
    if (state.phase !== 'confirmed') { wasHeld.current = false; return; }
    if (held) { wasHeld.current = true; return; }
    let t: ReturnType<typeof setTimeout>;
    const arm = (ms: number) => {
      t = setTimeout(() => {
        if (box.current?.matches(':hover')) { wasHeld.current = true; arm(1000); return; }
        onDismiss();
      }, ms);
    };
    arm(wasHeld.current ? 1000 : 3000);
    return () => clearTimeout(t);
  }, [state.phase, held, onDismiss]);

  if (state.phase === 'idle') return null;

  const failed = state.phase === 'failed';
  const done = state.phase === 'confirmed';
  const e = failed ? explain(state.error, ctx) : null;
  // The button exists only when something will act on it.
  const handlers = e?.fix ? handlersFor(e.fix.kind, ...fixes) : [];
  // Broadcast but unconfirmed is not a refusal, and must not be dressed as
  // one: a red panel over the word "Refused" is what a person reads first,
  // and they would read it while the transaction was still in flight.
  const unresolved = !!e?.sent;

  return (
    <aside
      ref={box}
      className={`drawer${done ? ' drawer--ok' : ''}${failed && !unresolved ? ' drawer--bad' : ''}${unresolved ? ' drawer--waiting' : ''}`}
      role={failed ? 'alert' : 'status'}
      aria-live="polite"
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHeld(false); }}
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
          : done ? state.outcome ?? `${state.label}: done.`
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
              ? 'Nothing has been sent yet. Cancelling in your wallet costs nothing.'
              : 'Sent. Waiting for the chain to confirm it.'}
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
          <span className="label">Transaction</span>
          <span className="spacer" />
          <span className="mono tiny" style={{ color: 'var(--text)' }}>
            {state.hash.slice(0, 10)}…{state.hash.slice(-8)}
          </span>
        </div>
      ) : null}

      {failed ? (
        <>
          {e!.fix && handlers.length > 0 ? (
            <button
              type="button"
              className="btn btn--small"
              style={{ marginTop: 14 }}
              onClick={() => { onDismiss(); runFix(handlers, e!.fix!.amount, state.error); }}
            >
              {e!.fix.label}
            </button>
          ) : null}
          {state.detail ? (
            <div className="row" style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
              <span className="label">Decoded</span>
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
          {i < 2 ? <span className="tiny dim" style={{ margin: '0 4px' }} aria-hidden="true">/</span> : null}
        </span>
      ))}
    </div>
  );
}

export { ContractError };
