// The owner surface, read.
//
// One of two files allowed to import a `*AdminAbi`; `scripts/check-hygiene.mjs`
// fails the build if a third appears. That keeps the rest of the bundle unable
// to ENCODE an owner call — it is not what stops one being made. `onlyOwner` on
// each contract is that, and it refuses a stranger whatever this application
// happens to contain.
//
// Everything below is read at ONE block, so a bound and the value it bounds can
// never come from different blocks and disagree on the same line. Every number
// a field validates against is read here rather than written in a component:
// there is no literal 10,000, no literal 24 hours, no literal cap anywhere in
// the panel.

import type { Abi } from 'viem';
import { client, pin, readMany, tryReadMany, type At } from './client';
import { contracts, manifest } from './manifest';
import { avianStockAbi, aviansAbi, positionManagerAbi, stateViewAbi } from './abis.generated';
import {
  theNestAdminAbi,
  avianStockAdminAbi,
  liquidityVaultAdminAbi,
  thePerchAdminAbi,
  transferValidatorAdminAbi,
  treasuryAdminAbi,
} from './abis.admin.generated';
import { encodeAbiParameters, encodeFunctionData, isAddress, keccak256 } from 'viem';
import { guard, proofFor, selectorToName, simulateClaimAll, tokenMeta } from './reads';
import type {
  AdminContract, AdminPairRow, AdminRewardToken, AdminRoute, AdminState, AdminTargetRow,
  Address, AllowlistCheck, Amount, ForeignToken, Hex, RewardToken, TreasuryRow, V3Hop, V4Hop,
  ValidatorOperation,
} from '../mock/types';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address;

/** `address(0)` out of an ownership getter means "nobody", not an address. */
const orNull = (a: unknown): Address | null =>
  typeof a === 'string' && a !== ZERO_ADDRESS ? (a as Address) : null;

const num = (v: unknown): number => Number(v as bigint); /* count */

// ── where each write goes ─────────────────────────────────────────────────

/**
 * The five, and only the five. A write names one of these and the address comes
 * from the manifest — there is no path in this file that takes an address from
 * a form and calls it.
 */
export function adminAddress(c: AdminContract): Address {
  const set = contracts();
  const found = set[c];
  if (!found) {
    throw new Error(`${c} is not in the ${manifest().id} manifest, so nothing can be sent to it.`);
  }
  return found;
}

export function hasVault(): boolean {
  return !!contracts().LiquidityVault;
}

// ── the whole panel, at one block ─────────────────────────────────────────

