// Everything the UI displays, read from the chain.
//
// Two rules run through all of it:
//
//   * BLOCK-PINNED. Each of these takes one `pin()` and passes it to every call
//     it makes, so the numbers on one panel are all from one block and cannot
//     contradict each other.
//   * A FAILURE IS A FAILURE. Nothing here catches a read error and returns a
//     zero, an empty array or a false. The panel renders the throw as its error
//     state, because "0 birds left" because a call timed out is a lie.
//
// One thing worth knowing before reading further: a SIMULATION of a write —
// `settle`, `claim` — cannot go through Multicall3. Aggregating makes
// `msg.sender` the multicall contract rather than the collector. They are
// issued as individual `eth_call`s with an explicit `from`, and always will be.

import { parseAbiItem, type Abi } from 'viem';
import {
  client, pin, readEach, readMany, readOne, tryReadAs, tryReadMany, type At,
} from './client';
import { contracts, manifest, poolContracts, sweeperAddress } from './manifest';
import {
  aviansAbi, theNestAbi, aviansHookAbi, avianStockAbi, liquidityVaultAbi, thePerchAbi,
  sweeperAbi, traitRegistryAbi, transferValidatorAbi, treasuryAbi,
} from './abis.generated';
import { ContractError, SELECTORS } from '../mock/errors';
import { asContractError } from './errors';
import {
  heldByFrom, invalidateOwnership, mintedSoFar, ownedBy, ownersAt,
  rememberTraits, traitsFor, traitsForId,
} from './birds';
import { birdForAccount, computeAccount, satchelAddressOf } from './safety';
import { setLaunchParams } from './launch';
import { packCombo, unpackCombo } from '../art/render';
import { estimateSince } from '../lib/stream';
import { COUNTS } from '../art/traits';
import type {
  Address, Amount, Bird, BirdLocation, BroodEntry, BroodState, BroodSummary, BroodTokenLine,
  SettleMove, SettlePreview,
  CollectionState, Deployment, ErrorName, Hex, LaunchState, PerchState, RewardSplit,
  RewardSplitPart, RewardStream, RewardToken,
  OwnerStatus, SatchelHolding, SweepBird, SweepState, Tier, TokenId, TraitIndices, TreasuryRow,
  TreasuryState, VaultState,
  WalletState,
} from '../mock/types';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address;

/** Every read funnels its failures through one place. */
export async function guard<T>(where: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throw asContractError(e, { where });
  }
}

// ── the collection ────────────────────────────────────────────────────────

export async function getCollection(at?: At): Promise<CollectionState> {
  return guard('reading the collection', async () => {
    const a = at ?? await pin();
    const t = contracts().AvianStock;
    const call = (functionName: string, args?: readonly unknown[]) =>
      ({ address: t, abi: avianStockAbi as unknown as Abi, functionName, args });

    const r = await readMany<unknown>([
      call('name'), call('symbol'), call('MAX_SUPPLY'), call('totalMinted'),
      call('WALLET_LIMIT'), call('mintOpen'), call('price'), call('MIN_PRICE'),
      call('paidRemaining'), call('freeMintOpen'), call('FREE_ALLOCATION'),
      call('freeMinted'), call('reservedFree'), call('freeAllocationReleased'),
      call('freeReleaseAvailableAt'), call('freeOpenSeconds'), call('requiredBacking'),
      call('burned'),
      // A sale price of 10,000 makes the answer the numerator itself, in bps.
      call('royaltyInfo', [0n, 10_000n]),
    ], a);

    const releaseAt = Number(r[14] as bigint);
    return {
      name: r[0] as string,
      symbol: r[1] as string,
      maxSupply: Number(r[2] as number),
      totalMinted: Number(r[3] as number),
      walletLimit: Number(r[4] as number),
      mintOpen: r[5] as boolean,
      price: r[6] as Amount,
      minPrice: r[7] as Amount,
      paidRemaining: Number(r[8] as bigint),
      freeMintOpen: r[9] as boolean,
      freeAllocation: Number(r[10] as number),
      freeMinted: Number(r[11] as number),
      reservedFree: Number(r[12] as bigint),
      freeAllocationReleased: r[13] as boolean,
      // 0 means "not applicable", which is not the same as the epoch.
      freeReleaseAvailableAt: releaseAt === 0 ? null : releaseAt,
      freeOpenSeconds: Number(r[15] as bigint),
      requiredBacking: r[16] as Amount,
      burned: Number(r[17] as number), /* count */
      royaltyBps: Number((r[18] as readonly [Address, bigint])[1]), /* count */
    };
  });
}

// ── the allowlist proofs ──────────────────────────────────────────────────

/**
 * `proofs.json` is a static file the site serves; building the tree is
 * `tools/allowlist.mjs`'s job and the list is the owner's. A wallet on the
 * MANUAL list has no proof and passes an empty array — the contract checks the
 * manual list first — so a missing entry is not an error.
 *
 * ONE FETCH, SHARED. The first caller starts it and every caller awaits the
 * same promise. It used to set a "loaded" flag before the fetch resolved, so
 * a second read arriving while the file was in flight — the compose page
 * reads the wallet from two places, and StrictMode doubles every effect —
 * got an empty proof and rendered a Merkle-listed wallet as "not on the
 * list". Found on the launch dry run; the wallet was on the list.
 */
let proofsPromise: Promise<Record<string, Hex[]> | null> | null = null;

async function loadProofs(): Promise<Record<string, Hex[]> | null> {
  const path = manifest().allowlistProofs;
  if (!path) return null;
  try {
    const res = await fetch(new URL(path, location.href).toString(), { cache: 'no-store' });
    if (!res.ok) return null;
    const raw = await res.json() as Record<string, unknown>;
    const out: Record<string, Hex[]> = {};
    for (const [address, proof] of Object.entries(raw)) {
      if (Array.isArray(proof) && proof.every((p) => typeof p === 'string' && /^0x[0-9a-fA-F]{64}$/.test(p))) {
        out[address.toLowerCase()] = proof as Hex[];
      }
    }
    return out;
  } catch {
    // A network failure is retried on the next read rather than remembered
    // as "no proofs". A missing file is a start-up failure (startup.ts).
    proofsPromise = null;
    return null;
  }
}

export async function proofFor(who: Address): Promise<Hex[]> {
  if (!proofsPromise) proofsPromise = loadProofs();
  const proofs = await proofsPromise;
  return proofs?.[who.toLowerCase()] ?? [];
}

export function resetProofs() { proofsPromise = null; }

/** `freeMintStatus` returns a selector. Turn it into a name the UI explains. */
const NAME_BY_SELECTOR: Record<string, ErrorName> = (() => {
  const out: Record<string, ErrorName> = {};
  for (const [name, selector] of Object.entries(SELECTORS)) {
    if (selector) out[selector.toLowerCase()] = name as ErrorName;
  }
  return out;
})();

export function selectorToName(selector: string): ErrorName | null {
  if (!selector || /^0x0{8}$/.test(selector)) return null;
  return NAME_BY_SELECTOR[selector.toLowerCase()] ?? 'Unknown';
}

