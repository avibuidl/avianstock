// The project's places off this site (2026-09-25), for the footer's row of
// marks. One entry per place, in the row's order. An entry with a URL is a
// live link; one with `url: null` is drawn in its place but inert, titled
// "Soon", so the row has its final shape before every place exists. Wiring
// one is filling in its URL, and nothing else changes.

export type Elsewhere = {
  /** The mark to draw, from the icon set. */
  id: 'x' | 'opensea' | 'dexscreener' | 'github';
  /** Its accessible name and title while live. */
  label: string;
  url: string | null;
};

export const ELSEWHERE: readonly Elsewhere[] = [
  { id: 'x', label: 'Avian Stock on X', url: 'https://x.com/AvianStock' },
  { id: 'opensea', label: 'Avian Stock on OpenSea', url: null },
  { id: 'dexscreener', label: 'AVIAN on DEX Screener', url: null },
  { id: 'github', label: 'Avian Stock on GitHub', url: null },
];
