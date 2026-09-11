import type { RewardSplit } from '../mock/types';

// Every amount on this site is 18 decimals of base units behind the scenes,
// and nobody should ever see a raw base-unit figure. BigInt end to end, a
// formatter at the edge. `Number` never touches an amount — it loses precision
// above 2^53, and 100,000 AVIANS is 10^23.

export const WAD = 10n ** 18n;

/** Whole AVIANS, with thousands separators. 100000e18 -> "100,000". */
export function formatAvians(v: bigint): string {
  return group((v / WAD).toString());
}

/** The unit always travels with the amount: a bare number invites a dollar reading. */
export function avians(v: bigint): string {
  return `${formatAvians(v)} AVIANS`;
}

/**
 * A reward balance. Truncated, NEVER rounded up — round up and someone clicks
 * claim for more than exists.
 */
export function formatReward(v: bigint, decimals: number, places = 4): string {
  const unit = 10n ** BigInt(decimals);
  const whole = v / unit;
  const frac = ((v % unit) * 10n ** BigInt(places)) / unit;   // truncating division
  return `${group(whole.toString())}.${frac.toString().padStart(places, '0')}`;
}

export function formatEth(v: bigint, places = 4): string {
  return formatReward(v, 18, places);
}

/** A typed figure back to base units. Never via Number. */
export function parseAvians(s: string): bigint {
  const clean = s.replace(/[\s,_]/g, '');
  if (!/^\d*(\.\d*)?$/.test(clean) || clean === '' || clean === '.') throw new Error('not a number');
  const [whole, frac = ''] = clean.split('.');
  const padded = (frac + '0'.repeat(18)).slice(0, 18);
  return BigInt(whole || '0') * WAD + BigInt(padded || '0');
}

function group(s: string): string {
  const neg = s.startsWith('-');
  const digits = neg ? s.slice(1) : s;
  return (neg ? '-' : '') + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function formatCount(n: number): string {
  return group(Math.trunc(n).toString());
}

/** "Avian #1,204" — with the separator, hash attached. */
export function avianNumber(id: number): string {
  return `Avian #${formatCount(id)}`;
}

export function shortAddress(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

/** 2500 -> "25%", 1396 -> "13.96%" trimmed to one place when it is not round. */
export function formatBps(bps: number, places = 1): string {
  const pct = bps / 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(places)}%`;
}

/** 162 -> "2:42";  11560 -> "3:12:40" */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** "14 days" / "6 hours" / "just now" — for how long a bird has been brooding. */
export function formatSince(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  if (d >= 1) return `${d} day${d === 1 ? '' : 's'}`;
  const h = Math.floor(seconds / 3600);
  if (h >= 1) return `${h} hour${h === 1 ? '' : 's'}`;
  const m = Math.floor(seconds / 60);
  if (m >= 1) return `${m} minute${m === 1 ? '' : 's'}`;
  return 'just now';
}

/** "365 days" — the lock is always in days, because the contract says days. */
export function formatDays(seconds: number): string {
  return `${formatCount(Math.floor(seconds / 86400))} days`;
}

/**
 * "NVDA 40%, SPY 30%, SPCX 20%, AAPL 10%" — or the truth about why it cannot
 * say that.
 *
 * Three states the owner can leave the contracts in, and each is a different
 * sentence rather than a blank:
 *
 *   nothing listed      TheNest accepts no reward token, so nothing streams.
 *   listed, no targets  `convertAndStream` reverts `NoTargets`.
 *   a target unlisted   it was retired after being made a target, and EVERY
 *                       conversion reverts `TargetNotListed` until that is
 *                       fixed. A page that quietly omitted it would be reading
 *                       the chain and still lying.
 */
export function rewardSplitLine(r: RewardSplit | undefined): string {
  if (!r) return '—';
  if (r.listed.length === 0) return 'None listed yet — nothing streams';

  const listed = new Set(r.listed.map((t) => t.address.toLowerCase()));
  const orphaned = r.parts.filter((p) => !listed.has(p.address.toLowerCase()));

  if (r.parts.length === 0) {
    return `${r.listed.map((t) => t.symbol).join(', ')} — listed, but no split is set, so nothing converts yet`;
  }

  const weight = new Map(r.parts.map((p) => [p.address.toLowerCase(), p.weightBps]));
  const shares = r.listed.map((t) => {
    const bps = weight.get(t.address.toLowerCase());
    return bps === undefined ? `${t.symbol} (no share)` : `${t.symbol} ${formatBps(bps)}`;
  });

  return orphaned.length === 0 ? shares.join(', ')
    : `${shares.join(', ')} — and ${orphaned.length} target${orphaned.length === 1 ? ' is' : 's are'} no longer listed, so conversions revert`;
}

/**
 * "NVDA, SPY, SPCX and AAPL" — the listing, in prose.
 *
 * `null` rather than an em-dash when the read has not landed or the listing is
 * empty, because this one goes in a SENTENCE. A table can hold a dash; a
 * paragraph that says "— , split by weight" cannot. The caller picks a sentence
 * that does not need the names instead.
 *
 * The order is TheNest's own: `listedRewardTokens()` returns them in the order
 * they were added, and re-sorting would invent a ranking nothing on chain has.
 */
export function rewardTokenNames(r: RewardSplit | undefined): string | null {
  if (!r || r.listed.length === 0) return null;
  const names = r.listed.map((t) => t.symbol);
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