// ── the wallet ────────────────────────────────────────────────────────────

export async function getWallet(who: Address, at?: At): Promise<WalletState> {
  return guard('reading your wallet', async () => {
    const a = at ?? await pin();
    const c = contracts();
    const proof = await proofFor(who);

    const [eth, results] = await Promise.all([
      client().getBalance({ address: who, blockNumber: a.blockNumber }),
      readMany<unknown>([
        { address: c.Avians, abi: aviansAbi as unknown as Abi, functionName: 'balanceOf', args: [who] },
        { address: c.Avians, abi: aviansAbi as unknown as Abi, functionName: 'allowance', args: [who, c.AvianStock] },
        { address: c.Avians, abi: aviansAbi as unknown as Abi, functionName: 'allowance', args: [who, c.TheNest] },
        { address: c.Avians, abi: aviansAbi as unknown as Abi, functionName: 'allowance', args: [who, c.ThePerch] },
        { address: c.AvianStock, abi: avianStockAbi as unknown as Abi, functionName: 'mintedBy', args: [who] },
        { address: c.AvianStock, abi: avianStockAbi as unknown as Abi, functionName: 'freeClaimed', args: [who] },
        { address: c.AvianStock, abi: avianStockAbi as unknown as Abi, functionName: 'isAllowlisted', args: [who, proof] },
        { address: c.AvianStock, abi: avianStockAbi as unknown as Abi, functionName: 'freeMintStatus', args: [who, proof] },
        { address: c.AvianStock, abi: avianStockAbi as unknown as Abi, functionName: 'isApprovedForAll', args: [who, c.ThePerch] },
      ], a),
    ]);

    // Named, not indexed. These were `results[3]`, `results[7]` and so on, and
    // inserting one call into the list above silently moved every field after
    // it — a wallet's mint count would have started reading its allowance.
    const [
      aviansBalance, allowanceCollection, allowanceNest, allowancePerch,
      mintedBy, freeClaimed, isAllowlisted, freeMintSelector,
      birdsToPerch,
    ] = results;

    return {
      address: who,
      eth,
      avians: aviansBalance as Amount,
      mintedBy: Number(mintedBy as number),
      freeClaimed: freeClaimed as boolean,
      isAllowlisted: isAllowlisted as boolean,
      proof: proof.length ? proof : null,
      freeMintStatus: selectorToName(freeMintSelector as string),
      approvals: {
        aviansToCollection: allowanceCollection as Amount,
        aviansToNest: allowanceNest as Amount,
        aviansToPerch: allowancePerch as Amount,
        birdsToPerch: birdsToPerch as boolean,
      },
    };
  });
}

export async function freeMintStatus(who: Address, proof: Hex[]): Promise<ErrorName | null> {
  return guard('checking the free mint', async () => {
    const selector = await readOne<string>({
      address: contracts().AvianStock,
      abi: avianStockAbi as unknown as Abi,
      functionName: 'freeMintStatus',
      args: [who, proof],
    });
    return selectorToName(selector);
  });
}

// ── birds ─────────────────────────────────────────────────────────────────

/**
 * The listed reward tokens, with metadata, at the block. Read once per block
 * and handed to every satchel on the page: their balances are what a satchel
 * is worth looking inside for.
 */
let listedAt: { at: bigint; tokens: RewardToken[] } | null = null;
async function listedTokens(at: At): Promise<RewardToken[]> {
  if (listedAt && listedAt.at === at.blockNumber) return listedAt.tokens;
  const c = contracts();
  const raw = await readOne<readonly Address[]>({
    address: c.TheNest, abi: theNestAbi as unknown as Abi, functionName: 'listedRewardTokens',
  }, at).catch(() => [] as readonly Address[]);
  const meta = await tokenMeta([...raw], at);
  const tokens = [...raw].map((a) => meta.get(a.toLowerCase())!);
  listedAt = { at: at.blockNumber, tokens };
  return tokens;
}

/**
 * A bird is in a wallet, in the perch, inside another bird's satchel, or
 * burnt. It is never "in the Nest": brooding is not custodial, and a bird
 * that IS at the Nest's address got there by a mistaken `transferFrom`, which
 * the owner's `rescueBird` undoes. That case reads as a wallet here — the
 * Nest's — which is the truth.
 */
function locationOf(owner: Address, totalMinted: number): BirdLocation {
  const c = contracts();
  if (owner.toLowerCase() === c.ThePerch.toLowerCase()) return { where: 'perch' };
  const host = birdForAccount(owner, totalMinted);
  if (host !== null) return { where: 'satchel', hostId: host };
  return { where: 'wallet', owner };
}

/**
 * `broodOf` + `isBrooding` + `deliveryOf` for a list of ids, one multicall.
 * `live` is the contract's word and covers the missed-stamp fallback; nothing
 * here decides expiry from the stamp.
 */
async function broodsOf(ids: TokenId[], at: At): Promise<Map<TokenId, BroodSummary | null>> {
  const out = new Map<TokenId, BroodSummary | null>();
  if (ids.length === 0) return out;
  const c = contracts();
  const n = (functionName: string, args: readonly unknown[]) =>
    ({ address: c.TheNest, abi: theNestAbi as unknown as Abi, functionName, args });
  const rows = await readMany<unknown>(ids.flatMap((id) => [
    n('broodOf', [BigInt(id)]), n('isBrooding', [BigInt(id)]), n('deliveryOf', [BigInt(id)]),
  ]), at);
  ids.forEach((id, i) => {
    const b = rows[i * 3] as readonly [Address, number, bigint, bigint];
    const live = rows[i * 3 + 1] as boolean;
    const d = rows[i * 3 + 2] as readonly [Address, boolean];
    const tier = Number(b[1]);
    out.set(id, tier === 0 ? null : {
      activator: b[0],
      tier: tier as Tier,
      activatedAt: Number(b[2]),
      expiredAt: Number(b[3]),
      live,
      delivery: { to: d[0], toWallet: d[1] },
    });
  });
  return out;
}

/**
 * `owners` is the page's one `ownersAt` sweep, when there is a lens. Birds
 * inside this satchel are then the ids whose owner is the satchel's address —
 * a local filter, no read. Null means no lens, and the log scan runs for this
 * one satchel as it always did.
 */
async function satchelOf(
  id: TokenId, totalMinted: number, at: At, owners: Address[], satchelTokens: RewardToken[],
): Promise<Bird['satchel']> {
  const account = satchelAddressOf(id);
  const c = contracts();

  const [code, eth, balances] = await Promise.all([
    client().getCode({ address: account, blockNumber: at.blockNumber }),
    client().getBalance({ address: account, blockNumber: at.blockNumber }),
    tryReadMany<bigint>(
      [{ address: c.Avians, abi: aviansAbi as unknown as Abi, functionName: 'balanceOf', args: [account] },
        ...satchelTokens.map((t) => ({
          address: t.address, abi: aviansAbi as unknown as Abi, functionName: 'balanceOf', args: [account],
        }))],
      at,
    ),
  ]);

  const holds: SatchelHolding[] = [];
  if (eth > 0n) holds.push({ kind: 'eth', amount: eth });
  if (balances[0]?.ok && balances[0].value > 0n) {
    holds.push({ kind: 'erc20', symbol: 'AVIANS', decimals: 18, amount: balances[0].value });
  }
  satchelTokens.forEach((t, i) => {
    const b = balances[i + 1];
    if (b?.ok && b.value > 0n) holds.push({ kind: 'erc20', symbol: t.symbol, decimals: t.decimals, amount: b.value });
  });

  // Birds inside this bird's satchel — the reason the cycle refusal exists.
  // The sweep already holds every owner at this block. No read.
  for (const inner of heldByFrom(owners, account)) holds.push({ kind: 'avian', id: inner });

  void totalMinted;
  return { address: account, deployed: !!code && code !== '0x', holds };
}