export async function getAdmin(who: Address | null, at?: At): Promise<AdminState> {
  return guard('reading the owner panel', async () => {
    const a = at ?? await pin();
    const c = contracts();

    const fac = (functionName: string, args: readonly unknown[] = []) =>
      ({ address: c.AvianStock, abi: avianStockAdminAbi as unknown as Abi, functionName, args });
    const amm = (functionName: string, args: readonly unknown[] = []) =>
      ({ address: c.ThePerch, abi: thePerchAdminAbi as unknown as Abi, functionName, args });
    const nest = (functionName: string, args: readonly unknown[] = []) =>
      ({ address: c.TheNest, abi: theNestAdminAbi as unknown as Abi, functionName, args });
    const tre = (functionName: string, args: readonly unknown[] = []) =>
      ({ address: c.Treasury, abi: treasuryAdminAbi as unknown as Abi, functionName, args });

    // ── ownership, first, because it can be wrong without anyone noticing ──
    const ownershipCalls: { contract: AdminContract; address: Address }[] = [
      { contract: 'AvianStock', address: c.AvianStock },
      { contract: 'ThePerch', address: c.ThePerch },
      { contract: 'TheNest', address: c.TheNest },
      { contract: 'Treasury', address: c.Treasury },
    ];
    if (c.LiquidityVault) {
      ownershipCalls.push({ contract: 'LiquidityVault', address: c.LiquidityVault });
    }

    const ownerAbiFor = (name: AdminContract) => (
      name === 'AvianStock' ? avianStockAdminAbi
        : name === 'ThePerch' ? thePerchAdminAbi
          : name === 'TheNest' ? theNestAdminAbi
            : name === 'Treasury' ? treasuryAdminAbi
              : liquidityVaultAdminAbi
    ) as unknown as Abi;

    const owners = await readMany<unknown>(
      ownershipCalls.flatMap(({ contract, address }) => [
        { address, abi: ownerAbiFor(contract), functionName: 'owner' },
        { address, abi: ownerAbiFor(contract), functionName: 'pendingOwner' },
      ]),
      a,
    );

    const ownership = ownershipCalls.map(({ contract, address }, i) => ({
      contract,
      address,
      owner: owners[i * 2] as Address,
      pendingOwner: orNull(owners[i * 2 + 1]),
    }));

    const lower = (x: string | null) => (x ? x.toLowerCase() : null);
    const ownersAgree = new Set(ownership.map((o) => o.owner.toLowerCase())).size === 1;
    const isOwner = !!who && ownership.some((o) => lower(o.owner) === who.toLowerCase());
    const isPendingOwner = !!who && ownership.some((o) => lower(o.pendingOwner) === who.toLowerCase());

    // ── the collection, the perch, the nest, the treasury, the vault ───────
    const listed = await readMany<Address[]>([nest('listedRewardTokens')], a)
      .then((r) => r[0] as Address[]);

    // The Treasury's currencies: native, AVIANS, and every listed reward token.
    const currencies: Address[] = [ZERO_ADDRESS, c.Avians, ...listed];
    const erc20 = currencies.filter((x) => x !== ZERO_ADDRESS);
    const meta = await tokenMeta([...new Set([...erc20, ...listed])], a);

    const [collectionReads, ammReads, nestReads, treasuryReads, balances, snapshotCount] =
      await Promise.all([
        readMany<unknown>([
          fac('mintOpen'), fac('freeMintOpen'), fac('price'), fac('MIN_PRICE'),
          fac('allowlistRoot'), fac('renderer'), fac('rendererLocked'),
          fac('getTransferValidator'), fac('transferValidatorLocked'),
          fac('freeMinted'), fac('FREE_ALLOCATION'), fac('freeAllocationReleased'),
          fac('freeReleaseAvailableAt'), fac('FREE_RELEASE_DELAY'), fac('requiredBacking'),
          // salePrice 10,000 makes the answer the numerator itself, in bps.
          fac('royaltyInfo', [0n, 10_000n]),
        ], a),
        readMany<unknown>([amm('feeRecipient')], a),
        readMany<unknown>([
          nest('MAX_REWARD_TOKENS'), nest('MIN_DURATION'), nest('MAX_DURATION'),
          nest('totalWeight'),
        ], a),
        readMany<unknown>([
          tre('conversionConfig'), tre('targets'), tre('priceKeeper'), tre('maxKeeperDropBps'),
          tre('MIN_INTERVAL_FLOOR'), tre('MAX_PER_CALL_BPS_CAP'), tre('SLIPPAGE_BPS_CAP'),
          tre('MIN_PRICE_AGE'), tre('MAX_PRICE_AGE'), tre('MAX_TARGETS'), tre('MAX_HOPS'),
        ], a),
        balancesOf(currencies, c.Treasury, a),
        // `_snapshotTokens` has no getter. `claimAll` RETURNS it, so a
        // simulation is the only honest way to count what the cap counts —
        // and it needs an account to simulate as. No account, no number: null,
        // never a zero, because "we could not ask" is not "there are none".
        who ? snapshotLength(who) : Promise.resolve(null),
      ]);

    const perCurrency = await readMany<bigint>(
      currencies.flatMap((currency) => [
        tre('cumulativeIn', [currency]),
        tre('claimable', [currency]),
        tre('convertible', [currency]),
      ]),
      a,
    );

    const rewardState = await readMany<unknown>(
      listed.flatMap((token) => [
        nest('rewardData', [token]),
        nest('escrowedOf', [token]),
        { address: token, abi: aviansAbi as unknown as Abi, functionName: 'balanceOf', args: [c.TheNest] },
      ]),
      a,
    );

    const [collectionAvians, collectionEth] = await Promise.all([
      readMany<bigint>([{
        address: c.Avians, abi: aviansAbi as unknown as Abi,
        functionName: 'balanceOf', args: [c.AvianStock],
      }], a).then((r) => r[0]),
      client().getBalance({ address: c.AvianStock, blockNumber: a.blockNumber }),
    ]);

    const royalty = collectionReads[15] as readonly [Address, bigint];
    const validator = orNull(collectionReads[7]);

    const cfg = readConversionConfig(treasuryReads[0]);
    const targetsRaw = treasuryReads[1] as readonly { token: Address; weightBps: number }[];
    const targets: AdminTargetRow[] = targetsRaw.map((t) => ({
      token: t.token, weightBps: num(t.weightBps),
    }));

    const rows: TreasuryRow[] = currencies.map((currency, i) => {
      const native = currency === ZERO_ADDRESS;
      const m = native ? null : meta.get(currency.toLowerCase());
      return {
        currency: native ? null : currency,
        symbol: native ? manifest().network.nativeCurrency.symbol : m?.symbol ?? '—',
        decimals: native ? manifest().network.nativeCurrency.decimals : m?.decimals ?? 18, /* count */
        cumulativeIn: perCurrency[i * 3],
        claimable: perCurrency[i * 3 + 1],
        convertible: perCurrency[i * 3 + 2],
        balance: balances[i],
      };
    });

    // Every currency crossed with every target. A conversion looks up exactly
    // one of these per split, so the owner has to be able to see all of them —
    // an unset floor or a missing route is the commonest reason a conversion
    // that should work does not.
    const pairCalls = currencies.flatMap((currency) => targets.map((t) => ({ currency, target: t.token })));
    const pairData = pairCalls.length
      ? await readMany<unknown>(pairCalls.flatMap(({ currency, target }) => [
        tre('routeVenue', [currency, target]),
        tre('floorPrice', [currency, target]),
        tre('floorPriceSetAt', [currency, target]),
      ]), a)
      : [];
    const pairs: AdminPairRow[] = pairCalls.map(({ currency, target }, i) => ({
      currency: currency === ZERO_ADDRESS ? null : currency,
      currencySymbol: currency === ZERO_ADDRESS
        ? manifest().network.nativeCurrency.symbol
        : meta.get(currency.toLowerCase())?.symbol ?? '—',
      target,
      targetSymbol: meta.get(target.toLowerCase())?.symbol ?? '—',
      venue: num(pairData[i * 3]),
      floorPriceE18: pairData[i * 3 + 1] as bigint,
      floorSetAt: num(pairData[i * 3 + 2]),
    }));

    const rewards: AdminRewardToken[] = listed.map((token, i) => {
      const data = rewardState[i * 3] as {
        periodFinish?: bigint; listed?: boolean; everListed?: boolean;
      };
      const escrowed = rewardState[i * 3 + 1] as bigint;
      const held = rewardState[i * 3 + 2] as bigint;
      return {
        token: meta.get(token.toLowerCase()) as RewardToken,
        listed: !!data?.listed,
        everListed: !!data?.everListed,
        escrowed,
        held,
        surplus: held > escrowed ? held - escrowed : 0n,
        periodFinish: num(data?.periodFinish ?? 0n),
      };
    });

    const vault = c.LiquidityVault
      ? await readVault(c.LiquidityVault, a)
      : null;

    return {
      you: who,
      ownership,
      ownersAgree,
      isOwner,
      isPendingOwner,
      collection: {
        mintOpen: collectionReads[0] as boolean,
        freeMintOpen: collectionReads[1] as boolean,
        price: collectionReads[2] as Amount,
        minPrice: collectionReads[3] as Amount,
        allowlistRoot: collectionReads[4] as Hex,
        royalty: { receiver: royalty[0], bps: num(royalty[1]) },
        renderer: collectionReads[5] as Address,
        rendererLocked: collectionReads[6] as boolean,
        transferValidator: validator,
        transferValidatorLocked: collectionReads[8] as boolean,
        freeMinted: num(collectionReads[9]),
        freeAllocation: num(collectionReads[10]),
        freeAllocationReleased: collectionReads[11] as boolean,
        freeReleaseAvailableAt: num(collectionReads[12]),
        freeReleaseDelay: num(collectionReads[13]),
        requiredBacking: collectionReads[14] as Amount,
        aviansHeld: collectionAvians,
        ethHeld: collectionEth,
      },
      perch: { feeRecipient: ammReads[0] as Address },
      nest: {
        rewards,
        snapshotCount,
        maxRewardTokens: num(nestReads[0]),
        minDuration: num(nestReads[1]),
        maxDuration: num(nestReads[2]),
        totalWeight: nestReads[3] as bigint,
      },
      treasury: {
        rows,
        conversion: cfg,
        bounds: {
          minIntervalFloor: num(treasuryReads[4]),
          maxPerCallBpsCap: num(treasuryReads[5]),
          slippageBpsCap: num(treasuryReads[6]),
          minPriceAge: num(treasuryReads[7]),
          maxPriceAge: num(treasuryReads[8]),
          maxTargets: num(treasuryReads[9]),
          maxHops: num(treasuryReads[10]),
          // `setConversionConfig` validates the stream duration against the
          // NEST's bounds, not its own, so those are the numbers the field has
          // to be checked against.
          minStreamDuration: num(nestReads[1]),
          maxStreamDuration: num(nestReads[2]),
        },
        targets,
        pairs,
        priceKeeper: orNull(treasuryReads[2]),
        maxKeeperDropBps: num(treasuryReads[3]),
      },
      vault,
    };
  });
}

