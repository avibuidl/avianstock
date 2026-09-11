// "Which birds does this address own?" — without an indexer.
//
// The collection is deliberately NOT ERC721Enumerable (HANDOVER section 9 says
// so): there is no `tokenByIndex` and no `tokenOfOwnerByIndex`, so nothing on
// the collection itself can walk it.
//
// TWO WAYS TO ASK, and the manifest says which.
//
// With a lens (`manifest().lens`), `AvianLens` walks it for us: a stateless
// contract that calls `ownerOf` for every id in a range and returns the ids an
// address holds, or the owner of each id. Its answer IS `ownerOf`, so nothing
// needs confirming afterwards. Pages of at most 2,000 ids, each its own
// `eth_call` in one JSON-RPC batch — see `readEach` for why not Multicall3.
//
// Without one, a chunked `Transfer` log scan produces CANDIDATES, and every
// candidate is confirmed with `ownerOf` before it is shown. Logs are a hint;
// `ownerOf` is the authority. This is the fallback, and it is the only path on
// which `confirmOwnership` and `ownershipConsistency` still earn their keep.
//
// Why the lens exists: on a chain minting ten blocks a second, the scan was 23
// sequential `eth_getLogs` two days after deployment and growing by nine a
// day, and the satchel check ran it once more per bird. The lens answers in
// two or three reads and does not grow.
//
// Either way a read that fails THROWS, and the panel says "we could not read
// your birds" — it never renders an empty gallery, because "you own nothing"
// and "we could not ask" are different sentences and only one of them is true.

import { parseAbiItem } from 'viem';
import { getLogsChunked, readEach, readMany, readOne, tryReadMany, type At } from './client';
import { contracts, manifest } from './manifest';
import { avianLensAbi, avianStockAbi } from './abis.generated';
import { unpackCombo } from '../art/render';
import type { Address, TokenId, TraitIndices } from '../mock/types';

const TRANSFER = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)');

type Entry = { at: bigint; ids: TokenId[] };
const owned = new Map<string, Entry>();

/** The one owners sweep kept for the pinned block. Nothing outlives a block. */
let sweep: { at: bigint; owners: Address[] } | null = null;

export function invalidateOwnership(who?: Address) {
  if (who) owned.delete(who.toLowerCase());
  else owned.clear();
  sweep = null;
}

/** A page is at most this many ids: about 8M gas at ~4,100 per `ownerOf`. */
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
 * The ids `who` holds right now.
 *
 * Lens: `tokensOfOwnerIn` over every page, ascending within a page and pages
 * in order, so the concatenation is already sorted. No confirmation step — the
 * lens read `ownerOf` to answer, and reading it again would be asking the same
 * contract the same question in the same block.
 *
 * Scan: every id `who` has ever RECEIVED, confirmed still theirs. Only the
 * `to` side is scanned; a bird received and later sent away simply fails the
 * `ownerOf` confirmation, so scanning `from` as well would cost a second pass
 * to learn nothing.
 */
export async function ownedBy(who: Address, at: At, total?: number): Promise<TokenId[]> {
  const key = who.toLowerCase();
  const hit = owned.get(key);
  if (hit && hit.at === at.blockNumber) return hit.ids;

  const lens = manifest().lens;
  if (lens) {
    // `total` is passed by a caller that has already read it, so the lens
    // pages can go out in the same round as its other lens reads.
    const minted = total ?? await mintedSoFar(at);
    const perPage = await readEach<readonly bigint[]>(pages(minted).map(([start, stop]) => ({
      address: lens, abi: avianLensAbi, functionName: 'tokensOfOwnerIn',
      args: [contracts().AvianStock, who, start, stop],
    })), at);
    const ids = perPage.flatMap((page) => page.map((id) => Number(id)));
    owned.set(key, { at: at.blockNumber, ids });
    return ids;
  }

  const logs = await getLogsChunked({
    address: contracts().AvianStock,
    event: TRANSFER,
    args: { to: who },
    fromBlock: BigInt(manifest().startBlock),
    toBlock: at.blockNumber,
  }) as { args: { tokenId?: bigint } }[];

  const candidates = [...new Set(logs.map((l) => Number(l.args.tokenId)))]
    .filter((n) => Number.isInteger(n) && n > 0)
    .sort((a, b) => a - b);

  const ids = await confirmOwnership(candidates, who, at);
  owned.set(key, { at: at.blockNumber, ids });
  return ids;
}

/**
 * Who holds every id, `1..totalMinted`, at the pinned block — or null when
 * there is no lens and the caller has to fall back to scanning.
 *
 * Index `i` is the owner of id `i + 1`; the zero address is a burnt or unminted
 * id. ONE sweep per page load, kept for the block: every satchel on the page
 * is then a local lookup — "which ids have this satchel's address as owner" —
 * where it used to be a log scan per bird. The Flock's "whose is this" is the
 * same lookup.
 */
export async function ownersAt(at: At, total?: number): Promise<Address[] | null> {
  const lens = manifest().lens;
  if (!lens) return null;
  if (sweep && sweep.at === at.blockNumber) return sweep.owners;

  const minted = total ?? await mintedSoFar(at);
  const perPage = await readEach<readonly Address[]>(pages(minted).map(([start, stop]) => ({
    address: lens, abi: avianLensAbi, functionName: 'ownersOf',
    args: [contracts().AvianStock, start, stop],
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

/**
 * `ownerOf` for every candidate, in one multicall. A revert means "not any more".
 *
 * FALLBACK ONLY. The lens's answer is `ownerOf` already; this exists to turn
 * the log scan's candidates into a fact, and has nothing to add to a fact.
 */
export async function confirmOwnership(ids: TokenId[], who: Address, at: At): Promise<TokenId[]> {
  if (ids.length === 0) return [];
  const results = await tryReadMany<Address>(
    ids.map((id) => ({
      address: contracts().AvianStock,
      abi: avianStockAbi,
      functionName: 'ownerOf',
      args: [BigInt(id)],
    })),
    at,
  );
  const out: TokenId[] = [];
  results.forEach((r, i) => {
    if (r.ok && r.value.toLowerCase() === who.toLowerCase()) out.push(ids[i]);
  });
  return out;
}

/**
 * What the log scan found against what the contract counts. They should agree;
 * when they do not, the panel says it may not be showing everything rather than
 * quietly under-reporting, which is the same failure as showing a zero.
 *
 * FALLBACK ONLY. With a lens the count and the list come from the same
 * `ownerOf` walk in the same block and cannot disagree, so the read is not
 * made: the answer is "consistent" by construction.
 */
export async function ownershipConsistency(who: Address, found: number, at: At): Promise<{
  ok: boolean; found: number; balance: number;
}> {
  if (manifest().lens) return { ok: true, found, balance: found };
  const [howMany] = await readMany<bigint>([{
    address: contracts().AvianStock,
    abi: avianStockAbi,
    functionName: 'balanceOf',
    args: [who],
  }], at);
  // ERC-721 `balanceOf` is a count of birds, capped at MAX_SUPPLY. Not money.
  const counted = Number(howMany); /* count */
  return { ok: counted === found, found, balance: counted };
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