export async function getBird(id: TokenId, at?: At): Promise<Bird> {
  return guard('reading that bird', async () => {
    const a = at ?? await pin();
    const c = contracts();

    // A burnt bird reverts on `ownerOf` and `traitsOf` and answers on
    // `tokenCombo`. That is not a fault, so neither read may be strict: a page
    // for a burnt bird has to draw, and only `tokenCombo` can draw it.
    const [traitsRaw, comboRes, ownerRes] = await tryReadMany<unknown>([
      { address: c.AvianStock, abi: avianStockAbi as unknown as Abi, functionName: 'traitsOf', args: [BigInt(id)] },
      { address: c.AvianStock, abi: avianStockAbi as unknown as Abi, functionName: 'tokenCombo', args: [BigInt(id)] },
      { address: c.AvianStock, abi: avianStockAbi as unknown as Abi, functionName: 'ownerOf', args: [BigInt(id)] },
    ], a);
    const totalMinted = Number(await readOne<number>({
      address: c.AvianStock, abi: avianStockAbi as unknown as Abi, functionName: 'totalMinted',
    }, a));

    const combo = comboRes.ok ? BigInt(comboRes.value as bigint) : 0n;
    // No combo AND no owner is an id that was never minted — a different thing
    // from a burnt one, and it must stay an error rather than draw a blank bird.
    if (!ownerRes.ok && combo === 0n) {
      throw new ContractError('ERC721NonexistentToken', { tokenId: id });
    }

    const traits = traitsRaw.ok
      ? (() => {
        const t = traitsRaw.value as readonly number[];
        return [t[0], t[1], t[2], t[3], t[4], t[5]] as unknown as TraitIndices;
      })()
      : unpackCombo(combo);
    rememberTraits(id, traits);

    const [owners, listed, broods] = await Promise.all([ownersAt(a), listedTokens(a), broodsOf([id], a)]);
    const brood = broods.get(id) ?? null;
    const [satchel, broodLines] = await Promise.all([
      satchelOf(id, totalMinted, a, owners, listed),
      brood ? broodLinesOf(id, brood, listed, a) : Promise.resolve(undefined),
    ]);
    const location: BirdLocation = ownerRes.ok
      ? locationOf(ownerRes.value as Address, totalMinted)
      : { where: 'burnt' };

    return { id, traits, combo, location, satchel, brood, broodLines };
  });
}

export async function getBirdsOf(who: Address, at?: At): Promise<Bird[]> {
  return guard('reading your birds', async () => {
    const a = at ?? await pin();
    /*
      THREE ROUND TRIPS, and the shape is the point.

        1. `totalMinted` — once. It used to be read three times over, each
           behind its own await, and every extra read was a round trip nothing
           else could share.
        2. The lens: the wallet's ids AND the owners sweep, together. Both page
           over `1..totalMinted`, neither depends on the other, and the
           transport puts them in one HTTP request.
        3. Everything per bird — traits, combos, and every satchel's code,
           balance and token balances — together. The satchels need only the
           ids and the sweep, not the traits, so they do not wait for them.

      The listed reward tokens ride in the second round too, so the third
      can read every satchel's balance in each of them.
    */
    const totalMinted = await mintedSoFar(a);
    const [ids, owners, listed] = await Promise.all([
      ownedBy(who, a, totalMinted), ownersAt(a, totalMinted), listedTokens(a),
    ]);
    const [traits, combos, satchels, broods] = await Promise.all([
      traitsFor(ids, a),
      readMany<bigint>(ids.map((id) => ({
        address: contracts().AvianStock, abi: avianStockAbi as unknown as Abi,
        functionName: 'tokenCombo', args: [BigInt(id)],
      })), a),
      Promise.all(ids.map((id) => satchelOf(id, totalMinted, a, owners, listed))),
      broodsOf(ids, a),
    ]);

    return ids.map((id, i) => ({
      id,
      traits: traits.get(id) ?? traitsForId(id),
      combo: combos[i],
      location: { where: 'wallet', owner: who } as BirdLocation,
      satchel: satchels[i],
      brood: broods.get(id) ?? null,
    } satisfies Bird));
  });
}

/**
 * A window of minted ids, newest first.
 *
 * There is no on-chain way to walk the collection — the comment in HANDOVER
 * section 9 is the whole story — so this is `totalMinted` plus one `traitsOf`
 * and one `ownerOf` per id in the window. A real deployment at 5,555 wants an
 * indexer behind this call; the window is what keeps it a page load in the
 * meantime.
 */
export async function getMintedBirds(o: { offset?: number; limit?: number } = {}, at?: At):
Promise<{ birds: Bird[]; total: number }> {
  return guard('reading the flock', async () => {
    const a = at ?? await pin();
    const c = contracts();
    const total = Number(await readOne<number>({
      address: c.AvianStock, abi: avianStockAbi as unknown as Abi, functionName: 'totalMinted',
    }, a));

    const offset = o.offset ?? 0;
    const limit = o.limit ?? 24;

    // BURNT IDS ARE SKIPPED, not drawn and not counted. `ownerOf` reverts for
    // one, so the read cannot be strict — and because a burnt id in the window
    // would otherwise short the page, the walk keeps going until the page is
    // full or the ids run out. Burns are one in a hundred deposits, so this
    // almost never takes a second pass; it is written to survive the case where
    // it does rather than to be fast in the case where it does not.
    const birds: Bird[] = [];
    let cursor = total - offset;
    for (let pass = 0; pass < 4 && birds.length < limit && cursor > 0; pass++) {
      const want = limit - birds.length;
      const ids: TokenId[] = [];
      for (; cursor > 0 && ids.length < want; cursor--) ids.push(cursor);
      if (ids.length === 0) break;

      const [traits, owners, combos, broods] = await Promise.all([
        traitsFor(ids, a),
        tryReadMany<Address>(ids.map((id) => ({
          address: c.AvianStock, abi: avianStockAbi as unknown as Abi, functionName: 'ownerOf', args: [BigInt(id)],
        })), a),
        readMany<bigint>(ids.map((id) => ({
          address: c.AvianStock, abi: avianStockAbi as unknown as Abi, functionName: 'tokenCombo', args: [BigInt(id)],
        })), a),
        broodsOf(ids, a),
      ]);

      for (let i = 0; i < ids.length; i++) {
        const owner = owners[i];
        if (!owner.ok) continue;                           // burnt
        const id = ids[i];
        birds.push({
          id,
          traits: traits.get(id) ?? unpackCombo(combos[i]),
          combo: combos[i],
          location: locationOf(owner.value, total),
          // The gallery does not open satchels: that is one code read and a
          // balance per bird, and it shows two dozen at a time.
          satchel: { address: satchelAddressOf(id), deployed: false, holds: [] },
          brood: broods.get(id) ?? null,
        } satisfies Bird);
      }
    }

    return { birds, total };
  });
}

