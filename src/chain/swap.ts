// ETH ↔ AVIANS, through Uniswap v4.
//
// WHY THIS EXISTS. After launch every AVIANS is in the pool, so a collector who
// arrives with none is told to approve a token they have no way to get. The
// mint page's own instructions were unfollowable. This is the missing step.
//
// THE POOL. One pool, and the hook will accept no other: native ETH is
// `currency0` (the zero address sorts below every token), AVIANS is
// `currency1`, the LP fee is `POOL_FEE` and the spacing is `TICK_SPACING`, both
// read off the hook rather than written here. A BUY is therefore zero-for-one.
//
// THE ROUTE. Uniswap's UniversalRouter, one `V4_SWAP` command carrying a
// program of three actions — SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL. That
// program is not invented here: `contracts/test/URPrograms.sol` builds it and
// the phase-B fork tests send it to the real router on 4663, and the action and
// command bytes in `abis.generated.ts` are read out of that same Solidity by
// the generator. The site cannot drift from the encoding that is proven to work
// without the build failing.
//
// EXACT-IN ONLY, both directions. Exact-out exists in the router and in the
// tests; it is not offered here, because it needs a maximum-in and a sweep and
// it answers a question a collector buying AVIANS to mint with does not have.

import {
  encodeAbiParameters, encodeFunctionData, encodePacked, parseAbiParameters, type Abi,
} from 'viem';
import { client, pin, readMany, type At } from './client';
import { contracts, manifest, thirdParty } from './manifest';
import {
  aviansAbi, aviansHookAbi, permit2Abi, universalRouterAbi, v4QuoterAbi,
  UR_COMMANDS, V4_ACTIONS,
} from './abis.generated';
import { asContractError } from './errors';
import { guard } from './reads';
import { run } from './writes';
import { requireChain } from './provider';
import { ContractError } from '../mock/errors';
import type { Address, Amount, OnPhase, SwapQuote, SwapState, UnixSeconds } from '../mock/types';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address;

/** Uniswap prices the LP fee in hundredths of a bip: 5000 is 0.5%. */
const FEE_DENOMINATOR = 1_000_000;
const BPS = 10_000n;

// ── the pool ──────────────────────────────────────────────────────────────

export type PoolKey = {
  currency0: Address; currency1: Address; fee: number; tickSpacing: number; hooks: Address;
};

const POOL_KEY_ABI = {
  type: 'tuple',
  components: [
    { name: 'currency0', type: 'address' },
    { name: 'currency1', type: 'address' },
    { name: 'fee', type: 'uint24' },
    { name: 'tickSpacing', type: 'int24' },
    { name: 'hooks', type: 'address' },
  ],
} as const;

/** `IV4Router.ExactInputSingleParams`. */
const EXACT_IN_SINGLE_ABI = {
  type: 'tuple',
  components: [
    { ...POOL_KEY_ABI, name: 'poolKey' },
    { name: 'zeroForOne', type: 'bool' },
    { name: 'amountIn', type: 'uint128' },
    { name: 'amountOutMinimum', type: 'uint128' },
    { name: 'hookData', type: 'bytes' },
  ],
} as const;

/** Null when this deployment has no pool — a real state, not a fault. */
export function canSwap(): boolean {
  return !!contracts().AviansHook && !!thirdParty();
}

function requirePool(): { hook: Address; avians: Address; router: Address; quoter: Address; permit2: Address } {
  const c = contracts();
  const t = thirdParty();
  if (!c.AviansHook || !t) {
    throw new ContractError('NoPool');
  }
  return {
    hook: c.AviansHook, avians: c.Avians,
    router: t.UniversalRouter, quoter: t.V4Quoter, permit2: t.Permit2,
  };
}

let cachedKey: { id: string; key: PoolKey } | null = null;

/** The one pool key the hook accepts, read off the hook rather than assumed. */
export async function poolKey(at?: At): Promise<PoolKey> {
  const m = manifest();
  if (cachedKey && cachedKey.id === m.id) return cachedKey.key;
  const { hook, avians } = requirePool();
  const [fee, tickSpacing] = await readMany<unknown>([
    { address: hook, abi: aviansHookAbi as unknown as Abi, functionName: 'POOL_FEE' },
    { address: hook, abi: aviansHookAbi as unknown as Abi, functionName: 'TICK_SPACING' },
  ], at);
  const key: PoolKey = {
    currency0: ZERO_ADDRESS,
    currency1: avians,
    fee: Number(fee), /* count */
    tickSpacing: Number(tickSpacing), /* count */
    hooks: hook,
  };
  cachedKey = { id: m.id, key };
  return key;
}

