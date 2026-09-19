// Everything the site can do, sent to the chain.
//
// One pipeline, seven steps, for every write without exception:
//
//   1. RE-READ THE CHAIN from the injected provider — and the account with it.
//      Not once at page load, not from React state. HANDOVER section 9a: a
//      person can switch networks at any moment and a mint on the wrong chain
//      is a real loss.
//   2. Pre-flight reads, so the common failures become a fix button rather
//      than a revert.
//   3. SIMULATE with `eth_call`. The revert is decoded into the sentence; the
//      RETURN VALUE is kept, because it is the only place a token id or a
//      payout exists before the transaction lands.
//   4. Estimate gas, with headroom.
//   5. Send.
//   6. Wait for the receipt — and treat a reverted receipt as a failure even
//      though we simulated, re-simulating at that block for the reason.
//   7. Read what happened OFF THE LOGS. A receipt carries no return data.
//
// Step 1 runs again between the simulation and the send, because a simulation
// takes time and that is exactly the window someone switches networks in.

import {
  encodeAbiParameters, encodeFunctionData, keccak256, parseEventLogs,
  stringToHex, toHex, type Abi, type Hash,
} from 'viem';
import { client } from './client';
import { chainIdHex, contracts, manifest, sweeperAddress } from './manifest';
import { requireChain, providerRequest, type Guarded } from './provider';
import { asContractError } from './errors';
import {
  accountV3Abi, aviansAbi, theNestAbi, thePerchAbi, avianStockAbi, sweeperAbi, treasuryAbi,
} from './abis.generated';
import { ContractError } from '../mock/errors';
import { checkTransferSafety } from './safety';
import { invalidateOwnership } from './birds';
import { isValid } from '../art/traits';
import type {
  Address, Amount, Hex, NestEvents, OnPhase, PermitSignature, SellResult, SweepResult, Tier, TokenId,
  TraitIndices,
} from '../mock/types';

/** Native ETH is the zero address everywhere in the Treasury's surface. */
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address;

// ── invalidation ──────────────────────────────────────────────────────────

const bumpers = new Set<() => void>();
export function onWrite(fn: () => void): () => void {
  bumpers.add(fn);
  return () => { bumpers.delete(fn); };
}
function settled() {
  invalidateOwnership();
  bumpers.forEach((f) => f());
}

// ── the pipeline ──────────────────────────────────────────────────────────

export type Plan<T> = {
  /** What the person is doing, for an unknown failure's detail line. */
  where: string;
  to: Address;
  abi: unknown;
  functionName: string;
  args: readonly unknown[];
  value?: bigint;
  /** Filled from the simulation's return value, before anything is signed. */
  simulated?: T;
};

async function simulate<T>(plan: Plan<T>, account: Address, price?: bigint): Promise<T> {
  try {
    const { result } = await client().simulateContract({
      address: plan.to,
      abi: plan.abi as Abi,
      functionName: plan.functionName,
      args: plan.args as never,
      account,
      value: plan.value,
    });
    return result as T;
  } catch (e) {
    throw asContractError(e, { where: plan.where, price });
  }
}

async function sendAndWait(
  plan: Plan<unknown>,
  guarded: Guarded,
  on?: OnPhase,
): Promise<{ hash: Hex; logs: unknown[] }> {
  const data = encodeFunctionData({
    abi: plan.abi as Abi,
    functionName: plan.functionName,
    args: plan.args as never,
  });

  let gas: Hex | undefined;
  try {
    const estimate = await client().estimateGas({
      account: guarded.account, to: plan.to, data, value: plan.value,
    });
    gas = toHex((estimate * 125n) / 100n);
  } catch {
    // The wallet will estimate again. A failed estimate is not a reason to
    // refuse a call the simulation just proved.
  }

  on?.('signing');
  let hash: Hex;
  try {
    hash = await providerRequest<Hex>('eth_sendTransaction', [{
      from: guarded.account,
      to: plan.to,
      data,
      chainId: chainIdHex(),
      ...(plan.value ? { value: toHex(plan.value) } : {}),
      ...(gas ? { gas } : {}),
    }]);
  } catch (e) {
    throw asContractError(e, { where: plan.where });
  }

  on?.('pending', hash);

  /*
    PAST THIS POINT THE TRANSACTION IS THE NETWORK'S.

    `eth_sendTransaction` has returned a hash, so it is broadcast and may land
    whatever happens here. A timeout or a node that will not answer is NOT a
    refusal, and reporting one as a refusal put "that didn't go through and
    nothing was taken" under three birds that had arrived.
  */
  let receipt;
  try {
    receipt = await client().waitForTransactionReceipt({ hash: hash as Hash, confirmations: 1 });
  } catch {
    throw new ContractError('ReceiptUnseen');
  }

  if (receipt.status === 'reverted') {
    // We simulated and it still failed: state moved underneath us. Ask again at
    // the block it failed in, so the reason is the real one.
    try {
      await client().simulateContract({
        address: plan.to,
        abi: plan.abi as Abi,
        functionName: plan.functionName,
        args: plan.args as never,
        account: guarded.account,
        value: plan.value,
        blockNumber: receipt.blockNumber,
      });
    } catch (e) {
      throw asContractError(e, { where: plan.where });
    }
    throw new ContractError('Unknown');
  }

  on?.('confirmed', hash);
  settled();
  return { hash, logs: receipt.logs as unknown[] };
}

/**
 * The whole thing, for a write whose result is its simulated return value.
 *
 * Exported because `admin-writes.ts` sends through exactly this and not through
 * a second pipeline of its own. An owner call re-reads the chain, simulates,
 * re-reads again and decodes its revert the same way a mint does.
 */
export async function run<T>(
  plan: Plan<T>,
  o: { on?: OnPhase; price?: bigint; preflight?: (g: Guarded) => Promise<void> } = {},
): Promise<{ simulated: T; hash: Hex; logs: unknown[] }> {
  const guarded = await requireChain();                 // 1
  await o.preflight?.(guarded);                         // 2
  const simulated = await simulate(plan, guarded.account, o.price);   // 3
  const still = await requireChain();                   // 1, again
  const out = await sendAndWait(plan, still, o.on);     // 4, 5, 6
  return { simulated, ...out };
}

