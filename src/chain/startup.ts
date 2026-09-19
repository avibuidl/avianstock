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
import { contracts, manifest, poolContracts, roostContracts, sweeperAddress } from './manifest';
import {
  theNestAbi, aviansHookAbi, thePerchAbi, avianStockAbi, sweeperAbi, traitRegistryAbi, treasuryAbi,
  theRoostAbi, aviansStakingAbi,
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
  const sweeper = sweeperAddress();
  const { roost, staking: aviansStaking } = roostContracts();
  const addresses = [...Object.entries(c), ['Sweeper', sweeper] as const, ['TheRoost', roost] as const, ['AviansStaking', aviansStaking] as const]
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
    // The transfer hook's target. A collection pointed at the wrong Nest would
    // expire nothing, and every brood would outlive its sale.
    { claim: 'token.NEST() == TheNest', call: token('NEST'), expect: c.TheNest },
    { claim: 'token.registry() == TraitRegistry', call: token('registry'), expect: c.TraitRegistry },
    { claim: 'amm.nft() == AvianStock', call: amm('nft'), expect: c.AvianStock },
    { claim: 'amm.avians() == Avians', call: amm('avians'), expect: c.Avians },
    { claim: 'staking.COLLECTION() == AvianStock', call: staking('COLLECTION'), expect: c.AvianStock },
    { claim: 'staking.AVIANS() == Avians', call: staking('AVIANS'), expect: c.Avians },
    { claim: 'treasury.STAKING() == TheNest', call: treasury('STAKING'), expect: c.TheNest },
    { claim: 'treasury.AVIANS() == Avians', call: treasury('AVIANS'), expect: c.Avians },
    // THE ROOST (2026-09-18). Bound to this Nest and this staking contract at
    // construction, and the Nest's cost sink is bound to it — a Roost from
    // another deployment would take every tier cost and split it to
    // strangers. All checked. (The Perch's `feeRecipient` is the Roost by
    // default but owner-settable to anything, so it is read on the admin
    // panel rather than refused here.)
    { claim: 'roost.NEST() == TheNest', call: { address: roost, abi: theRoostAbi as never, functionName: 'NEST' }, expect: c.TheNest },
    { claim: 'roost.STAKING() == AviansStaking', call: { address: roost, abi: theRoostAbi as never, functionName: 'STAKING' }, expect: aviansStaking },
    { claim: 'roost.AVIANS() == Avians', call: { address: roost, abi: theRoostAbi as never, functionName: 'AVIANS' }, expect: c.Avians },
    { claim: 'aviansStaking.ROOST() == TheRoost', call: { address: aviansStaking, abi: aviansStakingAbi as never, functionName: 'ROOST' }, expect: roost },
    { claim: 'aviansStaking.AVIANS() == Avians', call: { address: aviansStaking, abi: aviansStakingAbi as never, functionName: 'AVIANS' }, expect: c.Avians },
    { claim: 'staking.costSink() == TheRoost', call: staking('costSink'), expect: roost },
  ];

  if (pool) {
    const hook = (fn: string) => ({ address: pool.hook, abi: aviansHookAbi as never, functionName: fn });
    wanted.push(
      { claim: 'hook.AVIANS() == Avians', call: hook('AVIANS'), expect: c.Avians },
      { claim: 'hook.TREASURY() == Treasury', call: hook('TREASURY'), expect: c.Treasury },
    );
  }
  if (sweeper) {
    // A Sweeper built for some other collection would answer `status` about
    // the wrong birds and `sweep` nothing of ours. Its one immutable, checked.
    wanted.push({
      claim: 'sweeper.COLLECTION() == AvianStock',
      call: { address: sweeper, abi: sweeperAbi as never, functionName: 'COLLECTION' },
      expect: c.AvianStock,
    });
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

  // ── the allowlist proofs, if this deployment names a file ──
  //
  // `proofFor` treats a missing file as "no proofs", which is the right
  // answer for a deployment that never had any and the wrong one for a launch
  // whose manifest names a file the host is not serving: every Merkle-listed
  // wallet would read NotAllowlisted and nobody would know why. So it is asked
  // here, once, and a named file that does not come back as an object stops
  // the site with the path on screen.
  const proofsPath = manifest().allowlistProofs;
  if (proofsPath) {
    let actual = 'not served';
    let ok = false;
    try {
      const res = await fetch(new URL(proofsPath, location.href).toString(), { cache: 'no-store' });
      if (res.ok) {
        const raw = await res.json() as unknown;
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
          ok = true;
          actual = `${Object.keys(raw as object).length} wallets`; /* count */
        } else {
          actual = 'served, but not an object of address -> proof';
        }
      } else {
        actual = `${res.status} ${res.statusText}`;
      }
    } catch (e) {
      actual = (e as Error).message;
    }
    checks.push({ claim: `the allowlist proofs file is served (${proofsPath})`, ok, expected: 'address -> proof[]', actual });
  }

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
  if (m.sweeper) addresses.Sweeper = m.sweeper;
  addresses.AviansStaking = m.aviansStaking;
  addresses.TheRoost = m.roost;
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
