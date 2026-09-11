// "Which birds does this address own?" — without an indexer.
//
// The collection is deliberately NOT ERC721Enumerable (HANDOVER section 9 says
// so, and says to read `Transfer` events instead): there is no `tokenByIndex`
// and no `tokenOfOwnerByIndex`, so nothing on chain can walk it.
//
// So: a chunked `Transfer` log scan produces CANDIDATES, and every candidate is
// confirmed with `ownerOf` before it is shown and before it is ever used in a
// transfer or a stake. Logs are a hint. `ownerOf` is the authority. A scan that
// fails throws, and the panel says "we couldn't read your birds" — it never
// renders an empty gallery, because "you own nothing" and "we could not ask"
// are different sentences and only one of them is true.

import { parseAbiItem } from 'viem';
import { getLogsChunked, readMany, tryReadMany, type At } from './client';
import { contracts, manifest } from './manifest';
import { avianStockAbi } from './abis.generated';
import { unpackCombo } from '../art/render';
import type { Address, TokenId, TraitIndices } from '../mock/types';

const TRANSFER = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)');

type Entry = { at: bigint; ids: TokenId[] };
const owned = new Map<string, Entry>();

export function invalidateOwnership(who?: Address) {
  if (who) owned.delete(who.toLowerCase());
  else owned.clear();
}

/**
 * Every id `who` has ever received, confirmed still theirs.
 *
 * Only the `to` side is scanned: a bird received and later sent away simply
 * fails the `ownerOf` confirmation, so scanning `from` as well would cost a
 * second pass to learn nothing.
 */
export async function ownedBy(who: Address, at: At): Promise<TokenId[]> {
  const key = who.toLowerCase();
  const hit = owned.get(key);
  if (hit && hit.at === at.blockNumber) return hit.ids;

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

/** `ownerOf` for every candidate, in one multicall. A revert means "not any more". */
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
 */
export async function ownershipConsistency(who: Address, found: number, at: At): Promise<{
  ok: boolean; found: number; balance: number;
}> {
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
