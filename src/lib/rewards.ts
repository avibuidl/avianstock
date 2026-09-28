// A holder's rewards, in one shape (2026-09-27), for My Nest's Rewards panel.
//
// A holder's rewards live in three places: the stock tokens that stream into
// each bird's own wallet (moved out by the Sweeper, one call over every
// granted satchel), the Nest's held-back shares (`claimable`, claimed one
// token at a time), and the AVIAN earned by staking (one claim). This file
// reads the three reads into rows of one shape, values each row the way the
// homepage values what the Nest has paid out (at today's pool price, in
// dollars where the deployment has a dollar source, in ETH where it has
// not), and adds them up for the summary band. Pure: nothing here reads the
// chain or the wallet, so it is tested as arithmetic.

import type { Address, Amount, FlywheelSnapshot, RewardToken, StakingState, SweepState, TokenId } from '../mock/types';
import { usdOf } from './format';

export type RewardSource = 'birds' | 'nest' | 'staking';

export type RewardRow = {
  source: RewardSource;
  token: RewardToken;
  amount: Amount;
  /** The amount at today's pool price; null when the token has no price this refresh. */
  eth: Amount | null;
  /** The same in dollars; null where the deployment has no dollar source. */
  usd: Amount | null;
  /** The birds a sweep of this token would take it from. Empty but for the birds' rows. */
  ids: TokenId[];
};

/** Where a row's reward sits, as the row says it. */
export const WHERE: Record<RewardSource, string> = {
  birds: 'in your birds’ wallets',
  nest: 'held by the Nest',
  staking: 'from staking',
};

/** The row's one button. */
export const ACTION: Record<RewardSource, string> = { birds: 'Collect', nest: 'Claim', staking: 'Claim' };

const WAD = 10n ** 18n;

/**
 * An amount of a token in ETH at today's pool price, from the snapshot: the
 * token's paid-out entry carries its value, so the unit price is the ratio;
 * AVIAN carries its own price. Null with no snapshot or no price.
 */
export function ethValueOf(token: Address, amount: Amount, fly: FlywheelSnapshot | undefined, avian: Address | undefined): Amount | null {
  if (amount === 0n) return 0n;
  if (!fly) return null;
  const entry = fly.paid.find((p) => p.token.toLowerCase() === token.toLowerCase());
  if (entry && entry.ethValue !== null && entry.amount > 0n) return (entry.ethValue * amount) / entry.amount;
  if (avian && token.toLowerCase() === avian.toLowerCase() && fly.avian.ethPerAvian !== null) return (amount * fly.avian.ethPerAvian) / WAD;
  return null;
}

function row(source: RewardSource, token: RewardToken, amount: Amount, ids: TokenId[], fly: FlywheelSnapshot | undefined, avian: Address | undefined): RewardRow {
  const eth = ethValueOf(token.address, amount, fly, avian);
  const usd = eth !== null && fly?.usd ? usdOf(eth, fly.usd.usdPerEth) : null;
  return { source, token, amount, eth, usd, ids };
}

/** One row per token with something in a granted satchel, and the birds it sits in. */
export function birdRows(s: SweepState, fly: FlywheelSnapshot | undefined, avian: Address | undefined): RewardRow[] {
  return s.tokens
    .map((token, j) => {
      const holders = s.birds.filter((b) => b.granted && (b.amounts[j] ?? 0n) > 0n);
      const amount = holders.reduce((a, b) => a + b.amounts[j], 0n);
      return { token, amount, ids: holders.map((b) => b.id) };
    })
    .filter((x) => x.amount > 0n)
    .map((x) => row('birds', x.token, x.amount, x.ids, fly, avian));
}

/** The Nest's held-back shares, one row per token. */
export function nestRows(claimable: { token: RewardToken; amount: Amount }[], fly: FlywheelSnapshot | undefined, avian: Address | undefined): RewardRow[] {
  return claimable.filter((c) => c.amount > 0n).map((c) => row('nest', c.token, c.amount, [], fly, avian));
}

/** What staking has earned and not paid, as one AVIAN row; null at zero. */
export function stakingRow(staking: StakingState | undefined, avianToken: RewardToken, fly: FlywheelSnapshot | undefined): RewardRow | null {
  if (!staking || staking.earned === 0n) return null;
  return row('staking', avianToken, staking.earned, [], fly, avianToken.address);
}

/**
 * The rows added up for the summary band: in dollars when every row has a
 * dollar value, else in ETH when every row has one, else neither, with the
 * count of rows for the band to say something true anyway.
 */
export function totalValue(rows: RewardRow[]): { usd: Amount | null; eth: Amount | null; count: number } {
  const usd = rows.length && rows.every((r) => r.usd !== null) ? rows.reduce((a, r) => a + r.usd!, 0n) : null;
  const eth = rows.length && rows.every((r) => r.eth !== null) ? rows.reduce((a, r) => a + r.eth!, 0n) : null;
  return { usd, eth, count: rows.length };
}

/**
 * The birds holding stock the Sweeper cannot reach: a satchel with something
 * in a listed token and no grant from the current holder (deployed or not).
 * The panel's one line about the grant is for these.
 */
export function unreachable(s: SweepState, listedCount: number): TokenId[] {
  return s.birds
    .filter((b) => !b.granted && b.amounts.slice(0, listedCount).some((x) => x > 0n))
    .map((b) => b.id);
}
