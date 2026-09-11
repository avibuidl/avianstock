// First Light, the network gate, the refusal, and every remaining state.
import { C, M, doc, header, icon, bird, sw } from './common.mjs';

const A = (n) => `avian-${String(n).padStart(2, '0')}.svg`;

// ────────────────────────────────────────────────────────── the fee curve

const NOW = 138;                       // seconds into the window
const bpsAt = (t) => 100 + 2400 * (1 - t / 300);
const pct = (bps) => (bps / 100).toFixed(1);

function feeCurve(w = 820, h = 260) {
  const pad = { l: 56, r: 20, t: 18, b: 34 };
  const px = (t) => pad.l + (t / 300) * (w - pad.l - pad.r);
  const py = (bps) => pad.t + (1 - bps / 2600) * (h - pad.t - pad.b);
  const line = [0, 300].map((t) => `${px(t).toFixed(1)},${py(bpsAt(t)).toFixed(1)}`).join(' ');
  const area = `${px(0)},${py(0)} ${line} ${px(300)},${py(0)}`;
  const grid = [0, 500, 1000, 1500, 2000, 2500].map((b) =>
    `<line x1="${pad.l}" y1="${py(b)}" x2="${w - pad.r}" y2="${py(b)}" stroke="${C.slate}" stroke-width="1"/>
     <text x="${pad.l - 10}" y="${py(b) + 4}" fill="${C.ash}" font-size="10" text-anchor="end"
       font-family="JetBrains Mono, monospace">${b / 100}%</text>`).join('');
  const ticks = [0, 60, 120, 180, 240, 300].map((t) =>
    `<text x="${px(t)}" y="${h - 12}" fill="${C.ash}" font-size="10" text-anchor="middle"
       font-family="JetBrains Mono, monospace">${t === 0 ? '0s' : t === 300 ? '300s' : t + 's'}</text>`).join('');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img"
    aria-label="Buy fee falling from 25% to 1% over five minutes; right now 14.0%">
    ${grid}
    <polygon points="${area}" fill="${C.tealDark}" opacity="0.45"/>
    <polyline points="${line}" fill="none" stroke="${C.teal}" stroke-width="2"/>
    <line x1="${px(NOW)}" y1="${pad.t}" x2="${px(NOW)}" y2="${py(0)}" stroke="${C.amber}" stroke-width="1" stroke-dasharray="3 3"/>
    <rect x="${px(NOW) - 4}" y="${py(bpsAt(NOW)) - 4}" width="8" height="8" fill="${C.amber}"/>
    <text x="${px(NOW) + 12}" y="${py(bpsAt(NOW)) - 10}" fill="${C.amber}" font-size="12"
      font-family="JetBrains Mono, monospace">now · ${pct(bpsAt(NOW))}%</text>
    <line x1="${pad.l}" y1="${py(0)}" x2="${w - pad.r}" y2="${py(0)}" stroke="${C.steel}" stroke-width="1"/>
    ${ticks}
  </svg>`;
}

export const FirstLight = doc({
  extraCss: `
    .page { padding: 36px 40px 44px; }
    .two { display: grid; grid-template-columns: minmax(0,1fr) 420px; gap: 24px; align-items: start; margin-top: 28px; }
    .side { display: grid; gap: 24px; }
    .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 24px; }
  `,
  body: `${header('Contracts', 'connected')}
