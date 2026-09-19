// "Which birds does this address own?" — the collection answers.
//
// The collection is deliberately NOT ERC721Enumerable (HANDOVER section 9 says
// so): there is no `tokenByIndex` and no `tokenOfOwnerByIndex`. What it has
// instead (since 2026-09-11) are two views of its own that walk `_ownerOf`
// from storage, one SLOAD per id: `tokensOfOwnerIn(who, start, stop)` and
// `ownersOf(start, stop)`. Ids are 1-based, `stop` is inclusive and free past
// `totalMinted`, `start` of 0 means 1. Their answer IS `ownerOf`, read from
// the same storage in the same block, so nothing needs confirming afterwards.
//
// Pages of at most 2,000 ids, each its own `eth_call`, in one JSON-RPC batch —
// see `readEach` for why not Multicall3. About 2,600 gas per id, measured.
//
// There is no other way to ask any more. The `Transfer`-log scan that used to
// be the fallback is gone: on a chain minting ten blocks a second it was 23
// sequential `eth_getLogs` two days after deployment, and every deployment
// from now on carries these views. A read that fails THROWS, and the panel
// says "we could not read your birds" — it never renders an empty gallery,
// because "you own nothing" and "we could not ask" are different sentences and
// only one of them is true.

import { readEach, readOne, tryReadMany, type At } from './client';
import { contracts } from './manifest';
import { avianStockAbi } from './abis.generated';
import { unpackCombo } from '../art/render';
import type { Address, TokenId, TraitIndices } from '../mock/types';

type Entry = { at: bigint; ids: TokenId[] };
const owned = new Map<string, Entry>();

/** The one owners sweep kept for the pinned block. Nothing outlives a block. */
let sweep: { at: bigint; owners: Address[] } | null = null;

export function invalidateOwnership(who?: Address) {
  if (who) owned.delete(who.toLowerCase());
  else owned.clear();
  sweep = null;
}

/** A page is at most this many ids: about 5M gas at ~2,600 per id. */
const LENS_PAGE = 2000;

/** `[start, stop]` pairs, 1-based and inclusive, covering `1..total`. */
function pages(total: number): [bigint, bigint][] {
  const out: [bigint, bigint][] = [];
  for (let start = 1; start <= total; start += LENS_PAGE) {
    out.push([BigInt(start), BigInt(Math.min(start + LENS_PAGE - 1, total))]);
  }
  return out;
}

/** `totalMinted` at the block. Exported so a page can read it ONCE and hand it on. */
export async function mintedSoFar(at: At): Promise<number> {
  return Number(await readOne<bigint>({
    address: contracts().AvianStock, abi: avianStockAbi, functionName: 'totalMinted',
  }, at)); /* count */
}

/**
 * The ids `who` holds right now: `tokensOfOwnerIn` over every page, ascending
 * within a page and pages in order, so the concatenation is already sorted.
 * `total` is passed by a caller that has already read it, so the pages go out
 * in the same round as its other collection reads.
 */
export async function ownedBy(who: Address, at: At, total?: number): Promise<TokenId[]> {
  const key = who.toLowerCase();
  const hit = owned.get(key);
  if (hit && hit.at === at.blockNumber) return hit.ids;

  const minted = total ?? await mintedSoFar(at);
  const perPage = await readEach<readonly bigint[]>(pages(minted).map(([start, stop]) => ({
    address: contracts().AvianStock, abi: avianStockAbi, functionName: 'tokensOfOwnerIn',
    args: [who, start, stop],
  })), at);
  const ids = perPage.flatMap((page) => page.map((id) => Number(id)));
  owned.set(key, { at: at.blockNumber, ids });
  return ids;
}

/**
 * Who holds every id, `1..totalMinted`, at the pinned block.
 *
 * Index `i` is the owner of id `i + 1`; the zero address is a burnt or unminted
 * id. ONE sweep per page load, kept for the block: every satchel on the page
 * is then a local lookup — "which ids have this satchel's address as owner" —
 * and the Flock's "whose is this" is the same lookup.
 */