// ── the perch ─────────────────────────────────────────────────────────────

export async function getPerch(who: Address | null, at?: At): Promise<PerchState> {
  return guard('reading the perch', async () => {
    const a = at ?? await pin();
    const c = contracts();
    const call = (functionName: string, args?: readonly unknown[]) =>
      ({ address: c.ThePerch, abi: thePerchAbi as unknown as Abi, functionName, args });

    const [base, sellFee, buyFee, pickFee, poolSize, lowest, backing, held, maxSupply,
      burnEvery, deposits, untilBurn, burnFloor, burnsActive] =
      await readMany<unknown>([
        call('BASE'), call('SELL_FEE_BPS'), call('BUY_FEE_BPS'), call('PICK_FEE_BPS'),
        call('poolSize'), call('lowestId'), call('backingRequired'),
        { address: c.Avians, abi: aviansAbi as unknown as Abi, functionName: 'balanceOf', args: [c.ThePerch] },
        { address: c.AvianStock, abi: avianStockAbi as unknown as Abi, functionName: 'MAX_SUPPLY' },
        call('BURN_EVERY'), call('deposits'), call('depositsUntilNextBurn'),
        // The floor (2026-09-11). `depositsUntilNextBurn` reads 0 while
        // `burnsActive` is false, and 0 must never be read as "next sale burns".
        call('BURN_FLOOR'), call('burnsActive'),
      ], a);

    const BASE = base as bigint;
    const BPS = 10_000n;
    // Derived from the contract's own constants, never written down here.
    const sell = BASE - (BASE * (sellFee as bigint)) / BPS;
    const buyNext = BASE + (BASE * (buyFee as bigint)) / BPS;
    const buyNamed = BASE + (BASE * (pickFee as bigint)) / BPS;

    const words = Math.ceil(Number(maxSupply as number) / 256); /* count */ // MAX_SUPPLY is 5,555
    const heldIds = Number(poolSize as bigint) === 0
      ? []
      : idsFromBitmap(await readMany<bigint>(
        Array.from({ length: words }, (_, w) => call('heldWord', [BigInt(w)])), a,
      ));

    // Warm the trait cache for everything the gallery is about to draw, so the
    // synchronous `traitsForId` the perch screen uses never misses.
    if (heldIds.length) await traitsFor(heldIds.slice(0, 240), a);

    return {
      base: BASE,
      sell,
      buyNext,
      buyNamed,
      poolSize: Number(poolSize as bigint),
      lowestId: Number(lowest as bigint) || null,
      heldIds,
      backingRequired: backing as Amount,
      aviansHeld: held as Amount,
      operatorWhitelisted: await operatorWhitelisted(c.ThePerch, who, heldIds[0] ?? 1, a),
      burnEvery: Number(burnEvery as bigint), /* count */
      deposits: Number(deposits as bigint), /* count */
      depositsUntilNextBurn: Number(untilBurn as bigint), /* count */
      burnFloor: Number(burnFloor as bigint), /* count */
      burnsActive: burnsActive as boolean,
    };
  });
}

function idsFromBitmap(words: bigint[]): TokenId[] {
  const out: TokenId[] = [];
  words.forEach((word, w) => {
    if (word === 0n) return;
    for (let bit = 0; bit < 256; bit++) {
      if ((word >> BigInt(bit)) & 1n) out.push(w * 256 + bit);
    }
  });
  return out.sort((x, y) => x - y);
}

/**
 * Is the batch route open on this deployment?
 *
 * HANDOVER section 7: if `sell(ids)` or `stake(ids, tiers)` comes back with
 * `0xef28f901` the operator whitelist has not been applied, and the answer is
 * the push route — which always works. `validateTransfer` is a REVERTING VIEW,
 * so we can ask that question for free instead of discovering it when someone
 * has already been asked to sign.
 */
async function operatorWhitelisted(operator: Address, who: Address | null, sampleId: TokenId, at: At): Promise<boolean> {
  const validator = await readOne<Address>({
    address: contracts().AvianStock, abi: avianStockAbi as unknown as Abi, functionName: 'getTransferValidator',
  }, at).catch(() => ZERO_ADDRESS);
  if (validator === ZERO_ADDRESS) return true;   // no validator: nothing to refuse

  /*
    ASKED AS THE COLLECTION, BECAUSE THAT IS WHOSE POLICY THIS IS.

    `validateTransfer` reads the policy of `msg.sender` — the collection whose
    transfers are being validated — not of the account named in `from`. Asked
    with no sender set, the validator answered for the zero address's default
    policy, which whitelists nobody: every operator was refused on every chain,
    and the site fell back to the push route with the "batch route is not
    approved" callout permanently showing.

    MEASURED ON 46630: asked as the collection, the Perch, the Nest and Seaport
    are all admitted; asked as a wallet, all three are refused.

    The fallback below is kept — a deployment whose whitelist really has not
    been applied still answers `CallerMustBeWhitelisted`, and that is a true
    answer that must still reach the screen. It should simply never fire on a
    deployment that is configured.
  */
  const from = who ?? contracts().ThePerch;
  const result = await tryReadAs({
    address: validator,
    abi: transferValidatorAbi as unknown as Abi,
    functionName: 'validateTransfer',
    args: [operator, from, operator, BigInt(sampleId)],
  }, contracts().AvianStock, at);
  if (result.ok) return true;
  // Only the whitelist error means "the batch route is closed". Any other
  // refusal (a frozen account, a token that is not there) is about this sample,
  // not about the route.
  const err = asContractError(result.error);
  return err.errorName !== 'CallerMustBeWhitelisted';
}

export async function quoteSell(count: number): Promise<Amount> {
  return guard('quoting a sale', () => readOne<bigint>({
    address: contracts().ThePerch, abi: thePerchAbi as unknown as Abi, functionName: 'quoteSell', args: [BigInt(count)],
  }));
}

export async function quoteBuyNext(count: number): Promise<Amount> {
  return guard('quoting a purchase', () => readOne<bigint>({
    address: contracts().ThePerch, abi: thePerchAbi as unknown as Abi, functionName: 'quoteBuyNext', args: [BigInt(count)],
  }));
}

export async function quoteBuy(ids: TokenId[]): Promise<Amount> {
  return guard('quoting a purchase', () => readOne<bigint>({
    address: contracts().ThePerch, abi: thePerchAbi as unknown as Abi, functionName: 'quoteBuy',
    args: [ids.map((i) => BigInt(i))],
  }));
}

/** Exactly which birds `buyNext(n)` would hand over: the n lowest ids held. */
export async function nextBirds(n: number): Promise<TokenId[]> {
  const perch = await getPerch(null);
  return perch.heldIds.slice(0, n);
}

