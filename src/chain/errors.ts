// A revert blob, in. A sentence a person can act on, out.
//
// The vocabulary is generated from the compiled ABIs (`abis.generated.ts`), so
// this file never carries a hand-typed selector. What it adds is the mapping
// from a decoded error to the closed `ErrorName` union the UI already knows how
// to explain, and the two unwrappings that stand between a raw provider error
// and that name:
//
//   * Uniswap's PoolManager wraps a hook's revert in
//     `WrappedError(address hook, bytes4 fn, bytes reason, bytes details)`.
//     The useful part is `reason`, and HANDOVER section 7 says so.
//   * A wallet's own refusal (EIP-1193 code 4001) is not a contract error at
//     all, and must never be shown as one.
//
// Anything that does not decode becomes `Unknown` — but it keeps its selector,
// which appears in the collapsed detail line for a bug report. A hex blob never
// reaches a sentence.

import { decodeErrorResult, type Abi } from 'viem';
import { errorAbi, ERROR_SIGNATURES, ERROR_SOURCES } from './abis.generated';
import { ContractError, SELECTORS, type ErrorArgs } from '../mock/errors';
import type { ErrorName, Hex } from '../mock/types';

/** selector -> the name the UI explains. Inverted from the shared table. */
const BY_SELECTOR: Record<string, ErrorName> = (() => {
  const out: Record<string, ErrorName> = {};
  for (const [name, selector] of Object.entries(SELECTORS)) {
    if (selector) out[selector.toLowerCase()] = name as ErrorName;
  }
  return out;
})();

const WRAPPED_ERROR_SELECTOR = (() => {
  for (const [selector, sig] of Object.entries(ERROR_SIGNATURES)) {
    if (sig.startsWith('WrappedError(')) return selector.toLowerCase();
  }
  return null;
})();

/** Named arguments off a decoded error, whatever its shape. */
function namedArgs(name: string, values: readonly unknown[] | undefined): Record<string, unknown> {
  const entry = (errorAbi as unknown as { name: string; inputs: { name: string }[] }[])
    .find((e) => e.name === name);
  const out: Record<string, unknown> = {};
  if (!entry || !values) return out;
  entry.inputs.forEach((input, i) => { if (input.name) out[input.name] = values[i]; });
  return out;
}

const toNumber = (v: unknown): number | undefined =>
  typeof v === 'bigint' ? Number(v) : typeof v === 'number' ? v : undefined;

/** The contract's own argument names, mapped onto the shape `explain` reads. */
function toErrorArgs(name: string, values: readonly unknown[] | undefined): ErrorArgs {
  const a = namedArgs(name, values);
  const args: ErrorArgs = {};
  if (typeof a.price === 'bigint') args.price = a.price;
  // `ComboTaken(uint48 combo)` — viem decodes anything up to uint48 as a
  // `number`, not a `bigint`, so this one arrives in the other shape.
  if (typeof a.combo === 'bigint') args.combo = a.combo;
  else if (typeof a.combo === 'number') args.combo = BigInt(a.combo);
  if (typeof a.cap === 'bigint') args.cap = a.cap;
  if (typeof a.cumulative === 'bigint') args.cumulative = a.cumulative;
  const tokenId = toNumber(a.tokenId);
  if (tokenId !== undefined) args.tokenId = tokenId;
  const id = toNumber(a.id) ?? tokenId;
  if (id !== undefined) args.id = id;
  const requested = toNumber(a.requested);
  if (requested !== undefined) args.requested = requested;
  const available = toNumber(a.available);
  if (available !== undefined) args.available = available;
  const launchAt = toNumber(a.launchAt);
  if (launchAt !== undefined) args.launchAt = launchAt;
  if (typeof a.token === 'string') args.token = a.token as `0x${string}`;
  return args;
}

export type Decoded = {
  name: ErrorName;
  args: ErrorArgs;
  /** The selector actually on the wire, for the detail line. */
  selector: Hex | null;
  /** The canonical signature, when we recognised one. */
  signature: string | null;
};

/**
 * Decode revert data. Returns `Unknown` with the selector intact rather than
 * guessing, because a wrong sentence is worse than an honest one.
 */
