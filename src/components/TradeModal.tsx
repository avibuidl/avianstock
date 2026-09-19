// Buying and selling AVIANS, without leaving the mint.
//
// COMPACT ON PURPOSE. Every explanation has been taken out of this modal —
// what slippage is, how Permit2 works, where the fees go, the itemised pool and
// hook lines. What is left is figures, the controls that change them, and the
// reasons a trade is refused. The Docs page is where the mechanism is
// explained; this is where a trade is made.
//
// WHAT DID NOT COME OUT, and the one judgement in this file. Inside the launch
// window a buy pays an extra fee that starts near 24% and decays to nothing
// over five minutes, so the same ETH buys materially more a minute later. That
// figure is one line, it moves every second, and without it the modal would
// quote a 25% trade and a 1.5% trade in exactly the same words. It stays, as a
// single line rather than a banner.
//
// THE QUOTE IS NET. `amountOut` already has every fee taken out of it — the
// quoter runs the real swap, hook included — so "you pay X, you receive Y" is
// the whole cost with nothing hidden behind it, which is what makes dropping
// the itemisation survivable.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';
import { Box, Note, Tag } from './Primitives';
import { useTx, type FixHandlers } from './Tx';
import {
  avians, formatAvians, formatBps, formatCountdown, formatEth, parseAvians,
} from '../lib/format';
import { poolPhase } from '../lib/pool-phase';
import {
  CAP_MARGIN_BPS, approveAviansForPermit2, approvePermit2ForRouter, overCap,
  quoteSwap, swap, useNow, useSwapState, ContractError, explain,
  type Amount, type OnPhase, type SwapQuote, type SwapState,
} from '../mock';
import s from './TradeModal.module.css';

/** Never zero, which is no check at all, and never unbounded. */
const SLIPPAGE_CHOICES = [10, 50, 100, 300] as const;
const DEFAULT_SLIPPAGE_BPS = 50;

type Direction = 'buy' | 'sell';