// ── approvals — HANDOVER section 2 ────────────────────────────────────────

export async function approveAviansForMint(amount: Amount, on?: OnPhase) {
  const { hash } = await run({
    where: 'approving AVIANS for the mint',
    to: contracts().Avians, abi: aviansAbi, functionName: 'approve',
    args: [contracts().AvianStock, amount],
  }, { on });
  return { hash };
}

/** The only approval brooding needs: AVIANS to the Nest, for the tier costs. */
export async function approveAviansForNest(amount: Amount, on?: OnPhase) {
  const { hash } = await run({
    where: 'approving AVIANS for the nest',
    to: contracts().Avians, abi: aviansAbi, functionName: 'approve',
    args: [contracts().TheNest, amount],
  }, { on });
  return { hash };
}

/**
 * Buying from the perch pulls AVIANS with `transferFrom`, so it needs its own
 * allowance — the mint's approval is to the collection and does not carry.
 */
export async function approveAviansForPerch(amount: Amount, on?: OnPhase) {
  const { hash } = await run({
    where: 'approving AVIANS for the perch',
    to: contracts().Avians, abi: aviansAbi, functionName: 'approve',
    args: [contracts().ThePerch, amount],
  }, { on });
  return { hash };
}

/**
 * THE ONE BIRD APPROVAL, and it targets the perch only.
 *
 * There is no bird approval to the Nest (2026-09-11): a bird broods in its
 * holder's wallet and the Nest never calls `transferFrom` on anything. A
 * request to make the Nest an operator has no reason to exist, so it is
 * refused here — in the write, where no call site can route around it — as
 * the site bug it would be.
 */
export async function setPerchApproval(enabled: boolean, on?: OnPhase) {
  return setOperator(contracts().ThePerch, enabled, 'approving the perch to move your birds', on);
}

async function setOperator(operator: Address, enabled: boolean, where: string, on?: OnPhase) {
  if (operator.toLowerCase() === contracts().TheNest.toLowerCase()) {
    throw new Error('setApprovalForAll with the Nest as operator: the Nest never moves a bird and must never be asked to. This is a site bug.');
  }
  const { hash } = await run({
    where, to: contracts().AvianStock, abi: avianStockAbi, functionName: 'setApprovalForAll',
    args: [operator, enabled],
  }, { on });
  return { hash };
}

/** The current allowance, so nothing is ever asked for twice. */
export async function currentAllowance(who: Address, spender: Address): Promise<Amount> {
  return client().readContract({
    address: contracts().Avians, abi: aviansAbi as unknown as Abi,
    functionName: 'allowance', args: [who, spender],
  }) as Promise<Amount>;
}

// ── the permit — one signature instead of an approval transaction ─────────

const PERMIT_WINDOW_SECONDS = 1800;

/**
 * EIP-2612 for EXACTLY the current price.
 *
 * Two things HANDOVER section 2 insists on, both here:
 *
 *   * The digest commits to a value, so `price()` is re-read in the same tick
 *     the signature is built. A price that moved between the two would produce
 *     a permit for the old amount and a mint that fails with
 *     `InsufficientPayment`.
 *   * The domain is CHECKED against the token's own `DOMAIN_SEPARATOR()`
 *     before the wallet is asked for anything. A wrong name or version would
 *     produce a signature that silently does not verify — and, because the
 *     collection wraps `permit` in a `try` on purpose, that failure would
 *     surface as an allowance error rather than as a signature error, which is
 *     a bad place to discover a bug in this file.
 */
