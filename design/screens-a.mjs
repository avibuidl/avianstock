// Landing + the composer, in its four states.
import { C, M, doc, header, icon, sw, bird, pickers, combo, NAMES } from './common.mjs';

const SEL = { bg: 1, pl: 4, ey: 14, bk: 1, nk: 3, hw: 4 };
const SEL_TAKEN = { ...SEL, hw: 15 };
const SEL_FREE = { bg: 11, pl: 10, ey: 12, bk: 7, nk: 1, hw: 12 };

const chosenList = (sel) => `<dl class="kv" style="margin:0">
        <dt>Background</dt><dd>${NAMES.bg[sel.bg]}</dd>
        <dt>Plumage</dt><dd>${NAMES.pl[sel.pl]}</dd>
        <dt>Eyes</dt><dd>${NAMES.ey[sel.ey]}</dd>
        <dt>Beak</dt><dd>${NAMES.bk[sel.bk]}</dd>
        <dt>Neckwear</dt><dd>${NAMES.nk[sel.nk]}</dd>
        <dt>Headwear</dt><dd>${NAMES.hw[sel.hw]}</dd>
      </dl>`;

const registerKey = (sel) => `<div class="row" style="gap:8px;margin-top:16px;padding-top:14px;border-top:1px solid ${C.slate}">
        <span class="tiny dim">REGISTER KEY</span><span class="spacer"></span>
        <span class="mono" style="color:${C.bone}">${combo(sel)}</span>
      </div>`;

// ───────────────────────────────────────────────────────────── landing

