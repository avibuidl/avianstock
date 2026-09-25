// Everything the site can do.
//
// One shape for all of them: arguments in, an optional progress callback, and
// either a result or a thrown ContractError. The wiring agent replaces the
// body of each function with a viem write plus a receipt wait; nothing at a
// call site moves.
//
// Every one of them re-reads the chain id first. HANDOVER section 9a: never
// send a transaction without checking the chain immediately before building
// it, because a person can switch networks at any moment and a mint on the
// wrong chain is a real loss.

import type {
  Address, Amount, Hex, NestEvents, OnPhase, PermitSignature, SweepResult, Tier, TokenId, TraitIndices,
} from './types';
import { ContractError, SELECTORS } from './errors';
import { scenario, takeForcedError } from './scenario';
import {
  ADDRESSES, MAX_SUPPLY, PRICE, TIER_COST, YOU, overlay, rewardTokenMeta, satchelAddressOf, world,
} from './fixtures';
import { checkTransferSafety, comboTaken, getTreasury, mockOpening } from './reads';
import { isValid } from '../art/traits';
import { requireChain, sleep } from './wallet';

const bumpers = new Set<() => void>();
/** Anything that changed on chain invalidates every read. */
export function onWrite(fn: () => void): () => void {
  bumpers.add(fn);
  return () => { bumpers.delete(fn); };
}
/**
 * Shared with `./admin`, which is loaded lazily and so cannot register a
 * subscription of its own at start-up. One signal, however the write got made.
 */
export function settled() { bumpers.forEach((f) => f()); }

function hash(): Hex {
  let h = '0x';
  for (let i = 0; i < 64; i++) h += '0123456789abcdef'[Math.floor(Math.random() * 16)];
  return h as Hex;
}

/** signing → pending → confirmed, with a forced failure honoured at the top. */
async function send<T>(on: OnPhase | undefined, make: () => T): Promise<T & { hash: Hex }> {
  requireChain();
  const forced = takeForcedError();
  on?.('signing');
  await sleep(650);
  // No invented price. `explain` prefers an error's own argument over the
  // screen's context, so hard-coding one bird's price made a forced failure on
  // a three-bird batch report 100,000 — and sent a reviewer looking for a bug
  // in the caller's context, which was right all along.
  if (forced) throw new ContractError(forced);
  const h = hash();
  on?.('pending', h);
  await sleep(1400);
  const out = make();
  on?.('confirmed', h);
  settled();
  return { ...out, hash: h };
}

// ── approvals — HANDOVER section 2 ────────────────────────────────────────

export function approveAviansForMint(amount: Amount, on?: OnPhase) {
  return send(on, () => { overlay.approvals.aviansToCollection = amount; return {}; });
}

export function approveAviansForPerch(amount: Amount, on?: OnPhase) {
  return send(on, () => { overlay.approvals.aviansToPerch = amount; return {}; });
}

/** The only approval brooding needs: AVIAN to the Nest, for the tier costs. */
export function approveAviansForNest(amount: Amount, on?: OnPhase) {
  return send(on, () => { overlay.approvals.aviansToNest = amount; return {}; });
}

export function setPerchApproval(enabled: boolean, on?: OnPhase) {
  return send(on, () => { overlay.approvals.birdsToPerch = enabled; return {}; });
}

/**
 * An EIP-2612 signature for exactly `price()`, spender = the collection. One
 * signature and one transaction instead of two transactions.
 *
 * Sign for the CURRENT price: the digest commits to a value, so re-read
 * `price()` immediately before signing or the permit is for the old amount.
 */
export async function signMintPermit(count = 1): Promise<PermitSignature> {
  requireChain();
  await sleep(800);
  return {
    deadline: Math.floor(Date.now() / 1000) + 1800,
    v: 28, r: hash(), s: hash(), value: PRICE * BigInt(count),
  };
}

// ── the mint — HANDOVER section 3 ─────────────────────────────────────────

