// The owner surface, sent.
//
// The second and last file allowed to import a `*AdminAbi`. Every call below
// goes through `run()` from `writes.ts` — the same seven steps a mint takes:
// re-read the chain and the account, simulate, re-read again, estimate, send,
// wait for the receipt, and decode a revert into a sentence. There is no
// second, laxer pipeline for owner calls.
//
// Two rules this file keeps, both from the plan:
//
//   * ONE CALL, ONE SIGNATURE. Nothing here batches unrelated owner calls into
//     a single flow. `addRewardToken` is two transactions and is shown as two.
//   * NO ADDRESS FROM A MANIFEST FIELD CALLED "OWNER". There is none. The owner
//     is whatever `owner()` returns, read live, every time.
//
// And one it does not need to keep, because it cannot break it: none of these
// functions authorises anything. `onlyOwner` on the contract refuses a wallet
// that is not the owner, and it refuses it whether or not this file exists.

import { parseEventLogs, type Abi } from 'viem';
import { run } from './writes';
import { contracts } from './manifest';
import { aviansAbi, liquidityVaultAbi } from './abis.generated';
import {
  theNestAdminAbi,
  avianStockAdminAbi,
  liquidityVaultAdminAbi,
  thePerchAdminAbi,
  treasuryAdminAbi,
} from './abis.admin.generated';
import { adminAddress, encodeValidatorOperation } from './admin';
import type {
  AdminContract, AdminTargetRow, Address, Amount, Hex, OnPhase, TokenId, V3Hop, V4Hop,
  ValidatorOperation,
} from '../mock/types';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address;

const fac = () => ({ to: contracts().AvianStock, abi: avianStockAdminAbi as unknown as Abi });
const amm = () => ({ to: contracts().ThePerch, abi: thePerchAdminAbi as unknown as Abi });
const nest = () => ({ to: contracts().TheNest, abi: theNestAdminAbi as unknown as Abi });
const tre = () => ({ to: contracts().Treasury, abi: treasuryAdminAbi as unknown as Abi });
const vault = () => ({ to: adminAddress('LiquidityVault'), abi: liquidityVaultAdminAbi as unknown as Abi });

// ── the collection ────────────────────────────────────────────────────────

export async function setMintOpen(open: boolean, on?: OnPhase) {
  const { hash } = await run({
    where: open ? 'opening the paid mint' : 'closing the paid mint',
    ...fac(), functionName: 'setMintOpen', args: [open],
  }, { on });
  return { hash };
}

export async function setFreeMintOpen(open: boolean, on?: OnPhase) {
  const { hash } = await run({
    where: open ? 'opening the free mint' : 'closing the free mint',
    ...fac(), functionName: 'setFreeMintOpen', args: [open],
  }, { on });
  return { hash };
}

/**
 * A new merkle root.
 *
 * The copy beside this warns about the thing that is genuinely hard to debug:
 * a root that has moved on from the deployed `proofs.json` is indistinguishable
 * from `NotAllowlisted` for the collector, who is told they are not on the list
 * when in fact the file is stale.
 */
export async function setAllowlistRoot(root: Hex, on?: OnPhase) {
  const { hash } = await run({
    where: 'setting the allowlist root', ...fac(), functionName: 'setAllowlistRoot', args: [root],
  }, { on });
  return { hash };
}

export async function setAllowlisted(accounts: Address[], allowed: boolean, on?: OnPhase) {
  const { hash } = await run({
    where: allowed ? 'adding to the allowlist' : 'removing from the allowlist',
    ...fac(), functionName: 'setAllowlisted', args: [accounts, allowed],
  }, { on });
  return { hash };
}

export async function releaseFreeAllocation(on?: OnPhase) {
  const { simulated, hash } = await run<bigint>({
    where: 'releasing the free allocation',
    ...fac(), functionName: 'releaseFreeAllocation', args: [],
  }, { on });
  return { released: simulated, hash };
}