export function resetPoolKey() { cachedKey = null; }

// ── what the screen needs before anything is typed ────────────────────────

export async function getSwapState(who: Address | null, at?: At): Promise<SwapState> {
  return guard('reading the pool', async () => {
    const a = at ?? await pin();
    const { hook, avians, router, permit2 } = requirePool();
    const h = (functionName: string, args: readonly unknown[] = []) =>
      ({ address: hook, abi: aviansHookAbi as unknown as Abi, functionName, args });

    const [r, ethBalance, permit2Allowance] = await Promise.all([
      readMany<unknown>([
        h('LAUNCH_AT'), h('isLaunched'), h('WINDOW'), h('windowEndsAt'),
        h('currentBuyFeeBps'), h('sellFeeBps'), h('MAX_BUY_PER_TX'),
        h('POOL_FEE'),
      ], a),
      who ? client().getBalance({ address: who, blockNumber: a.blockNumber }) : Promise.resolve(0n),
      // Two allowances stand between a wallet and a sell, and they are
      // different things: the ERC-20 one lets Permit2 move AVIANS at all, and
      // the Permit2 one lets the ROUTER spend through it. Read both, so the UI
      // can say which of the two steps is outstanding rather than "approve".
      who
        ? readMany<unknown>([
          { address: avians, abi: aviansAbi as unknown as Abi, functionName: 'allowance', args: [who, permit2] },
          { address: permit2, abi: permit2Abi as unknown as Abi, functionName: 'allowance', args: [who, avians, router] },
        ], a)
        : Promise.resolve([0n, [0n, 0, 0]] as unknown[]),
    ]);

    const aviansBalance = who
      ? await readMany<bigint>([{
        address: avians, abi: aviansAbi as unknown as Abi, functionName: 'balanceOf', args: [who],
      }], a).then((x) => x[0])
      : 0n;

    const toPermit2 = (permit2Allowance[0] ?? 0n) as Amount;
    // viem hands a multi-return back as a tuple when the outputs are named
    // positionally and as an object when they are named in the ABI. Read it
    // either way rather than assume, the way `conversionConfig` already does.
    const p2 = permit2Allowance[1] as unknown;
    const asTuple = Array.isArray(p2) ? (p2 as readonly unknown[]) : null;
    const asObject = asTuple ? null : (p2 as { amount?: bigint; expiration?: number } | null);
    const permit2Amount = (asTuple ? asTuple[0] : asObject?.amount ?? 0n) as Amount;
    const permit2Expiration = Number(asTuple ? asTuple[1] : asObject?.expiration ?? 0); /* count */

    return {
      launchAt: Number(r[0] as bigint), /* count */
      isLaunched: r[1] as boolean,
      windowSeconds: Number(r[2] as bigint), /* count */
      windowEndsAt: Number(r[3] as bigint), /* count */
      buyFeeBps: Number(r[4] as bigint), /* count */
      sellFeeBps: Number(r[5] as bigint), /* count */
      maxBuyPerTx: r[6] as Amount,
      poolFeeBps: Number(r[7] as bigint) / (FEE_DENOMINATOR / 10_000), /* count */
      ethBalance,
      aviansBalance,
      allowanceToPermit2: toPermit2,
      permit2ToRouter: permit2Amount as Amount,
      permit2Expiration,
    };
  });
}

// ── quoting ──────────────────────────────────────────────────────────────

/**
 * What the pool would give, from Uniswap's own lens.
 *
 * The quote is NET OF EVERYTHING — the quoter runs the swap through the
 * PoolManager, so the hook's fee and the LP fee are already taken out of
 * `amountOut`. The itemisation below therefore explains where the difference
 * went; it is not a list of further deductions. Getting that backwards would
 * have a collector subtract the same fees twice.
 *
 * An estimate, never a promise: the price moves, and inside the launch window
 * the hook's own fee falls every second.
 */
export async function quoteSwap(
  direction: 'buy' | 'sell', amountIn: Amount, slippageBps: number,
): Promise<SwapQuote> {
  return guard('quoting the swap', async () => {
    const { quoter } = requirePool();
    const key = await poolKey();
    const zeroForOne = direction === 'buy';

    const { result } = await client().simulateContract({
      address: quoter,
      abi: v4QuoterAbi as unknown as Abi,
      functionName: 'quoteExactInputSingle',
      args: [{ poolKey: key, zeroForOne, exactAmount: amountIn, hookData: '0x' }],
    });
    const amountOut = (result as readonly [bigint, bigint])[0];

    const state = await getSwapState(null);
    return buildQuote({ direction, amountIn, amountOut, slippageBps, state, key });
  });
}