/** viem hands a struct getter back as an object or a tuple. Read it either way. */
function readConversionConfig(v: unknown) {
  const t = v as readonly unknown[];
  if (Array.isArray(v)) {
    return {
      enabled: t[0] as boolean,
      minInterval: num(t[1]),
      maxPerCallBps: num(t[2]),
      slippageBps: num(t[3]),
      streamDuration: num(t[4]),
      maxPriceAge: num(t[5]),
    };
  }
  const o = v as Record<string, unknown>;
  return {
    enabled: !!o.enabled,
    minInterval: num(o.minInterval),
    maxPerCallBps: num(o.maxPerCallBps),
    slippageBps: num(o.slippageBps),
    streamDuration: num(o.streamDuration),
    maxPriceAge: num(o.maxPriceAge),
  };
}

async function readVault(address: Address, a: At) {
  const v = await readMany<unknown>([
    { address, abi: liquidityVaultAdminAbi as unknown as Abi, functionName: 'tokenId' },
    { address, abi: liquidityVaultAdminAbi as unknown as Abi, functionName: 'unlockAt' },
    { address, abi: liquidityVaultAdminAbi as unknown as Abi, functionName: 'isLocked' },
    { address, abi: liquidityVaultAdminAbi as unknown as Abi, functionName: 'positionLiquidity' },
    { address, abi: liquidityVaultAdminAbi as unknown as Abi, functionName: 'LOCK_DURATION' },
  ], a);
  const tokenId = num(v[0]);
  return {
    tokenId,
    unlockAt: num(v[1]),
    isLocked: v[2] as boolean,
    positionLiquidity: v[3] as bigint,
    lockSeconds: num(v[4]),
    pendingFees: await pendingFeesOf(tokenId, a),
  };
}

