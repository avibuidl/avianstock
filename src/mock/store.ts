// What components subscribe to.
//
// One hook per domain, each a thin wrapper over a read plus two invalidation
// signals: a write landed, or the scenario changed. When the reads become
// chain calls, the hooks keep their names and their shapes.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Connection } from './types';
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
 * The pool, for the trade modal.
 *
 * `useNow` drives the fee display; this only re-reads on a write or an account
 * change. The decaying fee is recomputed in the component from `launchAt`
 * rather than re-fetched every second — one clock, not a request per tick.
 */
export function useSwapState() {
  const address = useAddress();
  return useAsync(() => reads.getSwapState(address), [address]);
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

export function useRoost() {
  const address = useAddress();
  return useAsync(() => reads.getRoost(address), [address]);
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

/** A clock, for countdowns and the live fee. One interval, not one per card. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