export async function ownersAt(at: At, total?: number): Promise<Address[]> {
  if (sweep && sweep.at === at.blockNumber) return sweep.owners;

  const minted = total ?? await mintedSoFar(at);
  const perPage = await readEach<readonly Address[]>(pages(minted).map(([start, stop]) => ({
    address: contracts().AvianStock, abi: avianStockAbi, functionName: 'ownersOf',
    args: [start, stop],
  })), at);
  const owners = perPage.flatMap((page) => [...page]);
  sweep = { at: at.blockNumber, owners };
  return owners;
}

/** From a sweep: the ids whose owner is `address`, ascending. */
export function heldByFrom(owners: Address[], address: Address): TokenId[] {
  const want = address.toLowerCase();
  const out: TokenId[] = [];
  owners.forEach((o, i) => { if (o.toLowerCase() === want) out.push(i + 1); });
  return out;
}

// ── traits ────────────────────────────────────────────────────────────────

const traits = new Map<TokenId, TraitIndices>();

export function rememberTraits(id: TokenId, t: TraitIndices) { traits.set(id, t); }
export function knownTraits(id: TokenId): TraitIndices | undefined { return traits.get(id); }
export function invalidateTraits() { traits.clear(); }

/** `traitsOf` for a list of ids, in one multicall, remembered afterwards. */
export async function traitsFor(ids: TokenId[], at?: At): Promise<Map<TokenId, TraitIndices>> {
  const missing = ids.filter((id) => !traits.has(id));
  if (missing.length) {
    const results = await tryReadMany<readonly number[]>(
      missing.map((id) => ({
        address: contracts().AvianStock,
        abi: avianStockAbi,
        functionName: 'traitsOf',
        args: [BigInt(id)],
      })),
      at,
    );
    // A revert here means burnt, not broken. `tokenCombo` is kept for exactly
    // this and gives the same six indices the mint packed.
    const burnt = missing.filter((_, i) => !results[i].ok);
    const combos = burnt.length
      ? await tryReadMany<bigint>(burnt.map((id) => ({
        address: contracts().AvianStock,
        abi: avianStockAbi,
        functionName: 'tokenCombo',
        args: [BigInt(id)],
      })), at)
      : [];
    const fromCombo = new Map<TokenId, TraitIndices>();
    burnt.forEach((id, i) => {
      const c = combos[i];
      if (c.ok && c.value !== 0n) fromCombo.set(id, unpackCombo(c.value));
    });

    results.forEach((r, i) => {
      const id = missing[i];
      if (r.ok) {
        const t = r.value;
        traits.set(id, [t[0], t[1], t[2], t[3], t[4], t[5]] as unknown as TraitIndices);
      } else {
        const t = fromCombo.get(id);
        // No traits and no combo is an id that was never minted. Cache nothing:
        // "we could not read it" must not become "it looks like this".
        if (t) traits.set(id, t);
      }
    });
  }
  const out = new Map<TokenId, TraitIndices>();
  for (const id of ids) {
    const t = traits.get(id);
    if (t) out.set(id, t);
  }
  return out;
}

/**
 * The synchronous accessor the perch gallery uses while it renders. Every read
 * that hands ids to a screen warms this cache first (see `reads.ts`), so a miss
 * is a race rather than the normal path — and a miss draws nothing rather than
 * drawing the wrong bird, because wrong art is a lie and an empty frame is not.
 */
export function traitsForId(id: TokenId): TraitIndices {
  return traits.get(id) ?? UNKNOWN_TRAITS;
}

/**
 * Not a bird. Every index is out of range for its category, so the renderer
 * draws an empty field: the "we do not know yet" frame.
 */
export const UNKNOWN_TRAITS = [-1, -1, -1, -1, -1, -1] as unknown as TraitIndices;

export function isUnknownTraits(t: TraitIndices): boolean {
  return t[0] < 0;
}