/** A v4 PoolKey, in the order the pool hashes it. */
const POOL_KEY = [{
  type: 'tuple',
  components: [
    { name: 'currency0', type: 'address' }, { name: 'currency1', type: 'address' },
    { name: 'fee', type: 'uint24' }, { name: 'tickSpacing', type: 'int24' },
    { name: 'hooks', type: 'address' },
  ],
}] as const;

/** `int24` out of the low 24 bits of a word: sign-extend bit 23. */
function int24At(word: bigint, shift: bigint): number {
  const raw = Number((word >> shift) & 0xffffffn);
  return raw >= 0x800000 ? raw - 0x1000000 : raw;
}

/**
 * What `collectFees` would pay right now, per currency — from the chain's
 * own accounting, not from events.
 *
 * The pool keeps, per position, the fee growth inside its tick range as of the
 * position's last touch. Fees owed since are (current growth inside − last
 * recorded) × liquidity, in Q128 — the same arithmetic `Position.update` runs
 * on collect. Four reads:
 *
 *   PositionManager.getPoolAndPositionInfo(tokenId)   which pool, which ticks
 *   StateView.getPositionInfo(poolId, PM, lo, hi, salt) liquidity + last growth
 *   StateView.getFeeGrowthInside(poolId, lo, hi)        current growth
 *
 * The position's owner inside the PoolManager is the PositionManager, and its
 * salt is the token id — that is how v4-periphery keys every position it
 * mints. `positionInfo` packs the ticks: lower at bit 8, upper at bit 32,
 * both int24 (PositionInfoLibrary). The pool id is the keccak of the encoded
 * key.
 *
 * Which is ETH and which is AVIANS is read off the key rather than assumed:
 * currency0 is the lower address and the native currency is address zero, so
 * it is always currency0 — but "always" is the kind of word this file avoids.
 */
