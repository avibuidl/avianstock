// Stroke icons on a 16px grid, one consistent style. Never an emoji: colour
// never carries meaning alone here, so these travel with every status.

export type IconName =
  | 'check' | 'cross' | 'warn' | 'lock' | 'arrow' | 'ext' | 'clock' | 'refresh'
  | 'minus' | 'plus' | 'chev' | 'wallet' | 'burn' | 'dots' | 'copy' | 'info'
  | 'nest' | 'home' | 'search' | 'sliders';

const PATHS: Record<IconName, string> = {
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
  sliders: 'M2.5 4.5h11M2.5 11.5h11M6 2.5v4M10.5 9.5v4',
};

export function Icon({
  name, size = 16, color = 'currentColor', strokeWidth = 1.5,
}: { name: IconName; size?: number; color?: string; strokeWidth?: number }) {
  return (
    <svg
      className="icon"
      width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color}
      strokeWidth={strokeWidth} strokeLinecap="square" aria-hidden="true" focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
