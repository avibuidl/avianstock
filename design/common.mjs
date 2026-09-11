// Shared chrome for the Fine Avians Club design canvas.
//
// The palette is Nightjar (art/palettes/nightjar.json) and nothing outside it
// is used. Type is Bricolage Grotesque / Inter / JetBrains Mono, per
// logo/final/README.md. The mark and every bird are the real assets.

export const C = {
  ink: '#06050C', inkWarm: '#161125', nocturne: '#241E3A', slate: '#363050',
  steel: '#4E4870', ash: '#7A7498', bone: '#C4C0D8', chalk: '#F2F0FA',
  tealDark: '#0F4C58', tealMid: '#1C8A94', teal: '#43C4BC', tealPale: '#93E8DC',
  rust: '#C05A22', amber: '#F5AC3E', straw: '#FBD98A',
  crimsonDark: '#7A1633', crimson: '#B32A4E', crimsonLight: '#DE5E77',
  mossDark: '#2C4A22', moss: '#4E7A34', mossLight: '#86B94E',
  violet: '#9B78DC', azure: '#4C9CE8', rose: '#E068C4', gold: '#F0C64C', signal: '#35E4BE',
};

/** The one mock world every artboard shares. Canon numbers are canon. */
export const M = {
  minted: 1632, maxSupply: 5555,
  freeClaimed: 1204, freeAllocation: 2000, freeLeft: 796,
  paidMinted: 428, paidRemaining: 3127,
  price: '100,000', sell: '90,000', buyNext: '110,000', buyNamed: '115,000',
  wallet: '0x8F3C4b2e9A7d15C0f8B36eA2d904C71bE5A19D',
  walletShort: '0x8F3C…A19D',
  avians: '412,500',
  poolSize: 37, lowestId: 214, secondId: 219,
  backingRequired: '143,550,000', poolHolds: '149,112,400',
  totalStaked: 611, totalWeight: '4,182', yourWeight: 6,
  totalBurned: '8,415,000',
  root: '0x9c4f2ab8e70d1e5c3f8a01d64b2e9c7a5f30e18b4d6c92af1305be74c821ab',
};

export const FONTS =
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
  '  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?' +
  'family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&' +
  'family=Inter:wght@400;500;600;700&' +
  'family=JetBrains+Mono:wght@400;500;700&display=swap">';