export async function signMintPermit(count = 1): Promise<PermitSignature> {
  const { account } = await requireChain();
  const c = contracts();

  const [name, nonce, price, onChainDomain] = await Promise.all([
    client().readContract({ address: c.Avians, abi: aviansAbi as unknown as Abi, functionName: 'name' }) as Promise<string>,
    client().readContract({ address: c.Avians, abi: aviansAbi as unknown as Abi, functionName: 'nonces', args: [account] }) as Promise<bigint>,
    client().readContract({ address: c.AvianStock, abi: avianStockAbi as unknown as Abi, functionName: 'price' }) as Promise<bigint>,
    client().readContract({ address: c.Avians, abi: aviansAbi as unknown as Abi, functionName: 'DOMAIN_SEPARATOR' }) as Promise<Hex>,
  ]);

  // `mintWithPermit` permits `price`; `mintManyWithPermit` permits
  // `price * traits.length`. A digest for any other number does not verify,
  // and the collection swallows that on purpose — so it would surface as an
  // allowance error with no hint that the signature was the problem.
  const value = price * BigInt(count);

  const chainId = manifest().network.chainId;
  const domain = { name, version: '1', chainId, verifyingContract: c.Avians } as const;

  const computed = keccak256(encodeAbiParameters(
    [{ type: 'bytes32' }, { type: 'bytes32' }, { type: 'bytes32' }, { type: 'uint256' }, { type: 'address' }],
    [
      keccak256(stringToHex('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')),
      keccak256(stringToHex(name)),
      keccak256(stringToHex('1')),
      BigInt(chainId),
      c.Avians,
    ],
  ));
  if (computed.toLowerCase() !== onChainDomain.toLowerCase()) {
    // Do not ask for a signature we know will not verify.
    throw new ContractError('InvalidPermit', { price });
  }

  const deadline = Math.floor(Date.now() / 1000) + PERMIT_WINDOW_SECONDS;
  const typedData = {
    domain,
    types: {
      // EIP-712 REQUIRES THIS ENTRY, AND IT IS NOT DECORATION.
      //
      // The domain separator is hashed from the field list the wallet finds
      // here. viem's own `signTypedData` inserts it; this file talks to the
      // provider directly and did not, so the wallet hashed the domain as
      // `EIP712Domain()` — no fields — and produced a signature against a
      // separator that is not the token's. `permit` then reverted inside the
      // collection's `try`, and the mint failed on the allowance instead.
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      Permit: [
        { name: 'owner', type: 'address' },
        { name: 'spender', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    },
    primaryType: 'Permit',
    message: {
      owner: account, spender: c.AvianStock, value, nonce, deadline: BigInt(deadline),
    },
  };

  let signature: Hex;
  try {
    signature = await providerRequest<Hex>('eth_signTypedData_v4', [
      account,
      JSON.stringify(typedData, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)),
    ]);
  } catch (e) {
    throw asContractError(e, { where: 'signing the permit' });
  }

  const r = `0x${signature.slice(2, 66)}` as Hex;
  const s = `0x${signature.slice(66, 130)}` as Hex;
  let v = Number.parseInt(signature.slice(130, 132), 16);
  if (v < 27) v += 27;

  return { deadline, v, r, s, value };
}

// ── the mint — HANDOVER section 3 ─────────────────────────────────────────

function mintedIds(logs: unknown[]): TokenId[] {
  const events = parseEventLogs({
    abi: avianStockAbi as unknown as Abi,
    logs: logs as never,
    eventName: ['Minted', 'FreeMinted'] as never,
  }) as unknown as { args: { tokenId?: bigint } }[];
  return events.map((e) => Number(e.args.tokenId)).filter((n) => Number.isFinite(n));
}

/** `onERC721Received(address,address,uint256,bytes)` — the magic value. */
const ERC721_RECEIVED = '0x150b7a02';

/**
 * Can this wallet actually HOLD a bird?
 *
 * HANDOVER section 7 mentions this as an edge case — "if the minter is a
 * contract whose `onERC721Received` refuses the token" — and it stopped being
 * an edge case with EIP-7702: a plain-looking wallet address can carry a
 * delegation designator, which makes `to.code.length > 0` true, which makes
 * `_safeMint` call `onERC721Received` on it.
 *
 * MEASURED ON CHAIN 4663: every well-known test address (the anvil and hardhat
 * defaults) is delegated to `0x8a5b10eb…3b005df6`, and that implementation does
 * not implement the hook — it reverts with EMPTY data. Solidity's `try` cannot
 * decode a `bytes4` out of nothing, so the whole mint reverts with no revert
 * data at all: no custom error, no selector, nothing to decode. Without this
 * check the only honest thing the site could say is "that didn't go through".
 *
 * So we ask first, and turn it into the sentence HANDOVER asks for.
 */
async function assertCanReceiveNfts(account: Address) {
  const code = await client().getCode({ address: account });
  if (!code || code === '0x') return;                   // a plain EOA, always fine

  try {
    const result = await client().call({
      to: account,
      // onERC721Received(operator, from, tokenId, data)
      data: `${ERC721_RECEIVED}${'0'.repeat(24)}${account.slice(2)}${'0'.repeat(24)}${account.slice(2)}${'0'.repeat(63)}1${'0'.repeat(63)}8${'0'.repeat(64)}` as Hex,
    });
    const returned = (result.data ?? '0x').slice(0, 10).toLowerCase();
    if (returned !== ERC721_RECEIVED) throw new ContractError('ERC721InvalidReceiver');
  } catch (e) {
    if (e instanceof ContractError) throw e;
    throw new ContractError('ERC721InvalidReceiver');
  }
}

async function preflightMint(count: number, guarded: Guarded, permit?: PermitSignature) {
  await assertCanReceiveNfts(guarded.account);
  const c = contracts();
  const [price, balance, allowance] = await Promise.all([
    client().readContract({ address: c.AvianStock, abi: avianStockAbi as unknown as Abi, functionName: 'price' }) as Promise<bigint>,
    client().readContract({ address: c.Avians, abi: aviansAbi as unknown as Abi, functionName: 'balanceOf', args: [guarded.account] }) as Promise<bigint>,
    currentAllowance(guarded.account, c.AvianStock),
  ]);
  const total = price * BigInt(count);
  if (balance < total) throw new ContractError('InsufficientPayment', { price: total });
  // A permit covers the allowance in the same transaction, so it is not short.
  if (!permit && allowance < total) throw new ContractError('InsufficientPayment', { price: total });
  if (permit && permit.value < total) throw new ContractError('InsufficientPayment', { price: total });
}

export async function mint(
  traits: TraitIndices,
  o: { permit?: PermitSignature } = {},
  on?: OnPhase,
) {
  if (!isValid(traits)) throw new ContractError('InvalidTrait');
  const plan = o.permit
    ? {
      where: 'minting', to: contracts().AvianStock, abi: avianStockAbi,
      functionName: 'mintWithPermit',
      args: [...traits, BigInt(o.permit.deadline), o.permit.v, o.permit.r, o.permit.s],
    }
    : {
      where: 'minting', to: contracts().AvianStock, abi: avianStockAbi,
      functionName: 'mint', args: [...traits],
    };

  const { simulated, hash, logs } = await run<bigint>(plan, {
    on,
    preflight: (g) => preflightMint(1, g, o.permit),
  });
  const fromLogs = mintedIds(logs);
  return { tokenId: fromLogs[0] ?? Number(simulated), hash };
}

/**
 * All or nothing: if any bird in the batch is refused the whole batch reverts
 * with THAT bird's error and nothing is minted. A duplicate INSIDE the batch is
 * `ComboTaken` on the second copy — caught here, before the wallet opens,
 * because there is no reason to spend a prompt on it.
 */
export async function mintMany(
  traits: TraitIndices[],
  o: { permit?: PermitSignature } = {},
  on?: OnPhase,
) {
  if (traits.length === 0) throw new ContractError('EmptyBatch');
  for (const t of traits) if (!isValid(t)) throw new ContractError('InvalidTrait');
  const seen = new Set<string>();
  for (const t of traits) {
    const key = t.join(',');
    if (seen.has(key)) throw new ContractError('ComboTaken');
    seen.add(key);
  }

  const rows = traits.map((t) => [...t]);
  const plan = o.permit
    ? {
      where: 'minting', to: contracts().AvianStock, abi: avianStockAbi,
      functionName: 'mintManyWithPermit',
      args: [rows, BigInt(o.permit.deadline), o.permit.v, o.permit.r, o.permit.s],
    }
    : {
      where: 'minting', to: contracts().AvianStock, abi: avianStockAbi,
      functionName: 'mintMany', args: [rows],
    };

  const { simulated, hash, logs } = await run<readonly bigint[]>(plan, {
    on,
    preflight: (g) => preflightMint(traits.length, g, o.permit),
  });
  const fromLogs = mintedIds(logs);
  return { tokenIds: fromLogs.length ? fromLogs : simulated.map((x) => Number(x)), hash };
}

export async function mintFree(traits: TraitIndices, proof: Hex[], on?: OnPhase) {
  if (!isValid(traits)) throw new ContractError('InvalidTrait');
  const { simulated, hash, logs } = await run<bigint>({
    where: 'claiming your free bird', to: contracts().AvianStock, abi: avianStockAbi,
    functionName: 'mintFree', args: [proof, ...traits],
  }, { on });
  const fromLogs = mintedIds(logs);
  return { tokenId: fromLogs[0] ?? Number(simulated), hash };
}

// ── the perch — HANDOVER section 4 ────────────────────────────────────────

/**
 * `'batch'` is `sell(ids)` and needs the bird approval. `'push'` is
 * `safeTransferFrom` into the AMM, which needs no approval because the holder
 * is the caller — one bird per transaction. They pay exactly the same.
 *
 * When the batch route is refused on this deployment (`0xef28f901`) the push
 * route is the fallback, and several birds become several transactions. That
 * is the documented behaviour, not a workaround.
 */
/**
 * Which birds a sale turned out to burn, read off the receipt.
 *
 * Three logs say the same thing and all three are checked, because they come
 * from two contracts and agreeing is the point: the Perch's `BirdBurned`, the
 * collection's own `Burned`, and OZ's `Transfer(perch, 0, id)`. An id has to
 * appear in the Perch's event AND in one of the collection's to count — a
 * receipt is the only truthful answer to "was mine the hundredth", and half an
 * answer is worse than none.
 */
/** `BurnWithheld` from the perch: a hundredth at or below the floor, kept. */
function withheldFrom(logs: unknown[], perch: Address): TokenId[] {
  const events = parseEventLogs({
    abi: thePerchAbi as unknown as Abi, eventName: 'BurnWithheld', logs: logs as never,
  }) as unknown as { address: Address; args: { id: bigint } }[];
  return events
    .filter((l) => l.address.toLowerCase() === perch.toLowerCase())
    .map((l) => Number(l.args.id)) /* count */
    .sort((a, b) => a - b);
}

function burntFrom(logs: unknown[], perch: Address, collection: Address): TokenId[] {
  const fromPerch = parseEventLogs({
    abi: thePerchAbi as unknown as Abi, eventName: 'BirdBurned', logs: logs as never,
  }) as unknown as { address: Address; args: { id: bigint } }[];
  const fromToken = parseEventLogs({
    abi: avianStockAbi as unknown as Abi, eventName: 'Burned', logs: logs as never,
  }) as unknown as { address: Address; args: { id: bigint } }[];
  const transfers = parseEventLogs({
    abi: avianStockAbi as unknown as Abi, eventName: 'Transfer', logs: logs as never,
  }) as unknown as { address: Address; args: { from: Address; to: Address; tokenId: bigint } }[];

  const same = (a: Address, b: Address) => a.toLowerCase() === b.toLowerCase();
  const perchSaid = new Set(
    fromPerch.filter((l) => same(l.address, perch)).map((l) => Number(l.args.id)), /* count */
  );
  const tokenSaid = new Set([
    ...fromToken.filter((l) => same(l.address, collection)).map((l) => Number(l.args.id)), /* count */
    ...transfers
      .filter((l) => same(l.address, collection) && same(l.args.from, perch) && Number(l.args.to) === 0) /* count */
      .map((l) => Number(l.args.tokenId)), /* count */
  ]);

  return [...perchSaid].filter((id) => tokenSaid.has(id)).sort((a, b) => a - b);
}

export async function sellToPerch(
  ids: TokenId[],
  o: { route?: 'batch' | 'push' } = {},
  on?: OnPhase,
): Promise<SellResult & { hash: Hex }> {
  if (ids.length === 0) throw new ContractError('EmptyList');
  if (new Set(ids).size !== ids.length) throw new ContractError('AlreadyHeld', { id: ids[0] });
  const c = contracts();
  const route = o.route ?? (ids.length === 1 ? 'push' : 'batch');

  if (route === 'batch') {
    const { simulated, hash, logs } = await run<bigint>({
      where: 'selling to the perch', to: c.ThePerch, abi: thePerchAbi,
      functionName: 'sell', args: [ids.map((i) => BigInt(i))],
    }, { on });
    const ev = nestEvents(logs);
    return {
      paid: simulated,
      burnt: burntFrom(logs, c.ThePerch, c.AvianStock),
      withheld: withheldFrom(logs, c.ThePerch),
      // A sale to the perch changes hands, so the collection's hook expires
      // any brood on the way in. The receipt says so here, not on a Nest page.
      expired: ev.expired.map((e) => e.id),
      hookFailed: ev.hookFailed,
      hash,
    };
  }

  let last: Hex = '0x' as Hex;
  let paid = 0n;
  const burnt: TokenId[] = [];
  const withheld: TokenId[] = [];
  const expired: TokenId[] = [];
  const hookFailed: TokenId[] = [];
  for (const id of ids) {
    const guarded = await requireChain();
    const quote = await client().readContract({
      address: c.ThePerch, abi: thePerchAbi as unknown as Abi, functionName: 'quoteSell', args: [1n],
    }) as bigint;
    const plan = {
      where: 'selling to the perch', to: c.AvianStock, abi: avianStockAbi,
      functionName: 'safeTransferFrom', args: [guarded.account, c.ThePerch, BigInt(id)],
    };
    await simulate(plan, guarded.account);
    const { hash, logs } = await sendAndWait(plan, await requireChain(), on);
    last = hash;
    paid += quote;
    // The push route is one transaction per bird, so each has its own receipt
    // and its own chance of being the hundredth.
    burnt.push(...burntFrom(logs, c.ThePerch, c.AvianStock));
    withheld.push(...withheldFrom(logs, c.ThePerch));
    const ev = nestEvents(logs);
    expired.push(...ev.expired.map((e) => e.id));
    hookFailed.push(...ev.hookFailed);
  }
  return { paid, burnt, withheld, expired, hookFailed, hash: last };
}

export async function buyNext(count: number, on?: OnPhase) {
  if (count <= 0) throw new ContractError('EmptyList');
  const c = contracts();

  /*
    QUOTED BEFORE THE BUY, NOT AFTER.

    This read used to sit below the `run`, where it asked what the NEXT
    `count` birds would cost against a pool this transaction had just shrunk.
    Two things wrong with that. The number was the wrong one — a later price,
    not what was paid. And `quoteBuyNext` reverts `InsufficientPool` when the
    pool no longer holds `count`, so buying the last few threw AFTER the
    transaction had landed: the birds arrived in the wallet under a drawer
    saying "that didn't go through and nothing was taken".

    Nothing after a sent transaction may be allowed to fail the write it
    belongs to. Asked first, this is the price that is about to be paid, and it
    is asked while a failure still means what the drawer would say.
  */
  const paid = await client().readContract({
    address: c.ThePerch, abi: thePerchAbi as unknown as Abi,
    functionName: 'quoteBuyNext', args: [BigInt(count)],
  }) as bigint;

  const { simulated, hash, logs } = await run<readonly bigint[]>({
    where: 'buying the next bird', to: c.ThePerch, abi: thePerchAbi,
    functionName: 'buyNext', args: [BigInt(count), await who()],
  }, { on, preflight: (g) => preflightBuy(g, 'quoteBuyNext', [BigInt(count)]) });

  const received = transferredTo(logs, await who());
  const ids = received.length ? received : simulated.map((x) => Number(x));
  return { ids, paid, hash };
}

export async function buyNamed(ids: TokenId[], on?: OnPhase) {
  if (ids.length === 0) throw new ContractError('EmptyList');
  const c = contracts();
  const args = [ids.map((i) => BigInt(i))];
  const { simulated, hash } = await run<bigint>({
    where: 'buying that bird', to: c.ThePerch, abi: thePerchAbi,
    functionName: 'buy', args: [ids.map((i) => BigInt(i)), await who()],
  }, { on, preflight: (g) => preflightBuy(g, 'quoteBuy', args) });
  return { paid: simulated, hash };
}

/**
 * The AMM does NOT pre-check the buyer's allowance the way the mint does —
 * HANDOVER section 7 says so — so a short allowance arrives as a bare
 * `TransferFromFailed`. Checking it here turns that into "Approve N AVIANS".
 */
async function preflightBuy(guarded: Guarded, quote: string, args: readonly unknown[]) {
  await assertCanReceiveNfts(guarded.account);
  const c = contracts();
  const total = await client().readContract({
    address: c.ThePerch, abi: thePerchAbi as unknown as Abi, functionName: quote, args: args as never,
  }) as bigint;
  const [balance, allowance] = await Promise.all([
    client().readContract({ address: c.Avians, abi: aviansAbi as unknown as Abi, functionName: 'balanceOf', args: [guarded.account] }) as Promise<bigint>,
    currentAllowance(guarded.account, c.ThePerch),
  ]);
  if (balance < total) throw new ContractError('InsufficientBalance', { price: total });
  if (allowance < total) throw new ContractError('TransferFromFailed', { price: total });
}

function transferredTo(logs: unknown[], to: Address): TokenId[] {
  const events = parseEventLogs({
    abi: avianStockAbi as unknown as Abi, logs: logs as never, eventName: 'Transfer' as never,
  }) as unknown as { args: { to?: Address; tokenId?: bigint } }[];
  return events
    .filter((e) => e.args.to?.toLowerCase() === to.toLowerCase())
    .map((e) => Number(e.args.tokenId));
}

async function who(): Promise<Address> {
  const { account } = await requireChain();
  return account;
}

// ── the nest — HANDOVER section 5 ────────────────────────────────────
//
// BROODING IS NOT CUSTODIAL (2026-09-11). Nothing here moves a bird. A holder
// burns AVIANS to brood birds they hold, rewards are delivered wherever
// `deliveryOf` says on every settle, and the brood ends the moment the bird
// changes hands. The one approval any of it needs is AVIANS to the Nest, for
// the tier costs. There is no bird approval to the Nest and never a reason to
// ask for one: `setApprovalForAll` with the Nest as operator is refused below
// as a site bug.
//
// Every pre-flight reads the chain at send time — `ownerOf`, `isBrooding`,
// `broodOf`, the allowance — never a cached list. "Expired" is the
// contract's `isBrooding`, which also covers the documented fallback (a bird no
// longer with its activator that the hook somehow missed); the stamp is not
// consulted for any decision.

export function nestEvents(logs: unknown[]): NestEvents {
  const nest = (name: string) => parseEventLogs({
    abi: theNestAbi as unknown as Abi, logs: logs as never, eventName: name as never,
  }) as unknown as { args: Record<string, unknown> }[];
  const stock = (name: string) => parseEventLogs({
    abi: avianStockAbi as unknown as Abi, logs: logs as never, eventName: name as never,
  }) as unknown as { args: Record<string, unknown> }[];
  const n = (x: unknown) => Number(x as bigint);
  const b = (x: unknown) => (x as bigint) ?? 0n;
  return {
    brooded: nest('Brooded').map((e) => ({
      id: n(e.args.id), tier: n(e.args.tier) as Tier, paid: b(e.args.aviansPaid), toWallet: !!e.args.toWallet,
    })),
    upgraded: nest('Upgraded').map((e) => ({
      id: n(e.args.id), fromTier: n(e.args.fromTier) as Tier, toTier: n(e.args.toTier) as Tier, paid: b(e.args.aviansPaid),
    })),
    redirected: nest('Redirected').map((e) => ({ id: n(e.args.id), toWallet: !!e.args.toWallet })),
    expired: nest('Expired').map((e) => ({ id: n(e.args.id), activator: e.args.activator as Address, at: n(e.args.at) })),
    settled: nest('Settled').map((e) => ({
      id: n(e.args.id), token: e.args.token as Address, to: e.args.to as Address, amount: b(e.args.amount),
    })),
    expirySettled: nest('ExpirySettled').map((e) => ({
      id: n(e.args.id), activator: e.args.activator as Address, token: e.args.token as Address,
      toActivator: b(e.args.toActivator), returned: b(e.args.returned),
    })),
    returned: nest('RewardReturned').map((e) => ({ token: e.args.token as Address, amount: b(e.args.amount), folded: !!e.args.folded })),
    held: nest('RewardHeld').map((e) => ({
      id: n(e.args.id), beneficiary: e.args.beneficiary as Address, token: e.args.token as Address, amount: b(e.args.amount),
    })),
    paid: nest('RewardPaid').map((e) => ({ user: e.args.user as Address, token: e.args.token as Address, amount: b(e.args.amount) })),
    hookFailed: stock('NestHookFailed').map((e) => n(e.args.tokenId)),
  };
}

/** The sum of the tier costs, read from the Nest rather than assumed. */
async function tierCosts(tiers: Tier[]): Promise<bigint[]> {
  const c = contracts();
  return client().multicall({
    contracts: tiers.map((tier) => ({
      address: c.TheNest, abi: theNestAbi as unknown as Abi, functionName: 'tierCost', args: [tier],
    })) as never,
    allowFailure: false,
  }) as Promise<bigint[]>;
}

/** AVIANS balance and allowance to the Nest must both cover `burn`. */
async function assertCanBurn(account: Address, burn: bigint) {
  const c = contracts();
  const [balance, allowance] = await Promise.all([
    client().readContract({ address: c.Avians, abi: aviansAbi as unknown as Abi, functionName: 'balanceOf', args: [account] }) as Promise<bigint>,
    currentAllowance(account, c.TheNest),
  ]);
  if (balance < burn || allowance < burn) throw new ContractError('TransferFromFailed', { price: burn });
}

/**
 * Brood the birds you hold, one tier each, choosing per bird where the
 * rewards land: the bird's own wallet (`toWallet` false — the default, and it
 * goes with the bird if sold) or yours. One `broodTo` for the batch.
 *
 * Pre-flight, all from the chain at send time: the caller holds every id; a
 * bird that is brooding is refused unless the contract says its brood has
 * expired (then `brood` settles it on the way, which is allowed); balance and
 * allowance cover the sum of the tier costs. The burn total is what the button
 * showed, read here again rather than trusted.
 */
export async function brood(
  entries: { id: TokenId; tier: Tier; toWallet: boolean }[],
  on?: OnPhase,
) {
  if (entries.length === 0) throw new ContractError('EmptyList');
  for (const e of entries) if (![1, 2, 3].includes(e.tier)) throw new ContractError('InvalidTier');
  const c = contracts();

  const preflight = async (g: Guarded) => {
    const ids = entries.map((e) => BigInt(e.id));
    const [owners, live, costs] = await Promise.all([
      client().multicall({
        contracts: ids.map((id) => ({ address: c.AvianStock, abi: avianStockAbi as unknown as Abi, functionName: 'ownerOf', args: [id] })) as never,
        allowFailure: true,
      }) as Promise<{ status: string; result?: Address }[]>,
      client().multicall({
        contracts: ids.map((id) => ({ address: c.TheNest, abi: theNestAbi as unknown as Abi, functionName: 'isBrooding', args: [id] })) as never,
        allowFailure: false,
      }) as Promise<boolean[]>,
      tierCosts(entries.map((e) => e.tier)),
    ]);
    entries.forEach((e, i) => {
      const owner = owners[i].status === 'success' ? owners[i].result : undefined;
      if (!owner || owner.toLowerCase() !== g.account.toLowerCase()) {
        throw new ContractError('NotTheOwner', { tokenId: e.id });
      }
      // Live ⇒ AlreadyBrooding. Expired-unsettled ⇒ allowed: brood settles it.
      if (live[i]) throw new ContractError('AlreadyBrooding', { tokenId: e.id });
    });
    await assertCanBurn(g.account, costs.reduce((a, b) => a + b, 0n));
  };

  const { simulated, hash, logs } = await run<bigint>({
    where: 'brooding', to: c.TheNest, abi: theNestAbi,
    functionName: 'broodTo',
    args: [entries.map((e) => BigInt(e.id)), entries.map((e) => e.tier), entries.map((e) => e.toWallet)],
  }, { on, preflight });
  return { paid: simulated, events: nestEvents(logs), hash };
}

/**
 * Raise a brooding bird's tier, burning the difference. The activator only,
 * on a brood the contract still calls live; a higher tier only. What has
 * accrued is settled at the old weight in the same call.
 */
export async function upgrade(id: TokenId, newTier: Tier, on?: OnPhase) {
  if (![1, 2, 3].includes(newTier)) throw new ContractError('InvalidTier');
  const c = contracts();

  const preflight = async (g: Guarded) => {
    const [live, broodRow] = await Promise.all([
      client().readContract({ address: c.TheNest, abi: theNestAbi as unknown as Abi, functionName: 'isBrooding', args: [BigInt(id)] }) as Promise<boolean>,
      client().readContract({ address: c.TheNest, abi: theNestAbi as unknown as Abi, functionName: 'broodOf', args: [BigInt(id)] }) as Promise<readonly [Address, number, bigint, bigint]>,
    ]);
    const [activator, tier] = broodRow;
    if (Number(tier) === 0) throw new ContractError('NotBrooding', { tokenId: id });
    if (!live) throw new ContractError('BroodExpired', { tokenId: id });
    if (activator.toLowerCase() !== g.account.toLowerCase()) throw new ContractError('NotTheOwner', { tokenId: id });
    if (newTier <= Number(tier)) throw new ContractError('TierNotHigher', { tokenId: id });
    const [from, to] = await tierCosts([Number(tier) as Tier, newTier]);
    await assertCanBurn(g.account, to - from);
  };

  const { simulated, hash, logs } = await run<bigint>({
    where: 'upgrading the brood', to: c.TheNest, abi: theNestAbi,
    functionName: 'upgrade', args: [BigInt(id), newTier],
  }, { on, preflight });
  return { paid: simulated, events: nestEvents(logs), hash };
}

/**
 * Change where a live brood delivers. What has accrued so far is settled to
 * the OLD destination in the same call — the receipt shows that settle.
 * Refused by the contract with `SameDelivery` if it already goes there; the
 * screen never offers that option, and this pre-flight says so if it did.
 */
export async function redirect(id: TokenId, toWallet: boolean, on?: OnPhase) {
  const c = contracts();
  const preflight = async (g: Guarded) => {
    const [live, broodRow, delivery] = await Promise.all([
      client().readContract({ address: c.TheNest, abi: theNestAbi as unknown as Abi, functionName: 'isBrooding', args: [BigInt(id)] }) as Promise<boolean>,
      client().readContract({ address: c.TheNest, abi: theNestAbi as unknown as Abi, functionName: 'broodOf', args: [BigInt(id)] }) as Promise<readonly [Address, number, bigint, bigint]>,
      client().readContract({ address: c.TheNest, abi: theNestAbi as unknown as Abi, functionName: 'deliveryOf', args: [BigInt(id)] }) as Promise<readonly [Address, boolean]>,
    ]);
    if (Number(broodRow[1]) === 0) throw new ContractError('NotBrooding', { tokenId: id });
    if (!live) throw new ContractError('BroodExpired', { tokenId: id });
    if (broodRow[0].toLowerCase() !== g.account.toLowerCase()) throw new ContractError('NotTheOwner', { tokenId: id });
    if (delivery[1] === toWallet) throw new ContractError('SameDelivery', { tokenId: id });
  };
  const { hash, logs } = await run({
    where: 'redirecting the rewards', to: c.TheNest, abi: theNestAbi,
    functionName: 'redirect', args: [BigInt(id), toWallet],
  }, { on, preflight });
  return { events: nestEvents(logs), hash };
}

/**
 * Deliver what these birds have accrued. ANYONE MAY CALL IT and nobody gains
 * by it: a brooding bird's accrual can only reach its destination, an expired
 * brood's can only reach its activator and the stream. The receipt is the
 * answer — a `RewardHeld` inside a confirmed settle is a partial outcome and
 * is reported as one, never as success.
 */
export async function settle(ids: TokenId[], on?: OnPhase) {
  if (ids.length === 0) throw new ContractError('EmptyList');
  const { hash, logs } = await run({
    where: 'settling', to: contracts().TheNest, abi: theNestAbi,
    functionName: 'settle', args: [ids.map((i) => BigInt(i))],
  }, { on });
  return { events: nestEvents(logs), hash };
}

/**
 * Pay the caller what `claimable` holds for them in `token` — an expired
 * brood's pre-sale share that their wallet refused when it was settled.
 * Reverts `TransferFailed` if the token still will not move; the amount stays
 * safe either way.
 */
export async function claim(token: Address, on?: OnPhase) {
  const { simulated, hash, logs } = await run<bigint>({
    where: 'claiming that reward', to: contracts().TheNest, abi: theNestAbi,
    functionName: 'claim', args: [token],
  }, { on });
  const ev = nestEvents(logs);
  const mine = ev.paid.find((e) => e.token.toLowerCase() === token.toLowerCase());
  return { amount: mine?.amount ?? simulated, events: ev, hash };
}

// ── birds — HANDOVER section 8 ────────────────────────────────────────────

/**
 * The refusal lives INSIDE the write, not only on the screen, so no call site
 * can route around it.
 */
export async function transferBird(id: TokenId, to: Address, on?: OnPhase) {
  const guarded = await requireChain();
  const safety = await checkTransferSafety(id, to);
  if (!safety.ok) {
    if (safety.reason === 'own-account') throw new ContractError('TransferToOwnAccount', { id });
    throw new ContractError('SatchelCycle', { id, path: safety.path });
  }

  const plan = {
    where: 'sending the bird', to: contracts().AvianStock, abi: avianStockAbi,
    functionName: 'safeTransferFrom', args: [guarded.account, to, BigInt(id)],
  };
  await simulate(plan, guarded.account);
  const { hash, logs } = await sendAndWait(plan, await requireChain(), on);
  // A transfer of a brooding bird ends its brood inside this very receipt: the
  // collection calls the Nest, the Nest emits `Expired`. Decoded here so the
  // transfer's own receipt can say it, and `NestHookFailed` with it — which
  // must never appear, and is a warning if it does.
  const ev = nestEvents(logs);
  return { hash, expired: ev.expired.map((e) => e.id), hookFailed: ev.hookFailed };
}

// ── the sweeper — HANDOVER section 5, "Collecting from many birds at once" ──
//
// A satchel obeys only the bird's owner, so nothing can move its stock out
// for them. The Sweeper is the one exception a holder can choose to make,
// and the choice is made ON THE SATCHEL: `setPermissions` is AccountV3's,
// sent to the bird's own wallet address, and it is the only call this file
// ever sends to a satchel. The grant is keyed by the bird's current owner,
// so it dies with a sale; the buyer grants afresh or not at all.
//
// `prepare` is anyone's and grants nothing. `sweep` is the holder's: a bird
// the caller does not hold reverts the WHOLE call (`NotTheOwner` — a wrong
// list), while a satchel that is not deployed or not granted, and a token
// that will not move, are `SweepSkipped` rows on a receipt that succeeded.
// The pre-flights read `ownerOf` from the chain at send time, never a list
// drawn earlier.

function sweeperOrThrow(): Address {
  const s = sweeperAddress();
  if (!s) throw new Error('a sweeper write on a deployment that has no Sweeper — the panel should not exist here. This is a site bug.');
  return s;
}

/** The three Sweeper events, off a receipt. */
export function sweepEvents(logs: unknown[]) {
  const ev = (name: string) => parseEventLogs({
    abi: sweeperAbi as unknown as Abi, logs: logs as never, eventName: name as never,
  }) as unknown as { args: Record<string, unknown> }[];
  const n = (x: unknown) => Number(x as bigint);
  return {
    swept: ev('Swept').map((e) => ({
      id: n(e.args.id), token: e.args.token as Address, to: e.args.to as Address, amount: (e.args.amount as bigint) ?? 0n,
    })),
    skipped: ev('SweepSkipped').map((e) => ({
      id: n(e.args.id),
      token: (e.args.token as Address).toLowerCase() === ZERO_ADDRESS ? null : e.args.token as Address,
      reason: (e.args.reason as Hex) ?? '0x',
    })),
    deployed: ev('SatchelDeployed').map((e) => n(e.args.id)),
  };
}

/**
 * Deploy the satchels of `ids` that are not deployed yet — one transaction
 * for the batch. Anyone may send it and it grants nothing; the holder sends
 * it here because a grant needs a deployed satchel to be made on.
 */
export async function prepareSatchels(ids: TokenId[], on?: OnPhase) {
  if (ids.length === 0) throw new ContractError('EmptyList');
  const { hash, logs } = await run({
    where: 'deploying the satchels', to: sweeperOrThrow(), abi: sweeperAbi,
    functionName: 'prepare', args: [ids.map((i) => BigInt(i))],
  }, { on });
  return { deployed: sweepEvents(logs).deployed, hash };
}

/**
 * The holder's grant — or its revocation — made on the satchel itself:
 * `setPermissions([sweeper], [enabled])`, sent to the bird's own wallet.
 * One transaction per bird, the wallet signing each.
 *
 * The satchel address is the chain's (`status`), not derived, and it must
 * be deployed — a call to an address with no code would "succeed" and grant
 * nothing, so it is refused here as the site bug it would be. The holder
 * check reads `ownerOf` at send time: a stranger's grant is AccountV3's
 * `NotAuthorized`, and the pre-flight names it before the wallet opens.
 */
export async function grantSweeper(id: TokenId, enabled: boolean, on?: OnPhase) {
  const sweeper = sweeperOrThrow();
  const c = contracts();
  const [satchel, deployed] = await client().readContract({
    address: sweeper, abi: sweeperAbi as unknown as Abi, functionName: 'status', args: [BigInt(id)],
  }) as readonly [Address, boolean, boolean];
  if (!deployed) {
    throw new Error(`granting on Avian #${id}: its satchel is not deployed, so there is nothing to send the grant to. Deploy it first. This is a site bug.`);
  }
  const preflight = async (g: Guarded) => {
    const owner = await client().readContract({
      address: c.AvianStock, abi: avianStockAbi as unknown as Abi, functionName: 'ownerOf', args: [BigInt(id)],
    }).catch(() => null) as Address | null;
    if (!owner || owner.toLowerCase() !== g.account.toLowerCase()) {
      throw new ContractError('NotAuthorized', { tokenId: id, id });
    }
  };
  const { hash } = await run({
    where: enabled ? 'granting the sweeper on that satchel' : 'revoking the sweeper on that satchel',
    to: satchel, abi: accountV3Abi, functionName: 'setPermissions', args: [[sweeper], [enabled]],
  }, { on, preflight });
  return { hash, satchel, granted: enabled };
}

/**
 * Move every one of `tokens` out of the satchels of `ids` into the caller's
 * wallet. The receipt is the answer: `Swept` per bird per token, summed per
 * token into `totals`; `SweepSkipped` for a bird that was not ready or a
 * token that would not move. Nothing skipped is lost — it is still in the
 * bird.
 */
export async function sweep(ids: TokenId[], tokens: Address[], on?: OnPhase): Promise<SweepResult> {
  if (ids.length === 0 || tokens.length === 0) throw new ContractError('EmptyList');
  const c = contracts();
  const preflight = async (g: Guarded) => {
    // Every id's owner from the chain, now. A bird sold since the list was
    // drawn would revert the whole call; caught here it is the same error,
    // with the bird named, before anything is signed.
    const owners = await client().multicall({
      contracts: ids.map((id) => ({
        address: c.AvianStock, abi: avianStockAbi as unknown as Abi, functionName: 'ownerOf', args: [BigInt(id)],
      })) as never,
      allowFailure: true,
    }) as unknown as ({ status: 'success'; result: Address } | { status: 'failure' })[];
    const wrong = ids.findIndex((_, i) => owners[i].status !== 'success'
      || (owners[i] as { result: Address }).result.toLowerCase() !== g.account.toLowerCase());
    if (wrong >= 0) throw new ContractError('NotTheOwner', { tokenId: ids[wrong], id: ids[wrong] });
  };
  const { hash, logs } = await run({
    where: 'collecting from your birds', to: sweeperOrThrow(), abi: sweeperAbi,
    functionName: 'sweep', args: [ids.map((i) => BigInt(i)), tokens],
  }, { on, preflight });
  const ev = sweepEvents(logs);
  const totals = new Map<string, { token: Address; amount: Amount }>();
  for (const s of ev.swept) {
    const k = s.token.toLowerCase();
    const t = totals.get(k) ?? { token: s.token, amount: 0n };
    t.amount += s.amount;
    totals.set(k, t);
  }
  return { swept: ev.swept, skipped: ev.skipped, totals: [...totals.values()], hash };
}

// ── the treasury ──────────────────────────────────────────────────────────

/**
 * Convert income into reward tokens and stream them to the incubator.
 *
 * CALLABLE BY ANYONE — that is the point of it, and why this sits on a card
 * every visitor can see rather than behind an owner check. The contract runs
 * seven guards in order; `getTreasury` answers the first five from cheap reads
 * so the button knows in advance whether it is enabled and why, and the
 * simulation below settles the last two, which no view can predict.
 */
export async function convertAndStream(currency: Address | null, on?: OnPhase) {
  const { simulated, hash } = await run<bigint>({
    where: 'converting the treasury’s income into rewards',
    to: contracts().Treasury, abi: treasuryAbi, functionName: 'convertAndStream',
    // `address(0)` IS the currency argument for native ETH, not a missing one.
    args: [currency ?? ZERO_ADDRESS],
  }, { on });
  return { converted: simulated, hash };
}

export async function createSatchel(id: TokenId, on?: OnPhase) {
  const { simulated, hash } = await run<Address>({
    where: 'creating the satchel', to: contracts().AvianStock, abi: avianStockAbi,
    functionName: 'createAccount', args: [BigInt(id)],
  }, { on });
  return { account: simulated, hash };
}

// ── which route, and why ──────────────────────────────────────────────────

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
