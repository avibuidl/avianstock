// The error vocabulary, against the compiled contracts.
//
// `SELECTORS` in `src/mock/errors.ts` is the table the UI explains from, and it
// was typed from HANDOVER section 7. `src/chain/abis.generated.ts` is computed
// from `contracts/out`. If a contract ever changes, this test fails — which is
// the difference between a site that names a revert and one that shows hex.

import test from 'node:test';
import assert from 'node:assert/strict';
import { SELECTORS } from '../src/mock/errors';
import { ERROR_SIGNATURES, errorAbi } from '../src/chain/abis.generated';
import { decodeRevert } from '../src/chain/errors';
import { encodeAbiParameters } from 'viem';

test('every selector the UI explains is in the compiled ABIs', () => {
  const missing: string[] = [];
  for (const [name, selector] of Object.entries(SELECTORS)) {
    if (!selector) continue;                            // ours, not the chain's
    if (!ERROR_SIGNATURES[selector.toLowerCase()]) missing.push(`${name} ${selector}`);
  }
  assert.deepEqual(missing, [], 'these are in errors.ts but in no compiled ABI');
});

test('and it is the error it claims to be', () => {
  const wrong: string[] = [];
  for (const [name, selector] of Object.entries(SELECTORS)) {
    if (!selector) continue;
    const signature = ERROR_SIGNATURES[selector.toLowerCase()];
    const base = signature.split('(')[0];
    // Two are namespaced by their source: OpenZeppelin's ERC721* and Limit
    // Break's CreatorTokenTransferValidator__*.
    const ok = base === name || base === `ERC721${name}` || base.endsWith(`__${name}`);
    if (!ok) wrong.push(`${name} -> ${signature}`);
  }
  assert.deepEqual(wrong, [], 'a selector names a different error than the table says');
});

test('the three HANDOVER section 7 names that are in NO contract ABI are still decodable', () => {
  // Solady declares these in SafeTransferLib, not in the contract that reverts
  // with them, and the validator's is the validator's. HANDOVER 9c says every
  // error is in the seven contract ABIs; these three are not, and the generator
  // pulls them from their own sources so the decoder still knows them.
  for (const [selector, expected] of [
    ['0x90b8ec18', 'TransferFailed'],
    ['0x7939f424', 'TransferFromFailed'],
    ['0xef28f901', 'CallerMustBeWhitelisted'],
  ] as const) {
    assert.equal(decodeRevert(`${selector}` as `0x${string}`).name, expected);
  }
});

test('a mint revert decodes to its name and its argument', () => {
  // InsufficientPayment(uint256 price) with the launch price.
  const price = (100_000n * 10n ** 18n).toString(16).padStart(64, '0');
  const decoded = decodeRevert(`0xbd4f29e3${price}` as `0x${string}`);
  assert.equal(decoded.name, 'InsufficientPayment');
  assert.equal(decoded.args.price, 100_000n * 10n ** 18n);
});

test('ComboTaken carries the combination', () => {
  const combo = (0x0102030405n).toString(16).padStart(64, '0');
  const decoded = decodeRevert(`0xf68aef51${combo}` as `0x${string}`);
  assert.equal(decoded.name, 'ComboTaken');
  assert.equal(decoded.args.combo, 0x0102030405n);
});

test('a hook revert inside the PoolManager\'s WrappedError is unwrapped', () => {
  // WrappedError(address hook, bytes4 fn, bytes reason, bytes details) with
  // reason = NotLaunched(uint256 launchAt).
  const inner = `0x8d4799be${(1893456000n).toString(16).padStart(64, '0')}`;
  const wrapped = encodeWrapped(inner);
  const decoded = decodeRevert(wrapped);
  assert.equal(decoded.name, 'NotLaunched');
  assert.equal(decoded.args.launchAt, 1893456000);
});

test('an unrecognised selector is Unknown, and keeps its selector', () => {
  const decoded = decodeRevert('0xdeadbeef');
  assert.equal(decoded.name, 'Unknown');
  assert.equal(decoded.selector, '0xdeadbeef');
});

test('empty revert data does not pretend to be an error', () => {
  assert.equal(decodeRevert('0x').name, 'Unknown');
  assert.equal(decodeRevert(null).name, 'Unknown');
});

test('the generated error set is not empty and has no duplicate selectors', () => {
  assert.ok(errorAbi.length > 100, 'the generator should find every contract error');
  const selectors = Object.keys(ERROR_SIGNATURES);
  assert.equal(new Set(selectors).size, selectors.length);
});

/**
 * WrappedError(address, bytes4, bytes reason, bytes details) — with the
 * selector taken from the GENERATED table rather than typed here, which is the
 * same rule the decoder follows.
 */
function encodeWrapped(reason: string): `0x${string}` {
  const selector = Object.entries(ERROR_SIGNATURES)
    .find(([, sig]) => sig.startsWith('WrappedError('))?.[0];
  assert.ok(selector, 'WrappedError should be in the generated ABIs (CustomRevert.sol)');
  const body = encodeAbiParameters(
    [{ type: 'address' }, { type: 'bytes4' }, { type: 'bytes' }, { type: 'bytes' }],
    ['0x0000000000000000000000000000000000000001', '0x00000000', reason as `0x${string}`, '0x'],
  );
  return `${selector}${body.slice(2)}` as `0x${string}`;
}

test('the Perch-only burn errors are decodable, though nothing here can raise them', () => {
  // Neither can reach a collector — the Perch is the only caller of `burn` and
  // it only burns a bird it holds. They are in the table so that if one ever
  // did arrive it would be a sentence rather than a hex blob.
  for (const [selector, expected] of [
    ['0xda9c3382', 'OnlyThePerch'],
    ['0xb9bdd572', 'NotHeldByThePerch'],
  ] as const) {
    assert.equal(decodeRevert(selector as `0x${string}`).name, expected);
  }
});