export const CSS = `
    *, *::before, *::after { box-sizing: border-box; }
    body {
      margin: 0; background: ${C.ink}; color: ${C.bone};
      font-family: Inter, "Helvetica Neue", Arial, sans-serif;
      font-size: 16px; line-height: 1.6; -webkit-font-smoothing: antialiased;
    }
    a { color: ${C.teal}; text-decoration: none; }
    a:hover { color: ${C.tealPale}; text-decoration: underline; }
    img { display: block; }
    .px { image-rendering: pixelated; }

    /* ---- type ------------------------------------------------------ */
    .display, h1, h2, h3, h4 {
      font-family: "Bricolage Grotesque", "Helvetica Neue", Arial, sans-serif;
      color: ${C.chalk}; margin: 0; font-weight: 700; letter-spacing: -0.02em;
    }
    h1 { font-size: 76px; line-height: 0.94; font-weight: 800; letter-spacing: -0.035em; }
    h2 { font-size: 40px; line-height: 1.06; }
    h3 { font-size: 24px; line-height: 1.2; }
    h4 { font-size: 17px; line-height: 1.3; letter-spacing: -0.01em; }
    .eyebrow {
      font-family: Inter, sans-serif; font-size: 11px; font-weight: 600;
      letter-spacing: 0.16em; text-transform: uppercase; color: ${C.ash};
      margin: 0 0 12px;
    }
    .lede { font-size: 19px; line-height: 1.55; color: ${C.bone}; margin: 16px 0 0; }
    p { margin: 12px 0 0; }
    .small { font-size: 13px; line-height: 1.5; }
    .tiny { font-size: 11.5px; line-height: 1.45; }
    .dim { color: ${C.ash}; }
    .chalk { color: ${C.chalk}; }
    .mono { font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 13px; letter-spacing: -0.01em; }
    .num { font-family: "JetBrains Mono", ui-monospace, monospace; font-variant-numeric: tabular-nums; color: ${C.chalk}; }

    /* ---- surfaces --------------------------------------------------- */
    .panel { background: ${C.nocturne}; border: 1px solid ${C.slate}; padding: 24px; }
    .inset { background: ${C.inkWarm}; border: 1px solid ${C.slate}; padding: 20px; }
    .band  { background: ${C.inkWarm}; border-top: 1px solid ${C.slate}; border-bottom: 1px solid ${C.slate}; }
    .rule  { height: 1px; background: ${C.slate}; border: 0; margin: 0; }
    .stack { display: flex; flex-direction: column; }
    .row   { display: flex; align-items: center; }

    /* ---- controls --------------------------------------------------- */
    .btn {
      font-family: Inter, sans-serif; font-size: 14px; font-weight: 600; letter-spacing: 0.01em;
      padding: 14px 24px; border: 1px solid ${C.teal}; background: ${C.teal}; color: ${C.ink};
      display: inline-flex; align-items: center; gap: 10px; min-height: 48px; cursor: pointer;
    }
    .btn.ghost { background: transparent; border-color: ${C.steel}; color: ${C.chalk}; }
    .btn.small { padding: 9px 14px; min-height: 40px; font-size: 13px; }
    .btn.wide  { width: 100%; justify-content: center; }
    .btn.off   { background: transparent; border-color: ${C.slate}; color: ${C.steel}; cursor: not-allowed; }
    .btn.focus { outline: 2px solid ${C.teal}; outline-offset: 2px; }
    .btn.danger{ background: transparent; border-color: ${C.crimson}; color: ${C.crimsonLight}; }

    /* ---- status ----------------------------------------------------- */
    .note { display: flex; gap: 10px; align-items: flex-start; font-size: 14px; line-height: 1.5; }
    .note svg { flex: none; margin-top: 2px; }
    .note.ok   { color: ${C.mossLight}; }
    .note.warn { color: ${C.amber}; }
    .note.bad  { color: ${C.crimsonLight}; }
    .note.info { color: ${C.bone}; }
    .box { border: 1px solid ${C.slate}; padding: 16px 18px; }
    .box.ok   { border-color: ${C.moss}; background: rgba(78,122,52,0.10); }
    .box.warn { border-color: ${C.rust}; background: rgba(192,90,34,0.10); }
    .box.bad  { border-color: ${C.crimson}; background: rgba(179,42,78,0.12); }
    .tag {
      font-family: "JetBrains Mono", monospace; font-size: 10.5px; letter-spacing: 0.06em;
      text-transform: uppercase; padding: 3px 7px; border: 1px solid ${C.steel}; color: ${C.bone};
      display: inline-flex; align-items: center; gap: 5px;
    }
    .tag.ok  { border-color: ${C.moss}; color: ${C.mossLight}; }
    .tag.bad { border-color: ${C.crimson}; color: ${C.crimsonLight}; }
    .tag.hot { border-color: ${C.rust}; color: ${C.amber}; }
    .numbox { display:inline-flex; align-items:center; justify-content:center; width:20px; height:20px;
      border:1px solid ${C.teal}; color:${C.teal}; font-family:"JetBrains Mono", monospace; font-size:11px;
      flex:none; line-height:1; }
    .numbox.big { width:38px; height:38px; font-size:17px; }

    /* ---- header ----------------------------------------------------- */
    .site {
      display: flex; align-items: center; gap: 32px; height: 72px; padding: 0 40px;
      border-bottom: 1px solid ${C.slate}; background: ${C.ink};
    }
    .brand { display: flex; align-items: center; gap: 12px; }
    .wordmark {
      font-family: "Bricolage Grotesque", sans-serif; font-weight: 800; font-size: 20px;
      letter-spacing: -0.02em; color: ${C.chalk};
    }
    .site nav { display: flex; gap: 26px; font-size: 14px; }
    .site nav a { color: ${C.bone}; }
    .site nav a.on { color: ${C.chalk}; box-shadow: inset 0 -2px 0 ${C.teal}; padding-bottom: 3px; }
    .spacer { flex: 1 1 auto; }
    .wchip {
      display: flex; align-items: center; gap: 9px; border: 1px solid ${C.steel};
      padding: 9px 13px; font-family: "JetBrains Mono", monospace; font-size: 12.5px; color: ${C.chalk};
    }
    .dot { width: 7px; height: 7px; background: ${C.mossLight}; flex: none; }
    .dot.bad { background: ${C.crimsonLight}; }

    /* ---- art -------------------------------------------------------- */
    .frame { border: 1px solid ${C.slate}; background: ${C.nocturne}; padding: 0; display: block; }
    .sw {
      width: 56px; height: 56px; background: ${C.inkWarm}; border: 1px solid ${C.slate};
      display: block; position: relative; padding: 0;
    }
    .sw img { width: 100%; height: 100%; }
    .sw.on { border-color: ${C.teal}; outline: 1px solid ${C.teal}; }
    .sw.gone { opacity: 0.34; }
    .strip { display: flex; flex-wrap: wrap; gap: 8px; }
    .avian { border: 1px solid ${C.slate}; background: ${C.nocturne}; }
    .avian img { width: 100%; height: auto; }

    /* ---- layout ----------------------------------------------------- */
    .page { padding: 40px; }
    .grid { display: grid; gap: 24px; }
    .kv { display: grid; grid-template-columns: 96px 1fr; gap: 4px 12px; font-size: 13px; }
    .kv dt { color: ${C.ash}; font-family: Inter, sans-serif; }
    .kv dd { margin: 0; font-family: "JetBrains Mono", monospace; color: ${C.chalk}; }
`;