export async function setPrice(newPrice: Amount, on?: OnPhase) {
  const { hash } = await run({
    where: 'setting the mint price', ...fac(), functionName: 'setPrice', args: [newPrice],
  }, { on });
  return { hash };
}

export async function setDefaultRoyalty(receiver: Address, bps: number, on?: OnPhase) {
  const { hash } = await run({
    where: 'setting the royalty', ...fac(), functionName: 'setDefaultRoyalty', args: [receiver, bps],
  }, { on });
  return { hash };
}

export async function deleteDefaultRoyalty(on?: OnPhase) {
  const { hash } = await run({
    where: 'removing the royalty', ...fac(), functionName: 'deleteDefaultRoyalty', args: [],
  }, { on });
  return { hash };
}

export async function setRenderer(renderer: Address, on?: OnPhase) {
  const { hash } = await run({
    where: 'pointing the collection at a renderer',
    ...fac(), functionName: 'setRenderer', args: [renderer],
  }, { on });
  return { hash };
}

/**
 * Permanent. `expected` is not a formality: the contract reverts when the
 * renderer on chain is not the address being locked, which is what stops a
 * lock landing on something that changed between reading and signing.
 */
export async function lockRenderer(expected: Address, on?: OnPhase) {
  const { hash } = await run({
    where: 'locking the renderer', ...fac(), functionName: 'lockRenderer', args: [expected],
  }, { on });
  return { hash };
}

export async function setTransferValidator(validator: Address, on?: OnPhase) {
  const { hash } = await run({
    where: 'pointing the collection at a transfer validator',
    ...fac(), functionName: 'setTransferValidator', args: [validator],
  }, { on });
  return { hash };
}

/** Permanent, and `expected` guards it the same way `lockRenderer` does. */
export async function lockTransferValidator(expected: Address, on?: OnPhase) {
  const { hash } = await run({
    where: 'locking the transfer validator',
    ...fac(), functionName: 'lockTransferValidator', args: [expected],
  }, { on });
  return { hash };
}

/**
 * Forward one composed operation to the validator.
 *
 * The calldata is built by `encodeValidatorOperation` from typed inputs and is
 * shown read-only before this is called. The collection forwards thirteen
 * selectors and refuses everything else, so what arrives here has already been
 * narrowed twice — once by the union that describes it, once by the contract.
 */
export async function configureTransferValidator(op: ValidatorOperation, on?: OnPhase) {
  const data = encodeValidatorOperation(op);
  const { hash } = await run({
    where: 'configuring the transfer validator',
    ...fac(), functionName: 'configureTransferValidator', args: [data],
  }, { on });
  return { hash, data };
}

/**
 * Sweep something out of the collection.
 *
 * `address(0)` means the collection's ETH. For AVIANS only the excess over
 * `requiredBacking()` can leave, and the panel shows held, required and
 * sweepable as three separate figures rather than one.
 */
export async function rescueFromCollection(token: Address | null, to: Address, on?: OnPhase) {
  const { hash } = await run({
    where: 'sweeping the collection', ...fac(), functionName: 'rescue',
    args: [token ?? ZERO_ADDRESS, to],
  }, { on });
  return { hash };
}

// ── the perch ─────────────────────────────────────────────────────────────

export async function setFeeRecipient(recipient: Address, on?: OnPhase) {
  const { hash } = await run({
    where: 'setting the perch’s fee recipient',
    ...amm(), functionName: 'setFeeRecipient', args: [recipient],
  }, { on });
  return { hash };
}

/** The perch refuses AVIANS and the collection by address. Everything else goes. */
export async function rescueFromPerch(token: Address, to: Address, on?: OnPhase) {
  const { simulated, hash } = await run<bigint>({
    where: 'sweeping the perch', ...amm(), functionName: 'rescueERC20', args: [token, to],
  }, { on });
  return { amount: simulated, hash };
}

// ── the nest ──────────────────────────────────────────────────────────────

/**
 * Add a reward token. Step two of two.
 *
 * The probe is a real transfer in and straight back out, pulled from the
 * owner's own wallet with `transferFrom`, to prove the token actually moves
 * what it says it moves. So it needs an allowance first — an exact one, made by
 * `approveForProbe` below. No infinite approval, here of all places.
 */