// ── the roost ─────────────────────────────────────────────────────────────

const erc20Meta = new Map<string, { symbol: string; decimals: number }>();

export async function tokenMeta(addresses: Address[], at: At): Promise<Map<string, RewardToken>> {
  const unknown = addresses.filter((a) => !erc20Meta.has(a.toLowerCase()));
  if (unknown.length) {
    const results = await tryReadMany<unknown>(
      unknown.flatMap((a) => [
        { address: a, abi: aviansAbi as unknown as Abi, functionName: 'symbol' },
        { address: a, abi: aviansAbi as unknown as Abi, functionName: 'decimals' },
      ]),
      at,
    );
    unknown.forEach((a, i) => {
      const symbol = results[i * 2];
      const decimals = results[i * 2 + 1];
      erc20Meta.set(a.toLowerCase(), {
        // A token's own metadata is attacker-controlled text if a token we did
        // not choose ever appears here. Clamped, and rendered as a text node.
        symbol: symbol.ok && typeof symbol.value === 'string' && symbol.value
          ? symbol.value.slice(0, 16)
          : `${a.slice(0, 6)}…${a.slice(-4)}`,
        decimals: decimals.ok && typeof decimals.value === 'number' ? decimals.value : 18,
      });
    });
  }
  const out = new Map<string, RewardToken>();
  for (const a of addresses) {
    const m = erc20Meta.get(a.toLowerCase())!;
    out.set(a.toLowerCase(), { address: a, symbol: m.symbol, decimals: m.decimals });
  }
  return out;
}

export function rewardTokenMeta(a: Address): RewardToken {
  const m = erc20Meta.get(a.toLowerCase());
  return m ? { address: a, symbol: m.symbol, decimals: m.decimals }
    : { address: a, symbol: `${a.slice(0, 6)}…${a.slice(-4)}`, decimals: 18 };
}

/** One bird's reward lines: unsettled, the destination's balance, and where a settle sends it. */
async function broodLinesOf(id: TokenId, brood: BroodSummary, listed: RewardToken[], a: At): Promise<BroodTokenLine[]> {
  if (listed.length === 0) return [];
  const c = contracts();
  const n = (functionName: string, args: readonly unknown[]) =>
    ({ address: c.TheNest, abi: theNestAbi as unknown as Abi, functionName, args });
  const rows = await readMany<unknown>(listed.flatMap((t) => [
    n('earned', [BigInt(id), t.address]),
    n('pending', [BigInt(id), t.address]),
    { address: t.address, abi: aviansAbi as unknown as Abi, functionName: 'balanceOf', args: [brood.delivery.to] },
  ]), a);
  return listed.map((token, i) => {
    const p = rows[i * 3 + 1] as readonly [bigint, bigint, bigint];
    return {
      token,
      unsettled: rows[i * 3] as bigint,
      settled: rows[i * 3 + 2] as bigint,
      pending: { toDestination: p[0], toActivator: p[1], returned: p[2] },
    };
  });
}

/**
 * The Nest, for the brooding screen: the streams, and every bird the
 * connected wallet holds with whatever brood it carries.
 *
 * NOTHING IS CUSTODIAL and there is no per-wallet list on chain. The wallet's
 * birds come from the collection (`tokensOfOwnerIn`), their broods from
 * `broodOf` each, and each brooding bird's reward lines from three reads per
 * listed token: `earned` (unsettled, costs no gas to show and is what makes
 * the stream visible), the destination's `balanceOf` (settled — the satchel,
 * or the holder's own wallet when they chose that), and `pending` (where a
 * settle would send it now, which for an expired brood is the split).
 *
 * `claimable` is read per LISTED token. A retired token could in principle
 * hold a claimable share for this wallet, and the contract has no way to
 * enumerate it; a `RewardHeld(0, wallet, token, …)` receipt is the only place
 * such a token is ever named, and the receipt says to claim it.
 */
export async function getBrood(who: Address | null, at?: At): Promise<BroodState> {
  return guard('reading the nest', async () => {
    const a = at ?? await pin();
    const c = contracts();
    const n = (functionName: string, args: readonly unknown[] = []) =>
      ({ address: c.TheNest, abi: theNestAbi as unknown as Abi, functionName, args });

    const [t1, t2, t3, totalWeight, totalBrooding, totalForwarded] = await readMany<unknown>([
      n('TIER_1_COST'), n('TIER_2_COST'), n('TIER_3_COST'),
      n('totalWeight'), n('totalBrooding'), n('totalForwarded'),
    ], a);
    const listed = await listedTokens(a);

    // The streams, per token.
    const perToken = listed.length
      ? await readMany<unknown>(listed.flatMap((t) => [
        n('rewardData', [t.address]), n('totalPaid', [t.address]), n('totalReturned', [t.address]),
      ]), a)
      : [];
    const streams: RewardStream[] = listed.map((token, i) => {
      const data = perToken[i * 3] as { rewardRate?: bigint; periodFinish?: bigint; escrowed?: bigint };
      return {
        token,
        rate: data?.rewardRate ?? 0n,
        periodFinish: Number(data?.periodFinish ?? 0n),
        escrowed: data?.escrowed ?? 0n,
        totalPaid: perToken[i * 3 + 1] as bigint,
        totalReturned: perToken[i * 3 + 2] as bigint,
      };
    });

    // Anonymous: the streams alone. That is the truth for that reader.
    if (!who) {
      return {
        tierCost: { 1: t1 as bigint, 2: t2 as bigint, 3: t3 as bigint },
        totalWeight: totalWeight as bigint,
        totalBrooding: Number(totalBrooding as bigint),
        totalForwarded: totalForwarded as bigint,
        listed, streams, yours: [], claimable: [],
        chainNow: a.timestamp,
      };
    }

    const birds = await getBirdsOf(who, a);

    // Per brooding bird, per token: unsettled, pending, and the destination's
    // balance — one round for all of them, alongside the wallet's claimable.
    const brooding = birds.filter((b) => b.brood !== null);
    const [perBird, claimRows] = await Promise.all([
      Promise.all(brooding.map((b) => broodLinesOf(b.id, b.brood!, listed, a))),
      listed.length
        ? readMany<bigint>(listed.map((t) => n('claimable', [who, t.address])), a)
        : Promise.resolve([] as bigint[]),
    ]);
    const linesFor = new Map<TokenId, BroodTokenLine[]>();
    brooding.forEach((b, i) => linesFor.set(b.id, perBird[i]));

    const yours: BroodEntry[] = birds.map((bird) => ({
      bird,
      brood: bird.brood,
      lines: linesFor.get(bird.id) ?? [],
    }));

    const claimable = listed
      .map((token, i) => ({ token, amount: claimRows[i] ?? 0n }))
      .filter((x) => x.amount > 0n);

    return {
      tierCost: { 1: t1 as bigint, 2: t2 as bigint, 3: t3 as bigint },
      totalWeight: totalWeight as bigint,
      totalBrooding: Number(totalBrooding as bigint),
      totalForwarded: totalForwarded as bigint,
      listed, streams, yours, claimable,
      chainNow: a.timestamp,
    };
  });
}

