// The perch, the nest, your birds, the flock.
import { C, M, doc, header, icon, bird } from './common.mjs';

const A = (n) => `avian-${String(n).padStart(2, '0')}.svg`;

// ─────────────────────────────────────────────────────────────── the perch

const POOL = [
  [214, 3], [219, 6], [231, 9], [244, 11], [258, 14], [263, 16],
  [277, 18], [281, 20], [296, 24], [303, 26], [317, 29], [322, 33],
];

export const Perch = doc({
  extraCss: `
    .page { padding: 36px 40px 44px; }
    .three { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 24px; align-items: start; margin-top: 32px; }
    .tiles { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 10px; }
    .tile { border: 1px solid ${C.slate}; background: ${C.nocturne}; padding: 6px; }
    .tile.on { border-color: ${C.teal}; outline: 1px solid ${C.teal}; }
    .tile img { width: 100%; height: auto; }
    .poolgrid { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 8px; }
    .bar { height: 10px; background: ${C.inkWarm}; border: 1px solid ${C.slate}; }
    .bar > i { display: block; height: 100%; background: ${C.tealMid}; }
  `,
  body: `${header('The Perch', 'connected')}
<div class="page">
  <p class="eyebrow">The perch</p>
  <h2>It never closes.</h2>
  <p class="lede" style="max-width:900px">It buys any bird for <span class="num">90,000 AVIANS</span>, sells the next one
    out of its own holdings for <span class="num">110,000</span>, and a bird you name for <span class="num">115,000</span>.
    Half of every fee is burned; half goes to the Treasury. The prices do not move with supply, demand or time.</p>

  <div class="three">
    <div class="panel">
      <div class="row"><h3>Sell a bird</h3><span class="spacer"></span><span class="num" style="color:${C.mossLight}">90,000</span></div>
      <p class="small dim" style="margin-top:6px">You receive 90,000 AVIANS each, instantly. The 10% fee is on the
        perch&rsquo;s side, not yours.</p>
      <div class="tiles" style="margin-top:18px">
        <span class="tile on"><img class="px" src="${A(2)}" alt=""></span>
        <span class="tile"><img class="px" src="${A(9)}" alt=""></span>
        <span class="tile on"><img class="px" src="${A(15)}" alt=""></span>
        <span class="tile"><img class="px" src="${A(21)}" alt=""></span>
        <span class="tile"><img class="px" src="${A(27)}" alt=""></span>
        <span class="tile"><img class="px" src="${A(30)}" alt=""></span>
      </div>
      <div class="row" style="margin-top:18px;padding-top:14px;border-top:1px solid ${C.slate}">
        <span class="small">2 selected</span><span class="spacer"></span>
        <span class="num" style="font-size:17px">180,000 AVIANS</span></div>
      <div class="note ok small" style="margin-top:12px">${icon('check', C.mossLight, 14)}
        <span>The perch is already approved for your birds.</span></div>
      <button class="btn wide" style="margin-top:16px">Sell 2 birds to the perch</button>
      <p class="tiny dim" style="margin-top:12px">Selling one bird? We send it in directly instead — same price, one
        transaction, no approval needed.</p>
    </div>

    <div class="panel">
      <div class="row"><h3>Buy the next bird</h3><span class="spacer"></span><span class="num" style="color:${C.amber}">110,000</span></div>
      <p class="small dim" style="margin-top:6px">The next bird is the lowest id the perch is holding. Not random, not
        the most recently sold.</p>
      <div style="margin-top:18px">${bird(A(3), 240)}</div>
      <div class="row" style="margin-top:12px">
        <span class="chalk" style="font-weight:600">Avian #214</span>
        <span class="spacer"></span><span class="tag">${icon('check', C.bone, 11)} IN THE PERCH</span></div>
      <p class="tiny dim" style="margin-top:6px">Nocturne · Kingfisher · Scholar · Crossbill · Scarf · Ramshorn</p>
      <div class="row" style="gap:10px;margin-top:18px">
        <span class="small dim">How many</span><span class="spacer"></span>
        <button class="btn ghost small" style="min-height:36px;padding:6px 10px">${icon('minus', C.chalk, 14)}</button>
        <span class="num" style="font-size:17px;min-width:24px;text-align:center">1</span>
        <button class="btn ghost small" style="min-height:36px;padding:6px 10px">${icon('plus', C.chalk, 14)}</button>
      </div>
      <div class="row" style="margin-top:16px;padding-top:14px;border-top:1px solid ${C.slate}">
        <span class="small">You pay</span><span class="spacer"></span>
        <span class="num" style="font-size:17px">110,000 AVIANS</span></div>
      <button class="btn wide" style="margin-top:16px">Buy Avian #214</button>
      <p class="tiny dim" style="margin-top:12px">Ask for two and you get #214 and #219 — the two lowest, in order. You
        see exactly which birds before you sign.</p>
    </div>

    <div class="panel">
      <div class="row"><h3>Buy a bird you name</h3><span class="spacer"></span><span class="num" style="color:${C.amber}">115,000</span></div>
      <p class="small dim" style="margin-top:6px">The extra 5,000 AVIANS is what picking costs. All or nothing: one bird
        gone from the pool and the whole purchase is refused.</p>
      <div class="row" style="gap:10px;margin-top:16px">
        <span class="tag">${M.poolSize} birds in the perch</span>
        <span class="tag">LOWEST ID 214</span></div>
      <div class="poolgrid" style="margin-top:14px">
        ${POOL.map(([id, art], i) => `<span class="tile${i === 5 ? ' on' : ''}" title="Avian #${id}">
          <img class="px" src="${A(art)}" alt=""><span class="mono tiny dim" style="display:block;text-align:center;margin-top:4px">#${id}</span></span>`).join('')}
      </div>
      <div class="row" style="margin-top:16px;padding-top:14px;border-top:1px solid ${C.slate}">
        <span class="small">Avian #263</span><span class="spacer"></span>
        <span class="num" style="font-size:17px">115,000 AVIANS</span></div>
      <button class="btn wide" style="margin-top:16px">Buy Avian #263</button>
      <div class="note warn small" style="margin-top:12px">${icon('warn', C.amber, 14)}
        <span>Approve 115,000 AVIANS to the perch first — it doesn&rsquo;t check your allowance before it pulls.</span></div>
    </div>
  </div>

  <div class="panel" style="margin-top:24px;display:grid;grid-template-columns:1fr 420px;gap:48px;align-items:center">
    <div>
      <p class="eyebrow" style="margin:0">The perch can always pay</p>
      <p class="small" style="margin-top:10px;max-width:760px">It must hold <span class="num">${M.backingRequired}
        AVIANS</span> to buy back every bird that isn&rsquo;t already in it. It holds
        <span class="num">${M.poolHolds} AVIANS</span>. The second is never less than the first — that is a property of
        the contract, proved in the test suite, not a promise from us.</p>
      <div class="bar" style="margin-top:16px"><i style="width:96.3%"></i></div>
      <div class="row" style="margin-top:8px">
        <span class="tiny dim">REQUIRED ${M.backingRequired}</span><span class="spacer"></span>
        <span class="tiny" style="color:${C.teal}">HELD ${M.poolHolds}</span></div>
    </div>
    <div class="inset">
      <p class="eyebrow" style="margin:0">Every fee, split</p>
      <div class="row" style="margin-top:12px"><span class="small">Burned</span><span class="spacer"></span>
        <span class="num">50%</span></div>
      <div class="row" style="margin-top:6px"><span class="small">To the Treasury</span><span class="spacer"></span>
        <span class="num">50%</span></div>
      <p class="tiny dim" style="margin-top:12px">Burned AVIANS leave the supply. Nobody can print them back.</p>
    </div>
  </div>
</div>`,
});

// ────────────────────────────────────────────────────────── the nest

const reward = (sym, name, amount, state) => {
  const bad = state === 'paused';
  return `<div style="padding:16px 0;border-top:1px solid ${C.slate}">
    <div class="row" style="gap:12px">
      <span class="tag" style="min-width:62px;justify-content:center">${sym}</span>
      <span class="small dim">${name}</span>
      <span class="spacer"></span>
      <span class="num" style="font-size:16px;${bad ? `color:${C.ash}` : ''}">${amount}</span>
      <button class="btn ${bad ? 'off' : 'ghost'} small">Claim</button>
    </div>
    ${bad ? `<div class="note bad small" style="margin-top:10px">${icon('warn', C.crimsonLight, 14)}
      <span>This reward token is not transferable right now. Your rewards are safe and can be claimed later — and your
      bird can still come home.</span></div>` : ''}
  </div>`;
};

export const Nest = doc({
  extraCss: `
    .page { padding: 36px 40px 44px; }
    .says { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; background: ${C.slate}; border: 1px solid ${C.slate}; margin-top: 28px; }
    .says > div { background: ${C.ink}; padding: 22px 24px; }
    .two { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 24px; margin-top: 28px; align-items: start; }
    .tiers { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
    .tier { border: 1px solid ${C.slate}; padding: 14px; background: ${C.inkWarm}; }
    .tier.on { border-color: ${C.teal}; background: rgba(67,196,188,0.08); outline: 1px solid ${C.teal}; }
    .staked { display: flex; gap: 12px; align-items: center; padding: 12px 0; border-top: 1px solid ${C.slate}; }
    .counters { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: ${C.slate}; border: 1px solid ${C.slate}; margin-top: 24px; }
    .counters > div { background: ${C.ink}; padding: 18px 20px; }
  `,
  body: `${header('The Nest', 'connected')}
<div class="page">
  <p class="eyebrow">The nest</p>
  <h2>Send a bird to be counted.</h2>
  <p class="lede" style="max-width:900px">Brooding is custodial: the bird moves to the staking contract and comes back
    when you unstake it. Three tiers, chosen per stay.</p>

  <div class="says">
    <div>
      <h4>The tier cost is burned. It does not come back.</h4>
      <p class="small">Not escrowed, not refunded, not returned when the bird comes home. It is destroyed — the AVIANS
        supply falls by exactly that amount. Brooding the same bird again at the same tier costs the same AVIANS again.</p>
    </div>
    <div>
      <h4>The weight is lost on unstake.</h4>
      <p class="small">A brooding bird&rsquo;s weight counts toward the stream while it is there and stops the moment it
        leaves. Rewards already accrued are yours and stay claimable forever. The weight is gone.</p>
    </div>
    <div>
      <h4>A brooding bird&rsquo;s satchel is controlled by the staking contract.</h4>
      <p class="small">For the whole stay you cannot use that bird&rsquo;s wallet, sign for it, or move anything it holds.
        Nothing is lost — everything is reachable again the moment the bird comes home, and not one second before.</p>
    </div>
  </div>

  <div class="two">
    <div class="panel">
      <h3>Send a bird to brood</h3>
      <p class="eyebrow" style="margin:20px 0 10px">Choose a tier</p>
      <div class="tiers">
        <div class="tier"><div class="num" style="font-size:15px">5,000</div>
          <div class="tiny dim" style="margin-top:4px">AVIANS, burned</div>
          <div style="margin-top:10px;font-weight:600;color:${C.chalk}">Tier 1 · 1x weight</div></div>
        <div class="tier on"><div class="num" style="font-size:15px">15,000</div>
          <div class="tiny dim" style="margin-top:4px">AVIANS, burned</div>
          <div style="margin-top:10px;font-weight:600;color:${C.chalk}">Tier 2 · 2x weight</div></div>
        <div class="tier"><div class="num" style="font-size:15px">25,000</div>
          <div class="tiny dim" style="margin-top:4px">AVIANS, burned</div>
          <div style="margin-top:10px;font-weight:600;color:${C.chalk}">Tier 3 · 3x weight</div></div>
      </div>

      <p class="eyebrow" style="margin:22px 0 10px">Choose birds</p>
      <div class="row" style="gap:10px">
        <span class="tile on" style="border:1px solid ${C.teal};outline:1px solid ${C.teal};padding:5px;background:${C.nocturne}">
          <img class="px" src="${A(21)}" width="86" height="86" alt=""></span>
        <span style="border:1px solid ${C.rust};padding:5px;background:${C.nocturne}">
          <img class="px" src="${A(27)}" width="86" height="86" alt=""></span>
        <span style="border:1px solid ${C.slate};padding:5px;background:${C.nocturne}">
          <img class="px" src="${A(30)}" width="86" height="86" alt=""></span>
        <span style="border:1px solid ${C.slate};padding:5px;background:${C.nocturne}">
          <img class="px" src="${A(9)}" width="86" height="86" alt=""></span>
      </div>

      <div class="box warn" style="margin-top:16px">
        <div class="note warn">${icon('warn', C.amber)}
          <span><strong class="chalk">Avian #1,204&rsquo;s satchel holds two birds.</strong>
            <span class="small">Brooding it locks them away until it comes home. Nothing is lost — but nothing inside is
            reachable either. <a href="#">Look inside first</a></span></span></div>
      </div>

      <div class="row" style="margin-top:18px;padding-top:14px;border-top:1px solid ${C.slate}">
        <span class="small">1 bird at Tier 2</span><span class="spacer"></span>
        <span class="num" style="font-size:17px">15,000 AVIANS</span></div>
      <div class="row"><span class="tiny dim">burned, not held</span><span class="spacer"></span>
        <span class="tiny dim">approved: 200,000 AVIANS</span></div>
      <button class="btn wide" style="margin-top:16px">${icon('burn', C.ink)} Send to the nest — burn 15,000 AVIANS</button>
    </div>

    <div>
      <div class="panel">
        <div class="row"><h3>Brooding now</h3><span class="spacer"></span>
          <span class="tag ok">YOUR WEIGHT ${M.yourWeight} / ${M.totalWeight}</span></div>
        <div class="staked" style="border-top:0">
          ${bird(A(6), 64)}
          <div><div class="chalk" style="font-weight:600">Avian #902</div>
            <div class="tiny dim">Tier 3 · 3x weight · brooding 14 days</div></div>
          <span class="spacer"></span><button class="btn ghost small">Bring home</button></div>
        <div class="staked">
          ${bird(A(12), 64)}
          <div><div class="chalk" style="font-weight:600">Avian #1,118</div>
            <div class="tiny dim">Tier 2 · 2x weight · brooding 6 days</div></div>
          <span class="spacer"></span><button class="btn ghost small">Bring home</button></div>
        <div class="staked">
          ${bird(A(18), 64)}
          <div><div class="chalk" style="font-weight:600">Avian #1,447</div>
            <div class="tiny dim">Tier 1 · 1x weight · brooding 2 days</div></div>
          <span class="spacer"></span><button class="btn ghost small">Bring home</button></div>
        <p class="tiny dim" style="margin-top:14px">Bringing a bird home never touches a reward token. Even if every
          listed token is frozen, the bird comes home.</p>
      </div>

      <div class="panel" style="margin-top:24px">
        <div class="row"><h3>Claimable</h3><span class="spacer"></span>
          <span class="tag hot">${icon('warn', C.amber, 11)} 1 OF 4 PAUSED</span></div>
        <p class="small dim" style="margin-top:6px">One transaction claims everything you have accrued. A token that
          will not move is skipped rather than blocking the others: the rest are still paid and its accrual stays
          exactly where it was. A paused token cannot pay while it is paused, so that one you have to come back for.</p>
        <button class="btn" style="width:100%;margin-top:14px">Claim all</button>
        <div style="margin-top:12px">
          ${reward('NVDA', 'tokenized stock product', '0.0412', 'ok')}
          ${reward('SPY', 'tokenized stock product', '0.1183', 'ok')}
          ${reward('SPCX', 'tokenized stock product', '0.0067', 'ok')}
          ${reward('AAPL', 'tokenized stock product', '0.0931', 'paused')}
          ${reward('TSLA', 'tokenized stock product · no longer streaming', '0.0274', 'ok')}
        </div>
        <p class="tiny dim" style="margin-top:14px">Shown truncated, never rounded up — a claim can never ask for more
          than exists.</p>
        <div class="box" style="margin-top:16px">
          <p class="eyebrow" style="margin:0 0 8px">Disclosure</p>
          <p class="tiny" style="margin:0;font-style:italic">NVDA, SPY, SPCX and AAPL are tokenized stock products issued
            and controlled by Robinhood — not stocks, shares, dividends or equity. Fine Avians Club has no relationship with
            Robinhood, NVIDIA, SpaceX, Apple or S&amp;P. The stream can be zero: it depends on income arriving, on pools
            other people provide, and on an issuer we don&rsquo;t control. Your bird comes home either way. TSLA is the
            same kind of product, no longer streamed but still claimable by anyone owed in it.</p>
        </div>
      </div>
    </div>
  </div>

  <div class="counters">
    <div><div class="num" style="font-size:22px">${M.totalStaked}</div><div class="tiny dim" style="margin-top:4px">BIRDS BROODING RIGHT NOW</div></div>
    <div><div class="num" style="font-size:22px">${M.totalWeight}</div><div class="tiny dim" style="margin-top:4px">TOTAL WEIGHT</div></div>
    <div><div class="num" style="font-size:22px">${M.totalBurned}</div><div class="tiny dim" style="margin-top:4px">AVIANS BURNED BY TIERS, EVER</div></div>
    <div><div class="num" style="font-size:22px">4</div><div class="tiny dim" style="margin-top:4px">REWARD TOKENS LISTED</div></div>
  </div>
</div>`,
});

// ────────────────────────────────────────────────────────────── your birds

const owned = (id, art, traits, where) => `<div class="card">
  ${bird(art, 168)}
  <div style="padding:12px 14px 14px">
    <div class="row"><span class="chalk" style="font-weight:600">Avian #${id}</span><span class="spacer"></span>${where}</div>
    <p class="tiny dim" style="margin-top:6px;line-height:1.45">${traits}</p>
    <div class="row" style="gap:8px;margin-top:12px">
      <button class="btn ghost small" style="min-height:34px;padding:7px 11px">Brood</button>
      <button class="btn ghost small" style="min-height:34px;padding:7px 11px">Sell 90,000</button>
      <button class="btn ghost small" style="min-height:34px;padding:7px 11px">Transfer</button>
    </div>
  </div>
</div>`;

export const YourBirds = doc({
  extraCss: `
    .page { padding: 36px 40px 44px; }
    .split { display: grid; grid-template-columns: minmax(0,1fr) 420px; gap: 32px; align-items: start; margin-top: 28px; }
    .cards { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 16px; }
    .card { border: 1px solid ${C.slate}; background: ${C.nocturne}; }
    .card img { width: 100%; height: auto; }
    .hold { display: flex; gap: 10px; align-items: center; padding: 10px 0; border-top: 1px solid ${C.slate}; }
    .field { display: flex; border: 1px solid ${C.steel}; background: ${C.inkWarm}; }
    .field input { flex: 1; background: transparent; border: 0; color: ${C.chalk}; padding: 13px 14px;
      font-family: "JetBrains Mono", monospace; font-size: 13px; outline: none; }
  `,
  body: `${header('My Birds', 'connected')}
<div class="page">
  <div class="row" style="gap:16px">
    <div><p class="eyebrow">Your birds</p><h2>Five in the wallet, three in the nest.</h2></div>
    <span class="spacer"></span>
    <span class="wchip">${M.walletShort}</span>
  </div>

  <div class="split">
    <div>
      <div class="cards">
        ${owned('1,204', A(21), 'Duskline · Kingfisher · Foxfire · Hooktip · Bandolier · Corsair', `<span class="tag hot">${icon('wallet', C.amber, 11)} SATCHEL: 2 BIRDS</span>`)}
        ${owned('1,377', A(27), 'Kiln · Vesper · Aviators · Upsweep · Chain · Drover', '<span class="tag">IN YOUR WALLET</span>')}
        ${owned('1,562', A(30), 'Chevron · Lichen · Monocle · Notchbill · Scarf · Sovereign', '<span class="tag">IN YOUR WALLET</span>')}
        ${owned('1,588', A(9), 'Tessera · Emberdown · Wink · Grosbeak · Cravat · Warcrest', '<span class="tag">IN YOUR WALLET</span>')}
      </div>

      <div class="row" style="margin-top:28px;gap:12px">
        <h3 style="font-size:18px">In the nest</h3>
        <span class="tag ok">WEIGHT ${M.yourWeight}</span></div>
      <div class="cards" style="margin-top:14px">
        ${owned('902', A(6), 'Bunting · Kingfisher · Drowse · Hooktip · Cravat · Knife', `<span class="tag ok">TIER 3</span>`)}
        ${owned('1,118', A(12), 'Meridian · Mosswing · Mirrorshade · Needlepoint · Cravat · Aureole', `<span class="tag ok">TIER 2</span>`)}
        ${owned('1,447', A(18), 'Downpour · Tidewater · Sidelong · Songgape · Amulet · Beanie', `<span class="tag ok">TIER 1</span>`)}
      </div>
    </div>

    <div>
      <div class="panel">
        <div class="row"><h3 style="font-size:20px">The satchel</h3><span class="spacer"></span>
          <span class="tag">AVIAN #1,204</span></div>
        <p class="small dim" style="margin-top:8px">Every bird has its own wallet from the moment it is minted. Whoever
          holds the bird controls it.</p>
        <div class="inset" style="margin-top:14px;padding:12px 14px">
          <div class="row"><span class="tiny dim">ADDRESS</span><span class="spacer"></span>
            <span class="tag ok">DEPLOYED</span></div>
          <p class="mono" style="margin-top:6px;word-break:break-all;color:${C.chalk}">0x9e11A4f7c3B08D62e5a4104fC9b7D21e0384c02</p>
        </div>
        <p class="eyebrow" style="margin:18px 0 0">It is holding</p>
        <div class="hold">${bird(A(33), 44)}<span class="small chalk">Avian #3,090</span>
          <span class="spacer"></span><span class="tiny dim">a bird</span></div>
        <div class="hold">${bird(A(35), 44)}<span class="small chalk">Avian #4,411</span>
          <span class="spacer"></span><span class="tiny dim">a bird</span></div>
        <div class="hold"><span class="tag" style="min-width:44px;justify-content:center">NVDA</span>
          <span class="small chalk num">12.4088</span><span class="spacer"></span><span class="tiny dim">a token</span></div>
        <div class="hold"><span class="tag" style="min-width:44px;justify-content:center">ETH</span>
          <span class="small chalk num">0.0310</span><span class="spacer"></span><span class="tiny dim">gas</span></div>
        <div class="box warn" style="margin-top:16px">
          <div class="note warn">${icon('warn', C.amber)}
            <span class="small">Brooding this bird locks both birds inside it until it comes home.</span></div>
        </div>
      </div>

      <div class="panel" style="margin-top:24px">
        <h3 style="font-size:20px">Send Avian #1,204</h3>
        <p class="eyebrow" style="margin:16px 0 8px">To</p>
        <div class="field"><input value="0x4d0aE9c31F8b207e6C5a19bD3e08fA742c6b91" readonly>
          <button class="btn small" style="border-left:1px solid ${C.steel}">Check</button></div>
        <div class="note ok small" style="margin-top:12px">${icon('check', C.mossLight, 14)}
          <span>Checked. That address is not a bird&rsquo;s satchel, and nothing in your ownership tree leads back to
            this bird.</span></div>
        <button class="btn wide" style="margin-top:16px">Send the bird</button>
        <p class="tiny dim" style="margin-top:12px">We walk the destination&rsquo;s ownership upward before every send. A
          bird that ends up inside its own ownership loop can never be moved again, and the chain can only catch the
          simplest version of that.</p>
      </div>
    </div>
  </div>
</div>`,
});

// ─────────────────────────────────────────────────────────────── the flock

const FREQ = [
  ['Aureole', 12, 6], ['Wildfire', 31, 16], ['Sovereign', 44, 23], ['Knife', 58, 30],
  ['Warcrest', 71, 37], ['Ramshorn', 86, 45], ['Seedling', 97, 50], ['Spark', 112, 58],
  ['Stovepipe', 128, 66], ['Crest', 141, 73], ['Drover', 155, 80], ['Corsair', 168, 87],
];

export const Flock = doc({
  extraCss: `
    .page { padding: 36px 40px 44px; }
    .filters { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; padding: 16px 0;
      border-top: 1px solid ${C.slate}; border-bottom: 1px solid ${C.slate}; margin-top: 24px; }
    .sel { display: inline-flex; align-items: center; gap: 8px; border: 1px solid ${C.steel};
      padding: 9px 12px; font-size: 13px; color: ${C.chalk}; background: ${C.inkWarm}; min-height: 40px; }
    .sel.on { border-color: ${C.teal}; color: ${C.teal}; }
    .gallery { display: grid; grid-template-columns: repeat(6, minmax(0,1fr)); gap: 16px; margin-top: 24px; }
    .g { border: 1px solid ${C.slate}; background: ${C.nocturne}; }
    .g img { width: 100%; height: auto; }
    .split { display: grid; grid-template-columns: minmax(0,1fr) 400px; gap: 32px; align-items: start; }
    .freq { display: grid; grid-template-columns: 110px 1fr 44px; gap: 8px 12px; align-items: center; }
    .fbar { height: 8px; background: ${C.inkWarm}; border: 1px solid ${C.slate}; }
    .fbar > i { display: block; height: 100%; background: ${C.violet}; }
  `,
  body: `${header('The Flock', 'connected')}
<div class="page">
  <div class="row" style="gap:20px;align-items:flex-end">
    <div><p class="eyebrow">The flock</p><h2>1,632 composed. 3,923 still to come.</h2></div>
    <span class="spacer"></span>
    <p class="small dim" style="max-width:380px;text-align:right;margin:0">1,866,240 combinations are possible. Every one
      nobody chooses stays unchosen forever.</p>
  </div>

  <div class="filters">
    <span class="tiny dim" style="letter-spacing:.14em">FILTER</span>
    ${['Background', 'Plumage', 'Eyes', 'Beak', 'Neckwear'].map((c) => `<span class="sel">${c} ${icon('chev', C.ash, 13)}</span>`).join('')}
    <span class="sel on">Headwear: Aureole ${icon('cross', C.teal, 13)}</span>
    <span class="spacer"></span>
    <span class="sel">${icon('check', C.ash, 13)} In the perch</span>
    <span class="sel">${icon('check', C.ash, 13)} Brooding</span>
    <span class="sel">Lowest id first ${icon('chev', C.ash, 13)}</span>
  </div>

  <div class="split" style="margin-top:24px">
    <div>
      <div class="gallery" style="margin-top:0">
        ${[[1, 214], [2, 219], [3, 231], [4, 244], [5, 258], [7, 263],
      [8, 277], [10, 281], [11, 296], [13, 303], [14, 317], [16, 322],
      [17, 341], [19, 358], [20, 372], [22, 389], [23, 402], [24, 418]]
      .map(([art, id], i) => `<div class="g">
          <img class="px" src="${A(art)}" alt="">
          <div style="padding:8px 10px 10px">
            <div class="row"><span class="mono" style="color:${C.chalk}">#${id.toLocaleString()}</span>
              <span class="spacer"></span>
              ${i === 2 ? `<span class="tag" style="font-size:9px;padding:2px 5px">PERCH</span>`
        : i === 7 ? `<span class="tag ok" style="font-size:9px;padding:2px 5px">NEST</span>` : ''}</div>
          </div></div>`).join('')}
      </div>
      <div class="row" style="justify-content:center;margin-top:24px">
        <button class="btn ghost small">Load the next 60 ${icon('chev', C.chalk, 14)}</button></div>
    </div>

    <div class="panel">
      <h3 style="font-size:20px">Rare because few people chose it</h3>
      <p class="small dim" style="margin-top:8px">There are no caps on any trait. This chart is written by the flock,
        live, and we find out at the same time you do.</p>
      <p class="eyebrow" style="margin:20px 0 12px">Headwear, of 1,632 composed</p>
      <div class="freq">
        ${FREQ.map(([n, count, pct]) => `<span class="small">${n}</span>
          <span class="fbar"><i style="width:${pct}%"></i></span>
          <span class="num tiny" style="text-align:right">${count}</span>`).join('')}
      </div>
      <p class="tiny dim" style="margin-top:16px">Four more headwear traits have not been chosen by anyone yet.</p>
    </div>
  </div>
</div>`,
});
