// The one thing this site must refuse to do. HANDOVER section 8.
//
// Every bird has an ERC-6551 wallet controlled by whoever owns the bird, so a
// bird can be put inside another bird's wallet — that is a feature. The failure
// is a CYCLE: A's satchel holds B, B's satchel is then given A, and now nobody
// owns either. Neither bird can ever be moved again and neither wallet can ever
// be used again.
//
// The chain refuses depth one (`TransferToOwnAccount`) and CANNOT refuse
// anything deeper — detecting it would mean walking an unbounded chain of
// external calls inside every transfer. That limit is documented and accepted
// in the contracts, and closing it is this file's job.
//
// Two properties this code is built around:
//
//   * `accountOf` is a PURE CREATE2 DERIVATION (`ERC6551Address.compute`, salt
//     zero), so the reverse map — address to token id — is computed locally,
//     with no RPC call per candidate. It is verified against
//     `token.accountOf(1)` on chain at start-up before anything trusts it.
//   * It REFUSES RATHER THAN ALLOWS whenever it cannot finish the walk: the
//     depth cap, an unminted destination bird, an RPC that will not answer. A
//     read that fails must never become permission.

import { getCreate2Address, keccak256, pad, toHex, type Hex } from 'viem';
import { readOne } from './client';
import { contracts, manifest } from './manifest';
import { avianStockAbi } from './abis.generated';
import type { Address, Bird, SatchelHolding, TokenId, TransferSafety } from '../mock/types';

/** HANDOVER section 8 step 4: "cap it at some sensible depth (say 32)". */
export const MAX_DEPTH = 32;

const ZERO = '0x0000000000000000000000000000000000000000';

// ── the derivation ────────────────────────────────────────────────────────

/**
 * Transcribed from `contracts/src/lib/ERC6551Address.sol`, which is itself
 * transcribed from the canonical registry's assembly:
 *
 *   creationCode = 3d60ad80600a3d3981f3363d3d373d3d3d363d73   ERC-1167 header
 *                  <implementation>                            20 bytes
 *                  5af43d82803e903d91602b57fd5bf3              ERC-1167 footer
 *                  <salt> <chainId> <tokenContract> <tokenId>  4 x 32 bytes
 *   account      = CREATE2(registry, salt, keccak256(creationCode))
 *
 * The salt, chain id, contract and token id live INSIDE the creation code; the
 * CREATE2 salt is the raw salt. (An early draft of the standard hashed them
 * into the salt; the deployed v0.3.1 registry does not.)
 */
const ERC1167_HEADER = '3d60ad80600a3d3981f3363d3d373d3d3d363d73';
const ERC1167_FOOTER = '5af43d82803e903d91602b57fd5bf3';

export type AccountConfig = {
  registry: Address;
  implementation: Address;
  salt: Hex;
  chainId: bigint;
  collection: Address;
};

let config: AccountConfig | null = null;

/** Set once at start-up from the collection's own immutables, not from a guess. */
export function setAccountConfig(c: AccountConfig) {
  config = c;
  cache.clear();
  reverse = null;
}

export function accountConfig(): AccountConfig {
  if (!config) throw new Error('the token-bound account derivation is not configured yet');
  return config;
}

const cache = new Map<TokenId, Address>();

export function computeAccount(tokenId: TokenId, c: AccountConfig = accountConfig()): Address {
  const hit = cache.get(tokenId);
  if (hit && config === c) return hit;

  const creationCode = ('0x'
    + ERC1167_HEADER
    + c.implementation.slice(2).toLowerCase()
    + ERC1167_FOOTER
    + c.salt.slice(2).padStart(64, '0')
    + pad(toHex(c.chainId), { size: 32 }).slice(2)
    + pad(c.collection, { size: 32 }).slice(2)
    + pad(toHex(BigInt(tokenId)), { size: 32 }).slice(2)) as Hex;

  const account = getCreate2Address({
    from: c.registry,
    salt: c.salt,
    bytecodeHash: keccak256(creationCode),
  }) as Address;

  if (config === c) cache.set(tokenId, account);
  return account;
}

/**
 * The synchronous accessor the UI already imports. It is exact — the same
 * derivation the collection does — not an approximation of one.
 */
export function satchelAddressOf(id: TokenId): Address {
  return computeAccount(id);
}

// ── the reverse map ───────────────────────────────────────────────────────

let reverse: { upTo: number; map: Map<string, TokenId> } | null = null;

