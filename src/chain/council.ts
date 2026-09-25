// The council, read from the chain (2026-09-24).
//
// The protocol's second key: a timelock (OpenZeppelin's TimelockController)
// that only the founder's multisig may propose to. It holds the structural
// pointers, the royalty and the rescue; the owner holds everything else.
// The site never sends it anything. This file reads:
//
//   * `council()` on the five seats the start-up checks ask, one address
//     everywhere, or zero on a seat that was never named;
//   * the Council's own `MULTISIG()` and its two constant delays;
//   * WHAT IS WAITING: every `CallScheduled` the Council has emitted with no
//     `CallExecuted` or `Cancelled` for its id. One scan, on the Council's
//     address, from the deploy block. It is the one event scan the site
//     makes for this, on a contract that emits a handful of events a year;
//   * `getTimestamp(id)` for each, which is when it may run.
//
// And it turns a scheduled call's `data` into one plain sentence, which is
// the whole point of showing a pending change: a public delay protects no one
// if what is waiting is a hex blob.

import {
  decodeFunctionData, parseAbi, parseAbiItem, toFunctionSelector, type Abi, type AbiFunction,
} from 'viem';
import { getLogsChunked, pin, readMany, tryReadMany, type At } from './client';
import { contracts, councilAddress, manifest, poolContracts, roostContracts, unveiled } from './manifest';
import {
  avianStockAbi, aviansHookAbi, councilAbi, liquidityVaultAbi, theNestAbi, thePerchAbi, theRoostAbi, treasuryAbi,
} from './abis.generated';
import type { Address, CouncilChange, CouncilState, Hex, OwnedSeat, SeatState } from '../mock/types';

const ZERO = '0x0000000000000000000000000000000000000000';

// ── the decoder ───────────────────────────────────────────────────────────

/**
 * Every call the council may schedule, by signature, and the sentence it
 * reads as. Parsed from the signatures, not from the generated ABIs: the site
 * holds no ABI that can ENCODE a council call (a test says so), and decoding
 * one needs only the shape. `{target}` is the contract the call lands on,
 * named; `{to}` is the address argument.
 *
 * THE TWO PATHS (part 18). The owner's own proposal, seated a day later, is
 * the routine one and reads in the ordinary tone. The seat moved after the
 * owner's silence is the one a holder must notice, and alone carries the
 * rescue's stronger tone.
 */
const CALLS: { sig: string; says: string; kind: CouncilChange['kind'] }[] = [
  { sig: 'setTreasury(address)', says: "the hook's Treasury moves to {to}", kind: 'structural' },
  { sig: 'setMintSink(address)', says: "the collection's Perch moves to {to}", kind: 'structural' },
  { sig: 'setNest(address)', says: "{target}'s Nest moves to {to}", kind: 'structural' },
  { sig: 'setCostSink(address)', says: "the Nest's Roost moves to {to}", kind: 'structural' },
  { sig: 'setRoost(address)', says: "{target}'s Roost moves to {to}", kind: 'structural' },
  { sig: 'setStaking(address)', says: "the Treasury's Nest moves to {to}", kind: 'structural' },
  { sig: 'setDefaultRoyalty(address,uint96)', says: 'the royalty becomes {bps} bps to {to}', kind: 'structural' },
  { sig: 'deleteDefaultRoyalty()', says: 'the royalty is removed', kind: 'structural' },
  { sig: 'councilTransferOwnership(address)', says: 'the admin key moves to {to}, as the owner proposed', kind: 'structural' },
  { sig: 'councilRescueSilentOwner(address)', says: "the admin key moves to {to}, after the owner's silence", kind: 'rescue' },
  { sig: 'setCouncil(address)', says: "the council's seat moves to {to}", kind: 'structural' },
];

const BY_SELECTOR = new Map(CALLS.map((c) => {
  const abi = parseAbi([`function ${c.sig}`] as readonly string[]) as Abi;
  return [toFunctionSelector(abi[0] as AbiFunction).toLowerCase(), { ...c, abi }];
}));

/**
 * The deployment's contracts by address, in the words a sentence uses: "the
 * collection", "the hook". The lockers' distributor is one of the vault
 * products, so it is named only once the founder has unveiled them; until
 * then a change to it reads by its address, which is public anyway.
 */
export function councilTargetNames(): Map<string, string> {
  const m = manifest();
  const c = contracts();
  const r = roostContracts();
  const pool = poolContracts();
  const pairs: [Address | null | undefined, string][] = [
    [c.AvianStock, 'the collection'],
    [c.ThePerch, 'the Perch'],
    [c.TheNest, 'the Nest'],
    [c.Treasury, 'the Treasury'],
    [pool?.hook, 'the hook'],
    [c.LiquidityVault, 'the vault'],
    [r.roost, 'the Roost'],
    [r.staking, 'the staking contract'],
    [unveiled('vaults') ? r.lockers : null, "the lockers' distributor"],
    [m.council, 'the council'],
  ];
  return new Map(pairs.filter(([a]) => !!a).map(([a, n]) => [a!.toLowerCase(), n]));
}

