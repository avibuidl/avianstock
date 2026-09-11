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
  Address, Amount, ClaimAllResult, Hex, OnPhase, PermitSignature, Tier, TokenId, TraitIndices,
} from './types';
import { ContractError } from './errors';
import { scenario, takeForcedError } from './scenario';
import {
  MAX_SUPPLY, PRICE, TIER_COST, overlay, world,
} from './fixtures';
import { checkTransferSafety, comboTaken } from './reads';
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

export function approveAviansForRoost(amount: Amount, on?: OnPhase) {
  return send(on, () => { overlay.approvals.aviansToStaking = amount; return {}; });
}

export function setPerchApproval(enabled: boolean, on?: OnPhase) {
  return send(on, () => { overlay.approvals.birdsToPerch = enabled; return {}; });
}

export function setRoostApproval(enabled: boolean, on?: OnPhase) {
  return send(on, () => { overlay.approvals.birdsToRoost = enabled; return {}; });
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
 * One transaction, one AVIANS transfer of price() * n, one approval for that
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
    ids.forEach((id, i) => {
      overlay.soldToPerch.push(id);
      overlay.deposits += 1;
      // `w.perch.deposits` is the count before this sale; this bird is the
      // (i+1)th of it. Burns when that lands on a multiple of BURN_EVERY.
      if ((w.perch.deposits + i + 1) % w.perch.burnEvery === 0) {
        burnt.push(id);
        overlay.burnt.push(id);
      }
    });
    overlay.spent -= w.perch.sell * BigInt(ids.length);
    // Paid in full for every bird, including the burnt one. That is the point.
    return { paid: w.perch.sell * BigInt(ids.length), burnt };
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

// ── the roost — HANDOVER section 5 ────────────────────────────────────────

export async function stake(
  entries: { id: TokenId; tier: Tier }[],
  o: { route?: 'batch' | 'push' } = {},
  on?: OnPhase,
) {
  requireChain();
  if (entries.length === 0) throw new ContractError('EmptyList');
  for (const e of entries) if (![1, 2, 3].includes(e.tier)) throw new ContractError('InvalidTier');
  const w = world();
  for (const e of entries) if (w.staked.has(e.id)) throw new ContractError('AlreadyStaked', { id: e.id });

  const burn = entries.reduce((a, e) => a + TIER_COST[e.tier], 0n);
  // The push route skips the BIRD approval, not the AVIANS one: the tier cost
  // is pulled from the holder and burned either way.
  if (w.wallet.approvals.aviansToStaking < burn || w.wallet.avians < burn) {
    throw new ContractError('TransferFromFailed', { price: burn });
  }
  const route = o.route ?? (entries.length === 1 ? 'push' : 'batch');
  if (route === 'batch' && !w.roost.operatorWhitelisted) throw new ContractError('CallerMustBeWhitelisted');

  return send(on, () => {
    for (const e of entries) { overlay.staked.set(e.id, e.tier); overlay.unstaked.delete(e.id); }
    overlay.spent += burn;
    const a = overlay.approvals.aviansToStaking ?? w.wallet.approvals.aviansToStaking;
    overlay.approvals.aviansToStaking = a > burn ? a - burn : 0n;
    return { burned: burn };
  });
}

export async function unstake(ids: TokenId[], on?: OnPhase) {
  requireChain();
  if (ids.length === 0) throw new ContractError('EmptyList');
  const w = world();
  for (const id of ids) {
    if (!w.staked.has(id)) throw new ContractError('NotStaked', { id });
  }
  return send(on, () => {
    for (const id of ids) { overlay.unstaked.add(id); overlay.staked.delete(id); }
    return {};
  });
}

/**
 * One named token, and it REVERTS with TransferFailed (0x90b8ec18) if that
 * token will not move — which is the right answer when the collector asked
 * for that token specifically. `claimAll` is the better default; this is the
 * escape hatch for someone who wants only NVDA.
 */
export async function claim(token: Address, on?: OnPhase) {
  requireChain();
  const w = world();
  const stream = [...w.roost.streams, ...w.roost.retired]
    .find((s) => s.token.address === token);
  if (!stream) throw new ContractError('NeverListed', { token });
  if (!stream.transferable) throw new ContractError('TransferFailed', { symbol: stream.token.symbol });

  return send(on, () => {
    overlay.claimed.add(stream.token.symbol);
    return { amount: stream.earned };
  });
}

/**
 * Every reward token the wallet has accrued in, in ONE transaction — the
 * listed ones and any retired one it still has a balance in.
 *
 * It does not revert for a token that refuses to move. That token is SKIPPED:
 * its accrual is left exactly where it was, every other token is still paid,
 * and the call succeeds. So the outcome has to be read off the return value,
 * never off "the transaction confirmed".
 *
 * Three parallel arrays in listing order. `readClaimAll` in reads.ts is the
 * one place they are zipped and interpreted; nothing else should index them.
 */
export async function claimAll(on?: OnPhase): Promise<ClaimAllResult & { hash: Hex }> {
  requireChain();
  const w = world();
  const rows = [...w.roost.streams, ...w.roost.retired];

  return send(on, () => {
    const tokens: Address[] = [];
    const paid: Amount[] = [];
    const skipped: boolean[] = [];
    for (const s of rows) {
      // Skipped only when something was OWED and the token itself refused it.
      // A token owing nothing is not skipped — it is simply a zero.
      const refused = s.earned > 0n && !s.transferable;
      tokens.push(s.token.address);
      paid.push(refused ? 0n : s.earned);
      skipped.push(refused);
      if (!refused && s.earned > 0n) overlay.claimed.add(s.token.symbol);
    }
    return { tokens, paid, skipped };
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
  return send(on, () => { overlay.transferredAway.add(id); return {}; });
}

// ── the treasury ──────────────────────────────────────────────────────────

/**
 * Permissionless. The guards the card can answer from reads are checked there;
 * this reproduces the two it cannot, so the switcher can walk both.
 */
export async function convertAndStream(currency: Address | null, on?: OnPhase) {
  requireChain();
  const t = scenario().treasury;
  if (t === 'disabled') throw new ContractError('ConversionDisabled');
  if (t === 'cooling-down') {
    const now = Math.floor(Date.now() / 1000);
    throw new ContractError('CoolingDown', { nextAllowedAt: now + 82_800, currentTime: now });
  }
  if (t === 'nothing-staked') throw new ContractError('NothingStaked');
  if (t === 'no-rewards') throw new ContractError('NoRewardTokens');
  if (t === 'no-targets') throw new ContractError('NoTargets');
  if (currency !== null) throw new ContractError('NothingToConvert', { token: currency });
  if (t === 'nothing-convertible') throw new ContractError('NothingToConvert');

  return send(on, () => ({ converted: 590_640_000_000_000_000n }));
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
