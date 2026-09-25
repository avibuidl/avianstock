// Stroke icons on a 16px grid, one consistent style. Never an emoji: colour
// never carries meaning alone here, so these travel with every status.

export type IconName =
  | 'check' | 'cross' | 'warn' | 'lock' | 'arrow' | 'ext' | 'clock' | 'refresh'
  | 'minus' | 'plus' | 'chev' | 'wallet' | 'burn' | 'dots' | 'copy' | 'info'
  | 'nest' | 'home' | 'search' | 'sliders' | 'menu' | 'swap' | 'cycle'
  // The footer's marks (2026-09-25): the project's places off this site, drawn
  // in the same stroke on the same grid rather than as images.
  | 'x' | 'opensea' | 'dexscreener' | 'github';

/** The brands' own marks, drawn filled rather than stroked; see BRANDS below. */
type BrandName = 'opensea' | 'dexscreener' | 'github';

const PATHS: Record<Exclude<IconName, BrandName>, string> = {
  check: 'M3 8.5l3.2 3.2L13 4.8',
  cross: 'M4 4l8 8M12 4l-8 8',
  warn: 'M8 2.5L14.5 13.5H1.5zM8 6.5v3.2M8 11.6v.1',
  lock: 'M3 7h10v6.5H3zM5.5 7V5a2.5 2.5 0 015 0v2',
  arrow: 'M2.5 8h10M9 4.5L12.5 8 9 11.5',
  ext: 'M9 2.5h4.5V7M13.5 2.5L7 9M11.5 9.5v3.5a.5.5 0 01-.5.5H3a.5.5 0 01-.5-.5V5a.5.5 0 01.5-.5h3.5',
  clock: 'M8 2a6 6 0 100 12A6 6 0 008 2zM8 4.5V8l2.5 1.6',
  refresh: 'M13.5 8a5.5 5.5 0 11-1.7-4M13.5 1.6V4.4h-2.8',
  minus: 'M3 8h10',
  plus: 'M8 3v10M3 8h10',
  chev: 'M4 6l4 4 4-4',
  wallet: 'M2 4h12v9H2zM2 6.5h12M11 9.5h1.5',
  burn: 'M8 2.5S4.5 6 4.5 9a3.5 3.5 0 007 0c0-1.4-1-2.6-1-2.6S9.5 8 8.6 8c0-2-.6-4-.6-5.5z',
  dots: 'M3.5 8h.01M8 8h.01M12.5 8h.01',
  copy: 'M5.5 5.5h8v8h-8zM2.5 10.5v-8h8',
  info: 'M8 2a6 6 0 100 12A6 6 0 008 2zM8 7v4M8 4.8v.1',
  nest: 'M2 9.5c1.6-2 4-3 6-3s4.4 1 6 3M3.5 12.5h9M5 6.5l1.5-3M11 6.5L9.5 3.5',
  home: 'M2.5 7.5L8 3l5.5 4.5M4 7v6.5h8V7',
  search: 'M7.2 12.4a5.2 5.2 0 100-10.4 5.2 5.2 0 000 10.4zM11 11l3 3',
  // Three upright tracks, each with its knob at a different height: a mixer's
  // sliders, drawn upright so they cannot be read as the swap's two arrows.
  // The phone's menu button: the two bars the Owner icon used to be.
  menu: 'M2.5 4.5h11M2.5 11.5h11M6 2.5v4M10.5 9.5v4',
  sliders: 'M4 2.5v11M8 2.5v11M12 2.5v11M2.5 10h3M6.5 5.5h3M10.5 8.5h3',
  // Two parallel arrows, opposite ways: a trade, both directions.
  swap: 'M2.5 5h10.5M10.5 2.5L13 5l-2.5 2.5M13.5 11H3M5.5 8.5L3 11l2.5 2.5',
  // The Flywheel: two arcs of one circle, each ending in its arrowhead, so
  // they chase each other round. The Perch's refresh is one arc and one head.
  cycle: 'M2.6 7A5.5 5.5 0 0 1 12 4.1M13.4 9A5.5 5.5 0 0 1 4 11.9M12.4 1.6v2.9H9.5M3.6 14.4v-2.9h2.9',
  // X: the long stroke as an outlined bar, the short one crossing it.
  x: 'M2.5 2.5h3l8 11h-3zM13 2.5L9.2 6.9M6.8 9.1L3 13.5',
};