async function pendingFeesOf(tokenId: number, a: At): Promise<{ eth: Amount; avians: Amount }> {
  const none = { eth: 0n, avians: 0n };
  if (tokenId === 0) return none;
  const tp = manifest().thirdParty;
  if (!tp) return none;

  const [key, info] = await client().readContract({
    address: tp.PositionManager, abi: positionManagerAbi as unknown as Abi,
    functionName: 'getPoolAndPositionInfo', args: [BigInt(tokenId)], blockNumber: a.blockNumber,
  } as never) as readonly [
    { currency0: Address; currency1: Address; fee: number; tickSpacing: number; hooks: Address },
    bigint,
  ];
  const tickLower = int24At(info, 8n);
  const tickUpper = int24At(info, 32n);
  const poolId = keccak256(encodeAbiParameters(POOL_KEY, [key]));
  const salt = (`0x${BigInt(tokenId).toString(16).padStart(64, '0')}`) as Hex;

  const [position, inside] = await readMany<readonly bigint[]>([
    {
      address: tp.StateView, abi: stateViewAbi as unknown as Abi, functionName: 'getPositionInfo',
      args: [poolId, tp.PositionManager, tickLower, tickUpper, salt],
    },
    {
      address: tp.StateView, abi: stateViewAbi as unknown as Abi, functionName: 'getFeeGrowthInside',
      args: [poolId, tickLower, tickUpper],
    },
  ], a);

  const liquidity = position[0];
  const Q128 = 1n << 128n;
  const MASK = (1n << 256n) - 1n;
  // The pool's subtraction wraps; so does this one.
  const owed0 = (((inside[0] - position[1]) & MASK) * liquidity) / Q128;
  const owed1 = (((inside[1] - position[2]) & MASK) * liquidity) / Q128;

  const avians = contracts().Avians.toLowerCase();
  const c0 = key.currency0.toLowerCase();
  return c0 === avians
    ? { avians: owed0, eth: owed1 }
    : { eth: owed0, avians: owed1 };
}

/**
 * The membership check under "Allowlist, by address".
 *
 * Four reads, and the verdict is the collector's: the manual mapping says
 * "manual door"; failing that, `isAllowlisted` with the proof the deployment's
 * proofs file holds for this address (or none) says "Merkle root"; and
 * `freeClaimed` overrides both, because a wallet that has claimed is refused
 * before its listing is even consulted. `freeMintStatus` is returned decoded
 * alongside — it is exactly what the collector would be told.
 */
export async function checkAllowlist(address: Address): Promise<AllowlistCheck> {
  return guard('checking the allowlist', async () => {
    const a = await pin();
    const c = contracts();
    const proof = await proofFor(address);
    const stock = (functionName: string, args: readonly unknown[]) =>
      ({ address: c.AvianStock, abi: avianStockAbi as unknown as Abi, functionName, args });
    const [manual, listed, claimed, status] = await readMany<unknown>([
      stock('allowlisted', [address]),
      stock('isAllowlisted', [address, proof]),
      stock('freeClaimed', [address]),
      stock('freeMintStatus', [address, proof]),
    ], a);
    const verdict: AllowlistCheck['verdict'] = claimed ? 'claimed'
      : manual ? 'manual'
        : listed ? 'merkle'
          : 'not-listed';
    return {
      address,
      proofLength: proof.length,
      verdict,
      freeMintStatus: selectorToName(status as string),
    };
  });
}