export const Main = doc({
  extraCss: `
    .hero { display: grid; grid-template-columns: minmax(0,1fr) 480px; gap: 64px; padding: 76px 64px 68px; align-items: start; }
    .stats { display: grid; grid-template-columns: repeat(3, 1fr); border: 1px solid ${C.slate}; margin-top: 44px; }
    .stats > div { padding: 18px 20px; border-right: 1px solid ${C.slate}; }
    .stats > div:last-child { border-right: 0; }
    .sec { padding: 72px 64px; }
    .four { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: ${C.slate}; border: 1px solid ${C.slate}; }
    .four > div { background: ${C.ink}; padding: 28px 26px 32px; }
    .steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
    .step { border-top: 2px solid ${C.teal}; padding-top: 18px; }
    .receipts { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: ${C.slate}; border: 1px solid ${C.slate}; margin-top: 32px; }
    .receipts > div { background: ${C.ink}; padding: 22px 24px; }
    table.nums { width: 100%; border-collapse: collapse; margin-top: 28px; }
    table.nums td { border-bottom: 1px solid ${C.slate}; padding: 13px 8px; font-size: 15px; vertical-align: baseline; }
    table.nums td:last-child { text-align: right; font-family: "JetBrains Mono", monospace; color: ${C.chalk}; font-size: 14px; }
    .faq { border-top: 1px solid ${C.slate}; padding: 26px 0; display: grid; grid-template-columns: 380px 1fr; gap: 48px; }
    .flockband { display: flex; gap: 8px; justify-content: center; }
  `,
  body: `${header('Compose', 'none')}

<section class="hero">
  <div>
    <p class="eyebrow">5,555 composed pixel birds · Robinhood Chain</p>
    <h1>Pick your own<br>damn bird.</h1>
    <p class="lede" style="max-width:600px">5,555 pixel birds you compose yourself — six choices, no reveal, and a chain
      that refuses to let anyone mint your combination twice. Stored on-chain, all 12,872 bytes of it.</p>
    <div class="row" style="gap:24px;margin-top:36px">
      <button class="btn">Compose your Avian ${icon('arrow', C.ink)}</button>
      <span class="small"><a href="#">See the flock</a> <span class="dim">·</span> <a href="#">Read how the perch works</a></span>
    </div>
    <div class="stats">
      <div><div class="num" style="font-size:24px">${M.minted.toLocaleString()} <span class="dim" style="font-size:15px">/ 5,555</span></div><div class="tiny dim" style="margin-top:4px">COMPOSED SO FAR</div></div>
      <div><div class="num" style="font-size:24px">${M.freeLeft}</div><div class="tiny dim" style="margin-top:4px">FREE BIRDS LEFT ON THE LIST</div></div>
      <div><div class="num" style="font-size:24px">100,000 <span class="dim" style="font-size:15px">AVIANS</span></div><div class="tiny dim" style="margin-top:4px">TO COMPOSE ONE</div></div>
    </div>
  </div>

  <div class="panel" style="padding:20px">
    <div class="row" style="gap:8px;margin-bottom:14px">
      <span class="tag ok">${icon('check', C.mossLight, 11)} AVAILABLE</span>
      <span class="spacer"></span><span class="tiny dim">LIVE PREVIEW · NOT MINTED</span>
    </div>
    ${bird('bird-hero.svg', 440)}
    <div style="margin-top:18px">
      <div class="row" style="gap:10px;margin-bottom:10px">
        <span class="numbox">6</span>
        <span style="font-size:14px;font-weight:600;color:${C.chalk}">Headwear</span>
        <span class="spacer"></span><span class="mono" style="color:${C.teal}">Crest</span>
      </div>
      <div class="strip">
        ${sw('hw', 5)}${sw('hw', 6)}${sw('hw', 7, 'on')}
        <span class="sw" style="outline:2px solid ${C.teal};outline-offset:2px"><img class="px" src="sw-hw-08.svg" alt=""></span>
        ${sw('hw', 9)}${sw('hw', 10)}${sw('hw', 11)}
      </div>
      <p class="tiny dim" style="margin-top:12px">Six choices. Change any one of them and the bird changes with it.</p>
    </div>
  </div>
</section>

<section class="band sec">
  <h2 style="max-width:780px">You&rsquo;ve had this evening before.</h2>
  <p class="lede" style="max-width:760px">You mint. You wait. A machine hands you a bird wearing a hat you would never
    have picked, and you say &ldquo;gm&rdquo; and set it as your avatar anyway. Later you find out the art was a link on
    somebody&rsquo;s server, the proceeds are in a wallet you can&rsquo;t see, and the &ldquo;rewards&rdquo; are a token the
    team makes for free.</p>
  <p class="lede" style="max-width:760px;color:${C.chalk}">You don&rsquo;t have to do that again.</p>
</section>

<section class="sec">
  <h2>Four things that are true here<br>and rare everywhere else.</h2>
  <div class="four" style="margin-top:40px">
    <div>
      <div class="numbox big">1</div>
      <h4 style="margin-top:14px">You choose all six.</h4>
      <p class="small">Background, plumage, eyes, beak, neckwear, headwear. Seventy traits over one locked owlish base.
        No roll, no reveal, no waiting for an image to load.</p>
    </div>
    <div>
      <div class="numbox big">2</div>
      <h4 style="margin-top:14px">Nobody can ever have yours.</h4>
      <p class="small">Your combination goes into the chain&rsquo;s own register. 1,866,240 birds are possible. 5,555 will
        be minted. A repeat is refused on-chain, permanently.</p>
    </div>
    <div>
      <div class="numbox big">3</div>
      <h4 style="margin-top:14px">Nothing is rare because we said so.</h4>
      <p class="small">There are no caps on any trait. Whatever turns out rare is rare because few people chose it — and
        we find out at the same time you do.</p>
    </div>
    <div>
      <div class="numbox big">4</div>
      <h4 style="margin-top:14px">There&rsquo;s always a buyer.</h4>
      <p class="small">The perch buys any bird back for 90,000 AVIANS, and its ability to pay is a proven property of the
        contract, not a promise from us.</p>
      <p class="tiny dim" style="font-style:italic">That&rsquo;s a quantity of tokens, not a dollar amount — AVIANS trades
        at whatever the market says.</p>
    </div>
  </div>
</section>

<section class="band sec">
  <h2 style="max-width:940px">You&rsquo;ve already made a personality out of a bird you didn&rsquo;t choose.
    You shouldn&rsquo;t have to do it again.</h2>
  <p class="lede" style="max-width:820px">Fine Avians Club was built by someone who kept asking why the person paying for the
    bird doesn&rsquo;t get to pick the bird. Everything below exists to answer that question and then get out of your way.</p>
  <p class="eyebrow" style="margin-top:44px">The receipts</p>
  <div class="receipts">
    <div><div class="note ok">${icon('check', C.mossLight)}<span><strong class="chalk">All on-chain.</strong>
      <span class="small">The whole collection is 12,872 bytes on one contract. There is no link to break, because there is no link.</span></span></div></div>
    <div><div class="note ok">${icon('check', C.mossLight)}<span><strong class="chalk">Your money never touches us.</strong>
      <span class="small">A paid mint&rsquo;s 100,000 AVIANS goes to the buy-back perch in the same transaction. We can&rsquo;t hold it and we can&rsquo;t redirect it.</span></span></div></div>
    <div><div class="note ok">${icon('check', C.mossLight)}<span><strong class="chalk">Nobody can print AVIANS.</strong>
      <span class="small">1,000,000,000, minted once. No mint function, no pause, no blacklist, no tax, no upgrade — and no owner at all.</span></span></div></div>
    <div><div class="note warn">${icon('warn', C.amber)}<span><strong class="chalk">Tested, not audited.</strong>
      <span class="small">Hundreds of tests, invariants proven able to fail, adversarial review after every build phase, fork tests against the live chain — and no paid third-party audit. We&rsquo;d rather say that than let you assume otherwise.</span></span></div></div>
  </div>
</section>

<section class="sec">
  <h2>Three steps. That&rsquo;s the whole thing.</h2>
  <div class="steps" style="margin-top:40px">
    <div class="step"><div class="eyebrow" style="color:${C.teal};display:flex;align-items:center;gap:8px"><span class="numbox">1</span> GET AVIANS</div>
      <p class="small">On the pool, once the opening window has run.</p></div>
    <div class="step"><div class="eyebrow" style="color:${C.teal};display:flex;align-items:center;gap:8px"><span class="numbox">2</span> COMPOSE YOUR BIRD</div>
      <p class="small">One pick in each of six categories. Combinations already taken are greyed out, so you can&rsquo;t
        waste a transaction on a bird that exists.</p></div>
    <div class="step"><div class="eyebrow" style="color:${C.teal};display:flex;align-items:center;gap:8px"><span class="numbox">3</span> MINT IT</div>
      <p class="small">It&rsquo;s yours, it has its own wallet, and the perch will buy it back for 90,000 AVIANS whenever
        you want.</p></div>
  </div>
  <div style="margin-top:40px"><button class="btn">Compose your Avian ${icon('arrow', C.ink)}</button></div>

  <div class="panel" style="margin-top:56px;padding:32px">
    <h3>Want it to brood?</h3>
    <div class="steps" style="margin-top:24px">
      <div class="step"><div class="eyebrow" style="color:${C.teal};display:flex;align-items:center;gap:8px"><span class="numbox">1</span> STAKE AT A TIER</div>
        <p class="small">5,000, 15,000 or 25,000 AVIANS, burned, for one, two or three shares of weight.</p></div>
      <div class="step"><div class="eyebrow" style="color:${C.teal};display:flex;align-items:center;gap:8px"><span class="numbox">2</span> WAIT FOR THE FLYWHEEL TO TURN</div>
        <p class="small">Pool fees and royalties reach the Treasury, and anyone at all can trigger the conversion.</p></div>
      <div class="step"><div class="eyebrow" style="color:${C.teal};display:flex;align-items:center;gap:8px"><span class="numbox">3</span> CLAIM YOUR SHARE</div>
        <p class="small">NVDA, SPY, SPCX and AAPL, split by weight.</p></div>
    </div>
    <div class="box" style="margin-top:26px">
      <p class="eyebrow" style="margin:0 0 8px">Disclosure</p>
      <p class="small" style="margin:0;font-style:italic">These are tokenized stock products issued and controlled by
        Robinhood — not stocks, shares, dividends or equity. Fine Avians Club has no relationship with Robinhood, NVIDIA,
        SpaceX, Apple or S&amp;P. The stream can be zero: it depends on income arriving, on pools other people provide,
        and on an issuer we don&rsquo;t control. Your bird comes home either way.</p>
    </div>
  </div>
</section>

<section class="band sec">
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:64px">
    <div>
      <h2>Why &ldquo;you choose&rdquo;<br>was the hard part</h2>
      <p class="lede">Letting people pick is easy. Guaranteeing nobody picks the same thing is not. The moment a mint is
        chosen rather than rolled, the chain has to keep a register — and refuse, in the same transaction, any
        combination that already exists. That refusal is the whole product. It&rsquo;s why there&rsquo;s no reveal, no
        waiting and no chance you and a stranger end up with the same bird in different wallets.</p>
    </div>
    <div style="padding-top:12px">
      <p class="lede">Everything else follows from it. Seventy traits over one locked base. One light, from the upper
        left, on every bird ever made. A palette called Nightjar, forty-eight colours deep, drawn for birds that are
        awake when the markets are shut. And a perch that will always take a bird back, so that changing your mind costs
        you a transaction rather than a search for a buyer.</p>
      <p style="margin-top:28px"><a href="#" class="small">Read how the perch works ${icon('arrow', C.teal, 13)}</a></p>
    </div>
  </div>
</section>

<section class="sec">
  <h2>The numbers, all of them</h2>
  <table class="nums">
    <tr><td>Birds that will ever exist</td><td>5,555</td></tr>
    <tr><td>Free birds, one per allowlisted wallet</td><td>2,000</td></tr>
    <tr><td>Paid birds</td><td>3,555 + any free birds released unclaimed</td></tr>
    <tr><td>Price of a bird</td><td>100,000 AVIANS — never ETH</td></tr>
    <tr><td>Can the price change?</td><td>Raised, yes. Never below 100,000 AVIANS</td></tr>
    <tr><td>The perch buys any bird for</td><td>90,000 AVIANS, instantly, always</td></tr>
    <tr><td>The perch sells the next bird for</td><td>110,000 AVIANS — or 115,000 for a specific one</td></tr>
    <tr><td>Perch fees</td><td>50% burned, 50% to the Treasury</td></tr>
    <tr><td>Brooding tiers (burned)</td><td>5,000 / 15,000 / 25,000 AVIANS for 1x / 2x / 3x weight</td></tr>
    <tr><td>Reward tokens</td><td>NVDA, SPY, SPCX, AAPL, equal parts</td></tr>
    <tr><td>AVIANS supply</td><td>1,000,000,000, minted once, no owner</td></tr>
    <tr><td>In the launch pool</td><td>800,000,000 AVIANS, single-sided</td></tr>
    <tr><td>Opening window</td><td>5 minutes; buy fee 25% → ~1%; max 50,000,000 AVIANS per transaction</td></tr>
    <tr><td>Pool fee afterwards</td><td>1% of the ETH side, both directions, forever</td></tr>
    <tr><td>Liquidity lock</td><td>365 days minimum, extendable, never shortenable</td></tr>
    <tr><td>Royalty</td><td>5%, to the Treasury</td></tr>
    <tr><td>Art</td><td>32 × 32, 48 colours, 70 traits, 6 categories, 100% on-chain</td></tr>
    <tr><td>Possible combinations</td><td>1,866,240</td></tr>
  </table>
  <p class="eyebrow" style="margin-top:40px">Where the money goes, in one line each</p>
  <div class="grid" style="grid-template-columns:repeat(3,1fr);gap:1px;background:${C.slate};border:1px solid ${C.slate}">
    <div style="background:${C.ink};padding:20px"><p class="small" style="margin:0">A paid mint&rsquo;s 100,000 AVIANS → the perch, same transaction, never us.</p></div>
    <div style="background:${C.ink};padding:20px"><p class="small" style="margin:0">Pool fees and royalties → the Treasury → converted to stock tokens for the nest, with the admin capped at 5% of what comes in.</p></div>
    <div style="background:${C.ink};padding:20px"><p class="small" style="margin:0">Brooding tiers → burned, gone from the supply entirely.</p></div>
  </div>
</section>

<section class="band sec">
  <h2>The honest answers</h2>
  <div style="margin-top:36px">
    <div class="faq"><h4>Is 90,000 AVIANS a floor price?</h4>
      <p class="small" style="margin:0">It&rsquo;s a standing offer in <em>tokens</em>, not in dollars or ETH. The perch
        will always buy your bird for 90,000 AVIANS — that part is a proven property of the contract. What those 90,000
        AVIANS are worth is whatever the market says, and it can be anything. We will never tell you what a bird will be
        worth, because we don&rsquo;t know and neither does anyone else.</p></div>
    <div class="faq"><h4>Are the rewards stocks?</h4>
      <p class="small" style="margin:0">No. NVDA, SPY, SPCX and AAPL here are <strong class="chalk">tokenized stock
        products issued and controlled by Robinhood</strong>. They are not stocks, shares, dividends or equity, and
        holding them isn&rsquo;t ownership in any company. Robinhood can pause them or freeze an address, including ours.
        We have no relationship with Robinhood, NVIDIA, SpaceX, Apple or S&amp;P — we&rsquo;re a third party building on
        a public chain.</p></div>
    <div class="faq"><h4>Has this been audited?</h4>
      <p class="small" style="margin:0">No paid third-party audit. What it has: hundreds of tests, stateful invariants
        proven able to fail, adversarial AI review after each build phase with the findings fixed, and a fork suite run
        against the live chain. That&rsquo;s a real bar and it isn&rsquo;t the same as an audit, so we say
        &ldquo;tested.&rdquo;</p></div>
    <div class="faq"><h4>Can the team rug?</h4>
      <p class="small" style="margin:0">Here is the honest map. Nobody can print AVIANS, pause it, blacklist an address
        or upgrade it — the token has no owner. Nobody can move the perch&rsquo;s AVIANS or its birds, change
        90,000/110,000/115,000, lower the mint price, redirect mint proceeds, touch your stake or your accrued rewards,
        shorten the liquidity lock, or change the opening window and its 1%. Ownership can&rsquo;t even be renounced, so
        a lost key would stop new configuration but never stop trading, minting, redeeming or unstaking.<br><br>
        What the owner <em>can</em> do: open and close mints, raise the price, set allowlists, set the royalty — and
        operate the transfer validator, which includes whitelisting marketplaces, raising the security level, and
        freezing an individual wallet. That last power is the honest answer to &ldquo;can you stop me selling&rdquo;: yes,
        and a frozen wallet couldn&rsquo;t sell to the perch either. The shipped configuration keeps freezing off and the
        level at &ldquo;whitelisted operators, holders always free,&rdquo; and we&rsquo;d rather tell you the power exists
        than let you find out.</p></div>
    <div class="faq"><h4>The free mint — what&rsquo;s the catch?</h4>
      <p class="small" style="margin:0">There isn&rsquo;t one, and it also isn&rsquo;t free money. A free bird is a real
        Avian: composed the same way, in the same register, with its own wallet, and it can be sold to the perch for the
        same 90,000 AVIANS as any bird that was paid for. It&rsquo;s 2,000 birds, one per allowlisted wallet. If the door
        has been open 24 hours and some are unclaimed, the rest can be released to the paid mint.</p></div>
  </div>
  <p style="margin-top:28px"><a href="#" class="small">Seven more answers ${icon('chev', C.teal, 13)}</a></p>
</section>

<section class="sec" style="text-align:center;padding-bottom:80px">
  <div class="flockband" style="margin-bottom:44px">
    ${[7, 12, 19, 23, 28, 31, 34, 5].map((n) => bird(`avian-${String(n).padStart(2, '0')}.svg`, 72)).join('')}
  </div>
  <h2 style="max-width:1000px;margin:0 auto">1,866,240 birds are possible. 5,555 will exist.<br>One of them is a
    decision you haven&rsquo;t made yet.</h2>
  <div style="margin-top:36px"><button class="btn">Compose your Avian ${icon('arrow', C.ink)}</button></div>
  <p class="small" style="margin-top:20px"><a href="#">See the flock</a> <span class="dim">·</span>
    <a href="#">Read how the perch works</a></p>
</section>

<footer style="border-top:1px solid ${C.slate};padding:44px 64px 56px">
  <div class="row" style="gap:16px;align-items:flex-start">
    <img class="px" src="mark.svg" width="32" height="32" alt="">
    <div style="max-width:900px">
      <p style="margin:0"><strong class="chalk">Fine Avians Club</strong> <span class="small">— 5,555 composed pixel birds on
        Robinhood Chain. Art stored on-chain. AVIANS: 1,000,000,000, minted once, no owner.</span></p>
      <p class="small" style="margin-top:14px"><a href="#">Compose</a> · <a href="#">The flock</a> ·
        <a href="#">The Perch</a> · <a href="#">The Nest</a> · <a href="#">Contracts</a> · <a href="#">X</a></p>
      <p class="tiny dim" style="margin-top:22px;font-style:italic">Fine Avians Club is an independent project with no
        relationship to Robinhood, NVIDIA, SpaceX, Apple or S&amp;P. NVDA, SPY, SPCX and AAPL are tokenized stock
        products issued and controlled by their issuer, not by us; they can be paused or frozen by that issuer at any
        time. Reward streams depend on Treasury income and may be zero. AVIANS is a token with a market price that can go
        to anything; nothing here is a promise of value, return or income, and nothing here is financial advice. The
        contracts are tested — hundreds of tests, invariants, adversarial review and fork tests — and have not had a paid
        third-party audit.</p>
    </div>
  </div>
</footer>`,
});