<div class="page">
  <div class="row" style="gap:16px;align-items:flex-end">
    <div><p class="eyebrow">First Light</p><h2>The first five minutes.</h2></div>
    <span class="spacer"></span>
    <span class="tag hot">${icon('clock', C.amber, 11)} WINDOW RUNNING · 2:42 LEFT</span>
  </div>

  <div class="two">
    <div class="panel">
      <div class="row" style="align-items:flex-end;gap:24px">
        <div>
          <p class="eyebrow" style="margin:0">Buy fee right now</p>
          <div class="num" style="font-size:64px;line-height:1;color:${C.amber};margin-top:8px">${pct(bpsAt(NOW))}%</div>
        </div>
        <div style="padding-bottom:8px">
          <p class="small" style="margin:0">falling to <span class="num">1%</span> in <span class="num">2:42</span></p>
          <p class="tiny dim" style="margin:4px 0 0">Taken on the ETH side, both directions.</p>
        </div>
        <span class="spacer"></span>
        <div style="text-align:right;padding-bottom:8px">
          <p class="eyebrow" style="margin:0">Selling</p>
          <div class="num" style="font-size:24px">1%</div>
          <p class="tiny dim" style="margin:2px 0 0">flat, in and out of the window</p>
        </div>
      </div>
      <div style="margin-top:20px;border:1px solid ${C.slate};background:${C.inkWarm};padding:12px 8px 4px">
        ${feeCurve()}
      </div>
      <p class="tiny dim" style="margin-top:12px">It starts at 24% on top of the standing 1% — 25% at the first second —
        and falls linearly to 1% at the last. Nobody can change either end. The hook that enforces it has no owner and no
        settings.</p>
    </div>

    <div class="side">
      <div class="panel">
        <h3 style="font-size:20px">The per-transaction cap</h3>
        <div class="num" style="font-size:28px;margin-top:12px">50,000,000 AVIANS</div>
        <p class="small" style="margin-top:8px">No single transaction may buy more than that while the window is running.
          The cap is per <em>transaction</em>, not per swap — several swaps bundled into one router call are added
          together.</p>
        <div class="box" style="margin-top:14px">
          <p class="tiny" style="margin:0">The contract cannot tell us how much a transaction has already used — that
            counter lives in transient storage. So we add up what you are about to bundle and keep it under the cap
            ourselves.</p>
        </div>
      </div>

      <div class="panel">
        <div class="row"><h3 style="font-size:20px">Get AVIANS</h3><span class="spacer"></span>
          <span class="tag hot">${icon('warn', C.amber, 11)} ${pct(bpsAt(NOW))}% RIGHT NOW</span></div>
        <p class="small" style="margin-top:8px">Buying AVIANS mints nothing. They are two different acts: get the token
          first, compose a bird second.</p>
        <button class="btn wide ghost" style="margin-top:14px">Open the pool ${icon('ext', C.chalk, 14)}</button>
        <p class="tiny dim" style="margin-top:12px">The 1% is a property of <em>this</em> pool, not a tax on the token.
          Anyone can open a pool without it, and a router will take whichever is cheaper.</p>
      </div>

      <div class="panel">
        <div class="row"><h3 style="font-size:20px">The Vault</h3><span class="spacer"></span>
          <span class="tag ok">${icon('lock', C.mossLight, 11)} LOCKED</span></div>
        <dl class="kv" style="margin-top:14px;grid-template-columns:130px 1fr">
          <dt>Locked for</dt><dd>365 days minimum</dd>
          <dt>Unlocks in</dt><dd>361 days</dd>
          <dt>In the pool</dt><dd>800,000,000 AVIANS</dd>
        </dl>
        <p class="tiny dim" style="margin-top:12px">The lock can be extended. It cannot be shortened.</p>
      </div>
    </div>
  </div>

  <div class="pair">
    <div class="panel">
      <div class="row"><h3 style="font-size:20px">Before it opens</h3><span class="spacer"></span>
        <span class="tag">${icon('clock', C.bone, 11)} NOT LAUNCHED</span></div>
      <div class="num" style="font-size:40px;margin-top:14px">03:12:40</div>
      <p class="small" style="margin-top:10px">Every swap reverts until the launch time, and the revert carries the
        timestamp — this countdown is built from the contract&rsquo;s own refusal.</p>
      <p class="tiny dim" style="margin-top:10px">We won&rsquo;t post a date we might have to move.</p>
    </div>
    <div class="panel">
      <div class="row"><h3 style="font-size:20px">After the window</h3><span class="spacer"></span>
        <span class="tag ok">${icon('check', C.mossLight, 11)} SETTLED</span></div>
      <div class="num" style="font-size:40px;margin-top:14px">1% <span class="dim" style="font-size:18px">both ways</span></div>
      <p class="small" style="margin-top:10px">No extra fee, no cap, forever. There is no key that can change any of it.</p>
      <p class="tiny dim" style="margin-top:10px">A swap either fills completely or reverts. There are no partial fills.</p>
    </div>
  </div>