/** The six checks, in the contract's order. Nothing else can come out of a mint. */
function guardMint(count: number, permit?: PermitSignature) {
  const w = world();
  const c = w.collection;
  const total = PRICE * BigInt(count);

  if (!c.mintOpen) throw new ContractError('MintClosed');
  const allowance = permit ? (permit.value >= total ? total : w.wallet.approvals.aviansToCollection)
    : w.wallet.approvals.aviansToCollection;
  if (w.wallet.avians < total || allowance < total) {
    throw new ContractError('InsufficientPayment', { price: total });
  }
  if (c.paidRemaining < count) throw new ContractError('SoldOut');
  if (w.wallet.mintedBy + count > c.walletLimit) throw new ContractError('WalletCapReached', { limit: c.walletLimit });
}

function nextId(): TokenId {
  const w = world();
  return Math.min(w.collection.totalMinted + 1, MAX_SUPPLY);
}

export async function mint(
  traits: TraitIndices,
  o: { permit?: PermitSignature } = {},
  on?: OnPhase,
) {
  requireChain();
  if (!isValid(traits)) throw new ContractError('InvalidTrait');
  guardMint(1, o.permit);
  const taken = await comboTaken(traits);
  if (taken.taken) throw new ContractError('ComboTaken', { tokenId: taken.tokenId, combo: 0n });

  return send(on, () => {
    const id = nextId();
    overlay.minted.push(id);
    overlay.spent += PRICE;
    if (!o.permit) {
      const a = overlay.approvals.aviansToCollection ?? world().wallet.approvals.aviansToCollection;
      overlay.approvals.aviansToCollection = a > PRICE ? a - PRICE : 0n;
    }
    return { tokenId: id };
  });
}

/**
 * One transaction, one AVIAN transfer of price() * n, one approval for that
 * total. All or nothing: if any bird in the batch is refused the whole batch
 * reverts with THAT bird's error and nothing is minted.
 */
export async function mintMany(
  traits: TraitIndices[],
  o: { permit?: PermitSignature } = {},
  on?: OnPhase,
) {
  requireChain();
  if (traits.length === 0) throw new ContractError('EmptyBatch');
  for (const t of traits) if (!isValid(t)) throw new ContractError('InvalidTrait');
  guardMint(traits.length, o.permit);

  const seen = new Set<string>();
  for (const t of traits) {
    const key = t.join(',');
    // A duplicate inside the batch is ComboTaken on the SECOND copy.
    if (seen.has(key)) throw new ContractError('ComboTaken', {});
    seen.add(key);
    const taken = await comboTaken(t);
    if (taken.taken) throw new ContractError('ComboTaken', { tokenId: taken.tokenId });
  }

  return send(on, () => {
    const ids: TokenId[] = [];
    for (let i = 0; i < traits.length; i++) {
      const id = world().collection.totalMinted + 1;
      overlay.minted.push(id);
      ids.push(id);
    }
    overlay.spent += PRICE * BigInt(traits.length);
    return { tokenIds: ids };
  });
}

export async function mintFree(traits: TraitIndices, _proof: Hex[], on?: OnPhase) {
  requireChain();
  const w = world();
  const c = w.collection;
  if (!c.freeMintOpen || c.freeAllocationReleased) throw new ContractError('FreeMintClosed');
  if (w.wallet.freeClaimed) throw new ContractError('FreeMintAlreadyClaimed');
  if (!w.wallet.isAllowlisted) throw new ContractError('NotAllowlisted');
  if (c.reservedFree <= 0) throw new ContractError('FreeAllocationExhausted');
  if (!isValid(traits)) throw new ContractError('InvalidTrait');
  const taken = await comboTaken(traits);
  if (taken.taken) throw new ContractError('ComboTaken', { tokenId: taken.tokenId });

  return send(on, () => {
    const id = nextId();
    overlay.minted.push(id);
    overlay.freeClaimed = true;
    return { tokenId: id };
  });
}

// ── the perch — HANDOVER section 4 ────────────────────────────────────────

/**
 * `route: 'push'` is `safeTransferFrom` into the perch: no bird approval,
 * one bird per transaction. `'batch'` is `sell(ids)`, which needs the
 * approval and takes a list. Same price either way.
 */