/**
 * The arithmetic, split out so the mock and the chain produce the same shape
 * and so it can be reasoned about without a node.
 *
 * The hook's fee is a pure function of the ETH side, which is why it can be
 * stated exactly rather than estimated:
 *
 *   BUY   the fee comes off the ETH going IN, before the curve sees it, so it
 *         is `amountIn * bps / 10000`.
 *   SELL  the fee comes off the ETH coming OUT, so what the quoter reports is
 *         already net and the gross is recovered as `out * bps / (10000 - bps)`.
 */
export function buildQuote(o: {
  direction: 'buy' | 'sell';
  amountIn: Amount;
  amountOut: Amount;
  slippageBps: number;
  state: SwapState;
  key: PoolKey;
}): SwapQuote {
  const { direction, amountIn, amountOut, slippageBps, state } = o;
  const buy = direction === 'buy';
  const hookBps = BigInt(buy ? state.buyFeeBps : state.sellFeeBps);

  const hookFeeEth = buy
    ? (amountIn * hookBps) / BPS
    : (amountOut * hookBps) / (BPS - hookBps);

  // The LP's share, of whatever actually reached the curve.
  const intoCurve = buy ? amountIn - hookFeeEth : amountIn;
  const poolFee = (intoCurve * BigInt(state.poolFeeBps)) / BPS;

  const minOut = (amountOut * BigInt(10_000 - slippageBps)) / BPS;

  return {
    direction,
    amountIn,
    amountOut,
    minOut,
    slippageBps,
    hookBps: Number(hookBps), /* count */
    hookFeeEth,
    poolFeeBps: state.poolFeeBps,
    poolFee,
    /** In the window only, and only on buys. */
    launchExtraBps: buy ? Math.max(0, state.buyFeeBps - state.sellFeeBps) : 0,
    at: Math.floor(Date.now() / 1000),
  };
}

// ── the cap, which no view can answer ────────────────────────────────────

/**
 * `MAX_BUY_PER_TX` is measured in `afterSwap` against the AVIANS the curve
 * actually moved, and it ACCUMULATES over every buy in one transaction. There
 * is no getter for the running total — it lives in transient storage for the
 * length of the transaction — so anything that bundles swaps has to add them up
 * itself. This site sends one swap per transaction, and this is where that
 * assumption is written down.
 *
 * The check is against the QUOTED output, which is an estimate, so it refuses a
 * little below the cap rather than at it. A refusal here costs a collector
 * nothing; a revert costs them the gas.
 */
export const CAP_MARGIN_BPS = 100;

export function overCap(quote: SwapQuote, state: SwapState, now: number): {
  over: boolean; ceiling: Amount;
} {
  const inWindow = state.isLaunched && now < state.windowEndsAt;
  const ceiling = (state.maxBuyPerTx * BigInt(10_000 - CAP_MARGIN_BPS)) / BPS;
  if (!inWindow || quote.direction !== 'buy') return { over: false, ceiling: state.maxBuyPerTx };
  return { over: quote.amountOut > ceiling, ceiling };
}

// ── the program ──────────────────────────────────────────────────────────

/**
 * One `V4_SWAP` command whose input is `abi.encode(actions, params)`.
 *
 * Byte-identical in shape to `URPrograms.exactInSingle`, with one deliberate
 * difference: that helper passes `amountOutMinimum: 0` because a test asserts
 * on the exact output. Zero here would not be a lenient slippage check, it
 * would be no check at all, so both the swap action and TAKE_ALL carry the real
 * minimum.
 */