export async function addRewardToken(token: Address, probeAmount: Amount, on?: OnPhase) {
  const { hash } = await run({
    where: 'adding a reward token', ...nest(),
    functionName: 'addRewardToken', args: [token, probeAmount],
  }, { on });
  return { hash };
}

/** Step one of two: exactly the probe amount, to the nest, and nothing more. */
export async function approveForProbe(token: Address, amount: Amount, on?: OnPhase) {
  const { hash } = await run({
    where: 'approving the probe amount',
    to: token, abi: aviansAbi, functionName: 'approve',
    args: [contracts().TheNest, amount],
  }, { on });
  return { hash };
}

export async function retireRewardToken(token: Address, on?: OnPhase) {
  const { hash } = await run({
    where: 'retiring a reward token', ...nest(),
    functionName: 'retireRewardToken', args: [token],
  }, { on });
  return { hash };
}

/**
 * Re-schedule the surplus.
 *
 * What is already earned is settled and untouched; only the amount above what
 * is escrowed moves, and it keeps its value and changes only its timing.
 */
export async function restream(token: Address, duration: number, on?: OnPhase) {
  const { simulated, hash } = await run<bigint>({
    where: 'restreaming a reward token', ...nest(),
    functionName: 'restream', args: [token, BigInt(duration)],
  }, { on });
  return { amount: simulated, hash };
}

export async function setFunder(funder: Address, allowed: boolean, on?: OnPhase) {
  const { hash } = await run({
    where: allowed ? 'adding a funder' : 'removing a funder',
    ...nest(), functionName: 'setFunder', args: [funder, allowed],
  }, { on });
  return { hash };
}

/** A bird the nest holds with no stake recorded against it, and nothing else. */
export async function rescueUnstaked(id: TokenId, to: Address, on?: OnPhase) {
  const { hash } = await run({
    where: 'rescuing a stranded bird', ...nest(),
    functionName: 'rescueUnstaked', args: [BigInt(id), to],
  }, { on });
  return { hash };
}

// ── the treasury ──────────────────────────────────────────────────────────

/**
 * Withdraw the admin's outstanding claim in one currency.
 *
 * `to` is an argument rather than the owner's own address so a hardware wallet
 * can hold the key while a different address holds the money. The panel shows
 * where it is going before anything is signed.
 */
export async function claimAdmin(currency: Address | null, to: Address, on?: OnPhase) {
  const { simulated, hash } = await run<bigint>({
    where: 'withdrawing from the treasury', ...tre(), functionName: 'claimAdmin',
    args: [currency ?? ZERO_ADDRESS, to],
  }, { on });
  return { amount: simulated, hash };
}

export async function setConversionConfig(
  c: {
    enabled: boolean; minInterval: number; maxPerCallBps: number;
    slippageBps: number; streamDuration: number; maxPriceAge: number;
  },
  on?: OnPhase,
) {
  const { hash } = await run({
    where: 'setting the conversion configuration', ...tre(), functionName: 'setConversionConfig',
    args: [c.enabled, c.minInterval, c.maxPerCallBps, c.slippageBps, c.streamDuration, c.maxPriceAge],
  }, { on });
  return { hash };
}

/** Weights are checked to sum to 10,000 in the panel, so nobody sees the revert. */
export async function setTargets(targets: AdminTargetRow[], on?: OnPhase) {
  const { hash } = await run({
    where: 'setting the conversion targets', ...tre(), functionName: 'setTargets',
    args: [targets.map((t) => ({ token: t.token, weightBps: t.weightBps }))],
  }, { on });
  return { hash };
}

export async function setRoute(currency: Address | null, target: Address, hops: V4Hop[], on?: OnPhase) {
  const { hash } = await run({
    where: 'setting a v4 route', ...tre(), functionName: 'setRoute',
    args: [currency ?? ZERO_ADDRESS, target, hops],
  }, { on });
  return { hash };
}