/**
 * A brooding bird's unsettled reward in one token NOW, carried forward from
 * the last read: `rate × weight / totalWeight / 1e18` per second since the
 * read while the stream is live, never below what was read. What a settle
 * would move is the chain's figure, read fresh; this is what the line shows
 * between reads. Pure: tests/estimate.test.ts.
 */
export function estimateUnsettled(o: {
  unsettledAtRead: Amount; rate: Amount; weight: bigint; totalWeight: bigint;
  periodFinish: number; chainNowAtRead: number; now: number;
}): Amount {
  return estimateSince({
    atRead: o.unsettledAtRead, rate: o.rate, share: o.weight, total: o.totalWeight,
    periodFinish: o.periodFinish, chainNowAtRead: o.chainNowAtRead, now: o.now,
  });
}

/**
 * What `settle(ids)` would deliver, token by token, simulated as `who` —
 * for the "settle" control to show before the wallet opens. The Nest emits
 * `Settled`, `ExpirySettled`, `RewardHeld` and `RewardReturned` inside the
 * simulation exactly as it would on chain, so the answer is the receipt in
 * advance. A bird with no brood contributes nothing and is not an error.
 */
export async function simulateSettle(who: Address, ids: TokenId[]): Promise<SettlePreview> {
  const c = contracts();
  const { request } = await client().simulateContract({
    address: c.TheNest, abi: theNestAbi as unknown as Abi, functionName: 'settle',
    args: [ids.map((i) => BigInt(i))], account: who,
  });
  void request;
  // `simulateContract` does not return logs. Ask the Nest instead, at the
  // same block, what it would do: `pending` per bird per token is the same
  // arithmetic `settle` runs, and it names the destination.
  const a = await pin();
  const listed = await listedTokens(a);
  const broods = await broodsOf(ids, a);
  const n = (functionName: string, args: readonly unknown[]) =>
    ({ address: c.TheNest, abi: theNestAbi as unknown as Abi, functionName, args });
  const withBrood = ids.filter((id) => broods.get(id));
  const rows = withBrood.length && listed.length
    ? await readMany<readonly [bigint, bigint, bigint]>(withBrood.flatMap((id) =>
      listed.map((t) => n('pending', [BigInt(id), t.address]))), a)
    : [];
  const moves: SettleMove[] = [];
  withBrood.forEach((id, bi) => {
    const brood = broods.get(id)!;
    listed.forEach((token, ti) => {
      const [toDestination, toActivator, returned] = rows[bi * listed.length + ti];
      if (toDestination > 0n) {
        moves.push({ id, token, amount: toDestination, kind: brood.delivery.toWallet ? 'to-wallet' : 'to-satchel', to: brood.delivery.to });
      }
      if (toActivator > 0n) moves.push({ id, token, amount: toActivator, kind: 'to-activator', to: brood.activator });
      if (returned > 0n) moves.push({ id, token, amount: returned, kind: 'returned', to: c.TheNest });
    });
  });
  return { ids: withBrood, moves };
}

// ── the sweeper — HANDOVER section 5, "Collecting from many birds at once" ──

/**
 * `sweepable` reads one balance per bird per token, so a page of it is a
 * real call: a hundred birds over five tokens is some 500 balance reads and
 * a hundred each of `ownerOf` and `permissions`. Each page is its own
 * `eth_call` (`readEach`), never summed through Multicall3.
 */
const SWEEPABLE_PAGE = 100;

/** The Sweeper's address, or a throw: nothing calls this on a deployment without one. */
function sweeperOrThrow(): Address {
  const s = sweeperAddress();
  if (!s) throw new Error('the Sweeper was asked for on a deployment that has none — the panel should not exist here');
  return s;
}

/**
 * Every held bird's standing with the Sweeper, and what a sweep would move.
 *
 * `status(id)` per bird — satchel, deployed, granted — through the multicall,
 * and `sweepable(holder, ids, tokens)` over the same list in pages. The
 * amounts are read for every bird, granted or not: a satchel with stock in
 * it and no grant is the bird this panel exists for. `granted` is the
 * contract's word and is keyed by the CURRENT holder, so a bird bought
 * yesterday reads false whatever its seller granted.
 *
 * Tokens: the Nest's listed reward tokens, then any the holder names by
 * address — a token retired from the list but still sitting in a satchel is
 * the case for that. A failed read throws; nothing here becomes a zero.
 */
export async function getSweep(who: Address, extra: Address[] = [], at?: At): Promise<SweepState> {
  return guard('reading the sweeper', async () => {
    const sweeper = sweeperOrThrow();
    const a = at ?? await pin();
    const totalMinted = await mintedSoFar(a);
    const [ids, listed] = await Promise.all([ownedBy(who, a, totalMinted), listedTokens(a)]);
    const extras = extra.filter((x, i) =>
      !listed.some((t) => t.address.toLowerCase() === x.toLowerCase())
      && extra.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i);
    const meta = await tokenMeta(extras, a);
    const tokens: RewardToken[] = [...listed, ...extras.map((x) => meta.get(x.toLowerCase())!)];

    const s = (functionName: string, args: readonly unknown[]) =>
      ({ address: sweeper, abi: sweeperAbi as unknown as Abi, functionName, args });
    const pages: TokenId[][] = [];
    for (let i = 0; i < ids.length; i += SWEEPABLE_PAGE) pages.push(ids.slice(i, i + SWEEPABLE_PAGE));

    const [statuses, sweepable] = await Promise.all([
      readMany<readonly [Address, boolean, boolean]>(ids.map((id) => s('status', [BigInt(id)])), a),
      readEach<readonly [readonly boolean[], readonly (readonly bigint[])[]]>(
        pages.map((page) => s('sweepable', [who, page.map((id) => BigInt(id)), tokens.map((t) => t.address)])), a,
      ),
    ]);

    const amounts = new Map<TokenId, Amount[]>();
    pages.forEach((page, p) => {
      const [, rows] = sweepable[p];
      page.forEach((id, i) => amounts.set(id, [...(rows[i] ?? [])]));
    });

    const birds: SweepBird[] = ids.map((id, i) => {
      const [satchel, deployed, granted] = statuses[i];
      return { id, satchel, deployed, granted, amounts: amounts.get(id) ?? tokens.map(() => 0n) };
    });

    // Worth drawing: a grant exists, or a satchel holds something in a LISTED
    // token. The extras do not count — they are only ever present once the
    // panel is open and the holder has typed one.
    const relevant = birds.some((b) => b.granted)
      || birds.some((b) => b.amounts.slice(0, listed.length).some((x) => x > 0n));

    return { tokens, birds, relevant };
  });
}

// ── first light, the vault, the treasury ──────────────────────────────────

