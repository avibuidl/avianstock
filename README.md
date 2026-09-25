# Fine Avians Club — the mint site

Every screen and every state of the front end, running against a typed mock
layer. **There is no chain in it.** No `viem`, no provider, no RPC, no ABIs.

The design canvas it was drawn from is in [`design/`](design/).

---

## Running it

```bash
npm install
npm run prepare:all     # ../art -> src/art/pieces.json, ../logo and ../pfp -> public/
npm run fonts           # Geist and Geist Mono into public/fonts/ (needs network, once)
npm run dev
```

`npm run build` emits `dist/` — plain static files, `base: './'`, hash routing,
so it works from a bucket, an IPFS gateway or a `file://` open with no server
rewrite rule.

`npm run check:art` is the one claim in this repo that can be proved rather
than asserted: it renders the 36 combinations in `../pfp/index.json` through
`src/art/render.ts` and asserts the output is **byte-identical** to the
committed `../pfp/svg/*.svg`, which were themselves verified against the
compiled on-chain renderer. It currently prints `36/36`.

Nothing outside `dapp/` is written to. The prepare scripts read `../art`,
`../logo` and `../pfp` and write only into `dapp/`.

---

## The state switcher

Bottom-right, **STATE SWITCHER**. Forty named presets and fourteen individual
switches; every state HANDOVER describes is reachable without a chain, and the
whole scenario is encoded into the address bar, so any state is a link you can
send someone.

`FAIL THE NEXT WRITE WITH` takes any of the ~50 errors in HANDOVER section 7 and
makes the next transaction throw it once, so every error sentence can be seen on
the screen it belongs to.

---

## For the agent wiring this to the contracts

**Everything you replace is in `src/mock/`.** Nine files. Components import from
`src/mock` and from nowhere else inside it, so this is one directory rather than
a search across the app.

| file | what it is | what to do with it |
|---|---|---|
| `types.ts` | every shape the UI reads | keep; these are the shapes viem should produce |
| `errors.ts` | the closed error vocabulary, selectors, and `explain()` | keep the table; replace the *throwing* with a decoder built from the compiled ABIs |
| `reads.ts` | every read | replace each body with `readContract` / `multicall` |
| `writes.ts` | every write | replace each body with `writeContract` + `waitForTransactionReceipt` |
| `wallet.ts` | connection and network | replace with real EIP-6963 + EIP-1193 |
| `store.ts` | the hooks components subscribe to | keep the names and shapes; change what fills them |
| `fixtures.ts` | the fake world | delete |
| `scenario.ts` | the switcher's model | delete, with `components/DevPanel.tsx` |
| `index.ts` | the public surface | keep |

**What is NOT part of the seam.** `src/art/` is the real renderer, ported from
`tools/svg.mjs`. It stays. It is what lets the composer preview a combination
before a token exists, and `check:art` proves it agrees with the chain. For a
minted bird you may keep it (cheap, correct, no `tokenURI` call) or switch to
`tokenURI` — both are right, and the seam either way is `Bird.traits`, which is
on chain.

**The write contract.** Every write has the same shape:

```ts
export function mint(traits, opts?, onPhase?): Promise<{ tokenId } & { hash }>
```

`onPhase` is called with `'signing'`, then `'pending'` with the hash, then
`'confirmed'`. Map those to the wallet prompt, the broadcast and the receipt.
Throw a `ContractError(name, args)` and the whole UI already knows what to say —
the drawer, the fix button and the disabled state all come from `explain()`.

**Things that are the site's own logic and must survive wiring:**

- `checkTransferSafety` — HANDOVER section 8. The chain refuses depth one; this
  walk is the only thing standing between a collector and two birds nobody will
  ever own again. It refuses rather than allows when it runs out of rope.
- `nearestAvailable` — the `ComboTaken` recovery.
- `routeFor` — batch vs push, and the `0xef28f901` fallback.
- `src/lib/format.ts` — `BigInt` end to end, a formatter at the edge, and
  reward balances truncated rather than rounded up.

**Read HANDOVER section 9a before the wallet code.** EIP-6963 rather than
`window.ethereum`, and re-read `eth_chainId` immediately before building any
write — `requireChain()` in `wallet.ts` is where that goes.

---

## What is deliberately not here