export function TradeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const tx = useTx();
  // Read once at page load, as it always was, so the modal opens on figures
  // it already has, with nothing to wait for; polled only while it is open,
  // and not during a transaction. Opening it asks for a fresh read, and the
  // last one stays on screen until that lands. `readAt` is the wall clock at
  // the read, which with `chainNow` is the skew the modal's clock runs on.
  const state = useSwapState({ paused: !open || tx.busy });
  const { reload } = state;
  useEffect(() => { if (open) reload(); }, [open, reload]);
  const [direction, setDirection] = useState<Direction>('buy');
  const [typed, setTyped] = useState('');
  const [slippageBps, setSlippageBps] = useState<number>(DEFAULT_SLIPPAGE_BPS);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => { if (open) dialog.current?.focus(); }, [open]);

  if (!open) return null;

  return (
    <div className={s.scrim} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        className={s.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="trade-h"
        tabIndex={-1}
        ref={dialog}
      >
        <div className="row">
          <h3 id="trade-h" style={{ fontSize: 18 }}>Trade AVIANS</h3>
          <span className="spacer" />
          <button type="button" className="btn btn--ghost btn--small" onClick={onClose} aria-label="Close">
            <Icon name="cross" size={14} />
          </button>
        </div>

        {/* The first read has not landed: nothing, rather than a notice. */}
        {state.data ? (
          <Body
            state={state.data}
            readAt={state.readAt ?? Math.floor(Date.now() / 1000)}
            reload={reload}
            direction={direction}
            setDirection={(d) => { setDirection(d); setTyped(''); }}
            typed={typed}
            setTyped={setTyped}
            slippageBps={slippageBps}
            setSlippageBps={setSlippageBps}
          />
        ) : state.error ? (
          <div style={{ marginTop: 16 }}>
            <Box tone="bad">
              <Note tone="bad"><strong className="strong">The pool could not be read.</strong></Note>
              <button type="button" className="btn btn--ghost btn--small" style={{ marginTop: 10 }} onClick={reload}>
                Try again
              </button>
            </Box>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ── the body ──────────────────────────────────────────────────────────────

function Body({
  state, readAt, reload, direction, setDirection, typed, setTyped, slippageBps, setSlippageBps,
}: {
  state: SwapState;
  /** Wall clock, seconds, when `state` was read. */
  readAt: number;
  reload: () => void;
  direction: Direction;
  setDirection: (d: Direction) => void;
  typed: string;
  setTyped: (v: string) => void;
  slippageBps: number;
  setSlippageBps: (v: number) => void;
}) {
  const tx = useTx();
  const wall = useNow(1000);
  // THE CHAIN'S CLOCK. `state.chainNow` is the block timestamp the state was
  // read at and `readAt` the wall clock at that moment; the difference is the
  // skew, and every second shown here is the wall clock corrected by it. On
  // the launch dry run the fork ran eleven minutes ahead of the machine and
  // the banner counted a window that had already closed.
  const now = wall + (state.chainNow - readAt);
  const buy = direction === 'buy';

  // Launched, on the clock, not on the last read: `isLaunched` on chain is
  // `block.timestamp >= LAUNCH_AT` and this is the same test on the same
  // clock, so the button opens the second the countdown ends rather than at
  // the next read. The five-minute window after it is the buyer's to wait out
  // or not: the fee line says what a buy pays now.
  const phase = poolPhase(state, now);
  const launched = phase !== 'before';
  const inWindow = phase === 'window';
  const secondsLeft = Math.max(0, state.windowEndsAt - now);

  // The moment the pool opens: read it again, so the fee and `isLaunched`
  // are the chain's, and the quote below is asked again.
  const wasLaunched = useRef(launched);
  useEffect(() => {
    if (launched && !wasLaunched.current) reload();
    wasLaunched.current = launched;
  }, [launched, reload]);

  const amountIn = useMemo<Amount | null>(() => {
    if (typed.trim() === '') return null;
    try { return parseAvians(typed); } catch { return null; }
  }, [typed]);

  const balance = buy ? state.ethBalance : state.aviansBalance;
  const short = amountIn !== null && amountIn > balance;

  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  /** The quote's refusal, decoded — `BuyTooLarge` inside the window is the one worth reading. */
  const [quoteFailed, setQuoteFailed] = useState<unknown>(null);

  // Re-quote on every change, and once a second inside the launch window where
  // the fee decays. The timer stops when the window ends: after that the fee is
  // flat and a request per second would ask the same question again.
  const requote = useCallback(async () => {
    if (amountIn === null || amountIn === 0n) { setQuote(null); setQuoteFailed(null); return; }
    setQuoting(true);
    try {
      setQuote(await quoteSwap(direction, amountIn, slippageBps));
      setQuoteFailed(null);
    } catch (e) {
      setQuote(null);
      setQuoteFailed(e ?? new Error('the quote failed'));
    }
    setQuoting(false);
  }, [amountIn, direction, slippageBps]);

  useEffect(() => { void requote(); }, [requote, launched]);
  useEffect(() => {
    if (!inWindow || amountIn === null) return undefined;
    const t = setInterval(() => { void requote(); }, 1000);
    return () => clearInterval(t);
  }, [inWindow, amountIn, requote]);

  const cap = quote ? overCap(quote, state, now) : { over: false, ceiling: state.maxBuyPerTx };

  const needsErc20 = !buy && amountIn !== null && state.allowanceToPermit2 < amountIn;
  const needsPermit2 = !buy && amountIn !== null && !needsErc20
    && (state.permit2ToRouter < amountIn || state.permit2Expiration <= now);

  const [busy, setBusy] = useState<string | null>(null);
  const blocked = !!busy || tx.busy;

  // The drawer's fixes this modal owns. The handler runs later than the
  // render that made it, so what it needs is read through refs.
  const latest = useRef({ amountIn, needsErc20, needsPermit2, requote });
  latest.current = { amountIn, needsErc20, needsPermit2, requote };
  const onFix: FixHandlers = {
    // "Split it": the buy crossed the opening window's per-transaction cap.
    // Half the amount, re-quoted; the button is theirs to press again. Any
    // other retry (the quote moved, the deadline passed) is the drawer's re-run.
    retry: (_amount, error) => {
      const l = latest.current;
      if (error instanceof ContractError && error.errorName === 'BuyTooLarge' && l.amountIn !== null) {
        setTyped(buy ? formatEth(l.amountIn / 2n, 6) : formatAvians(l.amountIn / 2n));
        return true;
      }
      if (error instanceof ContractError && (error.errorName === 'V4TooLittleReceived' || error.errorName === 'PartialFill')) {
        void l.requote();
        return true;
      }
      return false;
    },
    // A sell refused for want of an allowance: the step that is outstanding.
    approve: () => {
      const l = latest.current;
      if (l.amountIn === null) return false;
      if (l.needsErc20) { void go('erc20', 'Approving AVIANS to Permit2', (on) => approveAviansForPermit2(l.amountIn!, on), () => 'Approved. One more step, then the swap.'); return true; }
      if (l.needsPermit2) { void go('permit2', 'Allowing the router to spend through Permit2', (on) => approvePermit2ForRouter(l.amountIn!, on), () => 'Allowed. The swap can go through now.'); return true; }
      return false;
    },
  };

  const go = async (
    key: string, label: string,
    fn: (on: OnPhase) => Promise<unknown>,
    outcome?: (r: unknown) => string,
  ) => {
    setBusy(key);
    await tx.run(label, fn, { outcome, onFix });
    setBusy(null);
  };

  const inUnit = (v: Amount) => (buy ? `${formatEth(v)} ETH` : avians(v));
  const outUnit = (v: Amount) => (buy ? avians(v) : `${formatEth(v)} ETH`);

  return (
    <>
      {/* Not tradeable at all yet: a countdown, not an error. */}
      {!launched ? (
        <p className={s.state}>
          <Icon name="clock" size={12} /> The pool opens in{' '}
          <span className="mono">{formatCountdown(state.launchAt - now)}</span>
        </p>
      ) : null}

      <div className={s.tabs} role="tablist" aria-label="Direction">
        {(['buy', 'sell'] as const).map((d) => (
          <button
            key={d}
            type="button"
            role="tab"
            aria-selected={direction === d}
            className={`${s.tab}${direction === d ? ` ${s.tabOn}` : ''}`}
            onClick={() => setDirection(d)}
          >
            {d === 'buy' ? 'Buy' : 'Sell'}
          </button>
        ))}
      </div>

      <div className={s.field}>
        <div className={s.fieldHead}>
          <span className={s.label}>{buy ? 'You pay, ETH' : 'You sell, AVIANS'}</span>
          <span className="spacer" />
          <span className="tiny dim mono">{inUnit(balance)}</span>
        </div>
        {/* MAX sits inside the box, at its right edge — the balance is directly
            above it, so the two read as one control. */}
        <span className={`field${typed !== '' && amountIn === null ? ' field--bad' : ''}`}>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={buy ? '0.05' : '100,000'}
            inputMode="decimal"
            spellCheck={false}
            autoComplete="off"
          />
          <button
            type="button"
            className={s.maxBtn}
            disabled={balance === 0n}
            onClick={() => setTyped(buy ? formatEth(balance, 6) : formatAvians(balance))}
          >
            Max
          </button>
        </span>
      </div>

      {short ? <p className={s.bad}>More than you have.</p> : null}
      {typed !== '' && amountIn === null ? <p className={s.bad}>Not a number.</p> : null}

      <div className={s.slippage}>
        <span className={s.label}>Slippage</span>
        <div className="row row--wrap" style={{ gap: 6, marginTop: 5 }}>
          {SLIPPAGE_CHOICES.map((c) => (
            <button
              key={c}
              type="button"
              className={`select select--tight${slippageBps === c ? ' select--on' : ''}`}
              aria-pressed={slippageBps === c}
              onClick={() => setSlippageBps(c)}
            >
              {formatBps(c)}
            </button>
          ))}
        </div>
      </div>

      {/*
        THE ONE LINE THAT STAYED. It is the difference between a 25% trade and a
        1.5% one, and it changes every second — with it gone, both would read
        identically. Shown for buys only, because only buys pay it.
      */}
      {inWindow && buy ? (
        <p className={s.window}>
          <Icon name="warn" size={12} />
          Opening fee{' '}
          <strong className="strong">{formatBps(Math.max(0, state.buyFeeBps - state.sellFeeBps))}</strong>,
          falling to nothing in <span className="mono">{formatCountdown(secondsLeft)}</span>
        </p>
      ) : null}

      {quoteFailed ? (
        <div className={s.result}>
          <div className="row">
            <span className="small" style={{ color: 'var(--refusal)' }}>
              {quoteFailed instanceof ContractError && quoteFailed.errorName !== 'Unknown'
                ? explain(quoteFailed).title
                : 'The pool did not answer.'}
            </span>
            <span className="spacer" />
            <button type="button" className="btn btn--ghost btn--small" onClick={() => void requote()}>
              Again
            </button>
          </div>
          {quoteFailed instanceof ContractError && quoteFailed.errorName !== 'Unknown' ? (
            <p className="tiny dim" style={{ marginTop: 6 }}>{explain(quoteFailed).sentence}</p>
          ) : null}
        </div>
      ) : quote ? (
        <div className={s.result}>
          <div className={s.line}>
            <span className="small dim">You receive</span>
            <span className="spacer" />
            <span className="mono" style={{ color: 'var(--text-strong)', fontSize: 15 }}>
              {outUnit(quote.amountOut)}
            </span>
          </div>
          <div className={s.line}>
            <span className="tiny dim">At least</span>
            <span className="spacer" />
            <span className="mono tiny">{outUnit(quote.minOut)}</span>
          </div>
        </div>
      ) : quoting ? (
        <p className={s.state}>Quoting…</p>
      ) : null}

      {cap.over ? (
        <p className={s.bad}>
          More than the {avians(state.maxBuyPerTx)} one transaction may buy during the opening
          window. The site stops {formatBps(CAP_MARGIN_BPS)} short of the cap, because the figure
          above is an estimate.
        </p>
      ) : null}

      {needsErc20 || needsPermit2 ? (
        <div className={s.steps}>
          <StepRow
            n={1}
            done={!needsErc20}
            label="Approve AVIANS to Permit2"
            busy={busy === 'erc20'}
            disabled={blocked || amountIn === null || !needsErc20}
            onClick={() => go('erc20', 'Approving AVIANS to Permit2',
              (on) => approveAviansForPermit2(amountIn!, on),
              () => 'Approved. One more step, then the swap.')}
          />
          <StepRow
            n={2}
            done={!needsErc20 && !needsPermit2}
            label="Allow the router to spend it"
            busy={busy === 'permit2'}
            disabled={blocked || amountIn === null || needsErc20 || !needsPermit2}
            onClick={() => go('permit2', 'Allowing the router to spend through Permit2',
              (on) => approvePermit2ForRouter(amountIn!, on),
              () => 'Allowed. The swap can go through now.')}
          />
        </div>
      ) : null}

      <button
        type="button"
        className="btn btn--wide"
        style={{ marginTop: 14 }}
        disabled={
          blocked || !quote || short || cap.over || needsErc20 || needsPermit2
          || !launched || amountIn === null
        }
        onClick={() => go(
          'swap',
          buy ? `Buying AVIANS with ${formatEth(amountIn!)} ETH` : `Selling ${avians(amountIn!)}`,
          (on) => swap(direction, amountIn!, quote!.minOut, on),
          () => (buy
            ? `Bought at least ${avians(quote!.minOut)}.`
            : `Sold for at least ${formatEth(quote!.minOut)} ETH.`),
        )}
      >
        {busy === 'swap' ? 'Swapping…'
          : !launched ? 'The pool has not opened'
            : buy ? 'Buy AVIANS' : 'Sell AVIANS'}
      </button>
    </>
  );
}

function StepRow({
  n, done, label, busy, disabled, onClick,
}: { n: number; done: boolean; label: string; busy: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <div className="row" style={{ gap: 8 }}>
      <span className="numbox" aria-hidden="true">{n}</span>
      <span className="tiny">{label}</span>
      <span className="spacer" />
      {done ? <Tag tone="ok">Done</Tag> : (
        <button type="button" className="btn btn--small" disabled={disabled} onClick={onClick}>
          {busy ? 'Sending…' : 'Approve'}
        </button>
      )}
    </div>
  );
}
