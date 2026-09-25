// What components subscribe to.
//
// One hook per domain, each a thin wrapper over a read plus two invalidation
// signals: a write landed, or the scenario changed. When the reads become
// chain calls, the hooks keep their names and their shapes.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type {
  Amount, Connection, CouncilState, FlywheelSnapshot, SeatState, PriceBoard, RoostState, StakingState, SwapState,
} from './types';
import * as reads from './source';
import { onWrite } from './source';
import { connection, onConnectionChanged } from './source';
import { subscribeScenario } from './scenario';

// ── invalidation ──────────────────────────────────────────────────────────

let nonce = 0;
const listeners = new Set<() => void>();
const bump = () => { nonce++; listeners.forEach((l) => l()); };

onWrite(bump);
subscribeScenario(bump);

function subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function useRefreshNonce(): number {
  return useSyncExternalStore(subscribe, () => nonce, () => 0);
}
export function refreshAll() { bump(); }

// ── the async shape every panel renders ───────────────────────────────────

export type Async<T> = {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  reload: () => void;
};

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): Async<T> {
  const [state, setState] = useState<{ data?: T; error?: unknown; loading: boolean }>({ loading: true });
  const [local, setLocal] = useState(0);
  const n = useRefreshNonce();
  const latest = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    const call = ++latest.current;
    setState((s) => ({ ...s, loading: true, error: undefined }));
    let alive = true;
    fnRef.current().then(
      (data) => { if (alive && call === latest.current) setState({ data, loading: false }); },
      (error) => { if (alive && call === latest.current) setState({ error, loading: false }); },
    );
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n, local]);

  const reload = useCallback(() => setLocal((v) => v + 1), []);
  return { ...state, reload } as Async<T>;
}

// ── the connection ────────────────────────────────────────────────────────

export function useConnection(): Connection {
  const [c, setC] = useState<Connection>(() => connection());
  useEffect(() => onConnectionChanged(setC), []);
  const n = useRefreshNonce();
  useEffect(() => { setC(connection()); }, [n]);
  return c;
}

export function useAddress(): `0x${string}` | null {
  const c = useConnection();
  return c.status === 'connected' ? c.address : null;
}

// ── one hook per domain ───────────────────────────────────────────────────

export const useCollection = () => useAsync(() => reads.getCollection(), []);
export const useLaunch = () => useAsync(() => reads.getLaunch(), []);
export const usePerch = () => useAsync(() => reads.getPerch(), []);
export const useVault = () => useAsync(() => reads.getVault(), []);
export const useTreasury = () => useAsync(() => reads.getTreasury(), []);
export const useDeployment = () => useAsync(() => reads.getDeployment(), []);
export const useSupply = () => useAsync(() => reads.getSupply(), []);
export const useRewardSplit = () => useAsync(() => reads.getRewardSplit(), []);
/**
 * The flywheel snapshot (2026-09-22): the landing page's live figures, and the
 * Nest's "paid to brooders, ever" line, from one read at one block, on the
 * Roost screen's quiet timer.
 */
export function useFlywheel(o: PollOptions = {}): Polled<FlywheelSnapshot> {
  return usePolled(() => reads.getFlywheel(), [], o);
}
/**
 * The council (2026-09-24): the second key's card, on the public site and at
 * the foot of the Owner page. Polled, so a pending change's countdown and the
 * moment it lands are both on screen without a reload.
 */
export function useCouncil(o: PollOptions = {}): Polled<CouncilState> {
  return usePolled(() => reads.getCouncil(), [], o);
}
/**
 * The owner's seat (2026-09-24): the six owned seats' clocks and proposals,
 * for the "Your seat" control on the Owner page.
 */
export function useSeat(o: PollOptions = {}): Polled<SeatState> {
  return usePolled(() => reads.getSeat(), [], o);
}
/**
 * The Roost alone, polled: the Nest screen reads it for the held brooding leg
 * through this same read, not a second one.
 */
export function useRoost(o: PollOptions = {}) {
  return usePolled(() => reads.getRoost(), [], o);
}
/**
 * The Roost screen's one read: the Roost and the staking card under one pin,
 * one multicall, polled. The wallet's figures are part of it.
 */
export function useRoostScreen(o: PollOptions = {}): Polled<{ roost: RoostState; staking: StakingState }> {
  const address = useAddress();
  return usePolled(() => reads.getRoostScreen(), [address], o);
}

