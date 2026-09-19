// The price ticker, without a chain.
//
// A fixture set of ETH prices for the listed reward tokens, moved a little on
// every read so the up/down marks have something to say. The movement is a
// fixed sequence in basis points, not a random walk: the same tick number
// always shows the same figures, so a screenshot can be repeated.

import type { Address, Amount, PriceBoard, TokenPrice } from './types';
import { scenario } from './scenario';
import { STOCK_REWARD_TOKENS } from './fixtures';
import { read } from './reads';

/** ETH per token, 18 decimals — the order of REWARD_TOKENS. Off the real pools on 4663, 2026-09-13. */
const BASE: Record<string, Amount> = {
  NVDA: 85963816030997747n,     // 0.0859638
  SPY:  303470000000000000n,    // 0.30347
  SPCX: 59555000000000000n,     // 0.059555
  AAPL: 132100000000000000n,    // 0.13210
};

/** Per-tick drift in basis points, per token, cycled. Small, and each token on its own beat. */
const DRIFT: Record<string, number[]> = {
  NVDA: [0, 12, 12, -7, 3, -15, 0, 9],
  SPY:  [0, -4, 6, 6, -2, 0, 11, -8],
  SPCX: [0, 20, -18, 0, 5, 5, -9, 14],
  AAPL: [0, 0, -3, 8, -8, 2, 0, -6],
};

let tick = 0; /* count */

export function getPrices(): Promise<PriceBoard> {
  return read(() => {
    const s = scenario();
    const n = tick++;
    // AVIANS is listed on the Nest but not on the band: the stock tokens only.
    const listed = s.rewards === 'none-listed' ? [] : STOCK_REWARD_TOKENS;
    const prices: TokenPrice[] = listed
      // One token whose pool is missing or empty: it is not in the list, and
      // nothing else about the band changes.
      .filter((t) => !(s.ticker === 'one-missing' && t.symbol === 'SPCX'))
      .map((t) => {
        const seq = DRIFT[t.symbol] ?? [0];
        const bps = BigInt(seq[n % seq.length]);
        const base = BASE[t.symbol] ?? 100000000000000000n;
        return {
          address: t.address as Address,
          symbol: t.symbol,
          decimals: t.decimals,
          ethPerToken: base + (base * bps) / 10_000n,
          pool: `0x${'ab'.repeat(20)}` as Address,
          fee: 500,
        };
      });
    return { blockNumber: 62190576n + BigInt(n), timestamp: Math.floor(Date.now() / 1000), prices };
  }, 120);
}