export function encodeExactInSingle(o: {
  key: PoolKey; zeroForOne: boolean; amountIn: Amount; minOut: Amount;
}): { commands: `0x${string}`; inputs: `0x${string}`[] } {
  const { key, zeroForOne, amountIn, minOut } = o;
  const actions = encodePacked(
    ['uint8', 'uint8', 'uint8'],
    [V4_ACTIONS.SWAP_EXACT_IN_SINGLE, V4_ACTIONS.SETTLE_ALL, V4_ACTIONS.TAKE_ALL],
  );
  const currencyIn = zeroForOne ? key.currency0 : key.currency1;
  const currencyOut = zeroForOne ? key.currency1 : key.currency0;

  const params: `0x${string}`[] = [
    encodeAbiParameters([EXACT_IN_SINGLE_ABI], [{
      poolKey: key, zeroForOne, amountIn, amountOutMinimum: minOut, hookData: '0x',
    }] as never),
    encodeAbiParameters(parseAbiParameters('address, uint256'), [currencyIn, amountIn]),
    encodeAbiParameters(parseAbiParameters('address, uint256'), [currencyOut, minOut]),
  ];

  return {
    commands: encodePacked(['uint8'], [UR_COMMANDS.V4_SWAP]),
    inputs: [encodeAbiParameters(parseAbiParameters('bytes, bytes[]'), [actions, params])],
  };
}

// ── the writes ───────────────────────────────────────────────────────────

const DEADLINE_SECONDS = 600;

export async function swap(
  direction: 'buy' | 'sell', amountIn: Amount, minOut: Amount, on?: OnPhase,
) {
  const { router } = requirePool();
  const key = await poolKey();
  const zeroForOne = direction === 'buy';
  const { commands, inputs } = encodeExactInSingle({ key, zeroForOne, amountIn, minOut });
  const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SECONDS);

  const { hash } = await run({
    where: direction === 'buy' ? 'buying AVIANS' : 'selling AVIANS',
    to: router,
    abi: universalRouterAbi,
    functionName: 'execute',
    args: [commands, inputs, deadline],
    // A buy pays in native ETH; a sell pays in AVIANS through Permit2.
    value: zeroForOne ? amountIn : undefined,
  }, { on });
  return { hash };
}

/** Step one of two for a sell: let Permit2 move AVIANS at all. Exact amount. */
export async function approveAviansForPermit2(amount: Amount, on?: OnPhase) {
  const { avians, permit2 } = requirePool();
  const { hash } = await run({
    where: 'approving Permit2 to move AVIANS',
    to: avians, abi: aviansAbi, functionName: 'approve', args: [permit2, amount],
  }, { on });
  return { hash };
}

/**
 * Step two: let the router spend that allowance, until `expiration`.
 *
 * Permit2 stores an amount AND an expiry, and an expired allowance fails in a
 * way that looks like no allowance at all — so the expiry is set explicitly and
 * shown, rather than left to a default nobody sees.
 */
export const PERMIT2_EXPIRY_SECONDS = 30 * 24 * 3600;

export async function approvePermit2ForRouter(amount: Amount, on?: OnPhase) {
  const { avians, permit2, router } = requirePool();
  const expiration = Math.floor(Date.now() / 1000) + PERMIT2_EXPIRY_SECONDS;
  const { hash } = await run({
    where: 'allowing the router to spend through Permit2',
    to: permit2, abi: permit2Abi, functionName: 'approve',
    args: [avians, router, amount, expiration],
  }, { on });
  return { hash, expiration: expiration as UnixSeconds };
}

/**
 * A dry run of the exact program, before the wallet is asked.
 *
 * The quote comes from the quoter, which is a different contract on a different
 * path; this is the router refusing or not refusing the actual bytes. It is
 * what turns "the hook says NotLaunched" into a sentence rather than a wallet
 * error, and it is why `run()`'s own simulation is not the first thing a
 * collector meets.
 */
export async function simulateSwap(direction: 'buy' | 'sell', amountIn: Amount, minOut: Amount) {
  const { router } = requirePool();
  const { account } = await requireChain();
  const key = await poolKey();
  const zeroForOne = direction === 'buy';
  const { commands, inputs } = encodeExactInSingle({ key, zeroForOne, amountIn, minOut });
  try {
    await client().simulateContract({
      address: router,
      abi: universalRouterAbi as unknown as Abi,
      functionName: 'execute',
      args: [commands, inputs, BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SECONDS)],
      account,
      value: zeroForOne ? amountIn : undefined,
    });
  } catch (e) {
    throw asContractError(e, { where: direction === 'buy' ? 'buying AVIANS' : 'selling AVIANS' });
  }
}

/** For the drawer's "what did I actually get" line. */
export function encodeSwapCalldata(o: {
  key: PoolKey; zeroForOne: boolean; amountIn: Amount; minOut: Amount;
}): `0x${string}` {
  const { commands, inputs } = encodeExactInSingle(o);
  return encodeFunctionData({
    abi: universalRouterAbi as unknown as Abi,
    functionName: 'execute',
    args: [commands, inputs, BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SECONDS)],
  });
}