/**
 * The pool, for the trade modal.
 *
 * Read once at page load, so the modal opens on figures it already has, and
 * polled while it is open (the modal passes `paused` for the rest), so a
 * modal left open sees the launch and the balances move. `readAt` is the wall
 * clock at the read, which with `chainNow` is the skew the modal's clock
 * runs on. The decaying fee is
 * recomputed in the component from `launchAt` rather than re-fetched every
 * second — one clock, not a request per tick.
 */
export function useSwapState(o: PollOptions = {}): Polled<SwapState> {
  const address = useAddress();
  return usePolled(() => reads.getSwapState(address), [address], o);
}

/** The admin panel. Re-reads when the account changes, like every other hook. */
export function useAdmin() {
  const address = useAddress();
  return useAsync(() => reads.getAdmin(address), [address]);
}

/**
 * Just enough to decide whether to draw the owner's nav link.
 *
 * Ten reads rather than the panel's dozens, and none at all until a wallet is
 * connected — the header renders on every page, for everybody.
 */
export function useOwnerStatus() {
  const address = useAddress();
  return useAsync(
    async () => (address ? reads.getOwnerStatus(address) : { isOwner: false, isPendingOwner: false }),
    [address],
  );
}

export function useWallet() {
  const address = useAddress();
  return useAsync(async () => (address ? reads.getWallet() : undefined), [address]);
}

export function useBrood(o: PollOptions = {}) {
  const address = useAddress();
  return usePolled(() => reads.getBrood(address), [address], o);
}

/**
 * The Sweeper's view of the connected wallet's birds, or undefined where this
 * deployment has no Sweeper. `extra` is the tokens the holder added by
 * address; the key is their joined list so a new one re-reads.
 */
export function useSweep(extra: readonly `0x${string}`[] = []) {
  const address = useAddress();
  const key = extra.map((x) => x.toLowerCase()).join(',');
  return useAsync(
    async () => (address && reads.canSweep() ? reads.getSweep(address, [...extra]) : undefined),
    [address, key],
  );
}

export function useYourBirds() {
  const address = useAddress();
  return useAsync(async () => (address ? reads.getBirdsOf(address) : []), [address]);
}

export function useBird(id: number) {
  return useAsync(() => reads.getBird(id), [id]);
}

export function useMintedBirds(offset: number, limit: number) {
  return useAsync(() => reads.getMintedBirds({ offset, limit }), [offset, limit]);
}

// ── re-reading every few seconds, quietly ─────────────────────────────────

/**
 * How often a mounted screen re-reads the chain. One constant, one place.
 * Doubled after each failed read, up to POLL_BACKOFF_MAX_MS, until one lands.
 */
export const POLL_INTERVAL_MS = 12_000;
export const POLL_BACKOFF_MAX_MS = 120_000;

export type PollOptions = {
  /** No reads while true: a transaction from this screen is in flight, or a sheet is open. */
  paused?: boolean;
  /** Off by default only for callers that want the one-shot shape. */
  interval?: number;
};

export type Polled<T> = Async<T> & {
  /** Wall clock, seconds, when the data on screen landed. Null before the first read. */
  readAt: number | null;
  /** True after a background read failed: the data on screen is the last good read. */
  stale: boolean;
};

/**
 * `useAsync`, re-run on a timer while the screen is mounted.
 *
 * Only while the tab is visible (nothing while hidden; one read at once when
 * it comes back); not while `paused`; the previous data stays on screen until
 * the next read lands, so a refresh never blanks a panel; a failed background
 * read keeps the last good data, marks it stale, and doubles the interval up
 * to two minutes until a read succeeds. A write landing or the scenario
 * changing (the nonce) reads at once, as before. Cleared on unmount.
 */