/**
 * THE BRANDS' OWN MARKS (2026-09-25), for the footer. Each is the brand's own
 * artwork as one filled path on its source's grid, not a drawing of ours, and
 * `box` is the viewBox that sizes it OPTICALLY against the X mark beside it:
 * the X's strokes span about 12.5 of a 16px square, so a round mark is set
 * to about 13 and the tall eagle to 13 high. Filled in `currentColor`, so
 * the footer's tones apply unchanged.
 */
const BRANDS: Record<BrandName, { d: string; box: string; evenodd?: boolean }> = {
  // OpenSea. Source: https://cdn.jsdelivr.net/npm/simple-icons@16.32.0/icons/opensea.svg (Simple Icons, CC0), fetched 2026-09-25.
  opensea: { box: '-2.77 -2.77 29.54 29.54', d: 'M12 0C5.374 0 0 5.374 0 12s5.374 12 12 12 12-5.374 12-12S18.629 0 12 0ZM5.92 12.403l.051-.081 3.123-4.884a.107.107 0 0 1 .187.014c.52 1.169.972 2.623.76 3.528-.088.372-.335.876-.614 1.342a2.405 2.405 0 0 1-.117.199.106.106 0 0 1-.09.045H6.013a.106.106 0 0 1-.091-.163zm13.914 1.68a.109.109 0 0 1-.065.101c-.243.103-1.07.485-1.414.962-.878 1.222-1.548 2.97-3.048 2.97H9.053a4.019 4.019 0 0 1-4.013-4.028v-.072c0-.058.048-.106.108-.106h3.485c.07 0 .12.063.115.132-.026.226.017.459.125.67.206.42.636.682 1.099.682h1.726v-1.347H9.99a.11.11 0 0 1-.089-.173l.063-.09c.16-.231.391-.586.621-.992.156-.274.308-.566.43-.86.024-.052.043-.107.065-.16.033-.094.067-.182.091-.269a4.57 4.57 0 0 0 .065-.223c.057-.25.081-.514.081-.787 0-.108-.004-.221-.014-.327-.005-.117-.02-.235-.034-.352a3.415 3.415 0 0 0-.048-.312 6.494 6.494 0 0 0-.098-.468l-.014-.06c-.03-.108-.056-.21-.09-.317a11.824 11.824 0 0 0-.328-.972 5.212 5.212 0 0 0-.142-.355c-.072-.178-.146-.339-.213-.49a3.564 3.564 0 0 1-.094-.197 4.658 4.658 0 0 0-.103-.213c-.024-.053-.053-.104-.072-.152l-.211-.388c-.029-.053.019-.118.077-.101l1.32.357h.01l.173.05.192.054.07.019v-.783c0-.379.302-.686.679-.686a.66.66 0 0 1 .477.202.69.69 0 0 1 .2.484V6.65l.141.039c.01.005.022.01.031.017.034.024.084.062.147.11.05.038.103.086.165.137a10.351 10.351 0 0 1 .574.504c.214.199.454.432.684.691.065.074.127.146.192.226.062.079.132.156.19.232.079.104.16.212.235.324.033.053.074.108.105.161.096.142.178.288.257.435.034.067.067.141.096.213.089.197.159.396.202.598a.65.65 0 0 1 .029.132v.01c.014.057.019.12.024.184a2.057 2.057 0 0 1-.106.874c-.031.084-.06.17-.098.254-.075.17-.161.343-.264.502-.034.06-.075.122-.113.182-.043.063-.089.123-.127.18a3.89 3.89 0 0 1-.173.221c-.053.072-.106.144-.166.209-.081.098-.16.19-.245.278-.048.058-.1.118-.156.17-.052.06-.108.113-.156.161-.084.084-.15.147-.208.202l-.137.122a.102.102 0 0 1-.072.03h-1.051v1.346h1.322c.295 0 .576-.104.804-.298.077-.067.415-.36.816-.802a.094.094 0 0 1 .05-.03l3.65-1.057a.108.108 0 0 1 .138.103z' },
  // DEX Screener. Source: https://docs.dexscreener.com (its own icon-512x512.png, the eagle), traced to one even-odd path 2026-09-25; it is not in Simple Icons and publishes no SVG.
  dexscreener: { box: '-1.08 -1.08 26.16 26.16', evenodd: true, d: 'M11.53 1.36L10.5 1.5L9.14 1.92L8.02 2.53L7.45 2.95L7.17 3.28L7.08 3.28L6.84 3.56L6.09 3.33L5.63 3L5.16 2.48L5.39 3.14L5.95 4.03L6.52 4.64L6.52 4.73L7.69 5.91L7.78 5.91L8.06 6.23L8.16 6.23L9.23 7.13L10.78 8.02L11.2 7.73L11.67 7.59L12.56 7.64L13.27 8.02L15 6.98L15.98 6.14L16.08 6.14L17.34 4.92L17.34 4.83L17.67 4.55L18.42 3.52L18.89 2.58L18.84 2.48L18.56 2.86L17.86 3.38L17.2 3.56L16.08 2.58L14.53 1.78L12.98 1.41ZM18.28 5.25L17.77 5.95L17.53 6.14L17.53 6.23L17.11 6.61L17.11 6.8L17.3 7.08L17.48 7.73L17.48 8.48L17.11 9.38L16.64 9.84L16.08 10.17L15.42 10.36L14.77 10.41L14.86 10.78L14.86 11.44L16.45 12.33L16.73 12.56L17.02 12.66L17.16 12.84L15.14 13.92L14.81 14.2L14.25 14.95L13.31 16.97L12.05 21.19L11.95 21.14L10.78 17.16L10.31 15.98L9.75 14.91L8.95 13.97L6.84 12.8L9.14 11.48L9.23 10.41L8.58 10.36L8.06 10.22L7.27 9.75L6.89 9.33L6.61 8.72L6.52 8.06L6.61 7.45L6.94 6.66L6.19 5.86L5.91 5.39L5.72 5.3L5.11 6.7L4.83 8.02L4.78 12.66L4.55 14.53L3.89 16.97L3.09 18.75L5.44 16.83L5.58 16.83L7.22 19.59L7.31 19.59L9.09 17.91L12 22.64L14.91 17.91L15.05 17.95L15.75 18.7L15.84 18.7L16.55 19.45L16.78 19.59L17.67 18.09L17.86 17.91L18.05 17.48L18.23 17.3L18.42 16.88L18.56 16.83L20.95 18.75L20.2 17.16L19.5 14.63L19.22 12.05L19.17 7.78L18.75 6.23ZM7.88 7.5L7.73 7.78L7.73 8.39L7.83 8.63L8.16 8.95L8.53 9.14L9 9.23L9.61 9.19L10.13 9L10.13 8.91L9.19 8.44ZM16.17 7.5L15.14 8.25L13.88 8.95L14.11 9.09L14.72 9.23L15.33 9.19L15.8 9L16.13 8.72L16.31 8.34L16.31 7.83ZM11.95 8.72L11.39 8.91L10.78 9.52L10.41 10.45L10.31 12.09L9.23 12.8L9.84 13.17L10.45 13.78L10.88 14.39L11.44 15.56L11.95 17.25L12.05 17.34L12.42 16.03L13.13 14.44L13.78 13.55L14.81 12.75L13.83 12.23L13.69 12L13.64 10.55L13.45 9.89L13.22 9.47L12.56 8.86Z' },
  // GitHub. Source: https://cdn.jsdelivr.net/npm/simple-icons@16.32.0/icons/github.svg (Simple Icons, CC0), fetched 2026-09-25.
  github: { box: '-2.77 -2.77 29.54 29.54', d: 'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12' },
};

export function Icon({
  name, size = 16, color = 'currentColor', strokeWidth = 1.5,
}: { name: IconName; size?: number; color?: string; strokeWidth?: number }) {
  if (name in BRANDS) {
    const b = BRANDS[name as BrandName];
    return (
      <svg className="icon" width={size} height={size} viewBox={b.box} fill={color} aria-hidden="true" focusable="false">
        <path d={b.d} fillRule={b.evenodd ? 'evenodd' : undefined} />
      </svg>
    );
  }
  return (
    <svg
      className="icon"
      width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color}
      strokeWidth={strokeWidth} strokeLinecap="square" aria-hidden="true" focusable="false"
    >
      <path d={PATHS[name as Exclude<IconName, BrandName>]} />
    </svg>
  );
}