// ───────────────────────────────────────────────────── the composer shell

const composerCss = `
    .work { display: grid; grid-template-columns: 520px minmax(0,1fr); gap: 40px; padding: 32px 40px 40px; align-items: start; }
    .doorbar { display: flex; align-items: center; gap: 20px; padding: 14px 40px; border-bottom: 1px solid ${C.slate}; background: ${C.inkWarm}; }
    .picker { padding: 18px 0; border-top: 1px solid ${C.slate}; }
    .picker:first-child { border-top: 0; padding-top: 0; }
    .costline { display: flex; justify-content: space-between; align-items: baseline; padding: 12px 0; }
  `;

function doorbar(inner) { return `<div class="doorbar">${inner}</div>`; }

function priceBlock({ approved = true } = {}) {
  return `<div class="inset" style="margin-top:18px;padding:16px 18px">
      <div class="costline"><span class="small">Price</span><span class="num" style="font-size:18px">100,000 AVIANS</span></div>
      <p class="tiny dim" style="margin:0 0 12px">Goes straight to the perch, not to us.</p>
      <div class="costline" style="border-top:1px solid ${C.slate};padding-top:12px">
        <span class="small dim">You hold</span><span class="num">${M.avians} AVIANS</span></div>
      <div class="costline" style="padding-top:0">
        <span class="small dim">Approved to the collection</span>
        <span class="num" style="color:${approved ? C.mossLight : C.amber}">${approved ? '100,000' : '0'} AVIANS</span></div>
    </div>`;
}