</div>`,
});

// ──────────────────────────────────────────────────────── the wrong chain

export const WrongNetwork = doc({
  extraCss: `
    .page { padding: 32px 40px 40px; }
    .warnbar { display: flex; align-items: center; gap: 16px; padding: 14px 40px;
      border-bottom: 1px solid ${C.crimson}; background: rgba(179,42,78,0.14); }
    .two { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 24px; margin-top: 28px; align-items: start; }
    .behind { opacity: 0.28; pointer-events: none; margin-top: 32px; display: grid;
      grid-template-columns: 300px 1fr; gap: 32px; }
  `,
  body: `${header('Compose', 'wrong')}
<div class="warnbar">
  ${icon('warn', C.crimsonLight)}
  <span class="small chalk">You&rsquo;re on Ethereum Mainnet. Fine Avians Club lives on Robinhood Chain.</span>
  <span class="spacer"></span>
  <button class="btn small">Switch network</button>
</div>

<div class="page">
  <div class="two">
    <div class="panel" style="border-color:${C.crimson}">
      <div class="row" style="gap:10px">
        <span class="tag bad">${icon('cross', C.crimsonLight, 11)} WRONG NETWORK</span>
        <span class="spacer"></span><span class="mono dim">chain 1 → 4663</span>
      </div>
      <h3 style="margin-top:16px">Nothing here can be signed until you switch.</h3>
      <p class="small" style="margin-top:10px">Fine Avians Club is on <strong class="chalk">Robinhood Chain, id 4663</strong>.
        We check the chain immediately before every transaction, not once when the page loads — a person can switch
        networks in their wallet at any moment, and a mint sent to the wrong chain is a real loss.</p>
      <button class="btn wide" style="margin-top:18px">Switch to Robinhood Chain</button>
      <p class="tiny dim" style="margin-top:12px">One prompt in your wallet. Your wallet already knows this chain.</p>
      <div class="inset" style="margin-top:18px">
        <p class="eyebrow" style="margin:0 0 10px">What stays available</p>
        <div class="note info small">${icon('check', C.bone, 14)}<span>Reading the site: the flock, the perch, the
          numbers, the contracts.</span></div>
        <div class="note bad small" style="margin-top:8px">${icon('cross', C.crimsonLight, 14)}<span>Every button that
          would sign something is disabled, with the reason on it — not hidden.</span></div>
      </div>
    </div>

    <div class="panel">
      <div class="row" style="gap:10px">
        <span class="tag hot">${icon('warn', C.amber, 11)} CHAIN UNKNOWN TO THIS WALLET</span>
        <span class="spacer"></span><span class="mono dim">error 4902</span>
      </div>
      <h3 style="margin-top:16px">Your wallet has never seen Robinhood Chain.</h3>
      <p class="small" style="margin-top:10px">We&rsquo;ll ask it to add the network, and then switch to it. That is two
        prompts, and the second one only appears after you accept the first.</p>
      <div class="inset" style="margin-top:16px">
        <dl class="kv" style="grid-template-columns:120px 1fr">
          <dt>Network</dt><dd>Robinhood Chain</dd>
          <dt>Chain id</dt><dd>4663 · 0x1237</dd>
          <dt>Currency</dt><dd>ETH · 18 decimals</dd>
          <dt>RPC</dt><dd style="font-size:11.5px;word-break:break-all">https://rpc.mainnet.chain.robinhood.com</dd>
          <dt>Explorer</dt><dd style="font-size:11.5px;word-break:break-all">https://robinhoodchain.blockscout.com</dd>
        </dl>
      </div>
      <button class="btn wide" style="margin-top:18px">Add Robinhood Chain, then switch</button>
      <div class="row" style="gap:8px;margin-top:14px">
        <span class="tag">STEP 1 · ADD</span>${icon('arrow', C.ash, 14)}<span class="tag">STEP 2 · SWITCH</span>
      </div>
      <p class="tiny dim" style="margin-top:12px">If you dismiss the first prompt nothing is lost — we come back to this
        card and you can start again.</p>
    </div>
  </div>

  <div class="behind">
    <div class="panel" style="padding:14px">${bird('bird-compose.svg', 268)}</div>
    <div>
      <div class="row" style="gap:10px;margin-bottom:10px">
        <span style="font-size:14px;font-weight:600;color:${C.chalk}">Background</span>
        <span class="spacer"></span><span class="mono" style="color:${C.teal}">Duskline</span></div>
      <div class="strip">${Array.from({ length: 12 }, (_, i) => sw('bg', i, i === 1 ? 'on' : '')).join('')}</div>
      <div class="row" style="gap:10px;margin:22px 0 10px">
        <span style="font-size:14px;font-weight:600;color:${C.chalk}">Plumage</span>
        <span class="spacer"></span><span class="mono" style="color:${C.teal}">Kingfisher</span></div>
      <div class="strip">${Array.from({ length: 12 }, (_, i) => sw('pl', i, i === 4 ? 'on' : '')).join('')}</div>
    </div>
  </div>