No swap UI (the
*Get AVIAN* card hands off to the pool), no allowlist sign-up page, no
owner-only controls, no marketplace, no indexer, no light theme, and no dates.

---

## Wired: the chain layer

`src/mock/` is still the only module any screen imports from, and its export
surface has not changed. Behind it, the active **deployment manifest**'s
`driver` decides where a call lands:

```
src/mock/index.ts     the same public surface
src/mock/source.ts    the dispatcher
src/mock/*.ts         the fixtures — driver "mock"
src/chain/*           the contracts — driver "chain"
```

The mock is not dead code behind a flag: it is a DEPLOYMENT
(`public/deployments/mock.json`), so the dev state switcher and every preset
URL still work exactly as they did.

### Pointing the site at a deployment

A manifest is one JSON file per deployment carrying **both the network and the
addresses**. Nothing about a chain is compiled in.

```bash
# from a forge broadcast — runs the cross-checks against the chain before it writes
node scripts/make-manifest.mjs --chain 4663 --id mainnet-4663 \
  --label "Robinhood Chain" --rpc https://rpc.mainnet.chain.robinhood.com
```

The addresses come from `contracts/broadcast/Deploy.s.sol/<chain>/run-latest.json`,
the pool's from `DeployLaunch.s.sol`'s and the Sweeper's from `DeploySweeper.s.sol`'s.
The token alone may come from `DeployAvians.s.sol`'s instead: the runbook's step 0
puts AVIAN on chain early, and `Deploy.s.sol` then reuses it without a `CREATE` of
its own. The generator takes the token from whichever broadcast has it and refuses
when both do and they differ (step 1 run without `AVIARY_AVIANS` — a second token
nobody published); `AvianStock.AVIAN()` is then checked against it on the chain.

Then open `?d=mainnet-4663`. Files live in `public/deployments/`, are fetched at
runtime, and can be replaced without a rebuild. A manifest that is missing a
field, malformed, or whose addresses disagree with each other on chain stops
the app with a page that names the field or the mismatch.

Without `?d=`, the site opens on a real deployment whenever one is configured
(indexed, with `driver: "chain"`, and passing that validation): mainnet
(chain 4663) if it is, else the newest chain deployment in the index, and the
mock only when the index holds no chain deployment at all. A choice the browser
remembers is honoured while it is still indexed, except a remembered mock while
a chain deployment exists. `?d=mock` is the way to the mock once one does. The
index's `default` is read only as a tie-break among chain deployments
(`src/chain/manifest.ts`, `chooseDeployment`; `tests/chooser.test.ts` is the
table).

Two failure modes worth seeing once (write the file, open `?d=<id>`, delete it):

```bash
# 1. malformed: the app names every bad field by JSON path
# 2. well-formed but wrong: the start-up cross-check names the mismatch
```

### The owner's panel, and the two ABIs

`#/admin` is the owner's screen: the owner-only calls on the five contracts,
composed rather than hand-built. **It is not a security boundary and nothing in
this repository describes it as one.** Every function it reaches is
`onlyOwner` on its contract, and that is what refuses everyone else — the route
is reachable by typing it, and the page then says plainly that the connected
wallet is not the owner, naming both addresses.

It also opens for a `pendingOwner` of any of the five, showing the ownership
section and nothing else, because `acceptOwnership` is called by the incoming
owner and an owner-only rule would hide the one control they need.

The generator emits **two ABIs per contract**, into two files:

```
src/chain/abis.generated.ts        the collector surface
src/chain/abis.admin.generated.ts  the owner surface
```

Only `src/chain/admin.ts` and `src/chain/admin-writes.ts` may import an
admin ABI, `scripts/check-hygiene.mjs` fails the build if anything else does,
and `tests/abi-split.test.ts` asserts that no owner-only function is reachable
from a collector ABI at all. Again: this protects nothing on chain. What it
keeps is that a mistake in a screen or a collector write cannot BECOME an owner
call, because the ABI those files hold has no such entry to encode.

`src/mock/source.ts` reaches both admin modules through a dynamic `import()`
and `src/App.tsx` loads the screen with `React.lazy`, so the owner surface —
ABIs, wiring and screen, about 120 kB — is a chunk a collector never fetches.

### Generated, not hand-written

```bash
npm run abis      # contracts/out -> the two ABI files (+ every error selector)
npm run check     # build, tests, art parity, hygiene rules
```

