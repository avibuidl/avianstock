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

test('the Sweeper’s refusals decode: its NotTheOwner shares the Nest’s selector, and the satchel’s NotAuthorized is its own', () => {
  // HANDOVER section 7, the Sweeper rows. `NotTheOwner(uint256,address,address)`
  // is the same signature on the Nest and the Sweeper, so one selector names
  // both and the sentence is the same: that bird is not in this wallet.
  const holder = '0x0000000000000000000000000000000000000001';
  const caller = '0x0000000000000000000000000000000000000002';
  const decoded = decodeRevert(`0x04987a21${(1204n).toString(16).padStart(64, '0')}${holder.slice(2).padStart(64, '0')}${caller.slice(2).padStart(64, '0')}` as `0x${string}`);
  assert.equal(decoded.name, 'NotTheOwner');
  assert.equal(decoded.args.id, 1204);
  assert.equal(decodeRevert('0x615fd3c0').name, 'EmptyList');
  // AccountV3's, from the satchel: a grant by someone who is not the holder.
  assert.equal(decodeRevert('0xea8e4eb5').name, 'NotAuthorized');
});

test('a hook revert inside the V4Quoter\'s UnexpectedRevertBytes is unwrapped twice, down to BuyTooLarge and its cap', () => {
  // The quoter simulates the swap; the PoolManager wraps the hook's revert;
  // the quoter wraps that. BuyTooLarge(uint256 cumulative, uint256 cap).
  const cap = 50_000_000n * 10n ** 18n;
  const inner = `0xc888aaa1${(60_000_000n * 10n ** 18n).toString(16).padStart(64, '0')}${cap.toString(16).padStart(64, '0')}`;
  const wrapped = encodeWrapped(inner);
  const selector = Object.entries(ERROR_SIGNATURES).find(([, sig]) => sig.startsWith('UnexpectedRevertBytes('))?.[0];
  assert.ok(selector, 'UnexpectedRevertBytes should be in the generated set, read from QuoterRevert.sol');
  const body = encodeAbiParameters([{ type: 'bytes' }], [wrapped]);
  const decoded = decodeRevert(`${selector}${body.slice(2)}` as `0x${string}`);
  assert.equal(decoded.name, 'BuyTooLarge');
  assert.equal(decoded.args.cap, cap);
});

test('the Roost’s and the staking’s refusals decode by name, with their arguments', () => {
  // TooSoon(uint256 nextAt): the timestamp is in the error, and the card reads it.
  const at = 1_800_000_000n;
  const soon = decodeRevert(`0xe86f59ea${at.toString(16).padStart(64, '0')}` as `0x${string}`);
  assert.equal(soon.name, 'TooSoon');
  assert.equal(soon.args.at, Number(at));
  assert.equal(decodeRevert('0x01663f24').name, 'NothingToDistribute');
  assert.equal(decodeRevert('0x969bf728').name, 'NothingToClaim');
  assert.equal(decodeRevert('0x1f2a2005').name, 'ZeroAmount');
  // InsufficientStake(address, uint256 staked, uint256 wanted): "You have N staked."
  const who = '0x0000000000000000000000000000000000000001';
  const ins = decodeRevert(`0x936d426d${who.slice(2).padStart(64, '0')}${(5n * 10n ** 18n).toString(16).padStart(64, '0')}${(9n * 10n ** 18n).toString(16).padStart(64, '0')}` as `0x${string}`);
  assert.equal(ins.name, 'InsufficientStake');
  assert.equal(ins.args.staked, 5n * 10n ** 18n);
  assert.equal(ins.args.wanted, 9n * 10n ** 18n);
});

test('deliverHeld’s two refusals decode by name', () => {
  // HANDOVER section 7 (2026-09-19): nothing waits, or what waits still cannot move.
  assert.equal(decodeRevert('0x7a17debd').name, 'NothingHeld');
  assert.equal(decodeRevert('0x1e1b399d').name, 'NothingDeliverable');
});
