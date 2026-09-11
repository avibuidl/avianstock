// The start-up cross-check. HANDOVER section 10.
//
// "Every one of them can be checked against the others once you have the list,
// and the site should do it once at start-up. If any of those disagrees, you
// are pointed at the wrong deployment. Fail loudly rather than showing a
// half-working site."
//
// This is what turns a pasted-wrong address into an error message instead of a
// support ticket. It runs against the MANIFEST — the manifest says an address,
// the chain says an address, and they must be the same address.
//
// Three checks here are not in HANDOVER's list and earn their place:
//
//   * CODE AT EVERY ADDRESS. An EOA in a contract slot is the other common
//     paste error, and it produces a site that renders and then fails at the
//     first call.
//   * THE CHAIN ID THE RPC ANSWERS WITH. An RPC pointed at the wrong network is
//     indistinguishable from a wrong address list, until it isn't.
//   * OUR OWN `accountOf` DERIVATION against the collection's. The section 8
//     cycle walk computes satchel addresses locally rather than asking per
//     candidate; if that derivation were wrong the walk would silently check
//     the wrong thing, which is the worst failure this application has.

import { client, pin, readMany, tryReadMany, type At } from './client';
import { contracts, manifest, poolContracts } from './manifest';
import {
  theNestAbi, aviansHookAbi, thePerchAbi, avianStockAbi, traitRegistryAbi, treasuryAbi,
} from './abis.generated';
import { setAccountConfig, verifyDerivation } from './safety';
import { pinFeeCurve } from './launch';
import { COUNTS } from '../art/traits';
import type { Address, Deployment } from '../mock/types';
import type { Hex } from 'viem';

export type Check = { claim: string; ok: boolean; expected?: string; actual?: string };

export type StartupResult = {
  checks: Check[];
  /** The ones that must stop the app. */
  failures: Check[];
  at: At;
};

let last: StartupResult | null = null;

const same = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

