import type { RewardSplit } from '../mock/types';

// Every amount on this site is 18 decimals of base units behind the scenes,
// and nobody should ever see a raw base-unit figure. BigInt end to end, a
// formatter at the edge. `Number` never touches an amount — it loses precision
// above 2^53, and 100,000 AVIAN is 10^23.

export const WAD = 10n ** 18n;

/** Whole AVIAN, with thousands separators. 100000e18 -> "100,000". */
export function formatAvians(v: bigint): string {
  return group((v / WAD).toString());
}

/** The unit always travels with the amount: a bare number invites a dollar reading. */
export function avians(v: bigint): string {
  return `${formatAvians(v)} AVIAN`;
}

/**
 * A reward balance. Truncated, NEVER rounded up — round up and someone clicks
 * claim for more than exists.
 */
export function formatReward(v: bigint, decimals: number, places = 4): string {
  const unit = 10n ** BigInt(decimals);
  const whole = v / unit;
  const frac = ((v % unit) * 10n ** BigInt(places)) / unit;   // truncating division
  // A non-zero amount must never read as zero. The first hour of a stream on
  // launch day is a few millionths of a token — "0.0000 unsettled" beside "has
  // rewards accrued" is a contradiction on screen (seen on the dry run). When
  // the requested places truncate everything away, widen to the first four
  // significant digits, up to the token's own precision.
  if (v > 0n && whole === 0n && frac === 0n && places < decimals) {
    let wide = places;
    while (wide < decimals && ((v % unit) * 10n ** BigInt(wide)) / unit < 1000n) wide += 1;
    const wideFrac = ((v % unit) * 10n ** BigInt(wide)) / unit;
    return `0.${wideFrac.toString().padStart(wide, '0')}`;
  }
  return `${group(whole.toString())}.${frac.toString().padStart(places, '0')}`;
}

export function formatEth(v: bigint, places = 4): string {
  return formatReward(v, 18, places);
}

/**
 * A price, to at most `sig` significant figures. Truncated, never rounded, and
 * never through `Number`: 0.0859638 ETH -> "0.085963", 11.6328 -> "11.632",
 * 123456 -> "123,456". The ticker's numbers are these.
 */
export function formatPrice(v: bigint, decimals = 18, sig = 5): string {
  if (v <= 0n) return '0';
  const unit = 10n ** BigInt(decimals);
  const whole = v / unit;
  if (whole > 0n) {
    const places = Math.max(0, sig - whole.toString().length); /* count */
    if (places === 0) return group(whole.toString());
    const frac = ((v % unit) * 10n ** BigInt(places)) / unit;
    return `${group(whole.toString())}.${frac.toString().padStart(places, '0')}`;
  }
  // Below one: skip the leading zeros, then take `sig` digits, within the
  // token's own precision.
  let lead = 0; /* count */
  while (lead < decimals && (v * 10n ** BigInt(lead + 1)) / unit === 0n) lead += 1;
  const places = Math.min(decimals, lead + sig); /* count */
  const frac = (v * 10n ** BigInt(places)) / unit;
  return `0.${frac.toString().padStart(places, '0')}`;
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

/** 9000 -> "90%", 1396 -> "13.96%" trimmed to one place when it is not round. */
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

/** "3d 4h" / "4h 12m" / "12m" / "under a minute" — a countdown in two units, for the rotation line. */
export function formatDaysHours(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d >= 1) return `${d}d ${h}h`;
  if (h >= 1) return `${h}h ${m}m`;
  if (m >= 1) return `${m}m`;
  return 'under a minute';
}