</div>`,
});

// ──────────────────────────────────────────────────────────── the refusal

function cycleDiagram() {
  const w = 700, h = 300;
  const box = (x, y, title, sub, tone) => `
    <rect x="${x}" y="${y}" width="200" height="66" fill="${C.inkWarm}" stroke="${tone}" stroke-width="1"/>
    <text x="${x + 14}" y="${y + 27}" fill="${C.chalk}" font-size="14" font-weight="600"
      font-family="Inter, sans-serif">${title}</text>
    <text x="${x + 14}" y="${y + 47}" fill="${C.ash}" font-size="11"
      font-family="JetBrains Mono, monospace">${sub}</text>`;
  const label = (x, y, t, anchor = 'middle') => `<text x="${x}" y="${y}" fill="${C.ash}" font-size="11"
    text-anchor="${anchor}" font-family="Inter, sans-serif">${t}</text>`;
  const arrow = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"
    stroke="${C.crimsonLight}" stroke-width="1.5" marker-end="url(#ah)"/>`;
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img"
    aria-label="Ownership loop: Avian 1204 to its satchel to Avian 3090 to its satchel and back to Avian 1204">
    <defs><marker id="ah" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M0 0L8 4L0 8z" fill="${C.crimsonLight}"/></marker></defs>
    ${box(20, 24, 'Avian #1,204', 'the bird you are sending', C.crimsonLight)}
    ${box(470, 24, "Avian #3,090's satchel", '0x77c2…9b41', C.crimsonLight)}
    ${box(470, 200, 'Avian #3,090', 'lives in your satchel', C.slate)}
    ${box(20, 200, "Avian #1,204's satchel", '0x9e11…4c02', C.slate)}
    ${arrow(226, 57, 462, 57)}${label(344, 48, 'you would send it here')}
    ${arrow(570, 96, 570, 192)}${label(584, 148, 'is controlled by', 'start')}
    ${arrow(462, 233, 232, 233)}${label(347, 224, 'sits inside')}
    ${arrow(120, 192, 120, 100)}${label(106, 148, 'is controlled by', 'end')}
  </svg>`;
}

export const Refusal = doc({
  extraCss: `
    .page { padding: 32px 40px 40px; opacity: 0.22; }
    .scrim { position: absolute; inset: 0; background: rgba(6,5,12,0.72); }
    .modal { position: absolute; left: 50%; top: 96px; transform: translateX(-50%); width: 780px; }
    .split { display: grid; grid-template-columns: minmax(0,1fr) 420px; gap: 32px; align-items: start; }
    .field { display: flex; border: 1px solid ${C.crimson}; background: ${C.inkWarm}; }
    .field input { flex: 1; background: transparent; border: 0; color: ${C.chalk}; padding: 13px 14px;
      font-family: "JetBrains Mono", monospace; font-size: 13px; }
  `,
  body: `<div style="position:relative">
