// Trading AVIANS, without a chain.
//
// The launch window is NOT modelled again here — it comes from the existing
// `launch` and `windowElapsed` axes, the same ones First Light and the Docs
// timeline already read. A second copy of the window would be a second thing to
// keep true, and the decaying fee is exactly the number that must not be
// approximated in two places.
//
// What this file adds is the states the launch axes cannot express: the two
// approvals a sell needs, a quote that fails, and a deployment with no pool.

import type {
  Address, Amount, OnPhase, SwapQuote, SwapState,
} from './types';
import { ContractError } from './errors';
import { scenario } from './scenario';
import { MAX_BUY_PER_TX, buyFeeBpsAt, overlay, world } from './fixtures';
import { read } from './reads';
import { requireChain, sleep } from './wallet';
import { settled } from './writes';

/** The pool's own rate, and the hook's floor. Both constants on chain. */
const POOL_FEE_BPS = 50;   // 5000 hundredths of a bip
const SELL_FEE_BPS = 100;  // FEE_BPS
const BPS = 10_000n;

/**
 * A price, so the mock can quote. Flat rather than a curve: this is a fixture,
 * and a fake curve would only invite someone to read a shape into it.
 * 1 ETH buys 2,000,000 AVIANS before fees.
 */
const AVIANS_PER_ETH = 2_000_000n;

export function canSwap(): boolean {
  return scenario().swap !== 'no-pool';
}

export function getSwapState(_who: Address | null): Promise<SwapState> {
  return read(() => {
    if (scenario().swap === 'no-pool') throw new ContractError('NoPool');
    const s = scenario();
    const w = world();
    const now = Math.floor(Date.now() / 1000);
    const launch = w.launch;

    // Step one is outstanding unless the scenario says otherwise, and step two
    // only once step one is done — that order is the whole point of showing
    // them. An approval made in this session sticks, so the two-step can be
    // walked through rather than only looked at.
    const step1 = overlay.permit2Approved !== null
      || s.swap === 'needs-permit2' || s.swap === 'ready';
    const step2 = overlay.permit2Router !== null || s.swap === 'ready';

    return {
      launchAt: launch.launchAt,
      isLaunched: launch.isLaunched,
      windowSeconds: launch.windowSeconds,
      windowEndsAt: launch.windowEndsAt,
      buyFeeBps: buyFeeBpsAt(now, launch.launchAt),
      sellFeeBps: SELL_FEE_BPS,
      poolFeeBps: POOL_FEE_BPS,
      maxBuyPerTx: MAX_BUY_PER_TX,
      ethBalance: w.wallet.eth,
      aviansBalance: w.wallet.avians,
      allowanceToPermit2: step1 ? (overlay.permit2Approved ?? (1n << 255n)) : 0n,
      permit2ToRouter: step2 ? (overlay.permit2Router ?? (1n << 159n) - 1n) : 0n,
      permit2Expiration: step2 ? now + 30 * 86_400 : 0,
    };
  }, 200);
}

export async function quoteSwap(
  direction: 'buy' | 'sell', amountIn: Amount, slippageBps: number,
): Promise<SwapQuote> {
  const s = scenario();
  await sleep(320);
  if (s.swap === 'no-pool') throw new ContractError('NoPool');
  // A quote is a call like any other and the node can decline to answer it.
  // The screen has to survive that without inventing a number.
  if (s.swap === 'quote-fails') throw new ContractError('ReadFailed');
  if (amountIn === 0n) throw new ContractError('NothingTraded');

  const state = await getSwapState(null);
  const buy = direction === 'buy';
  const hookBps = BigInt(buy ? state.buyFeeBps : state.sellFeeBps);

  let amountOut: Amount;
  let hookFeeEth: Amount;
  if (buy) {
    hookFeeEth = (amountIn * hookBps) / BPS;
    const intoCurve = amountIn - hookFeeEth;
    const afterPool = intoCurve - (intoCurve * BigInt(POOL_FEE_BPS)) / BPS;
    amountOut = afterPool * AVIANS_PER_ETH;
  } else {
    // AVIANS in: the pool takes its cut of the input, the curve turns the rest
    // into ETH, and the hook takes its cut of that ETH on the way out.
    const afterPool = amountIn - (amountIn * BigInt(POOL_FEE_BPS)) / BPS;
    const eth = afterPool / AVIANS_PER_ETH;
    hookFeeEth = (eth * hookBps) / BPS;
    amountOut = eth - hookFeeEth;
  }

  const intoCurve = buy ? amountIn - hookFeeEth : amountIn;
  return {
    direction,
    amountIn,
    amountOut,
    minOut: (amountOut * BigInt(10_000 - slippageBps)) / BPS,
    slippageBps,
    hookBps: Number(hookBps), /* count */
    hookFeeEth,
    poolFeeBps: POOL_FEE_BPS,
    poolFee: (intoCurve * BigInt(POOL_FEE_BPS)) / BPS,
    launchExtraBps: buy ? Math.max(0, state.buyFeeBps - SELL_FEE_BPS) : 0,
    at: Math.floor(Date.now() / 1000),
  };
}

// ── writes ────────────────────────────────────────────────────────────────

function hash(): `0x${string}` {
  let h = '0x';
  for (let i = 0; i < 64; i++) h += '0123456789abcdef'[Math.floor(Math.random() * 16)];
  return h as `0x${string}`;
}

async function send<T>(on: OnPhase | undefined, make: () => T): Promise<T & { hash: `0x${string}` }> {
  requireChain();
  on?.('signing');
  await sleep(650);
  const h = hash();
  on?.('pending', h);
  await sleep(1400);
  const out = make();
  on?.('confirmed', h);
  settled();
  return { ...out, hash: h };
}

/**
 * The hook's three refusals, in the order it applies them, so the mock walks
 * the same path the chain does rather than a convenient one.
 */
export async function swap(
  direction: 'buy' | 'sell', amountIn: Amount, minOut: Amount, on?: OnPhase,
) {
  const s = scenario();
  if (s.swap === 'no-pool') throw new ContractError('NoPool');
  const state = await getSwapState(null);
  const now = Math.floor(Date.now() / 1000);

  if (!state.isLaunched) throw new ContractError('NotLaunched', { launchAt: state.launchAt });

  const quote = await quoteSwap(direction, amountIn, 0);
  if (direction === 'buy' && now < state.windowEndsAt && quote.amountOut > state.maxBuyPerTx) {
    throw new ContractError('BuyTooLarge', { cap: state.maxBuyPerTx });
  }
  if (direction === 'sell' && state.permit2ToRouter === 0n) {
    throw new ContractError('InsufficientAllowance');
  }
  if (quote.amountOut < minOut) throw new ContractError('V4TooLittleReceived');

  return send(on, () => {
    // Both sides move, so the compose page's balance, allowance and mint button
    // all change the moment this settles.
    if (direction === 'buy') {
      overlay.swappedEth -= amountIn;
      overlay.swappedAvians += quote.amountOut;
    } else {
      overlay.swappedAvians -= amountIn;
      overlay.swappedEth += quote.amountOut;
    }
    return { received: quote.amountOut };
  });
}

export async function approveAviansForPermit2(amount: Amount, on?: OnPhase) {
  return send(on, () => { overlay.permit2Approved = amount; return {}; });
}

export async function approvePermit2ForRouter(amount: Amount, on?: OnPhase) {
  return send(on, () => { overlay.permit2Router = amount; return {}; });
}