/** 16px stroke icons. No emoji anywhere. */
export function icon(name, color = 'currentColor', size = 16) {
  const o = `xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="square"`;
  const d = {
    check: '<path d="M3 8.5l3.2 3.2L13 4.8"/>',
    cross: '<path d="M4 4l8 8M12 4l-8 8"/>',
    warn: '<path d="M8 2.5L14.5 13.5H1.5z"/><path d="M8 6.5v3.2M8 11.6v.1"/>',
    lock: '<rect x="3" y="7" width="10" height="6.5"/><path d="M5.5 7V5a2.5 2.5 0 015 0v2"/>',
    arrow: '<path d="M2.5 8h10M9 4.5L12.5 8 9 11.5"/>',
    ext: '<path d="M9 2.5h4.5V7"/><path d="M13.5 2.5L7 9"/><path d="M11.5 9.5v3.5a.5.5 0 01-.5.5H3a.5.5 0 01-.5-.5V5a.5.5 0 01.5-.5h3.5"/>',
    clock: '<circle cx="8" cy="8" r="6"/><path d="M8 4.5V8l2.5 1.6"/>',
    refresh: '<path d="M13.5 8a5.5 5.5 0 11-1.7-4"/><path d="M13.5 1.6V4.4h-2.8"/>',
    minus: '<path d="M3 8h10"/>',
    plus: '<path d="M8 3v10M3 8h10"/>',
    chev: '<path d="M4 6l4 4 4-4"/>',
    wallet: '<rect x="2" y="4" width="12" height="9"/><path d="M2 6.5h12M11 9.5h1.5"/>',
    burn: '<path d="M8 2.5S4.5 6 4.5 9a3.5 3.5 0 007 0c0-1.4-1-2.6-1-2.6S9.5 8 8.6 8c0-2-0.6-4-0.6-5.5z"/>',
    dots: '<circle cx="3.5" cy="8" r="1"/><circle cx="8" cy="8" r="1"/><circle cx="12.5" cy="8" r="1"/>',
  }[name];
  return `<svg ${o}>${d}</svg>`;
}

/** The .dc.html envelope. */
export function doc({ body, extraCss = '' }) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  ${FONTS}
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <style>${CSS}${extraCss}
  </style>
</helmet>
${body}
</x-dc>
</body>
</html>
`;
}

// The order and casing the app ships. "My Birds" needs a wallet, so it is
// dropped from the boards that show a disconnected or wrong-network one.
export const NAV = ['Compose', 'The Flock', 'The Perch', 'My Birds', 'The Nest', 'Contracts', 'Docs'];

/** The site header. `wallet`: 'connected' | 'wrong' | 'none' | 'connecting'. */
export function header(active = 'Compose', wallet = 'connected', extraNav = []) {
  const chip = {
    connected: `<div class="wchip"><span class="dot"></span>${M.walletShort}<span class="dim" style="font-family:Inter;font-size:11.5px">Robinhood Chain</span></div>`,
    wrong: `<div class="wchip" style="border-color:${C.crimson}"><span class="dot bad"></span>${M.walletShort}<span style="font-family:Inter;font-size:11.5px;color:${C.crimsonLight}">Ethereum Mainnet</span></div>`,
    none: `<button class="btn small">${icon('wallet', C.ink)} Connect wallet</button>`,
    connecting: `<div class="wchip">${icon('dots', C.ash)} Waiting for your wallet…</div>`,
  }[wallet];
  const items = [...NAV.filter((n) => n !== 'My Birds' || wallet === 'connected'), ...extraNav]
    .map((n) => `<a href="#"${n === active ? ' class="on"' : ''}>${n}</a>`).join('');
  return `<header class="site">
  <div class="brand"><img class="px" src="mark.svg" width="32" height="32" alt="Fine Avians Club"><span class="wordmark">Fine Avians Club</span></div>
  <nav>${items}</nav>
  <div class="spacer"></div>
  ${chip}