${header('My Birds', 'connected')}
<div class="page">
  <p class="eyebrow">Your birds</p><h2>Send Avian #1,204</h2>
  <div class="split" style="margin-top:24px">
    <div class="panel">${bird(A(21), 300)}</div>
    <div class="panel">
      <p class="eyebrow" style="margin:0 0 8px">To</p>
      <div class="field"><input value="0x77c2b0Ae4519dF3c8a2e6104Bb95Dd7e1f09b41" readonly></div>
      <button class="btn wide" style="margin-top:16px">Send the bird</button>
    </div>
  </div>
</div>
<div class="scrim"></div>

<div class="modal panel" style="border-color:${C.crimson};padding:32px;background:${C.nocturne}">
  <div class="row" style="gap:10px">
    <span class="tag bad">${icon('cross', C.crimsonLight, 11)} REFUSED</span>
    <span class="spacer"></span><span class="tiny dim">CHECKED BEFORE ANYTHING WAS SIGNED</span>
  </div>
  <h3 style="margin-top:16px;font-size:30px">This would trap both birds forever.</h3>
  <p class="small" style="margin-top:12px;max-width:660px">Avian #3,090 is already inside Avian #1,204&rsquo;s satchel.
    Sending #1,204 into #3,090&rsquo;s satchel closes the loop: #1,204 would be owned by #3,090, which is owned by
    #1,204. Neither bird could ever be moved again, and neither satchel could ever be used again.</p>

  <div class="inset" style="margin-top:20px;padding:8px 12px">${cycleDiagram()}</div>

  <div class="box bad" style="margin-top:20px">
    <div class="note bad">${icon('warn', C.crimsonLight)}
      <span class="small">The chain refuses only the simplest version of this — a bird sent into its
        <em>own</em> satchel. Anything deeper it cannot see inside a transfer, so we refuse it here. This is a
        documented limit of the contracts, and closing it is this site&rsquo;s job.</span></div>
  </div>

  <div class="row" style="gap:12px;margin-top:22px">
    <button class="btn">Choose another destination</button>
    <button class="btn ghost">Look inside the satchel</button>
    <span class="spacer"></span>
    <span class="tiny dim">There is no way to send it anyway.</span>
  </div>
</div>
</div>`,
});

// ────────────────────────────────────────────── every state, in one place

const card = (tag, title, body, tone = '') => `<div class="scard">
  <div class="row" style="gap:8px;margin-bottom:10px"><span class="tag ${tone}">${tag}</span></div>
  <h4>${title}</h4>
  <p class="tiny" style="margin-top:6px">${body}</p>
</div>`;

const preset = (name, on = false) => `<div class="preset${on ? ' on' : ''}">${name}</div>`;
const toggle = (label, opts, sel) => `<div style="padding:9px 0;border-top:1px solid ${C.slate}">
  <div class="tiny dim" style="letter-spacing:.1em;margin-bottom:6px">${label.toUpperCase()}</div>
  <div class="row" style="gap:4px;flex-wrap:wrap">${opts.map((o) =>
  `<span class="opt${o === sel ? ' on' : ''}">${o}</span>`).join('')}</div>
</div>`;

export const SystemStates = doc({
  extraCss: `
    .page { padding: 36px 40px 44px; }
    .split { display: grid; grid-template-columns: 336px minmax(0,1fr); gap: 32px; align-items: start; margin-top: 28px; }
    .dev { border: 1px solid ${C.teal}; background: ${C.nocturne}; }
    .devhead { display:flex; align-items:center; gap:8px; padding:12px 14px; border-bottom:1px solid ${C.slate};
      background: ${C.inkWarm}; }
    .preset { padding: 7px 10px; font-size: 12px; border: 1px solid ${C.slate}; color: ${C.bone}; margin-bottom: 4px; }
    .preset.on { border-color: ${C.teal}; color: ${C.teal}; background: rgba(67,196,188,0.09); }
    .opt { font-family: "JetBrains Mono", monospace; font-size: 10.5px; padding: 3px 6px;
      border: 1px solid ${C.slate}; color: ${C.ash}; }
    .opt.on { border-color: ${C.teal}; color: ${C.teal}; }
    .cards { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 1px; background: ${C.slate};
      border: 1px solid ${C.slate}; }
    .scard { background: ${C.ink}; padding: 18px 20px 20px; }
    .skel { background: ${C.slate}; height: 10px; }
  `,
  body: `${header('Compose', 'connected')}