`npm run check` enforces, as build failures rather than review notes: no
`dangerouslySetInnerHTML` or `innerHTML` anywhere, no
`Number`/`parseFloat`/`toFixed` on a money path, no failed read defaulting to
zero, no contract address written in the source, no owner ABI imported outside
the two admin modules, and no seed-phrase surface or dev wallet in `dist/`.

**`check` builds first, deliberately.** The last three of those can only be
checked against a bundle, so `scripts/check-hygiene.mjs` now FAILS when `dist/`
is missing rather than printing a note and passing — otherwise the strongest
guarantees here would be vacuous on a clean checkout. Pass
`--allow-missing-dist` to run only the source checks while iterating; CI should
never pass it.

### Headers a host must set

The CSP is generated into both a `<meta>` tag and `dist/_headers`. Three of its
protections are **header-only** — a browser ignores them in a meta tag — so a
host that does not read `_headers` (Netlify and Cloudflare Pages do; a bare S3
bucket does not) must be configured to send them:

```
Content-Security-Policy: <the policy the build prints>
Referrer-Policy: no-referrer
X-Content-Type-Options: nosniff
```

`frame-ancestors 'none'` is the one that matters most, and it is inside that
CSP. Because the build also targets `file://` and IPFS gateways, where no
headers exist at all, `src/main.tsx` additionally refuses to render when
`window.top !== window.self` — a page with Approve, Mint and Claim buttons on
it should not be frameable anywhere. That guard is a backstop for the header,
not a replacement: set the header.

### The Roost, and AVIAN staking