export async function getLaunch(at?: At): Promise<LaunchState> {
  return guard('reading First Light', async () => {
    const pool = poolContracts();
    if (!pool) throw new ContractError('Unknown');
    const a = at ?? await pin();
    const h = (functionName: string, args?: readonly unknown[]) =>
      ({ address: pool.hook, abi: aviansHookAbi as unknown as Abi, functionName, args });

    const r = await readMany<unknown>([
      h('LAUNCH_AT'), h('isLaunched'), h('WINDOW'), h('windowEndsAt'),
      h('currentBuyFeeBps'), h('sellFeeBps'), h('MAX_BUY_PER_TX'),
      h('FEE_BPS'), h('MAX_EXTRA_FEE_BPS'),
    ], a);

    const state: LaunchState = {
      launchAt: Number(r[0] as bigint),
      isLaunched: r[1] as boolean,
      windowSeconds: Number(r[2] as bigint),
      windowEndsAt: Number(r[3] as bigint),
      currentBuyFeeBps: Number(r[4] as bigint),
      sellFeeBps: Number(r[5] as bigint),
      maxBuyPerTx: r[6] as bigint,
      feeBps: Number(r[7] as bigint),
      maxExtraFeeBps: Number(r[8] as bigint),
    };
    setLaunchParams({
      launchAt: state.launchAt,
      windowSeconds: state.windowSeconds,
      feeBps: state.feeBps,
      maxExtraFeeBps: state.maxExtraFeeBps,
      maxBuyPerTx: state.maxBuyPerTx,
    });
    return state;
  });
}

export async function getVault(at?: At): Promise<VaultState> {
  return guard('reading the vault', async () => {
    const pool = poolContracts();
    if (!pool) throw new ContractError('Unknown');
    const a = at ?? await pin();
    const v = (functionName: string) =>
      ({ address: pool.vault, abi: liquidityVaultAbi as unknown as Abi, functionName });

    const [tokenId, unlockAt, isLocked, liquidity, lock] = await readMany<unknown>([
      v('tokenId'), v('unlockAt'), v('isLocked'), v('positionLiquidity'), v('LOCK_DURATION'),
    ], a);

    return {
      tokenId: Number(tokenId as bigint),
      unlockAt: Number(unlockAt as bigint),
      isLocked: isLocked as boolean,
      positionLiquidity: liquidity as bigint,
      lockSeconds: Number(lock as bigint),
    };
  });
}

/**
 * The Treasury card.
 *
 * Three figures per currency, and the contract's own identity ties them
 * together: `cumulativeIn = balance + adminClaimed + convertedOut`. So
 * "received, ever" and "here now" differ by exactly what has been claimed or
 * converted, and the card can say that as a fact rather than a hedge.
 *
 * Plus the Treasury-wide state that decides whether a conversion can run at
 * all. The contract checks seven guards in order; the first five are cheap
 * reads and are answered here, so the button knows whether it is enabled and
 * WHY before anyone clicks. Guards 6 and 7 — the per-currency amount and the
 * floor prices — are left to the write's own simulation, which produces the
 * exact sentence.
 */
export async function getTreasury(at?: At): Promise<TreasuryState> {
  return guard('reading the treasury', async () => {
    const a = at ?? await pin();
    const c = contracts();
    const listed = await readOne<Address[]>({
      address: c.TheNest, abi: theNestAbi as unknown as Abi, functionName: 'listedRewardTokens',
    }, a).catch(() => [] as Address[]);

    const currencies: Address[] = [ZERO_ADDRESS, c.Avians, ...listed];
    const meta = await tokenMeta(currencies.filter((x) => x !== ZERO_ADDRESS), a);

    const t = (functionName: string, args: readonly unknown[] = []) =>
      ({ address: c.Treasury, abi: treasuryAbi as unknown as Abi, functionName, args });
    const s = (functionName: string) =>
      ({ address: c.TheNest, abi: theNestAbi as unknown as Abi, functionName });

    const [perCurrency, wide, nativeBalance] = await Promise.all([
      readMany<unknown>(currencies.flatMap((currency) => [
        t('cumulativeIn', [currency]),
        t('claimable', [currency]),
        t('convertible', [currency]),
      ]), a),
      readMany<unknown>([
        t('conversionConfig'), t('lastConversionAt'), t('targetCount'),
        s('totalWeight'), s('rewardTokenCount'),
      ], a),
      // The one balance that is not a `balanceOf`.
      client().getBalance({ address: c.Treasury, blockNumber: a.blockNumber }),
    ]);

    const erc20 = currencies.filter((x) => x !== ZERO_ADDRESS);
    const balances = erc20.length
      ? await readMany<bigint>(erc20.map((currency) => ({
        address: currency, abi: aviansAbi as unknown as Abi, functionName: 'balanceOf', args: [c.Treasury],
      })), a)
      : [];
    const balanceOf = new Map<string, bigint>(erc20.map((x, i) => [x.toLowerCase(), balances[i]]));

    const cfg = wide[0] as {
      enabled?: boolean; minInterval?: number; maxPerCallBps?: number;
    } | readonly unknown[];
    // viem returns a struct getter as an object when the ABI names its outputs
    // and as a tuple when it does not. Read it either way rather than assume.
    const asObject = Array.isArray(cfg)
      ? { enabled: cfg[0] as boolean, minInterval: Number(cfg[1]), maxPerCallBps: Number(cfg[2]) }
      : {
        enabled: !!(cfg as { enabled?: boolean }).enabled,
        minInterval: Number((cfg as { minInterval?: number }).minInterval ?? 0), /* count */
        maxPerCallBps: Number((cfg as { maxPerCallBps?: number }).maxPerCallBps ?? 0), /* count */
      };

    const lastConversionAt = Number(wide[1] as bigint); /* count */ // seconds

    const rows: TreasuryRow[] = currencies.map((currency, i) => {
      const native = currency === ZERO_ADDRESS;
      const m = native ? null : meta.get(currency.toLowerCase());
      return {
        currency: native ? null : currency,
        symbol: native ? manifest().network.nativeCurrency.symbol : m?.symbol ?? '—',
        decimals: native ? manifest().network.nativeCurrency.decimals : m?.decimals ?? 18, /* count */
        cumulativeIn: perCurrency[i * 3] as bigint,
        claimable: perCurrency[i * 3 + 1] as bigint,
        convertible: perCurrency[i * 3 + 2] as bigint,
        balance: native ? nativeBalance : balanceOf.get(currency.toLowerCase()) ?? 0n,
      };
    });

    return {
      rows,
      conversion: {
        enabled: asObject.enabled,
        minInterval: asObject.minInterval,
        lastConversionAt,
        // Nothing has ever converted ⇒ no cooldown to wait out, which is what
        // the contract's `last != 0` test means.
        nextAllowedAt: lastConversionAt === 0 ? 0 : lastConversionAt + asObject.minInterval,
        maxPerCallBps: asObject.maxPerCallBps,
      },
      totalWeight: wide[3] as bigint,
      rewardTokenCount: Number(wide[4] as bigint), /* count */
      targetCount: Number(wide[2] as bigint), /* count */
    };
  });
}