</header>`;
}

/** A trait swatch. */
export function sw(cat, i, state = '') {
  const f = `sw-${cat}-${String(i).padStart(2, '0')}.svg`;
  return `<span class="sw ${state}"><img class="px" src="${f}" alt=""></span>`;
}

/** A bird at an integer pixel size. */
export function bird(file, size, cls = '') {
  return `<span class="avian ${cls}" style="width:${size}px;height:${size}px;display:block"><img class="px" src="${file}" width="${size}" height="${size}" alt=""></span>`;
}

export const CATS = [
  { key: 'bg', label: 'Background', n: 12 },
  { key: 'pl', label: 'Plumage', n: 12 },
  { key: 'ey', label: 'Eyes', n: 15 },
  { key: 'bk', label: 'Beak', n: 9 },
  { key: 'nk', label: 'Neckwear', n: 6 },
  { key: 'hw', label: 'Headwear', n: 16 },
];

export const NAMES = {
  bg: ['Nocturne', 'Duskline', 'Meridian', 'Tessera', 'Lattice', 'Quarry', 'Bunting', 'Chevron', 'Kiln', 'Downpour', 'Fanfare', 'Solstice'],
  pl: ['Ashling', 'Frostcap', 'Cardinal', 'Rosefinch', 'Kingfisher', 'Tidewater', 'Amethyst', 'Vesper', 'Mosswing', 'Lichen', 'Emberdown', 'Kestrel'],
  ey: ['Wideawake', 'Drowse', 'Sidelong', 'Doleful', 'Thunderbrow', 'Wink', 'Sunglasses', 'Bandit', 'Rosy Shades', 'Aviators', 'Mirrorshade', 'Anaglyph', 'Scholar', 'Monocle', 'Foxfire'],
  bk: ['Seedcracker', 'Hooktip', 'Grosbeak', 'Needlepoint', 'Upsweep', 'Spoonbill', 'Notchbill', 'Songgape', 'Crossbill'],
  nk: ['Bare Throat', 'Scarf', 'Cravat', 'Bandolier', 'Chain', 'Amulet'],
  hw: ['Bare', 'Wool Cap', 'Dockhand', 'Beanie', 'Corsair', 'Drover', 'Stovepipe', 'Crest', 'Knife', 'Spark', 'Warcrest', 'Ramshorn', 'Seedling', 'Sovereign', 'Wildfire', 'Aureole'],
};

/** The packed uint48 the register keys on. */
export function combo({ bg, pl, ey, bk, nk, hw }) {
  const v = BigInt(bg) | (BigInt(pl) << 8n) | (BigInt(ey) << 16n)
    | (BigInt(bk) << 24n) | (BigInt(nk) << 32n) | (BigInt(hw) << 40n);
  return '0x' + v.toString(16).toUpperCase().padStart(12, '0');
}

/** The six picker rows. `sel` is {bg, pl, ...}; `taken` marks one swatch gone. */
export function pickers(sel, { taken = null, compact = false } = {}) {
  return CATS.map((c, ci) => {
    const chosen = sel[c.key];
    const swatches = Array.from({ length: c.n }, (_, i) => {
      let state = i === chosen ? 'on' : '';
      if (taken && taken.cat === c.key && taken.i === i) state = 'gone';
      return sw(c.key, i, state);
    }).join('');
    const badge = taken && taken.cat === c.key
      ? `<span class="tag bad" style="margin-left:8px">${icon('cross', C.crimsonLight, 11)} 1 taken</span>` : '';
    return `<div class="picker">
      <div class="row" style="gap:10px;margin-bottom:10px">
        <span class="numbox">${ci + 1}</span>
        <span style="font-size:14px;font-weight:600;color:${C.chalk}">${c.label}</span>
        <span class="dim tiny">${c.n} to choose from</span>
        <span class="spacer"></span>
        <span class="mono" style="color:${C.teal}">${NAMES[c.key][chosen]}</span>${badge}
      </div>
      <div class="strip">${swatches}</div>
    </div>`;
  }).join(compact ? '' : '\n');
}