Since 2026-09-18 every AVIAN fee — the whole of every Perch fee and every
brooding tier cost — lands at the Roost and is split five ways (since
2026-09-20): three figures, 35 / 30 / 20, that rotate weekly on a fixed
three-week cycle from `GENESIS` between AVIAN stakers, brooding birds
(through the Nest; AVIAN is a listed reward token) and the users of the vault
products (through `LockerRewards`, post-mainnet), plus 10% the admin's and 5%
burnt. The Roost card (`components/RoostCard.tsx`, on `#/bird-engine` since
2026-09-25; reads and writes in `chain/roost.ts`) shows this week's split from `currentSplit()`, the next
rotation from `nextRotationAt()` with next week's from `splitAt()`, what is
waiting, the three legs and whether each would move
(`stakingReady()`/`nestReady()`/`lockersReady()`, reason verbatim; the
lockers' leg is held until the vault products exist), one **Distribute**
button enabled when the day is up and there is something to move, a
**Deliver** button when a held leg can go, receipts decoded into
`Allocated/Delivered/Held/Burned` with all five legs. `#/roost`
(`screens/Roost.tsx`) is staking: the staking card, my stake, claimable, share, the stream's daily rate and end, the undelivered
remainder, and stake / withdraw / claim / exit. `stake` needs an AVIAN
approval to the staking contract (approve-only: the contract takes no
permit). The manifest carries `roost`, `aviansStaking` and `lockerRewards`,
required; the generator reads them from the deploy broadcast and cross-checks
the wiring (`roost.NEST/STAKING/LOCKERS/AVIAN`, `staking.ROOST/AVIAN`,
`lockerRewards.ROOST/AVIAN`, `nest.costSink`), and warns if
`perch.feeRecipient` is not the Roost. The admin panel's Roost card shows the
addresses and claims the tenth. Nothing about the split is on the site as a
constant: the shares are read (`currentSplit()`, `ADMIN_BPS`, `BURN_BPS`).

### The flywheel snapshot

The landing page's live figures (2026-09-22, `components/Flywheel.tsx`,
between "Three steps" and "Questions"): the birds (minted, burnt, brooding,
on the perch with its buy-back price), AVIAN (price in ETH and dollars,
market cap, supply, burnt as an amount and a share of the original supply,
staked), the Roost (split so far, to stakers, to brooding birds, burnt, the
countdown to the next turn on the Roost screen's chain-time footing), and
every token the Nest has ever paid out as chips with one total. One shape,
`FlywheelSnapshot` and `PaidOut` in `mock/types.ts`, one hook,
`useFlywheel()` (polled like the Roost's reads), one read, `getFlywheel()`,
which the mock composes from its own fixtures (`mock/flywheel.ts`) and the
chain side reads from one block in `chain/flywheel.ts`: one pin and one
multicall carrying the collection's, the Nest's, the perch's, the supply's,
the staking pool's and the Roost's counters, the launch pool's mid-price
(`StateView.getSlot0` on the pool id, not the quoter's figure), every listed
token's `TheNest.totalPaid` (AVIAN's plus `AviansStaking.totalPaid`), the
band's price reads and the dollar pool's; the listing, the pools and the
launch key are resolved once per deployment and ride along after that.
Every dollar figure is derived in the view from `usd.usdPerEth`, which comes
from ONE Uniswap v3 pool of WETH against the dollar stablecoin the manifest
names (`"usd": { "token" }`, USDG on 4663, null elsewhere; the 0.01%, 0.05%
and 0.3% pools asked for once, the deepest taken, its `slot0` read per
refresh). `usd` is null on a deployment with no dollar source, or when the
pool is missing or empty that refresh, and the dollar half of every figure
is then absent, as is any value whose price is null this refresh: never
stale, never made up. The start-up checks report the dollar source on one
non-fatal line. The Nest's streams are
one component in two modes (`components/Streams.tsx`): full on the Nest,
with its bookkeeping row and each stream's state, and compact under the
snapshot's chips on the landing page and on the Bird Engine, read signed
out through `useBrood()`: whose stream each row is and its "Total paid to
brooders" (or "to stakers") line, no state line, with "Stake AVIAN" and
"Brood a bird" beside the heading; with no reward token listed the block
reads one line. Formats in
`lib/format.ts`: `formatCompact` (K, M, B), `formatEthSig` (four
significant figures), `formatUsd`, `formatUsdPrice`, `formatShare`,
`usdOf`. The switcher's `flywheel` row has the four scenes: a live day,
the first day, no dollar source, a turn due now.

### The council

The protocol's second key, read-only on the site (2026-09-24,
`components/Council.tsx`): a card at the foot of the Owner page, where one
line above it says none of it is the owner's to press. (It stood under the
Treasury card on the Nest until 2026-09-25; the public site now shows what is
waiting in the price band instead, below.) It carries the one-breath sentence of what the council
may do, three facts (the Council, the multisig that may propose to it, and
the two waits) and what is scheduled: "No change is pending." or a row per
change, its sentence and a countdown on the chain's clock, the rescue marked
by a rule down its edge and the strong ink. With no seat named it says so
instead of the facts. One shape, `CouncilState` and `CouncilChange` in
`mock/types.ts`; one hook, `useCouncil()`; one read, `getCouncil()`,
which the mock answers from four scenes (`mock/council.ts`, the switcher's
`council` row) and the chain side will answer from `chain/council.ts`.
The site never sends a council call. Two controls on the Owner page are lines
now, because the council holds them: the royalty ("The council's; the cap is
10%.") and the Nest's cost sink ("the Roost is the council's to replace").

### Your seat

The two things on the Owner page that are the owner's alone (2026-09-24,
`components/admin/Seat.tsx`), right under the council card. One line, when
the owner was last heard from and when the council may act alone (the
earliest of the six seats' clocks), in the site's warning tone only in the
last five days before that. "Still here" sends `stillHere()` to each seat
in turn; "Propose a fresh key" sends `transferOwnership(key)` the same way;
each shows its run under the press in the drawer's dots ("3 of 6 · the
Treasury: waiting for your wallet"), stops at the first seat that does not
go and says which, skips a seat that already reads what is being sent, and
ends on one line of what came of it. "Proposed: <key> (on all six)", or
each seat's own when they disagree. A seat still behind the veil is named by
its place ("the fifth seat"). One shape, `SeatState` and `OwnedSeat` in
`mock/types.ts`; one hook, `useSeat()`; two senders, `stillHere` and
`proposeOwner`; five scenes (`mock/seat.ts`, the switcher's `your seat`
row). On a chain deployment the read and the senders refuse plainly until
`chain/council.ts` answers them. The Ownership section at the top is
read-only now: `acceptOwnership` is disabled on every contract, so its
Accept button and hand-over form could only have been refused.

### The Bird Engine, and the contracts in Docs

`#/bird-engine` (`screens/BirdEngine.tsx`, 2026-09-25; its first day it was
"The Flywheel" at `#/flywheel`, which still opens it) holds the protocol's
machinery, where Contracts was in the sidebar, so the Nest is about brooding
and the Roost page about staking. Two by two on a wide screen: the Treasury
card beside the Roost card, each moved whole with its handlers, then the
Nest's streams beside the figures (`RoostFigures` and `NestFigures` in
`components/Counters.tsx`, drawn with the homepage Flywheel section's own
stylesheet). The page owns the Roost read and the brood read and hands each
to the card that shares it, so nothing is read twice. One column under
1080px. `#/bird-engine/roost` opens it at the Roost card (`useOpenAt` in `router.ts`, which holds the
place while the cards above land); the homepage's "See the Roost" and the
Owner page's Roost panel point there.