export async function sellToPerch(
  ids: TokenId[],
  o: { route?: 'batch' | 'push' } = {},
  on?: OnPhase,
) {
  requireChain();
  if (ids.length === 0) throw new ContractError('EmptyList');
  if (new Set(ids).size !== ids.length) throw new ContractError('AlreadyHeld', { id: ids[0] });
  const w = world();
  const route = o.route ?? (ids.length === 1 ? 'push' : 'batch');
  if (route === 'batch' && !w.perch.operatorWhitelisted) throw new ContractError('CallerMustBeWhitelisted');
  if (route === 'batch' && !w.wallet.approvals.birdsToPerch) {
    throw new ContractError('ERC721InsufficientApproval');
  }

  return send(on, () => {
    // The count advances PER BIRD, never per transaction — which is why a sale
    // of 250 burns two, and why the bird that burns is the one at that position
    // in the list rather than the first or the last.
    const burnt: TokenId[] = [];
    const withheld: TokenId[] = [];
    const ev = noEvents();
    ids.forEach((id, i) => {
      // A sale changes hands: the collection's hook ends any brood on the way in.
      expireBroodOf(id, ev);
      overlay.soldToPerch.push(id);
      overlay.deposits += 1;
      // `w.perch.deposits` is the count before this sale; this bird is the
      // (i+1)th of it. A hundredth burns when the burn is active, and is
      // withheld — kept in the pool, paid the same — at or below the floor.
      if ((w.perch.deposits + i + 1) % w.perch.burnEvery === 0) {
        if (w.perch.burnsActive) { burnt.push(id); overlay.burnt.push(id); } else withheld.push(id);
      }
    });
    overlay.spent -= w.perch.sell * BigInt(ids.length);
    // Paid in full for every bird, including the burnt one. That is the point.
    return {
      paid: w.perch.sell * BigInt(ids.length), burnt, withheld,
      expired: ev.expired.map((e) => e.id), hookFailed: [],
    };
  });
}

export async function buyNext(count: number, on?: OnPhase) {
  requireChain();
  if (count <= 0) throw new ContractError('EmptyList');
  const w = world();
  if (count > w.perch.poolSize) {
    throw new ContractError('InsufficientPool', { requested: count, available: w.perch.poolSize });
  }
  const total = w.perch.buyNext * BigInt(count);
  // The perch does NOT pre-check the allowance the way the mint does.
  if (w.wallet.avians < total) throw new ContractError('TransferFromFailed', { price: total });

  return send(on, () => {
    const ids = w.perch.heldIds.slice(0, count);
    overlay.boughtFromPerch.push(...ids);
    overlay.spent += total;
    return { ids, paid: total };
  });
}

export async function buyNamed(ids: TokenId[], on?: OnPhase) {
  requireChain();
  if (ids.length === 0) throw new ContractError('EmptyList');
  const w = world();
  for (const id of ids) if (!w.perch.heldIds.includes(id)) throw new ContractError('NotHeld', { id });
  const total = w.perch.buyNamed * BigInt(ids.length);
  if (w.wallet.avians < total) throw new ContractError('TransferFromFailed', { price: total });

  return send(on, () => {
    overlay.boughtFromPerch.push(...ids);
    overlay.spent += total;
    return { paid: total };
  });
}

// ── the nest — HANDOVER section 5 ────────────────────────────────────────
//
// BROODING IS NOT CUSTODIAL. Nothing here moves a bird; the mock's writes
// change the brood record, burn AVIAN, and move accrual to a destination —
// so every state the screen can show is reachable by doing the thing, not
// only by flipping the switcher.

/** Empty receipt events, the shape the chain's `nestEvents` returns. */
function noEvents(): NestEvents {
  return {
    brooded: [], upgraded: [], redirected: [], expired: [], settled: [],
    expirySettled: [], returned: [], held: [], paid: [], hookFailed: [],
  };
}

/** Stamp expiry on a live brood, as the collection's hook does on a transfer. */
export function expireBroodOf(id: TokenId, ev?: NestEvents) {
  const w = world();
  const b = w.broods.get(id);
  if (!b || b.expiredAt !== 0) return;
  const stamped = { ...b, expiredAt: Math.floor(Date.now() / 1000) };
  overlay.broods.set(id, stamped);
  ev?.expired.push({ id, activator: b.activator, at: stamped.expiredAt });
}

/**
 * Deliver one bird's accrual, every token, to wherever it goes. A paused token
 * refuses: for a brooding bird the amount stays owed (`RewardHeld` with the
 * id); for an expired brood's activator share it waits in `claimable`
 * (`RewardHeld` with id 0). Returns the events for the receipt.
 */
