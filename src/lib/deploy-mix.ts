// Whether the Treasury's conversion targets are still the ones the deploy set.
//
// Deploy.s.sol lists NVDA, SPY, SPCX and AAPL at equal weights, and only on
// mainnet (2026-09-24): the testnet has no stock tokens, and its deploy sets
// no targets at all. So "set by the deploy" is a claim about one chain and one
// moment, and the owner page makes it only while the chain still bears it out.
//
// Matched by the symbols the tokens report, not by address: the site carries
// no addresses of its own, and the owner page already names each target by
// the symbol it read.

export const DEPLOY_MIX = ['NVDA', 'SPY', 'SPCX', 'AAPL'] as const;

/** Exactly the deploy's four, each at an equal quarter, in any order. */
export function isDeployMix(targets: readonly { symbol: string; weightBps: number }[]): boolean {
  if (targets.length !== DEPLOY_MIX.length) return false;
  if (!targets.every((t) => t.weightBps === 10_000 / DEPLOY_MIX.length)) return false;
  const symbols = new Set(targets.map((t) => t.symbol));
  return symbols.size === DEPLOY_MIX.length && DEPLOY_MIX.every((s) => symbols.has(s));
}
