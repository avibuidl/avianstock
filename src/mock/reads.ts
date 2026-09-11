// Everything the UI displays.
//
// Each of these is one or a handful of `eth_call`s once wired. They resolve, or
// they throw — a panel renders the throw as its error state and keeps its
// shape. No component reaches past this file for a number.

import type {
  Address, Amount, Bird, ClaimAllResult, ClaimOutcome, CollectionState, Deployment,
  ErrorName, Hex, LaunchState, PerchState, RoostState, TokenId, TraitIndices,
  RewardSplit, TransferSafety, TreasuryRow, TreasuryState, VaultState, WalletState,
  OwnerStatus,
} from './types';
import { ContractError } from './errors';
import { scenario } from './scenario';
import {
  ADDRESSES, ALLOWLIST_ROOT, AVIANS_SUPPLY, LOCK_SECONDS, POOL_AVIANS, PERCH_SELL,
  REWARD_TARGET_BPS, REWARD_TOKENS, THIRD_PARTY, buyFeeBpsAt, idForCombo, overlay,
  rewardTokenMeta, satchelAddressOf, takenCombos, world,
} from './fixtures';
import { packCombo } from '../art/render';
import { COUNTS, isValid } from '../art/traits';
import { sleep } from './wallet';

/** Reads are not instant, and the UI has to look right while they are not. */
export async function read<T>(make: () => T, ms = 260): Promise<T> {
  const s = scenario();
  if (s.data === 'loading') { await sleep(100000); }        // stays loading
  await sleep(ms);
  if (s.data === 'error') throw new ContractError('ReadFailed');
  return make();
}

export function getCollection(): Promise<CollectionState> {
  return read(() => world().collection);
}

export function getWallet(): Promise<WalletState> {
  return read(() => {
    const w = world();
    return { ...w.wallet, freeMintStatus: freeMintStatusSync(w) };
  });
}

/** `freeMintStatus(who, proof)`: zero if `mintFree` would succeed, else its selector. */
function freeMintStatusSync(w = world()): ErrorName | null {
  const c = w.collection;
  if (!c.freeMintOpen || c.freeAllocationReleased) return 'FreeMintClosed';
  if (w.wallet.freeClaimed) return 'FreeMintAlreadyClaimed';
  if (!w.wallet.isAllowlisted) return 'NotAllowlisted';
  if (c.reservedFree <= 0) return 'FreeAllocationExhausted';
  return null;
}

export function freeMintStatus(_who: Address, _proof: Hex[]): Promise<ErrorName | null> {
  return read(() => freeMintStatusSync(), 140);
}

export function getBird(id: TokenId): Promise<Bird> {
  return read(() => {
    const w = world();
    if (id < 1 || id > w.collection.totalMinted) throw new ContractError('ERC721NonexistentToken', { id });
    // Burnt first: it is no longer in anybody's list, and the page for it still
    // draws because `tokenCombo` — here, the deterministic traits — is kept.
    if (overlay.burnt.includes(id)) return w.makeBird(id, { where: 'burnt' });
    const mine = [...w.yourBirds, ...w.roosting].find((b) => b.id === id);
    if (mine) return mine;
    if (w.perch.heldIds.includes(id)) return w.makeBird(id, { where: 'perch' });
    const host = [...w.yourBirds].find((b) => b.satchel.holds.some((h) => h.kind === 'avian' && h.id === id));
    if (host) return w.makeBird(id, { where: 'satchel', hostId: host.id });
    return w.makeBird(id, { where: 'wallet', owner: ('0x' + 'a1'.repeat(20)) as Address });
  });
}

export function getBirdsOf(_who: Address): Promise<Bird[]> {
  return read(() => world().yourBirds);
}

/**
 * A window of minted ids. A real deployment wants an indexer here. The
 * collection exposes `totalSupply()` but is NOT ERC721Enumerable, so nothing
 * on chain can walk it: this is `totalMinted()` plus one `traitsOf` per id,
 * and 5,555 of those is not a page load.
 */