The Contracts page is a section of Docs, "The contracts", after "The
numbers": both address lists in the numbers table itself
(`components/Numbers.tsx`), each address its own copy control (a button:
click, Enter or Space copies the whole address and says "Copied" in its
place; middle-truncated at 375px), the explorer link directly after it for
the project's own, and the liquidity lock under them. The section owns the
deployment read's reporting: pending draws a skeleton, a failure draws the
error with a retry (`deployment: fails` in the switcher). `#/contracts`
opens Docs at the section.

The footer's OpenSea and GitHub marks are Simple Icons' paths (CC0), and
DEX Screener's is its own docs icon traced to one path, as it is in neither
Simple Icons nor a press kit; each has its source and date beside it in
`components/Icon.tsx`.

### The frame, and the price ticker

The nav is a column on the left (`components/Sidebar.tsx`): wordmark, the
pages one per line with the current one filled in the accent, "Trade AVIAN"
among them, the wallet at the bottom. On a wide screen with a pointer it rests
as a 73px rail (the mark, the icons, the wallet's dot) and opens to its full
200px over the page while the pointer or the keyboard is on it, so the page
keeps the width. Below 1280px the column is a drawer over the content — Escape, a link, or the scrim closes it — and a
56px strip keeps the mark, the burger and the wallet. `--header-h` in `tokens.css`
is 0 above the breakpoint and 56px below it; the sticky things on the pages
read that.

Above the page, one thin band (`components/Ticker.tsx`) scrolls the listed
stock tokens' prices in ETH, the whole width of the page column, never
sticky, paused on hover or focus, and a static wrapping row under
`prefers-reduced-motion` (or the dev switcher's `ticker: reduced-motion`).
Its caption is visually hidden and it is not a live region.

While the council has a change waiting (the same `useCouncil()` list the
Owner page's card reads), the band splits into two equal halves with a
hairline between them: on the left a "Council" label and each change as its
sentence and its wait ("in 2 days 4 hours", or "lands any moment" once its
time has passed and nobody has executed it), the rescue in the card's
stronger tone; on the right the prices, scrolling as always. The left half
scrolls when there is more than one change or the one does not fit, and
stands still otherwise. The height never changes. When the list empties the
split goes on the next read. Five scenes under "The price band" in the
switcher (`council`: quiet, replacement, silent-rescue, three, overdue).

The footer carries four marks where its page links were (`lib/links.ts`,
one constant): X live, OpenSea, DEX Screener and GitHub drawn inert and
titled "Soon" until each has a URL, at which point it is a link with no
other change. The marks are in the icon set, in its stroke.

Every figure is a chain read (`chain/prices.ts`): `TheNest.listedRewardTokens()`
for which tokens, then for each the pool the owner routed — `Treasury.v3RouteOf(NATIVE, token)`,
whose one hop names it — or, failing that, `V3_FACTORY.getPool(token, WETH, fee)`
at 0.05% then 0.3%, the first with liquidity. The price is the pool's
`slot0().sqrtPriceX96` turned into ETH per whole token with the pair's order
(`token0 == WETH`) and both tokens' decimals, in BigInt. Once resolved, a refresh
is one `pin()` and ONE `eth_call` (Multicall3 `aggregate3` at that block: the
listing, then `slot0` and `liquidity` per pool), every 15 seconds while the
tab is visible. A token whose pool is missing, empty or unanswered is left
out of that refresh, never shown as zero; three failed refreshes in a row
take the band down. There is no price API — the CSP reaches the RPC and
nothing else — and the Treasury's `floorPrice` is not a market price and is
not here. AVIAN itself is not on the band.

A listed token with no v3 pool at all (2026-09-22) is priced through the
Treasury's v4 route instead: `routeOf(NATIVE, token)` with one hop names the
pool key (ETH as currency0, the token as currency1, the hop's fee, spacing
and hooks), its id is the keccak256 of the encoded key (`lib/pool-id.ts`),
and `StateView.getSlot0(id)` gives the same `sqrtPriceX96`. Routes of more
than one hop are not priced, and a deployment whose `thirdParty` is null has
no fallback. On the testnet the Treasury has no v3 venue (`V3_FACTORY` and
`WETH` are zero) and the band shows something only once a reward token is
listed there, which is the runbook's step 10 (`DeployRehearsalReward`, after
a bird broods): the stand-in token it lists trades in a hookless v4 pool the
script opens, and the band prices it from that pool.

### The veil

Two things on the chain are not spoken of on the site until the founder
unveils them: the vault products (the Roost's lockers' leg, `LockerRewards`,
and the Cache and Feeder screens when they come) and the trait market (the
swap, and the Mint Combo / Recomposed cells on the bird page). The manifest
carries `"unveiled": { "vaults": false, "traitMarket": false }`, required,
both booleans; `unveiled('vaults' | 'traitMarket')` in `chain/manifest.ts`
reads the active manifest and nothing else. Unveiling is an edit to the
deployed JSON, no rebuild (or `AVIARY_UNVEIL_VAULTS=1` /
`AVIARY_UNVEIL_TRAIT_MARKET=1` on a regenerate). While `vaults` is false
the Roost's split line names two figures, the third stream row, its counter,
its DELIVER case and its receipt rows are omitted and the DISTRIBUTE
sentence names four legs; the Perch's fee shares, the Docs, the admin's
Roost panel and Docs' "The contracts" say nothing of it. While
`traitMarket` is false the bird page draws six cells, not eight. The chain is
read the same either way, and the start-up checks do not depend on the
flags. The dev switcher's two toggles flip the active manifest in memory, in
DEV builds only, as the proof that an unveiling changes nothing else.

### Shipping a build, and reading a receipt

```bash
npm run check:release        # npm run check, then scripts/check-release.mjs --chain 4663
npm run receipt -- <txhash>  # one transaction, decoded with the site's own ABIs (--d <id> | --rpc <url>)
```

`check:release` is the gate before `wrangler deploy`: the deployment the site
opens on, by the rule above, must be a chain deployment on the chain named, with
a Sweeper and a served proofs file;
`dist/` must carry the same index, manifest and proofs; `dist/_headers` must
exist with a CSP whose `connect-src` reaches that deployment's RPC (the policy
is generated from the manifests present at build time, so a manifest dropped
in after the build fails here rather than as a blank site). `LAUNCH-CHECKLIST.md`
is the launch-day walk, row by row, with what each receipt must carry.

`make-manifest.mjs --proofs <file>` copies the allowlist toolkit's proofs.json
under `public/deployments/proofs/` and records the served path — the manifest
field is a URL the site fetches, never a filesystem path. A chain manifest
written over a `"mock"` or missing default becomes the index's default on its
own; `--default` forces it; a testnet never displaces a mainnet default.

### Running it against a local chain

```bash
anvil --fork-url https://rpc.mainnet.chain.robinhood.com --chain-id 4663
# deploy with contracts/script/*.s.sol, then:
node scripts/make-manifest.mjs --chain 4663 --id local-fork --rpc http://127.0.0.1:8545
npm run dev
# ?d=local-fork&devwallet=2   a dev-only injected wallet, DEV builds only
# ?d=local-fork&wrongchain=1  the wrong-network path
# ?d=local-fork&unknownchain  the 4902 add-then-switch path
```

A `local-*` id is **per-machine**: its addresses exist only on a fork you
started yourself, so the file is gitignored (`public/deployments/local-*.json`)
and `make-manifest` never adds it to `index.json`. The site loads it straight
from `?d=local-fork` — the file of that name beside the index — and does not
remember it as the last choice, so a fork you tear down cannot break the next
boot. The index is only for deployments that ship, and `npm test` checks that
every entry in it names a file that exists in the repository and is a manifest
the site would boot on (a `local-*` entry fails that test).
