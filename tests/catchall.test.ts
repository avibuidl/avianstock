// The catch-all sentence, and the wallet that cannot pay for gas (2026-09-24).

import test from 'node:test';
import assert from 'node:assert/strict';
import { BaseError, InsufficientFundsError, encodeErrorResult, type Abi } from 'viem';
import { SELECTORS, explain, ContractError } from '../src/mock/errors';
import { asContractError, detailOf, isInsufficientFunds } from '../src/chain/errors';
import { avianStockAbi } from '../src/chain/abis.generated';

// ── the catch-all ──────────────────────────────────────────────────────────

test('the catch-all sentence mentions no bird, on a screen that has none', () => {
  // Seen on the Nest's Treasury card: a failed BUY FOR THE ROOST told the
  // presser their bird was not reserved.
  const e = explain(new ContractError('Unknown'));
  assert.equal(e.title, 'That did not go through. Nothing was taken.');
  assert.doesNotMatch(e.sentence, /bird|mint|reserved/i, e.sentence);
  assert.doesNotMatch(`${e.title} ${e.sentence}`, /—/, 'an em-dash');
  assert.equal(e.fix?.kind, 'retry');
  // With another screen's context, still nothing about a bird.
  assert.doesNotMatch(explain(new ContractError('Unknown'), { roostBuy: true }).sentence, /bird/i);
});

test('a mint keeps its reservation sentence, through its own context', () => {
  const e = explain(new ContractError('Unknown'), { mint: true });
  assert.equal(e.sentence, 'Nothing about your bird is reserved either: if someone else mints it first, it is theirs.');
});

// ── the wallet that cannot pay ─────────────────────────────────────────────

test('InsufficientFunds is not the chain’s: no selector, and a plain sentence', () => {
  assert.equal(SELECTORS.InsufficientFunds, null);
  const e = explain(new ContractError('InsufficientFunds'));
  assert.equal(e.title, 'Not enough ETH to pay for this.');
  assert.match(e.sentence, /does not have enough ETH to pay for the transaction/);
  assert.match(e.sentence, /Nothing was sent\./);
  assert.doesNotMatch(`${e.title} ${e.sentence}`, /—/, 'an em-dash');
});

test('viem’s InsufficientFundsError maps to InsufficientFunds, wrapped or bare', () => {
  const node = new BaseError('insufficient funds for gas * price + value');
  const bare = new InsufficientFundsError({ cause: node });
  assert.match(bare.message, /exceeds the balance of the account/, 'viem’s own text moved');
  assert.equal(asContractError(bare).errorName, 'InsufficientFunds');

  // As a write sees it: wrapped by viem's execution error.
  const wrapped = new BaseError('Execution failed while buying AVIAN for the Roost.', { cause: bare });
  const err = asContractError(wrapped, { where: 'buying AVIAN for the Roost' });
  assert.equal(err.errorName, 'InsufficientFunds');
  // The raw viem text never reaches the drawer's detail line.
  assert.equal(detailOf(err), null);
});

test('a node’s own words are recognised, even when they carry the sender’s address', () => {
  // geth's phrasing names the address. The revert-data scan reads any 0x and
  // eight hex characters as a selector, so this must be decided before it.
  const words = 'insufficient funds for gas * price + value: address 0xc653c33d5c87Bab9137e034764E1262884F3C2Ab have 0 want 1000000000000000';
  // The shape a real RPC gives: viem's error, its cause carrying the node's
  // words in \`details\`. Decided after the data scan, this read the address
  // as a selector and came out Unknown.
  const real = new InsufficientFundsError({ cause: new BaseError('RPC Request failed.', { details: words }) });
  assert.equal(asContractError(real).errorName, 'InsufficientFunds');
  // And the words alone, as some wallets hand them back.
  const geth = { code: -32000, message: words };
  assert.equal(isInsufficientFunds(geth), true);
  assert.equal(asContractError(geth).errorName, 'InsufficientFunds');
  // And the text viem writes, arriving as a plain object from a wallet.
  assert.equal(asContractError({
    message: 'The total cost (gas * gas fee + value) of executing this transaction exceeds the balance of the account.',
  }).errorName, 'InsufficientFunds');
});

test('a contract’s own refusal still decodes by its name', () => {
  // The collection's InsufficientPayment is a balance refusal too, from the
  // contract, with revert data: it must not be read as the wallet's.
  const data = encodeErrorResult({
    abi: avianStockAbi as unknown as Abi, errorName: 'InsufficientPayment', args: [10n ** 18n],
  });
  const err = asContractError({ message: 'execution reverted', data });
  assert.equal(err.errorName, 'InsufficientPayment');
  assert.equal(isInsufficientFunds({ message: 'execution reverted', data }), false);
});