/** "40 s" / "3 minutes" / "2 hours" — how long ago a read landed, for a stale panel's title. */
export function formatAgo(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return s < 60 ? `${s} s` : formatSince(s);
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
export function rewardSplitLine(r: RewardSplit | undefined, avians?: string): string {
  if (!r) return 'not read yet';
  if (r.listed.length === 0) return 'None listed yet; nothing streams';

  const listed = new Set(r.listed.map((t) => t.address.toLowerCase()));
  const orphaned = r.parts.filter((p) => !listed.has(p.address.toLowerCase()));

  if (r.parts.length === 0) {
    return `${r.listed.map((t) => t.symbol).join(', ')}: listed, but no split is set, so nothing converts yet`;
  }

  const weight = new Map(r.parts.map((p) => [p.address.toLowerCase(), p.weightBps]));
  const shares = r.listed.map((t) => {
    const bps = weight.get(t.address.toLowerCase());
    // AVIAN is listed since 2026-09-18 but is no conversion target: the Roost
    // delivers it. "No share" would read as a fault; it is the design.
    if (bps === undefined && avians && t.address.toLowerCase() === avians.toLowerCase()) return `${t.symbol} from the Roost`;
    return bps === undefined ? `${t.symbol} (no share)` : `${t.symbol} ${formatBps(bps)}`;
  });

  return orphaned.length === 0 ? shares.join(', ')
    : `${shares.join(', ')}; ${orphaned.length} target${orphaned.length === 1 ? ' is' : 's are'} no longer listed, so conversions revert`;
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

// ── the flywheel snapshot's figures (2026-09-22) ─────────────────────────
//
// BigInt end to end, like everything above: `Number` never touches an amount.

/**
 * An amount for a tile: K above ten thousand, M above a million, with up to
 * `places` decimals and the trailing zeros trimmed; below ten thousand, the
 * whole part with separators and `wholePlaces` decimals (the same by
 * default), and B above a billion so the original supply is "1B" and not
 * "1,000M". 999,850,000 -> "999.85M", 850,000 -> "850K", 8,800 -> "8,800",
 * 37.86 -> "37.86". Truncated, never rounded up, so a figure never claims
 * more than exists.
 */
export function formatCompact(v: bigint, decimals = 18, places = 2, wholePlaces = places): string {
  const unit = 10n ** BigInt(decimals);
  const scaled = (n: bigint, suffix: string, p: number) => {
    const whole = n / unit;
    const frac = ((n % unit) * 10n ** BigInt(p)) / unit;
    const f = frac.toString().padStart(p, '0').replace(/0+$/, '');
    return `${group(whole.toString())}${f ? '.' + f : ''}${suffix}`;
  };
  if (v >= unit * 1_000_000_000n) return scaled(v / 1_000_000_000n, 'B', places);
  if (v >= unit * 1_000_000n) return scaled(v / 1_000_000n, 'M', places);
  if (v >= unit * 10_000n) return scaled(v / 1_000n, 'K', places);
  return scaled(v, '', wholePlaces);
}

/** A price's trailing zeros, gone: "0.004400" -> "0.0044", "11.49" -> "11.49", "123,456" -> "123,456". */
function trimZeros(s: string): string {
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
}

/** ETH to four significant figures, truncated: 0.0044 ETH, 11.49 ETH, 499.9 ETH. */
export function formatEthSig(v: bigint): string {
  return `${trimZeros(formatPrice(v, 18, 4))} ETH`;
}

/**
 * A dollar total: to the nearest dollar below ten thousand, K and M above,
 * "$5,120", "$46.44K", "$1.39M". Never "$0" for a non-zero amount below a
 * dollar: that reads "less than $1".
 */
export function formatUsd(usd: bigint): string {
  if (usd > 0n && usd < WAD) return 'less than $1';
  return `$${formatCompact(usd, 18, 2, 0)}`;
}

/** A dollar unit price, to four significant figures: "$0.001391", "$2,782". */
export function formatUsdPrice(usd: bigint): string {
  return `$${trimZeros(formatPrice(usd, 18, 4))}`;
}

/** An ETH value in dollars, both 18 decimals: the one place a dollar figure is derived. */
export function usdOf(ethValue: bigint, usdPerEth: bigint): bigint {
  return (ethValue * usdPerEth) / WAD;
}

/** `part` as a share of `whole`, to two places, trimmed: "0.02%", "15%". "0%" for nothing. */
export function formatShare(part: bigint, whole: bigint): string {
  if (whole <= 0n || part <= 0n) return '0%';
  const bps = (part * 10_000n) / whole;
  const wholePct = bps / 100n;
  const frac = (bps % 100n).toString().padStart(2, '0').replace(/0+$/, '');
  return `${group(wholePct.toString())}${frac ? '.' + frac : ''}%`;
}

/**
 * "today", or "September 24" in the reader's own zone, with the year only
 * when it is not this one. For the owner's seat: when he was last heard from,
 * and when the council may act alone.
 */
export function formatDay(t: number, now: number): string {
  const d = new Date(t * 1000);
  const n = new Date(now * 1000);
  if (d.toDateString() === n.toDateString()) return 'today';
  return d.toLocaleDateString(undefined, {
    month: 'long', day: 'numeric',
    ...(d.getFullYear() === n.getFullYear() ? {} : { year: 'numeric' }),
  });
}

/**
 * "2 days 4 hours", "5 hours 12 minutes", "12 minutes", "under a minute":
 * a wait in words, two units at most. The price band's council half, where a
 * change's countdown is read in passing rather than watched.
 */
export function formatWait(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3_600);
  const m = Math.floor((s % 3_600) / 60);
  const u = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  if (d >= 1) return h ? `${u(d, 'day')} ${u(h, 'hour')}` : u(d, 'day');
  if (h >= 1) return m ? `${u(h, 'hour')} ${u(m, 'minute')}` : u(h, 'hour');
  if (m >= 1) return u(m, 'minute');
  return 'under a minute';
}