function settleOne(id: TokenId, ev: NestEvents) {
  const w = world();
  const b = w.broods.get(id);
  if (!b) return;
  const credit = (to: Address, symbol: string, amount: Amount) => {
    const k = to.toLowerCase();
    const m = overlay.delivered.get(k) ?? new Map<string, Amount>();
    m.set(symbol, (m.get(symbol) ?? 0n) + amount);
    overlay.delivered.set(k, m);
  };
  const paidDown = (symbol: string, amount: Amount) => {
    const m = overlay.settledUpTo.get(id) ?? new Map<string, Amount>();
    m.set(symbol, (m.get(symbol) ?? 0n) + amount);
    overlay.settledUpTo.set(id, m);
  };
  for (const token of w.listed) {
    const p = w.pendingOf(id, token.symbol);
    const paused = w.pausedSymbols.includes(token.symbol);
    if (b.expiredAt === 0) {
      if (p.toDestination === 0n) continue;
      const to = b.toWallet ? b.activator : satchelAddressOf(id);
      if (paused) {
        ev.held.push({ id, beneficiary: to, token: token.address, amount: p.toDestination });
        continue;   // still owed to the bird; a later settle retries
      }
      credit(to, token.symbol, p.toDestination);
      paidDown(token.symbol, p.toDestination);
      ev.settled.push({ id, token: token.address, to, amount: p.toDestination });
    } else {
      if (p.toActivator > 0n) {
        if (paused) {
          // Held for the activator; `claim` collects it.
          overlay.claimed.delete(token.symbol);
          ev.held.push({ id: 0, beneficiary: b.activator, token: token.address, amount: p.toActivator });
        } else {
          credit(b.activator, token.symbol, p.toActivator);
          ev.paid.push({ user: b.activator, token: token.address, amount: p.toActivator });
        }
      }
      if (p.returned > 0n) ev.returned.push({ token: token.address, amount: p.returned, folded: true });
      if (p.toActivator > 0n || p.returned > 0n) {
        ev.expirySettled.push({ id, activator: b.activator, token: token.address, toActivator: p.toActivator, returned: p.returned });
      }
      paidDown(token.symbol, p.toActivator + p.returned);
    }
  }
  if (b.expiredAt !== 0) {
    // The record is cleared; the bird can be brooded afresh by its holder.
    overlay.broods.set(id, null);
  }
}

export async function brood(
  entries: { id: TokenId; tier: Tier; toWallet: boolean }[],
  on?: OnPhase,
) {
  requireChain();
  if (entries.length === 0) throw new ContractError('EmptyList');
  for (const e of entries) if (![1, 2, 3].includes(e.tier)) throw new ContractError('InvalidTier');
  const w = world();
  for (const e of entries) {
    if (!w.yourBirds.some((b) => b.id === e.id)) throw new ContractError('NotTheOwner', { tokenId: e.id });
    const b = w.broods.get(e.id);
    if (b && b.expiredAt === 0) throw new ContractError('AlreadyBrooding', { tokenId: e.id });
  }
  const burn = entries.reduce((a, e) => a + TIER_COST[e.tier], 0n);
  if (w.wallet.avians < burn || w.wallet.approvals.aviansToNest < burn) {
    throw new ContractError('TransferFromFailed', { price: burn });
  }
  return send(on, () => {
    const ev = noEvents();
    const now = Math.floor(Date.now() / 1000);
    for (const e of entries) {
      // An expired brood on the bird is settled first, as the contract does.
      if (w.broods.get(e.id)?.expiredAt) settleOne(e.id, ev);
      overlay.broods.set(e.id, { activator: YOU, tier: e.tier, activatedAt: now, expiredAt: 0, toWallet: e.toWallet });
      overlay.settledUpTo.set(e.id, new Map());
      ev.brooded.push({ id: e.id, tier: e.tier, paid: TIER_COST[e.tier], toWallet: e.toWallet });
    }
    overlay.spent += burn;
    const a = overlay.approvals.aviansToNest ?? w.wallet.approvals.aviansToNest;
    overlay.approvals.aviansToNest = a > burn ? a - burn : 0n;
    return { paid: burn, events: ev };
  });
}