export function decodeRevert(data: Hex | null | undefined): Decoded {
  if (!data || data === '0x' || data.length < 10) {
    return { name: 'Unknown', args: {}, selector: null, signature: null };
  }
  const selector = data.slice(0, 10).toLowerCase() as Hex;

  // A hook's revert arrives inside the PoolManager's WrappedError. Unwrap and
  // decode the reason; the wrapper itself is never what a person is shown.
  if (WRAPPED_ERROR_SELECTOR && selector === WRAPPED_ERROR_SELECTOR) {
    const inner = decodeWrapped(data);
    if (inner) return decodeRevert(inner);
  }

  let name: string | null = null;
  let values: readonly unknown[] | undefined;
  try {
    const decoded = decodeErrorResult({ abi: errorAbi as unknown as Abi, data });
    name = decoded.errorName;
    values = decoded.args as readonly unknown[] | undefined;
  } catch {
    // Not one of ours. Fall through with the selector.
  }

  // `Error(string)` — a plain require. Not in our ABIs; worth naming.
  if (!name && selector === '0x08c379a0') {
    return { name: 'Unknown', args: {}, selector, signature: 'Error(string)' };
  }
  if (!name && selector === '0x4e487b71') {
    return { name: 'Unknown', args: {}, selector, signature: 'Panic(uint256)' };
  }

  const known = BY_SELECTOR[selector] ?? null;
  return {
    name: known ?? 'Unknown',
    args: name ? toErrorArgs(name, values) : {},
    selector,
    signature: ERROR_SIGNATURES[selector] ?? null,
  };
}

function decodeWrapped(data: Hex): Hex | null {
  try {
    const decoded = decodeErrorResult({ abi: errorAbi as unknown as Abi, data });
    const args = decoded.args as readonly unknown[] | undefined;
    // (address hook, bytes4 hookFunction, bytes reason, bytes details)
    const reason = args?.[2];
    return typeof reason === 'string' && reason.startsWith('0x') && reason.length >= 10
      ? (reason as Hex)
      : null;
  } catch {
    return null;
  }
}

// ── from a thrown provider / viem error ───────────────────────────────────

const USER_REJECTED = /user rejected|user denied|request rejected|rejected by the user/i;

function code(e: unknown): number | undefined {
  const c = (e as { code?: unknown })?.code;
  return typeof c === 'number' ? c : undefined;
}

/**
 * Walk whatever the provider or viem threw looking for revert data. Providers
 * put it in a different place each — `data`, `data.data`, `error.data`,
 * `cause.data`, or a hex string inside the message — so this looks in all of
 * them rather than trusting one shape.
 */
export function extractRevertData(e: unknown, depth = 0): Hex | null {
  if (!e || depth > 8) return null;
  if (typeof e === 'string') {
    const m = e.match(/0x[0-9a-fA-F]{8,}/);
    return m ? (m[0] as Hex) : null;
  }
  if (typeof e !== 'object') return null;
  const o = e as Record<string, unknown>;

  for (const key of ['data', 'raw', 'result', 'returnData']) {
    const v = o[key];
    if (typeof v === 'string' && v.startsWith('0x') && v.length >= 10) return v as Hex;
    if (v && typeof v === 'object') {
      const nested = (v as Record<string, unknown>).data;
      if (typeof nested === 'string' && nested.startsWith('0x') && nested.length >= 10) return nested as Hex;
    }
  }
  for (const key of ['cause', 'error', 'details', 'walk']) {
    if (key === 'walk') continue;
    const found = extractRevertData(o[key], depth + 1);
    if (found) return found;
  }
  // viem's BaseError chain.
  if (typeof (o as { walk?: unknown }).walk === 'function') {
    try {
      const walked = (o as { walk: () => unknown }).walk();
      if (walked && walked !== e) return extractRevertData(walked, depth + 1);
    } catch { /* not walkable */ }
  }
  return null;
}

export type AsErrorOptions = {
  /** What the caller was doing, so an unknown failure can still be reported. */
  where?: string;
  /** Used when the revert carries no price of its own. */
  price?: bigint;
};

/**
 * The single funnel: anything thrown anywhere in `src/chain` becomes a
 * `ContractError` here, and `explain()` in the shared error module turns that
 * into the sentence. No call site writes a message.
 */