// ─────────────────────────────────────────────── compose · ready to mint

export const Compose = doc({
  extraCss: composerCss,
  body: `${header('Compose', 'connected')}
${doorbar(`<span class="tag ok">${icon('check', C.mossLight, 11)} PAID DOOR OPEN</span>
  <span class="small"><span class="num">${M.paidRemaining.toLocaleString()}</span> of 3,555 paid birds left</span>
  <span class="dim">·</span>
  <span class="small"><span class="num">${M.freeLeft}</span> free birds still reserved for the flocklist</span>
  <span class="spacer"></span>
  <a href="#" class="small">Are you on the list?</a>`)}

<div class="work">
  <div>
    <div class="panel" style="padding:20px">
      <div class="row" style="gap:8px;margin-bottom:14px">
        <span class="eyebrow" style="margin:0">Your Avian — not minted yet</span>
        <span class="spacer"></span>
        <span class="tag ok">${icon('check', C.mossLight, 11)} AVAILABLE</span>
      </div>
      ${bird('bird-compose.svg', 440)}
      <div class="note ok" style="margin-top:16px">${icon('check', C.mossLight)}
        <span>Nobody has this bird. Yours if you want it.</span></div>
      <div style="margin-top:18px;padding-top:16px;border-top:1px solid ${C.slate}">${chosenList(SEL)}</div>
      ${registerKey(SEL)}
    </div>

    ${priceBlock({ approved: true })}

    <div class="row" style="gap:12px;margin-top:18px">
      <button class="btn" style="flex:1;justify-content:center">Mint this Avian</button>
      <button class="btn ghost small" style="min-height:48px">${icon('plus', C.chalk)} Add to the batch</button>
    </div>

    <div class="inset" style="margin-top:14px;padding:14px 16px">
      <div class="row" style="gap:10px">
        <span class="small chalk">2 in the batch</span><span class="spacer"></span>
        <span class="num">200,000 AVIANS</span></div>
      <div class="row" style="gap:8px;margin-top:12px">
        ${bird('avian-04.svg', 48)}${bird('avian-22.svg', 48)}
        <span class="tiny dim" style="margin-left:6px">Batch mints are all-or-nothing — either every bird in the
          transaction is minted or none of them are.</span>
      </div>
    </div>

    <p class="tiny dim" style="margin-top:16px">One approval covers the batch. Nothing is reserved while you decide — if
      someone else composes this bird first, it&rsquo;s theirs.</p>
  </div>

  <div>${pickers(SEL)}</div>
</div>`,
});