export async function upgrade(id: TokenId, newTier: Tier, on?: OnPhase) {
  requireChain();
  const w = world();
  const b = w.broods.get(id);
  if (!b) throw new ContractError('NotBrooding', { tokenId: id });
  if (b.expiredAt !== 0) throw new ContractError('BroodExpired', { tokenId: id });
  if (b.activator !== YOU) throw new ContractError('NotTheOwner', { tokenId: id });
  if (newTier <= b.tier) throw new ContractError('TierNotHigher', { tokenId: id });
  const burn = TIER_COST[newTier] - TIER_COST[b.tier];
  if (w.wallet.avians < burn || w.wallet.approvals.aviansToNest < burn) {
    throw new ContractError('TransferFromFailed', { price: burn });
  }
  return send(on, () => {
    const ev = noEvents();
    settleOne(id, ev);   // at the old weight, up to this second
    overlay.broods.set(id, { ...b, tier: newTier });
    overlay.spent += burn;
    ev.upgraded.push({ id, fromTier: b.tier, toTier: newTier, paid: burn });
    return { paid: burn, events: ev };
  });
}

export async function redirect(id: TokenId, toWallet: boolean, on?: OnPhase) {
  requireChain();
  const w = world();
  const b = w.broods.get(id);
  if (!b) throw new ContractError('NotBrooding', { tokenId: id });
  if (b.expiredAt !== 0) throw new ContractError('BroodExpired', { tokenId: id });
  if (b.activator !== YOU) throw new ContractError('NotTheOwner', { tokenId: id });
  if (b.toWallet === toWallet) throw new ContractError('SameDelivery', { tokenId: id });
  return send(on, () => {
    const ev = noEvents();
    settleOne(id, ev);   // to the OLD destination
    overlay.broods.set(id, { ...b, toWallet });
    ev.redirected.push({ id, toWallet });
    return { events: ev };
  });
}

export async function settle(ids: TokenId[], on?: OnPhase) {
  requireChain();
  if (ids.length === 0) throw new ContractError('EmptyList');
  return send(on, () => {
    const ev = noEvents();
    for (const id of ids) settleOne(id, ev);
    return { events: ev };
  });
}

export async function claim(token: Address, on?: OnPhase) {
  requireChain();
  const w = world();
  const t = w.listed.find((x) => x.address.toLowerCase() === token.toLowerCase());
  if (!t) throw new ContractError('NeverListed');
  const amount = w.claimable.get(t.symbol) ?? 0n;
  if (amount > 0n && w.pausedSymbols.includes(t.symbol)) throw new ContractError('TransferFailed');
  return send(on, () => {
    const ev = noEvents();
    overlay.claimed.add(t.symbol);
    if (amount > 0n) ev.paid.push({ user: YOU, token, amount });
    return { amount, events: ev };
  });
}

// ── birds — HANDOVER section 8 ────────────────────────────────────────────

export async function transferBird(id: TokenId, to: Address, on?: OnPhase) {
  requireChain();
  const safety = await checkTransferSafety(id, to);
  if (!safety.ok) {
    if (safety.reason === 'own-account') throw new ContractError('TransferToOwnAccount', { id });
    throw new ContractError('SatchelCycle', { id, path: safety.path });
  }
  return send(on, () => {
    const ev = noEvents();
    expireBroodOf(id, ev);
    overlay.transferredAway.add(id);
    return { expired: ev.expired.map((e) => e.id), hookFailed: [] };
  });
}

// ── the sweeper — HANDOVER section 5 ─────────────────────────────────────
//
// The grant lives on the satchel and dies with the bird's sale; the sweep
// moves each granted satchel's reward balances into your wallet and reports
// what it passed over. A paused token is skipped for that bird, never a
// failure — the stock stays in the bird.

export async function prepareSatchels(ids: TokenId[], on?: OnPhase) {
  requireChain();
  if (ids.length === 0) throw new ContractError('EmptyList');
  const w = world();
  for (const id of ids) {
    if (id < 1 || id > w.collection.totalMinted || overlay.burnt.includes(id)) {
      throw new ContractError('ERC721NonexistentToken', { id });
    }
  }
  return send(on, () => {
    const deployed = ids.filter((id) => !w.satchelDeployed(id));
    for (const id of deployed) overlay.satchelsDeployed.add(id);
    return { deployed };
  });
}