/** Native goes through `eth_getBalance`; everything else through `balanceOf`. */
async function balancesOf(currencies: Address[], holder: Address, a: At): Promise<Amount[]> {
  const erc20 = currencies.filter((x) => x !== ZERO_ADDRESS);
  const [native, values] = await Promise.all([
    currencies.includes(ZERO_ADDRESS)
      ? client().getBalance({ address: holder, blockNumber: a.blockNumber })
      : Promise.resolve(0n),
    erc20.length
      ? readMany<bigint>(erc20.map((token) => ({
        address: token, abi: aviansAbi as unknown as Abi, functionName: 'balanceOf', args: [holder],
      })), a)
      : Promise.resolve([] as bigint[]),
  ]);
  const byToken = new Map(erc20.map((t, i) => [t.toLowerCase(), values[i]]));
  return currencies.map((x) => (x === ZERO_ADDRESS ? native : byToken.get(x.toLowerCase())!));
}

/**
 * How many tokens the 8-token cap actually counts.
 *
 * A simulation, because `_snapshotTokens` is private and `claimAll` returning
 * it is the only way to see it. A failure here is reported as "we could not
 * ask" — null — and the panel says so rather than drawing a zero.
 */
async function snapshotLength(who: Address): Promise<number | null> {
  try {
    const { tokens } = await simulateClaimAll(who);
    return tokens.length;
  } catch {
    return null;
  }
}

// ── the sweeps, and a token nobody vetted ─────────────────────────────────

const HOLDERS: AdminContract[] = ['Treasury', 'ThePerch', 'AvianStock'];

/**
 * Look up an arbitrary ERC-20 for the sweep controls.
 *
 * A token somebody sent by accident is in no list, so the address is typed. All
 * of what comes back is attacker-controlled: `symbol` is clamped and rendered
 * as a text node by the component, and `decimals` stays NULL when it cannot be
 * read rather than defaulting to 18 — a token claiming 77 decimals must not be
 * able to make a large sweep look small.
 */
export async function readForeignToken(address: Address): Promise<ForeignToken> {
  return guard('reading a token', async () => {
    if (!isAddress(address)) throw new Error('not an address');
    const a = await pin();
    const c = contracts();

    const [meta, balances] = await Promise.all([
      tryReadMany<unknown>([
        { address, abi: aviansAbi as unknown as Abi, functionName: 'symbol' },
        { address, abi: aviansAbi as unknown as Abi, functionName: 'decimals' },
      ], a),
      tryReadMany<bigint>(HOLDERS.map((holder) => ({
        address, abi: aviansAbi as unknown as Abi, functionName: 'balanceOf',
        args: [adminAddress(holder)],
      })), a),
    ]);

    const claimable = await tryReadMany<bigint>([{
      address: c.Treasury, abi: treasuryAdminAbi as unknown as Abi,
      functionName: 'claimable', args: [address],
    }], a);

    const symbol = meta[0];
    const decimals = meta[1];

    return {
      address,
      symbol: symbol.ok && typeof symbol.value === 'string' && symbol.value
        ? symbol.value.slice(0, 16)
        : `${address.slice(0, 6)}…${address.slice(-4)}`,
      decimals: decimals.ok && typeof decimals.value === 'number' ? decimals.value : null, /* count */
      holdings: HOLDERS.map((holder, i) => ({
        holder,
        balance: balances[i].ok ? balances[i].value : 0n,
        refusal: refusalFor(holder, address),
      })),
      treasuryClaimable: claimable[0].ok ? claimable[0].value : null,
    };
  });
}

/**
 * What a holder will refuse before it is asked, so the owner is not sent to
 * sign a transaction that reverts. Each of these is a line in the contract.
 */
function refusalFor(holder: AdminContract, token: Address): string | null {
  const c = contracts();
  const is = (x: Address | null) => !!x && x.toLowerCase() === token.toLowerCase();
  if (holder === 'ThePerch') {
    if (is(c.Avians)) return 'The perch refuses AVIANS by address — it is the pool.';
    if (is(c.AvianStock)) return 'The perch refuses the collection by address.';
  }
  if (holder === 'AvianStock' && is(c.Avians)) {
    return 'Only the AVIANS above what the free mint requires as backing can leave.';
  }
  return null;
}