/** "The hook's Treasury moves to 0x…": one scheduled call, in words. */
export function describeCouncilCall(
  target: Address, data: Hex, names: Map<string, string>,
): { says: string; kind: CouncilChange['kind'] } {
  const selector = data.slice(0, 10).toLowerCase();
  const known = BY_SELECTOR.get(selector);
  const targetName = names.get(target.toLowerCase()) ?? target;
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const unrecognised = { says: cap(`an unrecognised call (${selector}) to ${targetName}`), kind: 'structural' as const };
  if (!known) return unrecognised;

  let args: readonly unknown[] = [];
  try {
    args = decodeFunctionData({ abi: known.abi, data }).args ?? [];
  } catch {
    // The right selector with the wrong arguments is not a call we can
    // honestly put into words.
    return unrecognised;
  }
  const to = typeof args[0] === 'string' ? (args[0] as string) : '';
  const bps = typeof args[1] === 'bigint' || typeof args[1] === 'number' ? String(args[1]) : '';
  return {
    says: cap(known.says.replace('{target}', targetName).replace('{to}', to).replace('{bps}', bps)),
    kind: known.kind,
  };
}

// ── the pending list ──────────────────────────────────────────────────────

const CALL_SCHEDULED = parseAbiItem('event CallScheduled(bytes32 indexed id, uint256 indexed index, address target, uint256 value, bytes data, bytes32 predecessor, uint256 delay)');
const CALL_EXECUTED = parseAbiItem('event CallExecuted(bytes32 indexed id, uint256 indexed index, address target, uint256 value, bytes data)');
const CANCELLED = parseAbiItem('event Cancelled(bytes32 indexed id)');

type Log = { eventName?: string; args?: Record<string, unknown> };

/**
 * Scheduled, and neither executed nor cancelled: the calls still waiting, one
 * per `(id, index)`. A batch executes all its calls together, so an id is
 * done as a whole once any `CallExecuted` names it.
 */
export function stillWaiting(logs: readonly Log[]): { id: Hex; index: number; target: Address; data: Hex }[] {
  const closed = new Set<string>();
  for (const l of logs) {
    if ((l.eventName === 'CallExecuted' || l.eventName === 'Cancelled') && typeof l.args?.id === 'string') {
      closed.add((l.args.id as string).toLowerCase());
    }
  }
  const out: { id: Hex; index: number; target: Address; data: Hex }[] = [];
  const seen = new Set<string>();
  for (const l of logs) {
    if (l.eventName !== 'CallScheduled' || !l.args) continue;
    const id = String(l.args.id).toLowerCase() as Hex;
    const index = Number(l.args.index); /* count */
    const key = `${id}:${index}`;
    if (closed.has(id) || seen.has(key)) continue;
    seen.add(key);
    out.push({ id, index, target: l.args.target as Address, data: l.args.data as Hex });
  }
  return out;
}

// ── the read ──────────────────────────────────────────────────────────────

/** The five seats the start-up checks ask, with the words the card uses. */
function seats(): { name: string; address: Address; abi: Abi }[] {
  const c = contracts();
  const pool = poolContracts();
  const list: { name: string; address: Address; abi: Abi }[] = [
    { name: 'the collection', address: c.AvianStock, abi: avianStockAbi as unknown as Abi },
    { name: 'the Treasury', address: c.Treasury, abi: treasuryAbi as unknown as Abi },
    { name: 'the Nest', address: c.TheNest, abi: theNestAbi as unknown as Abi },
    { name: 'the Roost', address: roostContracts().roost, abi: theRoostAbi as unknown as Abi },
  ];
  if (pool?.hook) list.splice(1, 0, { name: 'the hook', address: pool.hook, abi: aviansHookAbi as unknown as Abi });
  return list;
}

