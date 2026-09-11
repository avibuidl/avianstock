// The read client.
//
// Three rules, all of them from the brief's point 7:
//
//   * A read that fails THROWS. It never resolves to zero. "0 birds left"
//     because a call timed out is a lie that costs a sale, so every failure
//     travels as a failure and every panel renders it as one.
//   * Reads are block-pinned. One multicall is issued at ONE block, so
//     `totalMinted` and `paidRemaining` can never come from different blocks
//     and contradict each other on the same line.
//   * Only idempotent reads are retried. `eth_sendTransaction` is never
//     retried by anything in this file, and this file cannot send one.

import {
  createPublicClient, defineChain, fallback, http,
  type Abi, type Address, type Chain, type PublicClient,
} from 'viem';
import { manifest, type Manifest } from './manifest';

const READ_TIMEOUT_MS = 8_000;
const RETRY_COUNT = 2;

export function chainFor(m: Manifest): Chain {
  return defineChain({
    id: m.network.chainId,
    name: m.network.chainName,
    nativeCurrency: m.network.nativeCurrency,
    rpcUrls: { default: { http: [...m.network.rpcUrls] } },
    blockExplorers: m.network.blockExplorerUrls.length
      ? { default: { name: 'Explorer', url: m.network.blockExplorerUrls[0] } }
      : undefined,
    contracts: m.multicall3 ? { multicall3: { address: m.multicall3 } } : undefined,
  });
}

let cached: { id: string; client: PublicClient } | null = null;

/**
 * One client per manifest. Several RPC URLs become a failover in the order the
 * manifest lists them — a rate-limited or dead endpoint moves to the next
 * rather than becoming an empty page.
 */
export function client(): PublicClient {
  const m = manifest();
  if (cached && cached.id === m.id) return cached.client;
  const transports = m.network.rpcUrls.map((url) =>
    http(url, { timeout: READ_TIMEOUT_MS, retryCount: RETRY_COUNT, retryDelay: 200, batch: true }));
  const c = createPublicClient({
    chain: chainFor(m),
    transport: transports.length > 1 ? fallback(transports, { rank: false }) : transports[0],
    // Multicall3 where the chain has one; plain JSON-RPC batching otherwise,
    // which the 4663 endpoint supports.
    batch: m.multicall3 ? { multicall: { wait: 8 } } : undefined,
  }) as PublicClient;
  cached = { id: m.id, client: c };
  return c;
}

export function resetClient() { cached = null; }

// ── block pinning ─────────────────────────────────────────────────────────

/**
 * Every domain read takes one of these and passes it to every call it makes,
 * so a panel's numbers are all from the same instant.
 */
export type At = { blockNumber: bigint; timestamp: number };

export async function pin(): Promise<At> {
  const block = await client().getBlock({ blockTag: 'latest' });
  return { blockNumber: block.number!, timestamp: Number(block.timestamp) };
}

// ── multicall ─────────────────────────────────────────────────────────────

export type Call = {
  address: Address;
  abi: Abi | readonly unknown[];
  functionName: string;
  args?: readonly unknown[];
};

/**
 * Strict: if any call in the batch reverts or the batch cannot be made, this
 * throws. That is the point — a partial answer with zeros in the gaps is the
 * failure mode this application must not have.
 */
export async function readMany<T = unknown>(calls: Call[], at?: At): Promise<T[]> {
  if (calls.length === 0) return [];
  const results = await client().multicall({
    contracts: calls as never,
    allowFailure: false,
    blockNumber: at?.blockNumber,
  });
  return results as T[];
}

export type Attempt<T> = { ok: true; value: T } | { ok: false; error: unknown };

/**
 * For the calls where a revert is an ANSWER rather than a fault:
 * `quoteBuyNext` on an empty pool, `claim` simulated against a paused token,
 * `validateTransfer` telling us the batch route is closed.
 */
export async function tryReadMany<T = unknown>(calls: Call[], at?: At): Promise<Attempt<T>[]> {
  if (calls.length === 0) return [];
  const results = await client().multicall({
    contracts: calls as never,
    allowFailure: true,
    blockNumber: at?.blockNumber,
  }) as unknown as ({ status: 'success'; result: unknown } | { status: 'failure'; error: unknown })[];
  return results.map((r) =>
    r.status === 'success'
      ? { ok: true, value: r.result as T }
      : { ok: false, error: r.error }) as Attempt<T>[];
}

export async function readOne<T = unknown>(call: Call, at?: At): Promise<T> {
  const [v] = await readMany<T>([call], at);
  return v;
}

/**
 * One read, sent AS a given address, where a revert is an answer.
 *
 * NOT `tryReadMany`. That batches through Multicall3, and an inner call in a
 * batch has `msg.sender = Multicall3` — the outer `from` never reaches it. A
 * contract whose answer depends on WHO IS ASKING therefore cannot be asked
 * inside a batch at all, however the batch is addressed.
 *
 * The transfer validator is such a contract: it keys a collection's policy on
 * `msg.sender`, so the collection has to be the sender or the answer is about
 * somebody else's policy. Losing the batching costs one round trip, which is
 * the price of the question being the right one.
 */
export async function tryReadAs<T = unknown>(
  call: Call, sender: Address, at?: At,
): Promise<Attempt<T>> {
  try {
    const value = await client().readContract({
      address: call.address,
      abi: call.abi,
      functionName: call.functionName,
      args: call.args,
      account: sender,
      blockNumber: at?.blockNumber,
    } as never) as T;
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error };
  }
}

// ── logs ──────────────────────────────────────────────────────────────────

/**
 * The 4663 endpoint caps a `getLogs` response at 10,000 RESULTS — not at a
 * block range — and says so:
 *
 *     -32000  logs matched by query exceeds limit of 10000
 *
 * So the scan walks forward in chunks and HALVES the chunk when it is told the
 * window was too wide, rather than guessing a range that works everywhere. A
 * chunk that cannot be split below one block is a hard failure, reported as
 * one: the alternative is silently returning some of a wallet's birds.
 */
export async function getLogsChunked(args: {
  address: Address;
  event: unknown;
  args?: Record<string, unknown>;
  fromBlock: bigint;
  toBlock: bigint;
  initialChunk?: bigint;
}): Promise<unknown[]> {
  const c = client();
  const out: unknown[] = [];
  let chunk = args.initialChunk ?? 50_000n;
  let from = args.fromBlock;

  while (from <= args.toBlock) {
    const to = from + chunk - 1n > args.toBlock ? args.toBlock : from + chunk - 1n;
    try {
      const logs = await c.getLogs({
        address: args.address,
        event: args.event as never,
        args: args.args as never,
        fromBlock: from,
        toBlock: to,
      });
      out.push(...logs);
      from = to + 1n;
      // Creep back up after a success, so one dense window does not slow the
      // whole scan to a crawl.
      if (chunk < (args.initialChunk ?? 50_000n)) chunk *= 2n;
    } catch (e) {
      if (!tooManyLogs(e) || chunk === 1n) throw e;
      chunk = chunk / 2n > 0n ? chunk / 2n : 1n;
    }
  }
  return out;
}

function tooManyLogs(e: unknown): boolean {
  const msg = (e as { message?: string })?.message ?? String(e);
  return /exceeds limit|too many|response size|query returned more than|range is too large/i.test(msg);
}