export async function grantSweeper(id: TokenId, enabled: boolean, on?: OnPhase) {
  requireChain();
  const w = world();
  if (!w.satchelDeployed(id)) {
    throw new Error(`granting on Avian #${id}: its satchel is not deployed, so there is nothing to send the grant to. This is a site bug.`);
  }
  if (!w.yourBirds.some((b) => b.id === id)) throw new ContractError('NotAuthorized', { tokenId: id, id });
  return send(on, () => {
    overlay.sweeperGrants.set(id, enabled);
    return { satchel: satchelAddressOf(id), granted: enabled };
  });
}

export async function sweep(ids: TokenId[], tokens: Address[], on?: OnPhase): Promise<SweepResult> {
  requireChain();
  if (ids.length === 0 || tokens.length === 0) throw new ContractError('EmptyList');
  const w = world();
  for (const id of ids) {
    if (!w.yourBirds.some((b) => b.id === id)) throw new ContractError('NotTheOwner', { tokenId: id, id });
  }
  return send(on, () => {
    const swept: SweepResult['swept'] = [];
    const skipped: SweepResult['skipped'] = [];
    for (const id of ids) {
      if (!w.satchelDeployed(id) || !w.sweeperGranted(id)) {
        skipped.push({ id, token: null, reason: '0x' });
        continue;
      }
      const satchel = satchelAddressOf(id).toLowerCase();
      for (const token of tokens) {
        const meta = rewardTokenMeta(token);
        const amount = w.satchelBalanceOf(id, meta.symbol);
        if (amount === 0n) continue;
        if (w.pausedSymbols.includes(meta.symbol)) {
          skipped.push({ id, token, reason: SELECTORS.TransferFailed! });
          continue;
        }
        const out = overlay.sweptFrom.get(satchel) ?? new Map<string, Amount>();
        out.set(meta.symbol, (out.get(meta.symbol) ?? 0n) + amount);
        overlay.sweptFrom.set(satchel, out);
        const mine = overlay.delivered.get(YOU.toLowerCase()) ?? new Map<string, Amount>();
        mine.set(meta.symbol, (mine.get(meta.symbol) ?? 0n) + amount);
        overlay.delivered.set(YOU.toLowerCase(), mine);
        swept.push({ id, token, to: YOU, amount });
      }
    }
    const totals = new Map<string, { token: Address; amount: Amount }>();
    for (const s of swept) {
      const t = totals.get(s.token.toLowerCase()) ?? { token: s.token, amount: 0n };
      t.amount += s.amount;
      totals.set(s.token.toLowerCase(), t);
    }
    return { swept, skipped, totals: [...totals.values()] };
  });
}

// ── the treasury ──────────────────────────────────────────────────────────

/**
 * Permissionless. The guards the card can answer from reads are checked there;
 * this reproduces the two it cannot, so the switcher can walk both.
 */
export async function convertAndStream(currency: Address | null, on?: OnPhase) {
  requireChain();
  const t = scenario().treasury;
  if (t === 'paused') throw new ContractError('ConversionDisabled');
  if (t === 'launch-unknown') throw new ContractError('LaunchUnknown');
  if (t === 'opens-later') {
    const { openAt } = mockOpening(t, Math.floor(Date.now() / 1000));
    throw new ContractError('ConversionsNotOpen', { openAt });
  }
  if (t === 'cooling-down') {
    const now = Math.floor(Date.now() / 1000);
    throw new ContractError('CoolingDown', { nextAllowedAt: now + 82_800, currentTime: now });
  }
  if (t === 'nothing-staked') throw new ContractError('NothingBrooding');
  if (t === 'no-rewards') throw new ContractError('NoRewardTokens');
  if (t === 'no-targets') throw new ContractError('NoTargets');
  if (currency !== null) throw new ContractError('NothingToConvert', { token: currency });
  if (t === 'nothing-convertible') throw new ContractError('NothingToConvert');

  return send(on, () => ({ converted: 590_640_000_000_000_000n }));
}