export async function setV3Route(currency: Address | null, target: Address, hops: V3Hop[], on?: OnPhase) {
  const { hash } = await run({
    where: 'setting a v3 route', ...tre(), functionName: 'setV3Route',
    args: [currency ?? ZERO_ADDRESS, target, hops],
  }, { on });
  return { hash };
}

export async function setPriceKeeper(keeper: Address, on?: OnPhase) {
  const { hash } = await run({
    where: 'setting the price keeper', ...tre(), functionName: 'setPriceKeeper', args: [keeper],
  }, { on });
  return { hash };
}

export async function setKeeperDropBps(bps: number, on?: OnPhase) {
  const { hash } = await run({
    where: 'setting how far a keeper may drop a floor price',
    ...tre(), functionName: 'setKeeperDropBps', args: [bps],
  }, { on });
  return { hash };
}

/**
 * Owner or price keeper. A keeper may not drop a standing floor by more than
 * `maxKeeperDropBps`; the owner may set anything, including zero, which clears
 * the floor and the timestamps with it.
 */
export async function setFloorPrice(
  currency: Address | null, target: Address, priceE18: Amount, on?: OnPhase,
) {
  const { hash } = await run({
    where: 'setting a floor price', ...tre(), functionName: 'setFloorPrice',
    args: [currency ?? ZERO_ADDRESS, target, priceE18],
  }, { on });
  return { hash };
}

// ── the vault ─────────────────────────────────────────────────────────────

export async function collectFees(to: Address, on?: OnPhase) {
  const { simulated, hash, logs } = await run<readonly [bigint, bigint]>({
    where: 'collecting the position’s fees', ...vault(), functionName: 'collectFees', args: [to],
  }, { on });
  // What was PAID, from the receipt's own `FeesCollected`, not what the
  // simulation predicted a block earlier — the pool moved in between, and the
  // vault measures the amounts as balance deltas at the destination. The
  // simulation is the fallback if the log is somehow not there.
  const paid = (parseEventLogs({
    abi: liquidityVaultAbi as unknown as Abi, logs: logs as never,
    eventName: 'FeesCollected' as never,
  }) as unknown as { args: { amount0?: bigint; amount1?: bigint } }[])[0]?.args;
  return {
    amount0: paid?.amount0 ?? simulated[0],
    amount1: paid?.amount1 ?? simulated[1],
    hash,
  };
}

/** The unlock date only ever moves later. There is no way back. */
export async function extendLock(newUnlockAt: number, on?: OnPhase) {
  const { hash } = await run({
    where: 'extending the lock', ...vault(), functionName: 'extendLock',
    args: [BigInt(newUnlockAt)],
  }, { on });
  return { hash };
}

/** Single use: the vault does not take a second position after this one leaves. */
export async function withdrawPosition(to: Address, on?: OnPhase) {
  const { hash } = await run({
    where: 'withdrawing the position', ...vault(), functionName: 'withdraw', args: [to],
  }, { on });
  return { hash };
}

// ── ownership, two-step on all five ───────────────────────────────────────

function abiFor(contract: AdminContract): { to: Address; abi: Abi } {
  switch (contract) {
    case 'AvianStock': return fac();
    case 'ThePerch': return amm();
    case 'TheNest': return nest();
    case 'Treasury': return tre();
    case 'LiquidityVault': return vault();
  }
}

/** Nothing changes until the new owner accepts. That is the whole point. */
export async function transferOwnership(contract: AdminContract, to: Address, on?: OnPhase) {
  const { hash } = await run({
    where: `handing over ${contract}`, ...abiFor(contract),
    functionName: 'transferOwnership', args: [to],
  }, { on });
  return { hash };
}

/** Called by the PENDING owner, which is why they can open this panel at all. */
export async function acceptOwnership(contract: AdminContract, on?: OnPhase) {
  const { hash } = await run({
    where: `accepting ${contract}`, ...abiFor(contract),
    functionName: 'acceptOwnership', args: [],
  }, { on });
  return { hash };
}