export function getMintedBirds(o: { offset?: number; limit?: number } = {}):
Promise<{ birds: Bird[]; total: number }> {
  return read(() => {
    const w = world();
    const offset = o.offset ?? 0;
    const limit = o.limit ?? 24;
    const total = w.collection.totalMinted;
    const birds: Bird[] = [];
    for (let id = total - offset; id > 0 && birds.length < limit; id--) {
      // Burnt ids are skipped, never drawn: `ownerOf` reverts for one on chain
      // and the gallery must not go blank the first time the perch burns.
      if (overlay.burnt.includes(id)) continue;
      birds.push(w.perch.heldIds.includes(id)
        ? w.makeBird(id, { where: 'perch' })
        : w.staked.has(id)
          ? w.makeBird(id, { where: 'roost', staker: w.wallet.address, tier: w.staked.get(id)!, since: w.now })
          : w.makeBird(id, { where: 'wallet', owner: ('0x' + 'a1'.repeat(20)) as Address }));
    }
    return { birds, total };
  }, 340);
}

export function getPerch(): Promise<PerchState> {
  return read(() => world().perch);
}

export function getRoost(_who: Address | null): Promise<RoostState> {
  return read(() => world().roost);
}

export function getLaunch(): Promise<LaunchState> {
  return read(() => world().launch, 160);
}

/** The whole decay curve, for drawing it. */
export function buyFeeAt(timestamp: number, launchAt: number): number {
  return buyFeeBpsAt(timestamp, launchAt);
}

export function getVault(): Promise<VaultState> {
  return read(() => {
    const w = world();
    return {
      tokenId: 4471,
      unlockAt: w.now + LOCK_SECONDS - 4 * 86400,
      isLocked: true,
      positionLiquidity: POOL_AVIANS,
      lockSeconds: LOCK_SECONDS,
    };
  });
}

/**
 * The Treasury, as the contract now computes it.
 *
 * THE SHARE RULE CHANGED ON 2026-09-08: `adminShareBps` is 2,000 for native
 * ETH and 10,000 — all of it — for EVERY ERC-20, AVIANS included. Nothing in
 * this system pays the Treasury in an ERC-20; stock tokens bought during a
 * conversion go straight to the incubator inside the same transaction and
 * never rest here. So an ERC-20 that turns up is an accidental deposit and
 * none of it was ever a staker's.
 *
 * Two consequences fall out of that rule rather than being special-cased, and
 * the card relies on both:
 *
 *   * for every ERC-20, `claimable` IS the balance, so `convertible` is
 *     permanently zero and no convert button is ever drawn on those rows;
 *   * ETH is therefore the only currency that can ever convert.
 *
 * Every figure below satisfies the contract's own identity,
 * `cumulativeIn = balance + adminClaimed + convertedOut`, so the sentence the
 * card prints under the table is arithmetic rather than a claim.
 */
/** Somebody else entirely, for walking the non-owner view. */

/**
 * Whether the connected wallet is the owner, or an incoming one.
 *
 * Beside the ordinary reads rather than in `./admin`, mirroring the chain
 * driver: the header asks this on every page, and the whole owner surface is a
 * lazily loaded chunk that nobody else should have to download.
 */
export function getOwnerStatus(who: Address | null): Promise<OwnerStatus> {
  const a = scenario().admin;
  return Promise.resolve({
    isOwner: !!who && a !== 'not-the-owner' && a !== 'you-are-pending',
    isPendingOwner: !!who && a === 'you-are-pending',
  });
}

/**
 * The reward listing and the split, mocked.
 *
 * Deliberately unequal, because the copy this feeds used to say "equal parts"
 * and a fixture that happened to be equal would have hidden that it was reading
 * anything at all.
 */
export function getRewardSplit(): Promise<RewardSplit> {
  return read(() => ({
    listed: REWARD_TOKENS,
    parts: REWARD_TOKENS.map((t, i) => ({ address: t.address, weightBps: REWARD_TARGET_BPS[i] })),
  }));
}