// ────────────────────────────────────────── compose · the combination went

export const ComposeTaken = doc({
  extraCss: composerCss + `
    .drawer { position: absolute; right: 40px; bottom: 32px; width: 420px; }
    .alt { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 14px; }
  `,
  body: `${header('Compose', 'connected')}
${doorbar(`<span class="tag ok">${icon('check', C.mossLight, 11)} PAID DOOR OPEN</span>
  <span class="small"><span class="num">${M.paidRemaining.toLocaleString()}</span> of 3,555 paid birds left</span>
  <span class="spacer"></span><a href="#" class="small">Are you on the list?</a>`)}

<div class="work" style="position:relative">
  <div>
    <div class="panel" style="padding:20px;border-color:${C.crimson}">
      <div class="row" style="gap:8px;margin-bottom:14px">
        <span class="eyebrow" style="margin:0">Your Avian — not minted</span>
        <span class="spacer"></span>
        <span class="tag bad">${icon('cross', C.crimsonLight, 11)} TAKEN</span>
      </div>
      ${bird('bird-taken.svg', 440)}
      <div class="note bad" style="margin-top:16px">${icon('cross', C.crimsonLight)}
        <span>This exact bird already exists — Avian #1,204 got there first. Change any one of your six choices and
          it&rsquo;s yours again. <a href="#">See Avian #1,204</a></span></div>
      <div style="margin-top:18px;padding-top:16px;border-top:1px solid ${C.slate}">${chosenList(SEL_TAKEN)}</div>
      ${registerKey(SEL_TAKEN)}
    </div>

    <div class="panel" style="margin-top:18px;padding:18px">
      <p class="eyebrow" style="margin:0">Nearest still available</p>
      <p class="tiny dim" style="margin:6px 0 0">One choice changed. All three are free right now.</p>
      <div class="alt">
        <div>${bird('bird-compose.svg', 130)}<p class="tiny" style="margin-top:8px">Headwear<br><span class="chalk">Corsair</span></p></div>
        <div>${bird('bird-free.svg', 130)}<p class="tiny" style="margin-top:8px">Headwear<br><span class="chalk">Seedling</span></p></div>
        <div>${bird('bird-hero.svg', 130)}<p class="tiny" style="margin-top:8px">Headwear<br><span class="chalk">Crest</span></p></div>
      </div>
    </div>

    <div class="row" style="gap:12px;margin-top:18px">
      <button class="btn off" style="flex:1;justify-content:center">Mint this Avian</button>
    </div>
    <p class="tiny dim" style="margin-top:10px">Disabled because the register already holds this combination.</p>
  </div>

  <div>${pickers(SEL_TAKEN, { taken: { cat: 'hw', i: 15 } })}</div>

  <div class="drawer panel" style="border-color:${C.crimson};padding:20px">
    <div class="row" style="gap:8px">
      <span class="tag bad">${icon('cross', C.crimsonLight, 11)} MINT REFUSED</span>
      <span class="spacer"></span><span class="tiny dim">2 seconds ago</span>
    </div>
    <h4 style="margin-top:14px">That one just went.</h4>
    <p class="small" style="margin-top:8px">Avian #1,204 has this exact combination. Nothing was taken — the transaction
      reverted before any AVIANS moved.</p>
    <div class="row" style="gap:12px;margin-top:16px">
      <button class="btn small">Show me the nearest available</button>
      <button class="btn ghost small">Dismiss</button>
    </div>
    <div class="row" style="gap:8px;margin-top:16px;padding-top:12px;border-top:1px solid ${C.slate}">
      <span class="tiny dim">DECODED</span><span class="spacer"></span>
      <span class="mono dim" style="font-size:11.5px">ComboTaken(uint48) · 0xf68aef51</span>
    </div>
  </div>
</div>`,
});