/**
 * The Roost's tenth (2026-09-22): anyone, on its own daily clock. The fixture
 * pool's price is the swap fixture's, 1 ETH = 2,000,000 AVIAN.
 */
export async function buyForRoost(on?: OnPhase) {
  requireChain();
  const t = scenario().treasury;
  if (t === 'paused') throw new ContractError('ConversionDisabled');
  if (t === 'launch-unknown') throw new ContractError('LaunchUnknown');
  if (t === 'opens-later') {
    const { openAt } = mockOpening(t, Math.floor(Date.now() / 1000));
    throw new ContractError('ConversionsNotOpen', { openAt });
  }
  if (t === 'roost-buy-cooling') {
    const now = Math.floor(Date.now() / 1000);
    throw new ContractError('CoolingDown', { nextAllowedAt: now + 82_800, currentTime: now });
  }
  const treasury = await getTreasury();
  const buyable = treasury.roost?.buyable ?? 0n;
  if (buyable === 0n) {
    throw new ContractError('NothingToBuyForRoost', { balance: treasury.rows[0].balance, unspentShare: 0n });
  }
  if (t === 'no-targets') throw new ContractError('NoRoute');
  // Priced by the pools (2026-09-24): no usable reading means no price, and a
  // pool that has strayed from its own mean is refused rather than filled.
  if (t === 'readings-absent' || t === 'readings-too-young') {
    const now = Math.floor(Date.now() / 1000);
    throw new ContractError('NoUsableReading', { lastAt: t === 'readings-absent' ? 0 : now - 420, prevAt: 0 });
  }
  if (t === 'pool-unsettled') {
    throw new ContractError('PriceUnsettled', { token: ADDRESSES.Avians, meanTick: 4_200, spotTick: 5_600 });
  }
  return send(on, () => {
    const amountOut = buyable * 2_000_000n;
    overlay.roostSpent += buyable;
    overlay.roostBought = (overlay.roostBought ?? 0n) + amountOut;
    return { amountIn: buyable, amountOut };
  });
}

/**
 * A reading of the AVIAN pool (2026-09-24). Anyone's, and it refuses only
 * when the last one is still too young to be replaced — which is the state
 * the card already declines to draw the button in.
 */
export async function takeRoostReading(on?: OnPhase) {
  requireChain();
  const t = scenario().treasury;
  const now = Math.floor(Date.now() / 1000);
  if (t === 'readings-too-young') {
    const at = now - 420;
    throw new ContractError('ReadingTooYoung', { at, usableAt: at + 1_800 });
  }
  return send(on, () => ({ at: now }));
}

/** `onlyOwner` on the contract. The card hides the button; this is the refusal. */

export function createSatchel(id: TokenId, on?: OnPhase) {
  return send(on, () => ({ account: world().makeBird(id, { where: 'wallet', owner: world().wallet.address }).satchel.address }));
}

/** Which route the site would pick, and why — surfaced so the UI can say it. */
export function routeFor(count: number, approved: boolean, whitelisted: boolean): {
  route: 'batch' | 'push'; reason: string; offerApproval: boolean;
} {
  if (!whitelisted) {
    return {
      route: 'push',
      offerApproval: false,
      reason: 'The batch route is not approved on this deployment, so we send each bird in directly. Same price, same result.',
    };
  }
  /*
    NO OPERATOR APPROVAL, NO BATCH ROUTE.

    The batch call PULLS the birds — `transferFrom` by a contract that is not
    their owner — so without `setApprovalForAll` it reverts
    `ERC721InsufficientApproval`. This used to return 'batch' for any count of
    two or more whatever the approval said, which sent a transaction that could
    only fail.

    Pushing each bird in needs no approval and costs the same, so that is what
    goes out until the approval exists. The approval is OFFERED rather than
    demanded: it buys one transaction instead of several, which is worth a
    button and is not worth a wall.
  */
  if (!approved) {
    return {
      route: 'push',
      offerApproval: count > 1,
      reason: count > 1
        ? 'Each bird goes in directly — no approval needed. One approval would put them all in a single transaction instead.'
        : 'One bird goes in directly — no approval transaction needed.',
    };
  }
  return {
    route: 'batch',
    offerApproval: false,
    reason: count > 1 ? 'Several birds in one transaction.' : 'One transaction.',
  };
}

export { scenario };
