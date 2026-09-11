# Fine Avians Club — the mint site

Every screen and every state of the front end, running against a typed mock
layer. **There is no chain in it.** No `viem`, no provider, no RPC, no ABIs.

The design canvas it was drawn from is in [`design/`](design/).

---

## Running it

```bash
npm install
npm run prepare:all     # ../art -> src/art/pieces.json, ../logo and ../pfp -> public/
npm run fonts           # the three typefaces into public/fonts/ (needs network, once)
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
*Get AVIANS* card hands off to the pool), no allowlist sign-up page, no
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

Then open `?d=mainnet-4663`. Files live in `public/deployments/`, are fetched at
runtime, and can be replaced without a rebuild. A manifest that is missing a
field, malformed, or whose addresses disagree with each other on chain stops
the app with a page that names the field or the mismatch.

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