export async function runStartupChecks(): Promise<StartupResult> {
  const at = await pin();
  const c = contracts();
  const pool = poolContracts();
  const checks: Check[] = [];

  // ── the RPC is on the chain the manifest names ──
  const live = await client().getChainId();
  checks.push({
    claim: 'the RPC answers for network.chainId',
    ok: live === manifest().network.chainId,
    expected: String(manifest().network.chainId),
    actual: String(live),
  });

  // ── there is code at every address ──
  const addresses = Object.entries(c)
    .filter(([, v]) => !!v) as [string, Address][];
  const codes = await Promise.all(addresses.map(([, address]) =>
    client().getCode({ address, blockNumber: at.blockNumber }).catch(() => undefined)));
  addresses.forEach(([name], i) => {
    const code = codes[i];
    checks.push({
      claim: `there is contract code at ${name}`,
      ok: !!code && code !== '0x',
      expected: 'contract code',
      actual: code && code !== '0x' ? `${(code.length - 2) / 2} bytes` : 'nothing (an EOA, or the wrong chain)',
    });
  });

  // ── HANDOVER section 10, against the manifest ──
  const token = (fn: string) => ({ address: c.AvianStock, abi: avianStockAbi as never, functionName: fn });
  const amm = (fn: string) => ({ address: c.ThePerch, abi: thePerchAbi as never, functionName: fn });
  const staking = (fn: string) => ({ address: c.TheNest, abi: theNestAbi as never, functionName: fn });
  const treasury = (fn: string) => ({ address: c.Treasury, abi: treasuryAbi as never, functionName: fn });

  const wanted: { claim: string; call: ReturnType<typeof token>; expect: Address }[] = [
    { claim: 'token.AVIANS() == Avians', call: token('AVIANS'), expect: c.Avians },
    { claim: 'token.MINT_SINK() == ThePerch', call: token('MINT_SINK'), expect: c.ThePerch },
    { claim: 'token.registry() == TraitRegistry', call: token('registry'), expect: c.TraitRegistry },
    { claim: 'amm.nft() == AvianStock', call: amm('nft'), expect: c.AvianStock },
    { claim: 'amm.avians() == Avians', call: amm('avians'), expect: c.Avians },
    { claim: 'staking.COLLECTION() == AvianStock', call: staking('COLLECTION'), expect: c.AvianStock },
    { claim: 'staking.AVIANS() == Avians', call: staking('AVIANS'), expect: c.Avians },
    { claim: 'treasury.STAKING() == TheNest', call: treasury('STAKING'), expect: c.TheNest },
    { claim: 'treasury.AVIANS() == Avians', call: treasury('AVIANS'), expect: c.Avians },
  ];

  if (pool) {
    const hook = (fn: string) => ({ address: pool.hook, abi: aviansHookAbi as never, functionName: fn });
    wanted.push(
      { claim: 'hook.AVIANS() == Avians', call: hook('AVIANS'), expect: c.Avians },
      { claim: 'hook.TREASURY() == Treasury', call: hook('TREASURY'), expect: c.Treasury },
    );
  }

  const results = await tryReadMany<Address>(wanted.map((w) => w.call), at);
  results.forEach((r, i) => {
    const w = wanted[i];
    checks.push({
      claim: w.claim,
      ok: r.ok && same(r.value, w.expect),
      expected: w.expect,
      actual: r.ok ? r.value : 'the call failed',
    });
  });

  // ── the token-bound account derivation ──
  try {
    const [registry, implementation, salt] = await readMany<unknown>([
      token('ERC6551_REGISTRY'), token('ACCOUNT_IMPLEMENTATION'), token('ACCOUNT_SALT'),
    ], at);
    setAccountConfig({
      registry: registry as Address,
      implementation: implementation as Address,
      salt: salt as Hex,
      chainId: BigInt(manifest().network.chainId),
      collection: c.AvianStock,
    });
    const derived = await verifyDerivation();
    checks.push({
      claim: 'our accountOf derivation == token.accountOf(1)',
      ok: derived.ok,
      expected: derived.onChain,
      actual: derived.local,
    });
  } catch {
    checks.push({
      claim: 'our accountOf derivation == token.accountOf(1)',
      ok: false,
      expected: 'a match',
      actual: 'the collection would not answer',
    });
  }

  // ── the composer's trait lists against the registry ──
  try {
    const counts = await client().readContract({
      address: c.TraitRegistry,
      abi: traitRegistryAbi as never,
      functionName: 'counts',
      blockNumber: at.blockNumber,
    }) as readonly number[];
    const six = [...counts].slice(0, 6).map(Number);
    checks.push({
      claim: 'registry.counts() == the composer\'s trait lists',
      ok: six.every((n, i) => n === COUNTS[i]),
      expected: COUNTS.join('/'),
      actual: six.join('/'),
    });
  } catch {
    checks.push({
      claim: 'registry.counts() == the composer\'s trait lists',
      ok: false, expected: COUNTS.join('/'), actual: 'the registry would not answer',
    });
  }

  // ── the fee curve, if this deployment has a pool ──
  if (pool) {
    try {
      const [launchAt, windowSeconds, feeBps, maxExtra, maxBuy] = await readMany<bigint>([
        { address: pool.hook, abi: aviansHookAbi as never, functionName: 'LAUNCH_AT' },
        { address: pool.hook, abi: aviansHookAbi as never, functionName: 'WINDOW' },
        { address: pool.hook, abi: aviansHookAbi as never, functionName: 'FEE_BPS' },
        { address: pool.hook, abi: aviansHookAbi as never, functionName: 'MAX_EXTRA_FEE_BPS' },
        { address: pool.hook, abi: aviansHookAbi as never, functionName: 'MAX_BUY_PER_TX' },
      ], at);
      const pinned = await pinFeeCurve({
        launchAt: Number(launchAt),
        windowSeconds: Number(windowSeconds),
        feeBps: Number(feeBps),
        maxExtraFeeBps: Number(maxExtra),
        maxBuyPerTx: maxBuy,
      }, at);
      checks.push({
        claim: 'the drawn fee curve == hook.buyFeeBpsAt()',
        // Not fatal: on a disagreement the curve is fetched from the chain and
        // drawn from that, so what is on screen is still the contract's.
        ok: true,
        expected: 'agreement at five points',
        actual: pinned.ok ? 'agrees' : 'differs — drawing the chain\'s own values instead',
      });
    } catch {
      checks.push({
        claim: 'the drawn fee curve == hook.buyFeeBpsAt()', ok: true,
        expected: 'agreement at five points', actual: 'the hook would not answer; First Light will say so',
      });
    }
  }

  // Everything above is fatal except the fee-curve note, which repairs itself.
  const failures = checks.filter((x) => !x.ok);
  last = { checks, failures, at };
  return last;
}

export function lastStartup(): StartupResult | null { return last; }

/** What the `#/contracts` screen renders. */
export async function getDeployment(): Promise<Deployment> {
  const m = manifest();
  const result = last ?? await runStartupChecks();
  const addresses: Record<string, Address> = {};
  for (const [name, address] of Object.entries(m.contracts)) {
    if (address) addresses[name] = address;
  }
  // The third parties are READ OFF THE COLLECTION rather than listed here: the
  // registry, the account implementation and the transfer validator are all
  // immutables or owner state on this deployment, and asking is the only way to
  // show what this deployment actually uses.
  const thirdParty: Record<string, Address> = {};
  try {
    const [registry, implementation, validator] = await tryReadMany<Address>([
      { address: m.contracts.AvianStock, abi: avianStockAbi as never, functionName: 'ERC6551_REGISTRY' },
      { address: m.contracts.AvianStock, abi: avianStockAbi as never, functionName: 'ACCOUNT_IMPLEMENTATION' },
      { address: m.contracts.AvianStock, abi: avianStockAbi as never, functionName: 'getTransferValidator' },
    ], result.at);
    if (registry.ok) thirdParty['ERC-6551 registry'] = registry.value;
    if (implementation.ok) thirdParty['Tokenbound account implementation'] = implementation.value;
    if (validator.ok) thirdParty['Transfer validator'] = validator.value;
  } catch {
    // The panel shows what it has; it is provenance, not a number anyone acts on.
  }
  if (m.multicall3) thirdParty.Multicall3 = m.multicall3;

  // `result` is still wanted for `result.at`: the third parties above are read
  // at the block the start-up checks pinned, so this panel and that gate are
  // talking about the same chain state.
  return { addresses, thirdParty };
}