/**
 * Address to token id, for ids 1..`upTo`. Built once and extended, never
 * queried over RPC: 5,555 entries is a few thousand keccaks and about a tenth
 * of a second, which is cheaper than one round trip.
 */
export function birdForAccount(address: Address, upTo: number): TokenId | null {
  if (!reverse || reverse.upTo < upTo) {
    const map = reverse?.map ?? new Map<string, TokenId>();
    for (let id = (reverse?.upTo ?? 0) + 1; id <= upTo; id++) {
      map.set(computeAccount(id).toLowerCase(), id);
    }
    reverse = { upTo, map };
  }
  return reverse.map.get(address.toLowerCase()) ?? null;
}

export function resetReverseMap() { reverse = null; cache.clear(); }

// ── the walk ──────────────────────────────────────────────────────────────

async function ownerOf(id: TokenId): Promise<Address | null> {
  try {
    return await readOne<Address>({
      address: contracts().AvianStock,
      abi: avianStockAbi,
      functionName: 'ownerOf',
      args: [BigInt(id)],
    });
  } catch {
    // Either the bird is not minted, or the node would not answer. Both are
    // "we cannot tell", and the caller turns that into a refusal.
    return null;
  }
}

/**
 * Before letting bird `id` be sent to `to`:
 *
 *   1. `to` is this bird's own satchel        -> refuse (the chain also does)
 *   2. `to` is the collection                 -> refuse, a standard dead end
 *   3. `to` is some bird B's satchel          -> walk upward from B
 *   4. `id` anywhere on that walk             -> REFUSE, it closes the loop
 *   5. depth 32, or a walk we cannot read     -> REFUSE rather than allow
 *
 * It does not throw. A caller that has to make a safety decision must always
 * get an answer, and the only safe answer to "I do not know" is no.
 */
export async function checkTransferSafety(id: TokenId, to: Address): Promise<TransferSafety> {
  const lower = to.toLowerCase();

  if (lower === ZERO) return { ok: false, reason: 'collection-address', path: [] };
  if (lower === contracts().AvianStock.toLowerCase()) {
    return { ok: false, reason: 'collection-address', path: [] };
  }
  if (lower === satchelAddressOf(id).toLowerCase()) {
    return { ok: false, reason: 'own-account', path: [id] };
  }

  // How far the reverse map has to reach. `totalMinted` is read live rather
  // than remembered: a bird minted since this page loaded has a satchel too.
  let totalMinted: number;
  try {
    totalMinted = Number(await readOne<bigint | number>({
      address: contracts().AvianStock,
      abi: avianStockAbi,
      functionName: 'totalMinted',
    }));
  } catch {
    // We cannot even establish the search space. Refuse.
    return { ok: false, reason: 'depth-cap', path: [] };
  }

  let cursor = birdForAccount(to, totalMinted);
  if (cursor === null) return { ok: true };   // not a bird's satchel at all

  const path: TokenId[] = [];
  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    path.push(cursor);
    if (cursor === id) return { ok: false, reason: 'cycle', path };

    const owner = await ownerOf(cursor);
    // An unminted destination bird, or a node that will not answer. Either way
    // we cannot prove this is safe, so we do not allow it.
    if (!owner) return { ok: false, reason: 'depth-cap', path };

    const next = birdForAccount(owner, totalMinted);
    if (next === null) return { ok: true };   // the chain ends at a real account
    cursor = next;
  }
  return { ok: false, reason: 'depth-cap', path };
}

/**
 * The sibling refusal on the same checklist: a bird whose satchel holds other
 * birds must not be staked, because the inner birds are frozen until the outer
 * one is unstaked. The ids come from the ownership index, each one already
 * confirmed with `ownerOf`.
 */
export function satchelBlocksStaking(bird: Bird): TokenId[] {
  return bird.satchel.holds
    .filter((h): h is Extract<SatchelHolding, { kind: 'avian' }> => h.kind === 'avian')
    .map((h) => h.id);
}

/** For the start-up cross-check: our derivation against the collection's own. */
export async function verifyDerivation(): Promise<{ ok: boolean; local: Address; onChain: Address }> {
  const local = computeAccount(1);
  const onChain = await readOne<Address>({
    address: contracts().AvianStock,
    abi: avianStockAbi,
    functionName: 'accountOf',
    args: [1n],
  });
  return { ok: local.toLowerCase() === onChain.toLowerCase(), local, onChain };
}

export function collectionAddress(): Address { return contracts().AvianStock; }
export function currentChainId(): number { return manifest().network.chainId; }