export function asContractError(e: unknown, o: AsErrorOptions = {}): ContractError {
  if (e instanceof ContractError) return e;

  const c = code(e);
  const message = (e as { message?: string })?.message ?? '';

  if (c === 4001 || c === 4100 || USER_REJECTED.test(message)) {
    return new ContractError('UserRejected');
  }

  const data = extractRevertData(e);
  if (data) {
    const decoded = decodeRevert(data);
    const args: ErrorArgs = { ...decoded.args };
    if (args.price === undefined && o.price !== undefined) args.price = o.price;
    const err = new ContractError(decoded.name, args);
    if (decoded.name === 'Unknown') {
      attachDetail(err, decoded.selector, decoded.signature, o.where);
    }
    return err;
  }

  // No revert data at all: a transport problem, a timeout, a rate limit.
  if (isTransport(e)) { logUnknown(e, o.where); return new ContractError('ReadFailed'); }

  const err = new ContractError('Unknown');
  attachDetail(err, null, null, o.where, message);
  logUnknown(e, o.where);
  return err;
}

/**
 * An `Unknown` is a gap in the decoder, and a gap is only ever closed by seeing
 * the thing that fell through it. In a dev build the original object goes to
 * the console; in a shipped build nothing is logged, because a stack trace on a
 * collector's console helps nobody and the detail line already carries what a
 * bug report needs.
 */
function logUnknown(e: unknown, where?: string) {
  try {
    if (import.meta.env?.DEV) {
      // eslint-disable-next-line no-console
      console.debug(`[chain] undecoded failure${where ? ` while ${where}` : ''}:`, e);
    }
  } catch { /* not a Vite build */ }
}

/**
 * An unrecognised failure still has to be reportable. The selector, the
 * signature if we know it, and the source file it came from go into the
 * drawer's collapsed detail line — never into the sentence.
 */
function attachDetail(
  err: ContractError,
  selector: Hex | null,
  signature: string | null,
  where?: string,
  message?: string,
) {
  const bits = [
    where ? `while ${where}` : null,
    selector,
    signature,
    selector ? ERROR_SOURCES[selector] : null,
    message ? message.slice(0, 200) : null,
  ].filter(Boolean);
  (err as unknown as { detail?: string }).detail = bits.join(' · ');
}

/**
 * "The node did not answer" — and ONLY that.
 *
 * This has to be narrow. A revert wrongly reported as a transport failure tells
 * a collector to try again when the answer is that their allowance is short,
 * and a viem error message mentions the RPC URL and the request arguments, so
 * matching loose words like "network" in the message reads almost every failure
 * as an outage. The name of the error class, the transport error CODES, and a
 * couple of unambiguous phrases — nothing else.
 */
function isTransport(e: unknown): boolean {
  const seen = new Set<unknown>();
  const walk = (x: unknown, depth: number): boolean => {
    if (!x || typeof x !== 'object' || depth > 6 || seen.has(x)) return false;
    seen.add(x);
    const o = x as Record<string, unknown>;
    const name = typeof o.name === 'string' ? o.name : '';
    if (/^(HttpRequestError|TimeoutError|SocketClosedError|WebSocketRequestError|AbortError|NetworkError|FetchError|TypeError)$/.test(name)) {
      // A bare TypeError from fetch is the browser's "Failed to fetch".
      if (name !== 'TypeError' || /failed to fetch|load failed/i.test(String(o.message ?? ''))) return true;
    }
    if (o.code === -32603 && /timeout|timed out/i.test(String(o.message ?? ''))) return true;
    if (o.code === -32005 || o.code === 429 || o.code === 503 || o.code === 502) return true;
    if (typeof o.status === 'number' && [408, 429, 500, 502, 503, 504].includes(o.status)) return true;
    return walk(o.cause, depth + 1) || walk(o.error, depth + 1);
  };
  return walk(e, 0);
}

/** The line under the sentence, for a bug report. Never the sentence itself. */
export function detailOf(e: unknown): string | null {
  const d = (e as { detail?: unknown })?.detail;
  return typeof d === 'string' && d.length ? d : null;
}