export function getTreasury(): Promise<TreasuryState> {
  return read(() => {
    const s = scenario();
    const t = s.treasury;

    // ETH: 4.182 in, 0.8364 of it the admin's (20%), 2.4 already streamed.
    const ethIn = 4_182_000_000_000_000_000n;
    const ethConverted = t === 'flowing' ? 2_400_000_000_000_000_000n : 0n;
    const ethClaimed = t === 'nothing-claimable' ? (ethIn * 2000n) / 10000n : 0n;
    const ethBalance = ethIn - ethClaimed - ethConverted;
    const ethClaimable = (ethIn * 2000n) / 10000n - ethClaimed;
    // `convertible` is the balance less the admin's outstanding claim, capped
    // at maxPerCallBps of the balance.
    const maxPerCallBps = 2000n;
    const free = ethBalance > ethClaimable ? ethBalance - ethClaimable : 0n;
    const cap = (ethBalance * maxPerCallBps) / 10000n;
    const ethConvertible = t === 'nothing-convertible' ? 0n : (free < cap ? free : cap);

    // AVIANS: an ERC-20, so 100% is the admin's and nothing is convertible.
    const aviansIn = 2_140_000n * 10n ** 18n;
    // An accidental ERC-20 deposit — the case the new rule exists for.
    const nvdaIn = t === 'accidental-deposit' ? 131_800_000_000_000_000_000n : 0n;

    const rows: TreasuryRow[] = [
      {
        currency: null, symbol: 'ETH', decimals: 18,
        cumulativeIn: ethIn, balance: ethBalance,
        claimable: ethClaimable, convertible: ethConvertible,
      },
      {
        currency: ADDRESSES.Avians, symbol: 'AVIANS', decimals: 18,
        cumulativeIn: aviansIn, balance: aviansIn,
        claimable: aviansIn, convertible: 0n,
      },
      {
        currency: '0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC', symbol: 'NVDA', decimals: 18,
        cumulativeIn: nvdaIn, balance: nvdaIn,
        claimable: nvdaIn, convertible: 0n,
      },
      // Two listed reward tokens that have never had anything arrive. They are
      // the reason the card has a rule about zero rows.
      {
        currency: '0x117cc2133c37B721F49dE2A7a74833232B3B4C0C', symbol: 'SPY', decimals: 18,
        cumulativeIn: 0n, balance: 0n, claimable: 0n, convertible: 0n,
      },
      {
        currency: '0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9', symbol: 'AAPL', decimals: 18,
        cumulativeIn: 0n, balance: 0n, claimable: 0n, convertible: 0n,
      },
    ];

    const now = Math.floor(Date.now() / 1000);
    const minInterval = overlay.conversionMinInterval ?? 86_400;
    const lastConversionAt = t === 'cooling-down' ? now - 3_600 : now - 200_000;

    return {
      rows,
      conversion: {
        enabled: t !== 'disabled',
        minInterval,
        lastConversionAt,
        nextAllowedAt: lastConversionAt + minInterval,
        maxPerCallBps: Number(maxPerCallBps), /* count */
      },
      totalWeight: t === 'nothing-staked' ? 0n : 4188n,
      rewardTokenCount: t === 'no-rewards' ? 0 : 4,
      targetCount: t === 'no-targets' ? 0 : 4,
    };
  });
}

/**
 * What the Contracts screen lists: this deployment's own addresses, and the
 * third-party ones it sits on.
 *
 * NOT the cross-check any more. That was the third field here and the screen
 * drew it; the checks still run, in `chain/startup.ts`, where `main.tsx`
 * refuses to mount the app if one of them fails.
 */
export function getDeployment(): Promise<Deployment> {
  return read(() => ({
    addresses: ADDRESSES,
    thirdParty: THIRD_PARTY,
  }));
}

export function getSupply(): Promise<{ total: Amount; inPool: Amount; burned: Amount }> {
  return read(() => ({ total: AVIANS_SUPPLY, inPool: POOL_AVIANS, burned: world().roost.totalBurned }));
}

// ── pre-flight ────────────────────────────────────────────────────────────

/** `comboTaken(uint48)`. Check it before submitting; there is no way to reserve one. */
export function comboTaken(t: TraitIndices): Promise<{ taken: boolean; tokenId?: TokenId }> {
  return read(() => {
    const w = world();
    if (w.scenario.combo === 'taken') return { taken: true, tokenId: 1204 };
    const taken = takenCombos(w).has(t.join(','));
    return taken ? { taken, tokenId: idForCombo(w, t) } : { taken: false };
  }, 180);
}

/**
 * The recovery from `ComboTaken`, which is most of the mint experience in a
 * busy mint: change one choice and offer what is actually free.
 */
export function nearestAvailable(t: TraitIndices, n = 3): Promise<TraitIndices[]> {
  return read(() => {
    const w = world();
    const taken = takenCombos(w);
    const out: TraitIndices[] = [];
    // Vary one category at a time, nearest index first.
    for (let step = 1; step < 16 && out.length < n; step++) {
      for (let c = 5; c >= 0 && out.length < n; c--) {
        for (const dir of [1, -1]) {
          const i = t[c] + dir * step;
          if (i < 0 || i >= COUNTS[c]) continue;
          const alt = t.slice() as number[];
          alt[c] = i;
          const key = alt.join(',');
          if (taken.has(key) || out.some((o) => o.join(',') === key)) continue;
          out.push(alt as unknown as TraitIndices);
          break;
        }
      }
    }
    return out;
  }, 220);
}

