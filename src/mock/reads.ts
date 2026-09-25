// Everything the UI displays.
//
// Each of these is one or a handful of `eth_call`s once wired. They resolve, or
// they throw — a panel renders the throw as its error state and keeps its
// shape. No component reaches past this file for a number.

import type {
  Address, Amount, Bird, BroodEntry, BroodState, BroodTokenLine, CollectionState, Deployment,
  ErrorName, Hex, LaunchState, PerchState, SettleMove, SettlePreview, SweepState, TokenId, TraitIndices,
  RewardSplit, TransferSafety, TreasuryRow, TreasuryState, VaultState, WalletState,
  OwnerStatus, Opening,
} from './types';
import { ContractError } from './errors';
import { scenario } from './scenario';
import {
  ADDRESSES, ALLOWLIST_ROOT, AVIANS_SUPPLY, LOCK_SECONDS, POOL_AVIANS, PERCH_SELL,
  REWARD_TARGET_BPS, REWARD_TOKENS, STOCK_REWARD_TOKENS, THIRD_PARTY, buyFeeBpsAt, idForCombo, overlay,
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
    const mine = w.yourBirds.find((b) => b.id === id);
    if (mine) return { ...mine, broodLines: linesOf(w, mine) };
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
        : w.yourBirds.find((b) => b.id === id)
          ?? w.makeBird(id, { where: 'wallet', owner: ('0x' + 'a1'.repeat(20)) as Address }));
    }
    return { birds, total };
  }, 340);
}

export function getPerch(): Promise<PerchState> {
  return read(() => world().perch);
}

/** A brooding bird's per-token lines, from the world's own figures. */
function linesOf(w: ReturnType<typeof world>, bird: Bird): BroodTokenLine[] | undefined {
  if (!bird.brood) return undefined;
  return w.listed.map((token): BroodTokenLine => ({
    token,
    unsettled: w.unsettledOf(bird.id, token.symbol),
    // The destination's balance: the satchel's, or — for a wallet delivery —
    // your own, which holds other things too.
    settled: bird.brood!.delivery.toWallet
      ? w.walletRewardBalanceOf(token.symbol)
      : w.satchelBalanceOf(bird.id, token.symbol),
    pending: w.pendingOf(bird.id, token.symbol),
  }));
}

/**
 * The nest for the brooding screen. Every bird you hold, with its brood and
 * its reward lines: unsettled (`earned`), settled (the destination's balance
 * — the satchel's, or your wallet's), and where a settle would send it.
 */
export function getBrood(who: Address | null): Promise<BroodState> {
  return read(() => {
    const w = world();
    const n = w.nest;
    const chainNow = Math.floor(Date.now() / 1000);
    if (!who) return { ...n, yours: [], claimable: [], chainNow };
    const yours: BroodEntry[] = w.yourBirds.map((bird) => ({
      bird,
      brood: bird.brood,
      lines: linesOf(w, bird) ?? [],
    }));
    const claimable = [...w.claimable].map(([symbol, amount]) => ({
      token: w.listed.find((t) => t.symbol === symbol)!, amount,
    })).filter((x) => x.token);
    return { ...n, yours, claimable, chainNow };
  });
}

/**
 * The Sweeper's view of your birds: each satchel's standing, and what a sweep
 * would move in every listed token plus any the holder added by address.
 */
export function getSweep(_who: Address, extra: Address[] = []): Promise<SweepState> {
  return read(() => {
    const w = world();
    const extras = extra
      .filter((x, i) => extra.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i)
      .filter((x) => !w.listed.some((t) => t.address.toLowerCase() === x.toLowerCase()))
      .map(rewardTokenMeta);
    const tokens = [...w.listed, ...extras];
    const birds = w.yourBirds.map((b) => ({
      id: b.id,
      satchel: b.satchel.address,
      deployed: w.satchelDeployed(b.id),
      granted: w.sweeperGranted(b.id),
      amounts: tokens.map((t) => w.satchelBalanceOf(b.id, t.symbol)),
    }));
    const relevant = birds.some((b) => b.granted)
      || birds.some((b) => b.amounts.slice(0, w.listed.length).some((x) => x > 0n));
    return { tokens, birds, relevant };
  });
}