/**
 * The reward tokens, and the split between them.
 *
 * A small read of its own rather than a field on `getTreasury`, because the
 * page that needs it is the Docs reference — one table row — and the treasury
 * read is thirty calls about balances that row does not use.
 *
 * Two contracts answer, and they can disagree. TheNest says which tokens it
 * will stream at all; the Treasury says how a conversion divides its output.
 * `setTargets` refuses a token TheNest has not listed, so the split starts as a
 * subset — but `retireRewardToken` can remove one afterwards, and then every
 * conversion reverts `TargetNotListed` until somebody fixes it. The caller is
 * given both lists rather than a merged one, so it can say which case it is in.
 */
export async function getRewardSplit(at?: At): Promise<RewardSplit> {
  return guard('reading the reward split', async () => {
    const a = at ?? await pin();
    const c = contracts();

    const [listedRaw, targetsRaw] = await Promise.all([
      readOne<Address[]>({
        address: c.TheNest, abi: theNestAbi as unknown as Abi, functionName: 'listedRewardTokens',
      }, a).catch(() => [] as Address[]),
      readOne<readonly unknown[]>({
        address: c.Treasury, abi: treasuryAbi as unknown as Abi, functionName: 'targets',
      }, a).catch(() => [] as unknown[]),
    ]);

    // viem hands a struct back as an object when the ABI names its fields and
    // as a tuple when it does not. `Target` names both, but read it either way
    // rather than depend on a generator's output shape.
    const parts: RewardSplitPart[] = (targetsRaw ?? []).map((t) => (Array.isArray(t)
      ? { address: t[0] as Address, weightBps: Number(t[1]) /* count */ }
      : {
        address: (t as { token: Address }).token,
        weightBps: Number((t as { weightBps: number }).weightBps), /* count */
      }));

    // Symbols for the listing. A target that is no longer listed has no meta
    // here, which is exactly the state the caller has to be able to see.
    const meta = await tokenMeta(listedRaw ?? [], a);
    const listed: RewardToken[] = (listedRaw ?? []).map(
      (address) => meta.get(address.toLowerCase()) ?? { address, symbol: '—', decimals: 18 },
    );

    return { listed, parts };
  });
}

export async function getSupply(at?: At): Promise<{ total: Amount; inPool: Amount; burned: Amount }> {
  return guard('reading the supply', async () => {
    const a = at ?? await pin();
    const c = contracts();
    const [initial, total] = await readMany<bigint>([
      { address: c.Avians, abi: aviansAbi as unknown as Abi, functionName: 'TOTAL_SUPPLY' },
      { address: c.Avians, abi: aviansAbi as unknown as Abi, functionName: 'totalSupply' },
    ], a);
    const inPool = await readOne<bigint>({
      address: c.Avians, abi: aviansAbi as unknown as Abi, functionName: 'balanceOf', args: [c.ThePerch],
    }, a);
    // AVIANS has no mint path, so everything the supply has lost was burned —
    // by the Roost, the one burner since 2026-09-18 (a fifth of everything it
    // receives, at each distribute). `roost.burned()` says the same number.
    return { total, inPool, burned: initial - total };
  });
}

// ── the composer's pre-flight ─────────────────────────────────────────────

export async function comboTaken(t: TraitIndices): Promise<{ taken: boolean; tokenId?: TokenId }> {
  return guard('checking that combination', async () => {
    const taken = await readOne<boolean>({
      address: contracts().AvianStock, abi: avianStockAbi as unknown as Abi,
      functionName: 'comboTaken', args: [packCombo(t)],
    });
    // There is no reverse index from a combination to an id on chain, and
    // `explain()` already writes a sentence for the case where we do not have
    // one. Better no number than a wrong number.
    return taken ? { taken } : { taken: false };
  });
}

/**
 * The recovery from `ComboTaken`, which is most of the mint experience in a
 * busy mint. Candidates are generated locally, then checked in ONE multicall.
 */
export async function nearestAvailable(t: TraitIndices, n = 3): Promise<TraitIndices[]> {
  return guard('finding a free combination', async () => {
    const candidates: TraitIndices[] = [];
    const seen = new Set<string>([t.join(',')]);
    for (let step = 1; step < 16 && candidates.length < n * 4; step++) {
      for (let c = 5; c >= 0 && candidates.length < n * 4; c--) {
        for (const dir of [1, -1]) {
          const i = t[c] + dir * step;
          if (i < 0 || i >= COUNTS[c]) continue;
          const alt = t.slice() as number[];
          alt[c] = i;
          const key = alt.join(',');
          if (seen.has(key)) continue;
          seen.add(key);
          candidates.push(alt as unknown as TraitIndices);
          break;
        }
      }
    }
    if (!candidates.length) return [];

    const results = await readMany<boolean>(candidates.map((cand) => ({
      address: contracts().AvianStock, abi: avianStockAbi as unknown as Abi,
      functionName: 'comboTaken', args: [packCombo(cand)],
    })));
    return candidates.filter((_, i) => !results[i]).slice(0, n);
  });
}

// ── the deployment ────────────────────────────────────────────────────────

/**
 * Is this address the owner, or an incoming owner, of any of the five?
 *
 * Here rather than in `admin.ts`, and on the COLLECTOR ABIs, for one reason:
 * the header asks it on every page for every connected wallet, and the whole
 * owner surface — its ABIs and its screen — is a lazily loaded chunk that
 * nobody but the owner should ever download. Ten public views answer it.
 */
export async function getOwnerStatus(who: Address | null): Promise<OwnerStatus> {
  if (!who) return { isOwner: false, isPendingOwner: false };
  return guard('reading ownership', async () => {
    const c = contracts();
    const pairs: [Address, unknown][] = [
      [c.AvianStock, avianStockAbi],
      [c.ThePerch, thePerchAbi],
      [c.TheNest, theNestAbi],
      [c.Treasury, treasuryAbi],
    ];
    if (c.LiquidityVault) pairs.push([c.LiquidityVault, liquidityVaultAbi]);

    const out = await readMany<unknown>(pairs.flatMap(([address, abi]) => [
      { address, abi: abi as Abi, functionName: 'owner' },
      { address, abi: abi as Abi, functionName: 'pendingOwner' },
    ]));

    const mine = who.toLowerCase();
    const at = (i: number) => (typeof out[i] === 'string' ? (out[i] as string).toLowerCase() : null);
    return {
      isOwner: pairs.some((_, i) => at(i * 2) === mine),
      isPendingOwner: pairs.some((_, i) => at(i * 2 + 1) === mine),
    };
  });
}

export { getDeployment } from './startup';

// ── the trait registry, verified rather than assumed ──────────────────────

export async function registryCounts(at?: At): Promise<number[]> {
  const counts = await readOne<readonly number[]>({
    address: contracts().TraitRegistry, abi: traitRegistryAbi as unknown as Abi, functionName: 'counts',
  }, at);
  return [...counts];
}

// ── invalidation ──────────────────────────────────────────────────────────

/** Anything that changed on chain, an account change, or a chain change. */
export function invalidateAll() {
  invalidateOwnership();
  erc20Meta.clear();
}

export { checkTransferSafety, satchelBlocksStaking } from './safety';
export { traitsForId } from './birds';
export const TRANSFER_EVENT = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)');
export function collectionAddress(): Address { return contracts().AvianStock; }
export function computeSatchel(id: TokenId): Address { return computeAccount(id); }
export type { Deployment };