export function usePolled<T>(fn: () => Promise<T>, deps: unknown[], o: PollOptions = {}): Polled<T> {
  const interval = o.interval ?? POLL_INTERVAL_MS;
  const paused = !!o.paused;
  const [state, setState] = useState<{ data?: T; error?: unknown; loading: boolean; readAt: number | null; stale: boolean }>({
    loading: true, readAt: null, stale: false,
  });
  const [local, setLocal] = useState(0);
  const n = useRefreshNonce();
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const failures = useRef(0);

  useEffect(() => {
    let alive = true;
    let inflight = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const visible = () => typeof document === 'undefined' || document.visibilityState === 'visible';
    const delay = () => Math.min(POLL_BACKOFF_MAX_MS, interval * 2 ** failures.current);
    const schedule = () => {
      clearTimeout(timer);
      if (alive) timer = setTimeout(() => { void tick(false); }, delay());
    };
    const tick = async (first: boolean) => {
      if (!alive) return;
      // The visibility and pause rules are for the TIMER's reads. The first
      // read — on mount, on a wallet change, after a write, on an explicit
      // reload — always runs: a screen opened in a background tab still has
      // to have something on it when the tab is looked at.
      if (!first && (!visible() || pausedRef.current || inflight)) { schedule(); return; }
      if (inflight) { schedule(); return; }
      inflight = true;
      try {
        const data = await fnRef.current();
        if (alive) {
          failures.current = 0;
          setState({ data, loading: false, readAt: Math.floor(Date.now() / 1000), stale: false });
        }
      } catch (error) {
        if (alive) {
          failures.current += 1;
          // A read with nothing to keep is an error. Any later one, timer or
          // not, keeps the data on screen and says how old it is.
          setState((s) => (s.data === undefined
            ? { ...s, error, loading: false }
            : { ...s, stale: true }));
        }
      } finally {
        inflight = false;
        schedule();
      }
    };
    const onVisibility = () => { if (visible()) { clearTimeout(timer); void tick(false); } };
    document.addEventListener('visibilitychange', onVisibility);
    void tick(true);
    return () => {
      alive = false;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n, local, interval]);

  const reload = useCallback(() => setLocal((v) => v + 1), []);
  return { data: state.data, error: state.error, loading: state.loading, readAt: state.readAt, stale: state.stale, reload } as Polled<T>;
}

/** A clock, for countdowns and the live fee. One interval, not one per card. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

// ── the price ticker ──────────────────────────────────────────────────────

/**
 * The ticker's own clock: one read every `intervalMs` while the tab is
 * visible, none while it is hidden, and one at once when it comes back. Not
 * `useAsync` — that re-reads on writes and scenario changes, which is right
 * for a panel and wrong for a band that must tick on a schedule of its own
 * (a write still bumps the nonce below, so a fresh board follows it).
 *
 * `previous` is the last board's prices by address, for the up/down marks.
 * Three misses in a row and the board is dropped: a figure a minute old with
 * nothing behind it is not a price, and the band is not drawn without one.
 */
export function usePrices(intervalMs = 15_000): {
  board: PriceBoard | null;
  previous: Map<string, Amount>;
  /** Wall clock, seconds, when the board landed — for "N seconds ago". */
  readAt: number | null;
  error: unknown;
} {
  const [state, setState] = useState<{
    board: PriceBoard | null; previous: Map<string, Amount>; readAt: number | null; error: unknown; misses: number;
  }>({ board: null, previous: new Map(), readAt: null, error: undefined, misses: 0 });
  const n = useRefreshNonce();

  useEffect(() => {
    let alive = true;
    let inflight = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const visible = () => document.visibilityState === 'visible';
    const schedule = () => {
      clearTimeout(timer);
      if (alive && visible()) timer = setTimeout(() => { void tick(); }, intervalMs);
    };
    const tick = async () => {
      if (!alive || !visible() || inflight) return;
      inflight = true;
      try {
        const board = await reads.getPrices();
        if (alive) {
          setState((s) => ({
            board,
            previous: new Map((s.board?.prices ?? []).map((p) => [p.address.toLowerCase(), p.ethPerToken])),
            readAt: Math.floor(Date.now() / 1000),
            error: undefined,
            misses: 0,
          }));
        }
      } catch (error) {
        if (alive) {
          setState((s) => (s.misses + 1 >= 3
            ? { board: null, previous: new Map(), readAt: null, error, misses: s.misses + 1 }
            : { ...s, error, misses: s.misses + 1 }));
        }
      } finally {
        inflight = false;
        schedule();
      }
    };
    const onVisibility = () => {
      clearTimeout(timer);
      if (visible()) void tick();
    };
    document.addEventListener('visibilitychange', onVisibility);
    void tick();
    return () => {
      alive = false;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intervalMs, n]);

  return { board: state.board, previous: state.previous, readAt: state.readAt, error: state.error };
}