<div class="page">
  <div class="row" style="gap:20px;align-items:flex-end">
    <div><p class="eyebrow">Development only</p><h2>Every state, reachable.</h2></div>
    <span class="spacer"></span>
    <p class="small dim" style="max-width:520px;text-align:right;margin:0">Each preset is a URL. If a state exists in the
      handover and cannot be reached here, the wiring agent has nowhere to put it.</p>
  </div>

  <div class="split">
    <div class="dev">
      <div class="devhead">
        <span class="dot" style="background:${C.teal}"></span>
        <span class="small chalk" style="font-weight:600">State switcher</span>
        <span class="spacer"></span><span class="mono dim" style="font-size:10.5px">?dev=1</span>
      </div>
      <div style="padding:14px">
        <div class="tiny dim" style="letter-spacing:.1em;margin-bottom:8px">PRESETS</div>
        ${preset('Before launch')}${preset('First Light · second 3')}${preset('First Light · second 138', true)}
        ${preset('Free door · on the list')}${preset('Free door · not on the list')}
        ${preset('Already claimed')}${preset('Paid mint · no AVIANS')}${preset('Paid mint · needs approval')}
        ${preset('Paid mint · ready')}${preset('Combination just went')}${preset('Wallet cap reached')}
        ${preset('Sold out')}${preset('Perch empty')}${preset('Nothing brooding')}
        ${preset('Brooding · nothing streams yet')}${preset('Brooding · AAPL paused')}
        ${preset('Satchel holds two birds')}${preset('Cycle refused')}${preset('Wrong network')}
        ${preset('Unknown network · 4902')}${preset('No wallet')}${preset('Everything failing')}
      </div>
      <div style="padding:0 14px 14px">
        ${toggle('connection', ['none', 'disc', 'wrong', '4902', 'ok'], 'ok')}
        ${toggle('data', ['loading', 'empty', 'error', 'full'], 'full')}
        ${toggle('launch', ['before', 'window', 'after'], 'window')}
        ${toggle('paid mint', ['closed', 'open', 'sold out', 'cap'], 'open')}
        ${toggle('free mint', ['closed', 'listed', 'unlisted', 'claimed', 'gone'], 'listed')}
        ${toggle('balance', ['none', 'short', 'enough'], 'enough')}
        ${toggle('approvals', ['none', 'partial', 'sufficient'], 'sufficient')}
        ${toggle('nest', ['none', 'tier 1', 'tier 2', 'tier 3', 'mixed'], 'mixed')}
        ${toggle('rewards', ['unlisted', 'accruing', '1 paused', 'all paused'], '1 paused')}
        ${toggle('satchel', ['empty', 'tokens', 'birds'], 'birds')}
        ${toggle('operators', ['whitelisted', 'missing'], 'whitelisted')}
        <div style="padding:9px 0;border-top:1px solid ${C.slate}">
          <div class="tiny dim" style="letter-spacing:.1em;margin-bottom:6px">FAIL THE NEXT WRITE WITH</div>
          <div class="sel" style="display:flex;justify-content:space-between;min-height:34px;padding:7px 10px">
            <span class="mono" style="font-size:11px;color:${C.chalk}">ComboTaken</span>${icon('chev', C.ash, 13)}</div>
        </div>
      </div>
    </div>

    <div>
      <div class="cards">
        ${card('WALLET', 'No wallet installed',
    'Nothing announced over EIP-6963 and no injected provider. We name what to install and leave every read working. Buttons are disabled with the reason on them, not hidden.')}
        ${card('WALLET', 'Which wallet?',
    'Every wallet that announced itself, with its own name and icon. Never a single hard-coded button when three are installed.')}
        ${card('WALLET', 'Waiting for your wallet',
    'The prompt is open. Nothing has been sent. Cancelling here costs nothing and says so.')}

        ${card('DATA', 'Loading',
    'Pixel skeletons on the same 8px grid as the content they replace. No spinners.')}
        ${card('DATA', 'Nothing here yet',
    'Before the first mint the flock is empty, and the page says what will fill it rather than showing an empty grid.')}
        ${card('DATA', 'That read failed',
    'The RPC did not answer. One retry button, the panel keeps its shape, and the rest of the page carries on.', 'bad')}

        ${card('FREE DOOR', 'Not on the list',
    'This wallet isn&rsquo;t on the flocklist. That door is 2,000 birds, one per listed wallet — but the paid mint is a separate door, and your bird is composed exactly the same way.')}
        ${card('FREE DOOR', 'Already claimed',
    'You&rsquo;ve already claimed yours — one per wallet on the list. You can compose as many more as you like at 100,000 AVIANS each.')}
        ${card('FREE DOOR', 'All 2,000 claimed',
    'All 2,000 flocklist birds are claimed. The paid mint is the door now.')}

        ${card('PAID DOOR', 'The paid mint is closed',
    'Birds already minted are still trading, and the perch is still buying at 90,000 AVIANS — that part never closes.')}
        ${card('PAID DOOR', 'Sold out',
    'All 5,555 are composed. The 1,866,240 combinations nobody chose stay unchosen forever. The perch is still open.')}
        ${card('PAID DOOR', 'This wallet has minted its limit',
    'The number comes from the contract, not from us. Read live, never assumed.')}

        ${card('PAYMENT', 'Not enough AVIANS',
    'You need 100,000 AVIANS to compose a bird. You&rsquo;ve got 41,200. The exact figure comes back inside the error itself.', 'bad')}
        ${card('PAYMENT', 'One approval first',
    'Exact amount or a large one, side by side, with what each means. And where the wallet supports it: one signature and no approval transaction at all.')}
        ${card('PAYMENT', 'A permit that did not take',
    'The contract wraps permit in a try, deliberately — so a stranger cannot cancel your mint by front-running the signature. We show the allowance error, never &ldquo;your signature was rejected&rdquo;.')}

        ${card('TRANSACTION', 'Pending',
    'The hash, a link to the explorer, and nothing pretending to know how long it will take.')}
        ${card('TRANSACTION', 'Confirmed',
    'What arrived: the token id, the art, and where the bird is now.', 'ok')}
        ${card('TRANSACTION', 'That did not go through',
    'And nothing was taken. Nothing about your bird is reserved either — if someone else composes it first, it&rsquo;s theirs.', 'bad')}

        ${card('NEST', 'Nothing streams yet',
    'Birds are held, weight is counted, and no reward token has passed the transferability gate. That is not a bug, and we say so instead of showing an empty panel.')}
        ${card('NEST', 'One token is frozen',
    'Claiming AAPL fails; NVDA, SPY and SPCX still work. The accrual is safe, and the bird can still come home.', 'bad')}
        ${card('OPERATORS', 'The batch route was refused',
    'This deployment has not whitelisted the perch as an operator. We fall back to sending the bird in directly — same price, same result — and tell the operator.')}
      </div>

      <div class="panel" style="margin-top:24px">
        <div class="row" style="gap:24px;align-items:flex-start">
          <div style="flex:1">
            <p class="eyebrow" style="margin:0 0 10px">What a loading panel looks like</p>
            <div class="inset" style="padding:16px">
              <div class="row" style="gap:14px">
                <span style="width:88px;height:88px;background:${C.slate};display:block"></span>
                <div style="flex:1">
                  <div class="skel" style="width:56%"></div>
                  <div class="skel" style="width:82%;margin-top:8px"></div>
                  <div class="skel" style="width:38%;margin-top:8px"></div>
                </div>
              </div>
            </div>
          </div>
          <div style="flex:1">
            <p class="eyebrow" style="margin:0 0 10px">Focus is always visible</p>
            <div class="inset" style="padding:16px">
              <div class="row" style="gap:12px">
                <button class="btn small focus">Mint this Avian</button>
                <span class="sw" style="outline:2px solid ${C.teal};outline-offset:2px">
                  <img class="px" src="sw-hw-08.svg" alt=""></span>
                <span class="tiny dim">2px ring, teal, 2px offset — on every control, keyboard or mouse.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>`,
});
