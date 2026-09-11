// First Light: the fee curve, and the per-transaction buy cap.
//
// Two things here are deliberately not "read it once and believe it".
//
// THE CURVE. `FirstLight.tsx` draws it by calling a synchronous function for
// arbitrary timestamps, so it cannot await a call per point. The arithmetic is
// therefore reproduced locally — and then PINNED against `hook.buyFeeBpsAt(t)`
// at sample points across the window at start-up. If the two disagree by even
// one bp the local curve is dropped and a table is fetched from the chain, so
// what is drawn is never a plausible-looking curve that is not the contract's.
//
//   (The mock's port rounds; the contract floors — `MAX_EXTRA * (WINDOW -
//   elapsed) / WINDOW` in integer arithmetic. That is exactly the kind of
//   one-bp difference the pin exists to catch, and this file floors.)
//
// THE CAP. HANDOVER section 6: the per-transaction counter lives in transient
// storage and CANNOT be read, so no view can say how much of the cap a
// transaction has already spent. Anything that bundles buys has to add them up
// itself. This site does not execute swaps, so nothing here spends the cap
// today — but the guard is written and tested, so a route that is ever added
// has something it must pass rather than a gap to discover.

import { readMany, tryReadMany, type At } from './client';
import { poolContracts } from './manifest';
import { aviansHookAbi } from './abis.generated';

export type LaunchParams = {
  launchAt: number;
  windowSeconds: number;
  feeBps: number;
  maxExtraFeeBps: number;
  maxBuyPerTx: bigint;
};

let params: LaunchParams | null = null;
/** Set when the local curve disagreed with the chain: t -> bps, from the chain. */
let table: Map<number, number> | null = null;

export function setLaunchParams(p: LaunchParams) { params = p; }
export function launchParams(): LaunchParams | null { return params; }

/**
 * The contract's arithmetic, floor division and all:
 *
 *   before LAUNCH_AT       FEE_BPS + MAX_EXTRA_FEE_BPS   (the opening number,
 *                                                         never a zero that
 *                                                         would read as "free")
 *   inside the window      FEE_BPS + MAX_EXTRA * (WINDOW - elapsed) / WINDOW
 *   after it               FEE_BPS
 */
export function buyFeeBpsAt(t: number, launchAt: number): number {
  const p = params;
  const feeBps = p?.feeBps ?? 100;
  const maxExtra = p?.maxExtraFeeBps ?? 2400;
  const windowSeconds = p?.windowSeconds ?? 300;

  if (table) {
    const key = Math.max(0, Math.min(windowSeconds, Math.floor(t - launchAt)));
    const fromChain = table.get(key);
    if (fromChain !== undefined) return fromChain;
  }

  if (t < launchAt) return feeBps + maxExtra;
  const elapsed = Math.floor(t - launchAt);
  if (elapsed >= windowSeconds) return feeBps;
  return feeBps + Math.floor((maxExtra * (windowSeconds - elapsed)) / windowSeconds);
}

/**
 * Ask the hook for the same figure at five points and compare. On any
 * disagreement, fetch the whole window a second at a time and serve exactly
 * what the contract says instead.
 */
export async function pinFeeCurve(p: LaunchParams, at?: At): Promise<{
  ok: boolean; samples: { t: number; local: number; onChain: number }[];
}> {
  const pool = poolContracts();
  setLaunchParams(p);
  table = null;
  if (!pool) return { ok: true, samples: [] };

  const offsets = [0, 1, Math.floor(p.windowSeconds / 2), p.windowSeconds - 1, p.windowSeconds];
  const times = offsets.map((o) => p.launchAt + o);
  const onChain = await readMany<bigint>(
    times.map((t) => ({
      address: pool.hook,
      abi: aviansHookAbi,
      functionName: 'buyFeeBpsAt',
      args: [BigInt(t)],
    })),
    at,
  );

  const samples = times.map((t, i) => ({ t, local: buyFeeBpsAt(t, p.launchAt), onChain: Number(onChain[i]) }));
  const ok = samples.every((s) => s.local === s.onChain);
  if (!ok) await loadCurveFromChain(p, at);
  return { ok, samples };
}

async function loadCurveFromChain(p: LaunchParams, at?: At) {
  const pool = poolContracts();
  if (!pool) return;
  const seconds = Array.from({ length: p.windowSeconds + 1 }, (_, i) => i);
  const results = await tryReadMany<bigint>(
    seconds.map((s) => ({
      address: pool.hook,
      abi: aviansHookAbi,
      functionName: 'buyFeeBpsAt',
      args: [BigInt(p.launchAt + s)],
    })),
    at,
  );
  const next = new Map<number, number>();
  results.forEach((r, i) => { if (r.ok) next.set(seconds[i], Number(r.value)); }); /* count */ // bps
  table = next.size ? next : null;
}

export function curveIsFromChain(): boolean { return table !== null; }

// ── the cap ───────────────────────────────────────────────────────────────

export type CapVerdict = {
  ok: boolean;
  cumulative: bigint;
  cap: bigint;
  /** True only while the window is open; outside it there is no cap at all. */
  applies: boolean;
};

/**
 * Add up every buy that would go into ONE transaction and compare with
 * `MAX_BUY_PER_TX`. The cap is per transaction, not per swap, so several swaps
 * bundled into one router call are summed — which is the whole reason a site
 * has to do this itself.
 *
 * `now` decides whether the cap applies at all: after the window there is no
 * cap, forever.
 */
export function capGuard(buys: bigint[], now: number, p: LaunchParams | null = params): CapVerdict {
  const cap = p?.maxBuyPerTx ?? 0n;
  const applies = !!p && now >= p.launchAt && now < p.launchAt + p.windowSeconds;
  const cumulative = buys.reduce((a, b) => a + b, 0n);
  return { ok: !applies || cap === 0n || cumulative <= cap, cumulative, cap, applies };
}

/** How to split an over-cap amount into transactions that each fit. */
export function splitForCap(amount: bigint, cap: bigint): bigint[] {
  if (cap <= 0n || amount <= cap) return [amount];
  const whole = amount / cap;
  const rest = amount % cap;
  const out = Array.from({ length: Number(whole) }, () => cap);
  if (rest > 0n) out.push(rest);
  return out;
}
