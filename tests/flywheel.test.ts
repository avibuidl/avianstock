// The flywheel snapshot's wiring (2026-09-22): the dollar source's arithmetic,
// the v4 pool id, the paid list's order, and the veil's helper.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { usdPerEthFrom, ethPerToken } from '../src/chain/prices';
import { poolIdOf } from '../src/lib/pool-id';
import { orderPaid, ethValueOf } from '../src/chain/flywheel';
import { setActiveManifest, unveiled, validateManifest } from '../src/chain/manifest';
import { formatReward } from '../src/lib/format';

const WAD = 10n ** 18n;

test('usdPerEth from a known v3 slot0: WETH token0 with 18 decimals, USDG token1 with 6, gives $2,782.67', () => {
  const usd = usdPerEthFrom({ sqrtPriceX96: 4179364365309585417780295n, usdIsToken1: true, usdDecimals: 6, wethDecimals: 18 });
  // 2,782.6674…: the site's formatters truncate (a dollar figure is never
  // rounded up), so the cents read .66; the brief's $2,782.67 is the same
  // number rounded.
  assert.equal(usd / 10n ** 14n, 27826674n, 'to the hundredth of a cent');
  assert.equal(formatReward(usd, 18, 2), '2,782.66');
});

test('the same slot0 read as ETH per USDG is the reciprocal, and the two agree', () => {
  const ethPerUsd = ethPerToken({ sqrtPriceX96: 4179364365309585417780295n, tokenIsToken1: true, tokenDecimals: 6, wethDecimals: 18 });
  const usd = usdPerEthFrom({ sqrtPriceX96: 4179364365309585417780295n, usdIsToken1: true, usdDecimals: 6, wethDecimals: 18 });
  // ethPerUsd × usdPerEth ≈ 1e36, within the truncation of two divisions.
  const product = ethPerUsd * usd;
  assert.ok(product > WAD * WAD - WAD * 10n ** 6n && product <= WAD * WAD, `${product}`);
});

test('the v4 pool id of a known key is the keccak256 of the encoded key, as the chain computes it', () => {
  // The testnet launch pool (2026-09-21 set): ETH against AVIAN at the hook's
  // fee and spacing. The expected id was computed with Foundry's own
  // abi-encode and keccak, and StateView.getSlot0(id) answers for it on chain.
  const id = poolIdOf({
    currency0: '0x0000000000000000000000000000000000000000',
    currency1: '0xaad656f0ce5441334011795ebbebd0615dfc0d64',
    fee: 5000, tickSpacing: 100,
    hooks: '0xae1d36f46588950a08b66b362a1bd7e94196e0cc',
  });
  assert.equal(id, '0xe532082db001e9564225e263e0048827030865b4e97563e60fd25567d8fe8a76');
});

const AVIAN = '0xaad656f0ce5441334011795ebbebd0615dfc0d64' as const;
const row = (token: string, symbol: string, ethValue: bigint | null) => ({ token: token as `0x${string}`, symbol, decimals: 18, amount: WAD, ethValue });

test('the paid list: AVIAN first, then by value descending, unpriced last', () => {
  const out = orderPaid([
    row('0x0000000000000000000000000000000000000002', 'SPY', 3n * WAD),
    row('0x0000000000000000000000000000000000000001', 'NVDA', null),
    row(AVIAN, 'AVIAN', 1n),
    row('0x0000000000000000000000000000000000000003', 'AAPL', 5n * WAD),
    row('0x0000000000000000000000000000000000000004', 'SPCX', null),
  ], AVIAN);
  assert.deepEqual(out.map((p) => p.symbol), ['AVIAN', 'AAPL', 'SPY', 'NVDA', 'SPCX']);
});

test('AVIAN leads even unpriced, and a value is the amount at the price or null with none', () => {
  const out = orderPaid([row('0x0000000000000000000000000000000000000002', 'SPY', 3n * WAD), row(AVIAN, 'AVIAN', null)], AVIAN);
  assert.deepEqual(out.map((p) => p.symbol), ['AVIAN', 'SPY']);
  assert.equal(ethValueOf(2n * WAD, 18, WAD / 2n), WAD);
  assert.equal(ethValueOf(1_000_000n, 6, 2n * WAD), 2n * WAD, 'six-decimal amounts scale by their own decimals');
  assert.equal(ethValueOf(WAD, 18, null), null);
});

// ── the veil, against both committed manifests ────────────────────────────

const here = dirname(fileURLToPath(import.meta.url));
const load = (file: string) => JSON.parse(readFileSync(join(here, '..', 'public', 'deployments', file), 'utf8')) as unknown;

test('both committed manifests carry the veil, both flags false, and the helper reads the active one', () => {
  for (const [file, id] of [['mock.json', 'mock'], ['testnet-46630.json', 'testnet-46630']] as const) {
    const { manifest, problems } = validateManifest(load(file), id);
    assert.deepEqual(problems, [], `${file}: ${JSON.stringify(problems)}`);
    assert.deepEqual(manifest!.unveiled, { vaults: false, traitMarket: false });
    setActiveManifest(manifest!);
    assert.equal(unveiled('vaults'), false);
    assert.equal(unveiled('traitMarket'), false);
  }
});

test('the veil and the dollar source are required, and a flag that is not a boolean is refused', () => {
  const good = load('mock.json') as Record<string, unknown>;
  const noVeil = { ...good }; delete noVeil.unveiled;
  assert.ok(validateManifest(noVeil, 'mock').problems.some((p) => p.path === 'unveiled'));
  const half = { ...good, unveiled: { vaults: false } };
  assert.ok(validateManifest(half, 'mock').problems.some((p) => p.path === 'unveiled.traitMarket'));
  const stringy = { ...good, unveiled: { vaults: 'no', traitMarket: false } };
  assert.ok(validateManifest(stringy, 'mock').problems.some((p) => p.path === 'unveiled.vaults'));
  const noUsd = { ...good }; delete noUsd.usd;
  assert.ok(validateManifest(noUsd, 'mock').problems.some((p) => p.path === 'usd'));
  const badUsd = { ...good, usd: { token: 'not-an-address' } };
  assert.ok(validateManifest(badUsd, 'mock').problems.some((p) => p.path === 'usd.token'));
  const nullUsd = { ...good, usd: null };
  assert.deepEqual(validateManifest(nullUsd, 'mock').problems, []);
  assert.equal(validateManifest(nullUsd, 'mock').manifest!.usd, null);
});

test('an unveiled manifest reads true, and the helper follows the active manifest', () => {
  const good = load('mock.json') as Record<string, unknown>;
  const { manifest } = validateManifest({ ...good, unveiled: { vaults: true, traitMarket: false } }, 'mock');
  setActiveManifest(manifest!);
  assert.equal(unveiled('vaults'), true);
  assert.equal(unveiled('traitMarket'), false);
});