export async function getCouncil(at?: At): Promise<CouncilState> {
  const a = at ?? await pin();
  const council = councilAddress();
  const seatList = seats();

  const seatAnswers = await tryReadMany<Address>(
    seatList.map((s) => ({ address: s.address, abi: s.abi, functionName: 'council' })), a,
  );
  // A seat that answers zero was never named. One that fails to answer is not
  // read as unnamed: it says nothing either way, and the start-up check
  // already refuses a deployment whose seats do not answer.
  const unnamedOn = seatList
    .filter((_, i) => seatAnswers[i].ok && (seatAnswers[i] as { value: Address }).value.toLowerCase() === ZERO)
    .map((s) => s.name);

  if (!council) {
    return {
      council: null, unnamedOn, multisig: null,
      structuralDelay: 0, rescueDelay: 0, chainNow: a.timestamp, pending: [],
    };
  }

  const cc = (functionName: string, args: readonly unknown[] = []) =>
    ({ address: council, abi: councilAbi as unknown as Abi, functionName, args });
  const [multisig, structural, rescue] = await tryReadMany<unknown>(
    [cc('MULTISIG'), cc('STRUCTURAL_DELAY'), cc('RESCUE_DELAY')], a,
  );
  if (!structural.ok || !rescue.ok) throw new Error('the Council did not answer its delays');

  const logs = await getLogsChunked({
    address: council,
    events: [CALL_SCHEDULED, CALL_EXECUTED, CANCELLED],
    fromBlock: BigInt(manifest().startBlock),
    toBlock: a.blockNumber,
    // The whole range at once: the Council emits a handful of events a year,
    // and the scan halves itself only if a node refuses the window.
    initialChunk: a.blockNumber - BigInt(manifest().startBlock) + 1n,
  }) as Log[];

  const waiting = stillWaiting(logs);
  const ids = [...new Set(waiting.map((w) => w.id))];
  const stamps = await readMany<bigint>(ids.map((id) => cc('getTimestamp', [id])), a);
  const readyAt = new Map(ids.map((id, i) => [id, Number(stamps[i])])); /* count */

  const names = councilTargetNames();
  const pending: CouncilChange[] = waiting
    // The chain has the last word: 0 is not scheduled, 1 is done. The events
    // agree on any honest node; if they do not, the Council itself wins.
    .filter((w) => (readyAt.get(w.id) ?? 0) > 1)
    .map((w) => ({ id: w.id, index: w.index, readyAt: readyAt.get(w.id)!, ...describeCouncilCall(w.target, w.data, names) }))
    .sort((x, y) => x.readyAt - y.readyAt || x.index - y.index);

  return {
    council,
    unnamedOn,
    multisig: multisig.ok ? (multisig.value as Address) : null,
    structuralDelay: Number(structural.value), /* count */
    rescueDelay: Number(rescue.value), /* count */
    chainNow: a.timestamp,
    pending,
  };
}

// ── the owner's seat (2026-09-24) ──────────────────────────────────────────
//
// The seat moves two ways only: the owner proposes a key on each seat and the
// council seats it a day later (path A), or the council seats any key once
// the owner has been silent for `SILENCE()` (path B). Each seat keeps its
// own clock. These are the reads for the Owner page's "Your seat" control;
// the two senders are owner calls and live in `admin-writes.ts`.

/**
 * The owned seats this manifest knows, in the control's order. The trait
 * market joins when a manifest carries one (part 10, held back); the vault
 * only on a deployment that has a pool.
 */
function ownedSeats(): { id: OwnedSeat['id']; name: string; address: Address; abi: Abi }[] {
  const c = contracts();
  const list: { id: OwnedSeat['id']; name: string; address: Address | null; abi: Abi }[] = [
    { id: 'collection', name: 'the collection', address: c.AvianStock, abi: avianStockAbi as unknown as Abi },
    { id: 'perch', name: 'the Perch', address: c.ThePerch, abi: thePerchAbi as unknown as Abi },
    { id: 'nest', name: 'the Nest', address: c.TheNest, abi: theNestAbi as unknown as Abi },
    { id: 'treasury', name: 'the Treasury', address: c.Treasury, abi: treasuryAbi as unknown as Abi },
    { id: 'vault', name: 'the vault', address: c.LiquidityVault, abi: liquidityVaultAbi as unknown as Abi },
  ];
  return list.filter((s): s is { id: OwnedSeat['id']; name: string; address: Address; abi: Abi } => !!s.address);
}

/** `owner()`, `lastSeenAt()`, `silentAt()` and `pendingOwner()` on each seat, and `SILENCE()`, at one block. */
export async function getSeat(at?: At): Promise<SeatState> {
  const a = at ?? await pin();
  const seats = ownedSeats();
  const FIELDS = ['owner', 'lastSeenAt', 'silentAt', 'pendingOwner'] as const;
  const answers = await readMany<unknown>([
    ...seats.flatMap((s) => FIELDS.map((functionName) => ({ address: s.address, abi: s.abi, functionName }))),
    { address: seats[0].address, abi: seats[0].abi, functionName: 'SILENCE' },
  ], a);
  const at4 = (i: number, k: number) => answers[i * FIELDS.length + k];
  return {
    seats: seats.map((s, i) => {
      const pending = String(at4(i, 3));
      return {
        id: s.id,
        name: s.name,
        owner: at4(i, 0) as Address,
        lastSeenAt: Number(at4(i, 1)), /* count */
        silentAt: Number(at4(i, 2)), /* count */
        proposed: pending.toLowerCase() === ZERO ? null : (pending as Address),
      };
    }),
    silence: Number(answers[seats.length * FIELDS.length]), /* count */
    chainNow: a.timestamp,
  };
}