/** What `settle(ids)` would move, from the same figures the write uses. */
export function simulateSettle(_who: Address, ids: TokenId[]): Promise<SettlePreview> {
  return read(() => {
    const w = world();
    const withBrood = ids.filter((id) => w.broods.has(id));
    const moves: SettleMove[] = [];
    for (const id of withBrood) {
      const b = w.broods.get(id)!;
      for (const token of w.listed) {
        const p = w.pendingOf(id, token.symbol);
        const to = b.toWallet ? b.activator : satchelAddressOf(id);
        if (p.toDestination > 0n) moves.push({ id, token, amount: p.toDestination, kind: b.toWallet ? 'to-wallet' : 'to-satchel', to });
        if (p.toActivator > 0n) moves.push({ id, token, amount: p.toActivator, kind: 'to-activator', to: b.activator });
        if (p.returned > 0n) moves.push({ id, token, amount: p.returned, kind: 'returned', to: ADDRESSES.TheNest });
      }
    }
    return { ids: withBrood, moves };
  }, 200);
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
 * ETH and 10,000 — all of it — for EVERY ERC-20, AVIAN included. Nothing in
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
    // The targets are the stock tokens only: AVIAN is listed but delivered by
    // the Roost, never converted into.
    parts: STOCK_REWARD_TOKENS.map((t, i) => ({ address: t.address, weightBps: REWARD_TARGET_BPS[i] })),
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

    // AVIAN: an ERC-20, so 100% is the admin's and nothing is convertible.
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
        currency: ADDRESSES.Avians, symbol: 'AVIAN', decimals: 18,
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

    // THE ROOST'S TENTH (2026-09-22): 10% of everything that ever arrived,
    // less what buys have spent, capped per call like a conversion. Its own
    // clock, and the AVIAN it has bought at the fixture pool's price
    // (1 ETH = 2,000,000 AVIAN, as `swap.ts` quotes it).
    const roostShare = (ethIn * 1000n) / 10_000n;
    const roostSpent = overlay.roostBought !== null ? overlay.roostSpent
      : t === 'roost-buy-empty' ? roostShare : (roostShare * 6n) / 10n;
    const roostFree = roostShare > roostSpent ? roostShare - roostSpent : 0n;
    const roostCap = (ethBalance * maxPerCallBps) / 10000n;
    const lastRoostBuyAt = t === 'roost-buy-cooling' ? now - 3_600
      : roostSpent === 0n ? 0 : now - 200_000;

    // PRICED BY THE POOLS (2026-09-24). `TWAP_WINDOW` is half an hour and
    // `READING_MAX_AGE` a week, as the contract has them. The launch set has
    // two readings far enough apart to average over, so `roostMeanTick`
    // answers and the card offers the buy.
    const readings = {
      window: 1_800,
      maxAge: 604_800,
      lastAt: t === 'readings-absent' ? 0
        : t === 'readings-too-young' ? now - 420
          : now - 5_400,
      prevAt: t === 'readings-absent' || t === 'readings-too-young' ? 0 : now - 9_000,
      refusal: t === 'readings-absent' || t === 'readings-too-young' ? 'NoUsableReading' : null,
    };

    return {
      rows,
      chainNow: now,
      readings,
      opening: mockOpening(t, now),
      roost: {
        buyable: roostFree < roostCap ? roostFree : roostCap,
        everSpent: roostSpent,
        everBought: roostSpent * 2_000_000n,
        lastBuyAt: lastRoostBuyAt,
        nextAllowedAt: lastRoostBuyAt === 0 ? 0 : lastRoostBuyAt + minInterval,
        sharesBps: { admin: 2000, rewards: 7000, roost: 1000 },
      },
      conversion: {
        enabled: t !== 'paused',
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
 * When the two buttons open, per scene (2026-09-24). "Opens in two hours" is
 * anchored once, when the module loads, so its countdown runs down between
 * reads instead of restarting at two hours on every poll.
 */
const OPENS_LATER_AT = Math.floor(Date.now() / 1000) + 2 * 3_600;
export function mockOpening(t: string, now: number): Opening {
  const enabled = t !== 'paused';
  const openAt = t === 'launch-unknown' ? 0
    : t === 'opens-later' ? OPENS_LATER_AT
      : now - 3 * 86_400;
  return { openAt, enabled, open: enabled && openAt !== 0 && now >= openAt };
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
  return read(() => {
    // The Docs "The contracts" section's failure state (2026-09-25).
    if (scenario().deployment === 'fails') throw new ContractError('ReadFailed');
    return { addresses: ADDRESSES, thirdParty: THIRD_PARTY };
  });
}

export function getSupply(): Promise<{ total: Amount; inPool: Amount; burned: Amount }> {
  return read(() => ({ total: AVIANS_SUPPLY, inPool: POOL_AVIANS, burned: world().nest.totalForwarded / 5n }));
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
    const host = w.yourBirds
      .find((b) => b.satchel.holds.some((h) => h.kind === 'avian' && h.id === cursor));
    if (!host) return { ok: true };
    cursor = host.id;
  }
  return { ok: false, reason: 'depth-cap', path };
}

export { packCombo, isValid, ALLOWLIST_ROOT, PERCH_SELL };