export function quoteSell(count: number): Promise<Amount> {
  return read(() => world().perch.sell * BigInt(count), 120);
}

export function quoteBuyNext(count: number): Promise<Amount> {
  return read(() => {
    const w = world();
    if (count > w.perch.poolSize) {
      throw new ContractError('InsufficientPool', { requested: count, available: w.perch.poolSize });
    }
    return w.perch.buyNext * BigInt(count);
  }, 120);
}

export function quoteBuy(ids: TokenId[]): Promise<Amount> {
  return read(() => {
    const w = world();
    for (const id of ids) if (!w.perch.heldIds.includes(id)) throw new ContractError('NotHeld', { id });
    return w.perch.buyNamed * BigInt(ids.length);
  }, 120);
}

/** What `buyNext(n)` would actually hand over: the n lowest ids, in order. */
export function nextBirds(n: number): Promise<TokenId[]> {
  return read(() => world().perch.heldIds.slice(0, n), 100);
}

// ── the site's own logic, which stays after wiring ────────────────────────

const MAX_DEPTH = 32;

/**
 * HANDOVER section 8. The chain refuses depth one — a bird sent into its own
 * satchel. Anything deeper it cannot see inside a transfer, so this walk is
 * the only thing standing between a collector and two birds nobody will ever
 * own again. It refuses rather than allows when it runs out of rope.
 */
export async function checkTransferSafety(id: TokenId, to: Address): Promise<TransferSafety> {
  await sleep(220);
  const w = world();
  const lower = to.toLowerCase();

  if (lower === satchelAddressOf(id).toLowerCase()) return { ok: false, reason: 'own-account', path: [id] };
  if (lower === ADDRESSES.AvianStock.toLowerCase()) return { ok: false, reason: 'collection-address', path: [] };

  // Is the destination the satchel of some bird? Every account address is a
  // deterministic function of the token id, so this is a reverse lookup.
  let cursor: TokenId | undefined;
  for (let candidate = 1; candidate <= w.collection.totalMinted; candidate++) {
    if (satchelAddressOf(candidate).toLowerCase() === lower) { cursor = candidate; break; }
  }
  if (cursor === undefined) return { ok: true };

  // Walk upward: who owns that bird, and is that owner itself a bird's satchel?
  const path: TokenId[] = [];
  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    path.push(cursor);
    if (cursor === id) return { ok: false, reason: 'cycle', path };
    const host = [...w.yourBirds, ...w.roosting]
      .find((b) => b.satchel.holds.some((h) => h.kind === 'avian' && h.id === cursor));
    if (!host) return { ok: true };
    cursor = host.id;
  }
  return { ok: false, reason: 'depth-cap', path };
}

/**
 * `claimAll` returns three parallel arrays; a screen renders rows. Two of the
 * rows look identical in the raw arrays and mean opposite things, so the
 * reading is done once, here, and never at a call site:
 *
 *   paid > 0                      → paid.
 *   paid === 0, skipped === false → nothing was owed. NOT a failure.
 *   skipped === true              → the token refused. The rewards are safe.
 *
 * The arrays can be longer than the listed set, so the symbol is resolved by
 * address rather than by position in anything else.
 */
export function readClaimAll(r: ClaimAllResult): ClaimOutcome[] {
  return r.tokens.map((address, i) => {
    const meta = rewardTokenMeta(address);
    const paid = r.paid[i] ?? 0n;
    const skipped = r.skipped[i] ?? false;
    return {
      token: address,
      symbol: meta.symbol,
      decimals: meta.decimals,
      paid,
      skipped,
      kind: skipped ? 'skipped' : paid > 0n ? 'paid' : 'nothing-owed',
    };
  });
}

/** The other refusal on the same checklist: a satchel with birds in it must not roost. */
export function satchelBlocksStaking(bird: Bird): TokenId[] {
  return bird.satchel.holds.filter((h) => h.kind === 'avian').map((h) => (h as { id: TokenId }).id);
}

export { packCombo, isValid, ALLOWLIST_ROOT, PERCH_SELL };