// ── configureTransferValidator, composed ──────────────────────────────────

/** The validator's own token type for an ERC-721 collection. */
const TOKEN_TYPE_ERC721 = 721;

/**
 * Turn one named operation into calldata for the collection to forward.
 *
 * Composed from typed inputs, never typed as hex. The collection's own
 * allowlist is what decides which selectors it will forward, so a hex field
 * could not have reached an arbitrary contract — that is not why there is no
 * hex field. There is no hex field because it would give the owner no preview
 * of what they are about to do, and because "paste this hex into your admin
 * panel" is the most reusable phishing instruction this site could ship.
 *
 * The three booleans on `setTransferSecurityLevelOfCollection` are fixed to the
 * runbook's policy — authorization mode ON, wildcard operators ON, account
 * freezing OFF — because the runbook's `verifyPolicy` asserts exactly that and
 * a panel that could quietly disagree with the script would be worse than no
 * panel.
 */
export function encodeValidatorOperation(op: ValidatorOperation): Hex {
  const abi = transferValidatorAdminAbi as unknown as Abi;
  const collection = contracts().AvianStock;
  switch (op.kind) {
    case 'createList':
      return encodeFunctionData({ abi, functionName: 'createList', args: [op.name] });
    case 'applyListToCollection':
      return encodeFunctionData({ abi, functionName: 'applyListToCollection', args: [collection, op.listId] });
    case 'setSecurityLevel':
      return encodeFunctionData({
        abi,
        functionName: 'setTransferSecurityLevelOfCollection',
        args: [collection, op.level, false, false, false],
      });
    case 'setTokenType':
      return encodeFunctionData({
        abi, functionName: 'setTokenTypeOfCollection', args: [collection, TOKEN_TYPE_ERC721],
      });
    case 'addToWhitelist':
      return encodeFunctionData({ abi, functionName: 'addAccountsToWhitelist', args: [op.listId, op.accounts] });
    case 'removeFromWhitelist':
      return encodeFunctionData({ abi, functionName: 'removeAccountsFromWhitelist', args: [op.listId, op.accounts] });
    case 'addToAuthorizers':
      return encodeFunctionData({ abi, functionName: 'addAccountsToAuthorizers', args: [op.listId, op.accounts] });
    case 'removeFromAuthorizers':
      return encodeFunctionData({ abi, functionName: 'removeAccountsFromAuthorizers', args: [op.listId, op.accounts] });
  }
}

/**
 * The route for one pair, read on demand.
 *
 * Both are read, not only the one in effect, because a v3 route silently takes
 * precedence over a v4 one and an owner editing the v4 hops of a pair that has
 * a v3 route needs to see that before they wonder why nothing changed.
 */
export async function readRoute(currency: Address | null, target: Address): Promise<AdminRoute> {
  return guard('reading a route', async () => {
    const from = currency ?? ZERO_ADDRESS;
    const t = (functionName: string) => ({
      address: contracts().Treasury, abi: treasuryAdminAbi as unknown as Abi,
      functionName, args: [from, target],
    });
    const [venue, v4, v3] = await readMany<unknown>([t('routeVenue'), t('routeOf'), t('v3RouteOf')]);
    return {
      venue: num(venue),
      v4: (v4 as readonly V4Hop[]).map((h) => ({
        currencyOut: h.currencyOut, fee: num(h.fee), tickSpacing: num(h.tickSpacing), hooks: h.hooks,
      })),
      v3: (v3 as readonly V3Hop[]).map((h) => ({ pool: h.pool, tokenOut: h.tokenOut })),
    };
  });
}

/** The current allowance of an arbitrary token, for the reward-token probe. */
export async function allowanceOf(token: Address, who: Address, spender: Address): Promise<Amount> {
  return client().readContract({
    address: token, abi: aviansAbi as unknown as Abi,
    functionName: 'allowance', args: [who, spender],
  }) as Promise<Amount>;
}

export async function balanceOfToken(token: Address, who: Address): Promise<Amount> {
  return client().readContract({
    address: token, abi: aviansAbi as unknown as Abi,
    functionName: 'balanceOf', args: [who],
  }) as Promise<Amount>;
}
