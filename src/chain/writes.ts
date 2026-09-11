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
import { chainIdHex, contracts, manifest } from './manifest';
import { requireChain, providerRequest, type Guarded } from './provider';
import { asContractError } from './errors';
import {
  aviansAbi, theNestAbi, thePerchAbi, avianStockAbi, treasuryAbi,
} from './abis.generated';
import { ContractError } from '../mock/errors';
import { checkTransferSafety } from './safety';
import { invalidateOwnership } from './birds';
import { simulateClaimAll } from './reads';
import { isValid } from '../art/traits';
import type {
  Address, Amount, ClaimAllResult, Hex, OnPhase, PermitSignature, SellResult, Tier, TokenId,
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

export async function approveAviansForRoost(amount: Amount, on?: OnPhase) {
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

export async function setPerchApproval(enabled: boolean, on?: OnPhase) {
  const { hash } = await run({
    where: 'approving the perch to move your birds',
    to: contracts().AvianStock, abi: avianStockAbi, functionName: 'setApprovalForAll',
    args: [contracts().ThePerch, enabled],
  }, { on });
  return { hash };
}

export async function setRoostApproval(enabled: boolean, on?: OnPhase) {
  const { hash } = await run({
    where: 'approving the nest to move your birds',
    to: contracts().AvianStock, abi: avianStockAbi, functionName: 'setApprovalForAll',
    args: [contracts().TheNest, enabled],
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
    return { paid: simulated, burnt: burntFrom(logs, c.ThePerch, c.AvianStock), hash };
  }

  let last: Hex = '0x' as Hex;
  let paid = 0n;
  const burnt: TokenId[] = [];
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
  }
  return { paid, burnt, hash: last };
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

export async function stake(
  entries: { id: TokenId; tier: Tier }[],
  o: { route?: 'batch' | 'push' } = {},
  on?: OnPhase,
) {
  if (entries.length === 0) throw new ContractError('EmptyList');
  for (const e of entries) if (![1, 2, 3].includes(e.tier)) throw new ContractError('InvalidTier');
  const c = contracts();
  const route = o.route ?? (entries.length === 1 ? 'push' : 'batch');

  /**
   * The push route skips the BIRD approval, not the AVIANS one: the tier cost
   * is pulled from the holder and burned either way. Without it the transaction
   * fails with `TransferFromFailed` and no obvious reason.
   */
  const preflight = async (g: Guarded) => {
    const costs = await client().multicall({
      contracts: entries.map((e) => ({
        address: c.TheNest, abi: theNestAbi as unknown as Abi,
        functionName: 'tierCost', args: [e.tier],
      })) as never,
      allowFailure: false,
    }) as bigint[];
    const burn = costs.reduce((a, b) => a + b, 0n);
    const [balance, allowance] = await Promise.all([
      client().readContract({ address: c.Avians, abi: aviansAbi as unknown as Abi, functionName: 'balanceOf', args: [g.account] }) as Promise<bigint>,
      currentAllowance(g.account, c.TheNest),
    ]);
    if (balance < burn || allowance < burn) throw new ContractError('TransferFromFailed', { price: burn });
  };

  if (route === 'batch') {
    const { simulated, hash } = await run<bigint>({
      where: 'sending birds to the nest', to: c.TheNest, abi: theNestAbi,
      functionName: 'stake',
      args: [entries.map((e) => BigInt(e.id)), entries.map((e) => e.tier)],
    }, { on, preflight });
    return { burned: simulated, hash };
  }

  let last: Hex = '0x' as Hex;
  let burned = 0n;
  for (const e of entries) {
    const guarded = await requireChain();
    await preflight(guarded);
    // The push route's data must be exactly `abi.encode(uint8 tier)` — 32
    // bytes. Anything else is `BadStakeData`.
    const data = encodeAbiParameters([{ type: 'uint8' }], [e.tier]);
    const plan = {
      where: 'sending a bird to the nest', to: c.AvianStock, abi: avianStockAbi,
      functionName: 'safeTransferFrom',
      args: [guarded.account, c.TheNest, BigInt(e.id), data],
    };
    await simulate(plan, guarded.account);
    // Read before the send, like the perch's quote. `tierCost` is a constant
    // and will not revert, but a read after a landed transaction can still
    // fail on the transport — and a throw here would report a bird that IS
    // staked as one that never went through.
    const cost = await client().readContract({
      address: c.TheNest, abi: theNestAbi as unknown as Abi,
      functionName: 'tierCost', args: [e.tier],
    }) as bigint;
    const { hash } = await sendAndWait(plan, await requireChain(), on);
    last = hash;
    burned += cost;
  }
  return { burned, hash: last };
}

export async function unstake(ids: TokenId[], on?: OnPhase) {
  if (ids.length === 0) throw new ContractError('EmptyList');
  const { hash } = await run({
    where: 'bringing birds home', to: contracts().TheNest, abi: theNestAbi,
    functionName: 'unstake', args: [ids.map((i) => BigInt(i))],
  }, { on });
  return { hash };
}

/**
 * One named token. It REVERTS with `TransferFailed` (0x90b8ec18) when that
 * token will not move, which is the right answer for someone who asked for that
 * token specifically. `explain()` turns it into a sentence about the TOKEN —
 * "your rewards are safe and can be claimed later" — never about the person.
 */
export async function claim(token: Address, on?: OnPhase) {
  const { simulated, hash, logs } = await run<bigint>({
    where: 'claiming that reward', to: contracts().TheNest, abi: theNestAbi,
    functionName: 'claim', args: [token],
  }, { on });

  const paid = parseEventLogs({
    abi: theNestAbi as unknown as Abi, logs: logs as never, eventName: 'RewardPaid' as never,
  }) as unknown as { args: { token?: Address; amount?: bigint } }[];
  const mine = paid.find((e) => e.args.token?.toLowerCase() === token.toLowerCase());
  return { amount: mine?.args.amount ?? simulated, hash };
}

/**
 * EVERY reward token in one transaction — and THE ONE CALL WHERE A RECEIPT IS
 * NOT AN ANSWER.
 *
 * `claimAll` does not revert for a token that refuses to move. That token is
 * SKIPPED: its accrual is put back exactly where it was, every other token is
 * still paid, and the transaction SUCCEEDS with part of its intention
 * unfulfilled. So the outcome is read off the return value and the logs, never
 * off "it confirmed".
 *
 *   RewardPaid(user, token, amount)     -> paid
 *   RewardSkipped(user, token, amount)  -> skipped, and the amount is what is
 *                                          still waiting
 *   neither                             -> nothing was owed. NOT a failure.
 *
 * The token list comes from the simulation, because the array `claimAll`
 * iterates is `_snapshotTokens` — every token EVER listed — and that array has
 * no public getter. It can therefore be longer than `listedRewardTokens()`,
 * and nothing may index one against the other.
 */
export async function claimAll(on?: OnPhase): Promise<ClaimAllResult & { hash: Hex }> {
  const guarded = await requireChain();

  let expected: ClaimAllResult;
  try {
    expected = await simulateClaimAll(guarded.account);
  } catch (e) {
    throw asContractError(e, { where: 'claiming your rewards' });
  }

  const plan = {
    where: 'claiming your rewards', to: contracts().TheNest, abi: theNestAbi,
    functionName: 'claimAll', args: [] as const,
  };
  const { hash, logs } = await sendAndWait(plan, await requireChain(), on);

  const paidEvents = parseEventLogs({
    abi: theNestAbi as unknown as Abi, logs: logs as never, eventName: 'RewardPaid' as never,
  }) as unknown as { args: { user?: Address; token?: Address; amount?: bigint } }[];
  const skippedEvents = parseEventLogs({
    abi: theNestAbi as unknown as Abi, logs: logs as never, eventName: 'RewardSkipped' as never,
  }) as unknown as { args: { user?: Address; token?: Address; amount?: bigint } }[];

  const mine = (e: { args: { user?: Address } }) =>
    e.args.user?.toLowerCase() === guarded.account.toLowerCase();

  const paidBy = new Map<string, bigint>();
  for (const e of paidEvents.filter(mine)) {
    if (e.args.token) paidBy.set(e.args.token.toLowerCase(), e.args.amount ?? 0n);
  }
  const skippedBy = new Map<string, bigint>();
  for (const e of skippedEvents.filter(mine)) {
    if (e.args.token) skippedBy.set(e.args.token.toLowerCase(), e.args.amount ?? 0n);
  }

  // The logs are the authority: they are what actually happened. Anything the
  // logs mention that the simulation did not is added rather than dropped.
  const tokens = [...expected.tokens];
  for (const key of [...paidBy.keys(), ...skippedBy.keys()]) {
    if (!tokens.some((t) => t.toLowerCase() === key)) tokens.push(key as Address);
  }

  return {
    tokens,
    paid: tokens.map((t) => paidBy.get(t.toLowerCase()) ?? 0n),
    skipped: tokens.map((t) => skippedBy.has(t.toLowerCase())),
    hash,
  };
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
  const { hash } = await sendAndWait(plan, await requireChain(), on);
  return { hash };
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