// ────────────────────────────────────────────── compose · the free door

export const ComposeFree = doc({
  extraCss: composerCss,
  body: `${header('Compose', 'connected')}
${doorbar(`<span class="tag ok">${icon('check', C.mossLight, 11)} FLOCKLIST DOOR OPEN</span>
  <span class="small"><span class="num">${M.freeLeft}</span> of 2,000 free birds left</span>
  <span class="dim">·</span><span class="small">one per listed wallet, ever</span>
  <span class="spacer"></span>
  <span class="tag">${icon('lock', C.bone, 11)} PAID DOOR CLOSED</span>`)}

<div class="work">
  <div>
    <div class="panel box ok" style="padding:20px;margin-bottom:18px">
      <div class="note ok">${icon('check', C.mossLight)}
        <span><strong class="chalk">You&rsquo;re on the list.</strong> One free Avian, and it&rsquo;s a real one — same
          register, same wallet, same perch as every other bird.</span></div>
      <dl class="kv" style="margin-top:16px;grid-template-columns:120px 1fr">
        <dt>Wallet</dt><dd>${M.walletShort}</dd>
        <dt>On the list by</dt><dd>Merkle proof · 12 nodes</dd>
        <dt>Root</dt><dd style="font-size:11.5px;word-break:break-all">${M.root}</dd>
      </dl>
    </div>

    <div class="panel" style="padding:20px">
      <div class="row" style="gap:8px;margin-bottom:14px">
        <span class="eyebrow" style="margin:0">Your free Avian — not claimed yet</span>
        <span class="spacer"></span>
        <span class="tag ok">${icon('check', C.mossLight, 11)} AVAILABLE</span>
      </div>
      ${bird('bird-free.svg', 440)}
      <div class="note ok" style="margin-top:16px">${icon('check', C.mossLight)}
        <span>Nobody has this bird. Yours if you want it.</span></div>
      <div style="margin-top:18px;padding-top:16px;border-top:1px solid ${C.slate}">${chosenList(SEL_FREE)}</div>
      ${registerKey(SEL_FREE)}
    </div>

    <div class="inset" style="margin-top:18px;padding:16px 18px">
      <div class="costline"><span class="small">Cost</span><span class="num" style="font-size:18px;color:${C.mossLight}">No AVIANS</span></div>
      <p class="tiny dim" style="margin:0">The collection holds 100,000 AVIANS behind every free bird and sends it to the
        perch when you claim, so the perch will buy this one back at the same 90,000 as any paid bird.</p>
    </div>

    <button class="btn wide" style="margin-top:18px">Claim your free Avian</button>
    <p class="tiny dim" style="margin-top:12px">It counts toward your wallet limit like any other bird. One per listed
      wallet, ever.</p>
    <p class="small" style="margin-top:14px"><a href="#">Compose a paid one instead — 100,000 AVIANS</a></p>
  </div>

  <div>${pickers(SEL_FREE)}</div>
</div>`,
});

