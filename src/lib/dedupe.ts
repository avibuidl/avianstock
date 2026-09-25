// One row per currency.
//
// The admin Treasury panel lists native ETH, AVIAN, and every reward token the
// Nest lists. AVIAN has been a listed reward token since 2026-09-18, so a list
// built as `[native, AVIAN, ...listed]` carried it twice, and the panel drew
// two AVIAN rows: the Treasury's own and a second one at zero. The first entry
// for an address wins, so the order the caller puts them in is the order that
// decides which row stays. Addresses compare case-insensitively: the manifest's
// are checksummed and a contract's may not be.

export function firstByAddress<T>(items: readonly T[], addressOf: (t: T) => string | null): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    const key = addressOf(it)?.toLowerCase() ?? 'native';
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}
