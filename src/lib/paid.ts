// "Total paid out", with the stakers counted on their own (part 19, 2026-09-25).
//
// The headline's entries start from the Nest's paid total per listed token.
// AVIAN stakers are paid by a different contract, the staking contract, and
// their total used to be added inside the loop over the Nest's listing: had
// AVIAN ever left that listing, the stakers' payouts would have dropped out of
// the headline without a word. So they are added here, after the loop, on
// their own: onto AVIAN's entry when the Nest lists AVIAN, and as AVIAN's
// entry alone when it does not.

import type { Address, Amount } from '../mock/types';

export type PaidIn = { token: Address; symbol: string; decimals: number; amount: Amount };

export function countStakers(
  nest: readonly PaidIn[],
  avian: { token: Address; symbol: string; decimals: number },
  stakingPaid: Amount,
): PaidIn[] {
  const at = nest.findIndex((p) => p.token.toLowerCase() === avian.token.toLowerCase());
  if (at >= 0) return nest.map((p, k) => (k === at ? { ...p, amount: p.amount + stakingPaid } : p));
  // Not listed: the stakers' total is AVIAN's whole entry. Nothing paid yet
  // is no entry at all, so launch day still reads "Nothing has been paid out".
  return stakingPaid > 0n ? [...nest, { ...avian, amount: stakingPaid }] : [...nest];
}