// ───────────────────────────────────────────────────── compose · a phone

export const ComposeMobile = doc({
  extraCss: `
    /* A real phone viewport. The page's own scroll area is clipped at the
       fold, the way it is on the device — the frame itself clips nothing. */
    body { width: 390px; height: 844px; position: relative; overflow: hidden; }
    .mhead { display:flex; align-items:center; gap:10px; height:56px; padding:0 16px; border-bottom:1px solid ${C.slate}; }
    .mbody { padding: 14px 16px 20px; height: 648px; overflow: hidden;
      -webkit-mask-image: linear-gradient(${C.ink} 88%, transparent 100%);
      mask-image: linear-gradient(${C.ink} 88%, transparent 100%); }
    .mbar { position: absolute; left:0; right:0; bottom:0; background:${C.inkWarm};
      border-top:1px solid ${C.slate}; padding:12px 16px; }
    .picker { padding: 16px 0; border-top: 1px solid ${C.slate}; }
  `,
  body: `<div class="mhead">
  <img class="px" src="mark.svg" width="28" height="28" alt="">
  <span class="wordmark" style="font-size:16px">Fine Avians Club</span>
  <span class="spacer"></span>
  <span class="wchip" style="padding:7px 10px;font-size:11.5px"><span class="dot"></span>${M.walletShort}</span>
</div>
<div class="doorbar" style="padding:10px 16px;gap:10px">
  <span class="tag ok" style="font-size:9.5px">${icon('check', C.mossLight, 10)} OPEN</span>
  <span class="tiny"><span class="num" style="font-size:12px">${M.paidRemaining.toLocaleString()}</span> paid birds left</span>
</div>

<div class="mbody">
  <div class="panel" style="padding:12px">
    ${bird('bird-compose.svg', 334)}
    <div class="note ok small" style="margin-top:12px">${icon('check', C.mossLight, 14)}
      <span>Nobody has this bird. Yours if you want it.</span></div>
  </div>

  <div class="row" style="gap:8px;margin-top:14px;flex-wrap:wrap">
    <span class="tag">Duskline</span><span class="tag">Kingfisher</span><span class="tag">Foxfire</span>
    <span class="tag">Hooktip</span><span class="tag">Bandolier</span><span class="tag">Corsair</span>
  </div>

  <div style="margin-top:18px">
    ${pickers({ bg: 1, pl: 4, ey: 14, bk: 1, nk: 3, hw: 4 })}
  </div>
</div>

<div class="mbar">
  <div class="row" style="margin-bottom:10px">
    <span class="tiny dim">100,000 AVIANS · to the perch, not to us</span>
    <span class="spacer"></span><span class="tiny dim">You hold <span class="num" style="font-size:11.5px">${M.avians}</span></span>
  </div>
  <button class="btn wide">Mint this Avian — 100,000 AVIANS</button>
</div>`,
});
