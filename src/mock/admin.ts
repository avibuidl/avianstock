// The admin panel, without a chain.
//
// Same rule as the rest of this directory: every state the screen can draw is
// reachable from `scenario.ts`, so a reviewer can send a link to the panel in a
// particular condition — mismatched owners, a locked renderer, a full reward
// list, a vault whose lock has expired — without a deployment.
//
// The figures here are plausible, not real. Nothing outside this directory
// reads them: `source.ts` picks this file or `src/chain/admin*.ts` from the
// active manifest's `driver`.

import type {
  AdminContract, AdminPairRow, AdminRewardToken, AdminRoute, AdminState, AdminTargetRow,
  Address, AllowlistCheck, Amount, ForeignToken, Hex, OnPhase, TokenId, TreasuryRow,
  ValidatorOperation,
} from './types';
import { ContractError } from './errors';
import { scenario } from './scenario';
import {
  ADDRESSES, FREE_ALLOCATION, LOCK_SECONDS, MIN_PRICE, PRICE, REWARD_TARGET_BPS,
  REWARD_TOKENS, YOU, overlay, world,
} from './fixtures';
import { read } from './reads';
import { requireChain, sleep } from './wallet';

const NOT_YOU = '0x00000000000000000000000000000000000000A1' as Address;
const e18 = (n: number | bigint) => BigInt(n) * 10n ** 18n;

// The same invalidation signal the rest of the mock uses. This module is
// loaded lazily — it is part of the owner chunk — so it cannot register a
// subscription at start-up, and it does not need one.
import { settled } from './writes';

function hash(): Hex {
  let h = '0x';
  for (let i = 0; i < 64; i++) h += '0123456789abcdef'[Math.floor(Math.random() * 16)];
  return h as Hex;
}

/** signing → pending → confirmed, refusing first if this wallet is not the owner. */
async function send<T>(on: OnPhase | undefined, make: () => T): Promise<T & { hash: Hex }> {
  requireChain();
  // The mock refuses a non-owner because the CONTRACT would. Hiding the button
  // is presentation; this is the thing behind it, and the panel is worth
  // exercising against it.
  if (scenario().admin === 'not-the-owner') throw new ContractError('OwnableUnauthorizedAccount');
  on?.('signing');
  await sleep(600);
  const h = hash();
  on?.('pending', h);
  await sleep(1200);
  const out = make();
  on?.('confirmed', h);
  settled();
  return { ...out, hash: h };
}

const CONTRACTS: AdminContract[] = [
  'AvianStock', 'ThePerch', 'TheNest', 'Treasury', 'LiquidityVault',
];

export function getAdmin(who: Address | null): Promise<AdminState> {
  return read(() => {
    const s = scenario();
    const a = s.admin;
    const now = Math.floor(Date.now() / 1000);

    // An incoming owner is NOT the owner — that is the whole point of the
    // two-step — so the fixture has to say so, or the panel draws a hand-over
    // form to the wallet that is already waiting to accept.
    const owner = a === 'not-the-owner' || a === 'you-are-pending' ? NOT_YOU : YOU;
    const ownership = CONTRACTS.map((contract) => ({
      contract,
      address: ADDRESSES[contract],
      // One contract out of step is the case worth being able to see: it is
      // either a deploy in progress or a mistake, and both are worth a banner.
      owner: a === 'owners-disagree' && contract === 'ThePerch' ? NOT_YOU : owner,
      pendingOwner: a === 'transfer-pending' && contract === 'Treasury' ? NOT_YOU
        : a === 'you-are-pending' ? YOU
          : null,
    }));

    const rewards: AdminRewardToken[] = REWARD_TOKENS.map((token, i) => {
      const escrowed = e18([412_000, 96_400, 0, 51_900][i] ?? 0);
      const spare = a === 'surplus-to-restream' && i === 0 ? e18(38_500) : 0n;
      return {
        token,
        listed: true,
        everListed: true,
        escrowed,
        held: escrowed + spare,
        surplus: spare,
        periodFinish: now + 86_400 * (i + 2),
      };
    });

    const targets: AdminTargetRow[] = REWARD_TOKENS.map((t, i) => ({
      token: t.address, weightBps: REWARD_TARGET_BPS[i],
    }));

    const pairs: AdminPairRow[] = REWARD_TOKENS.map((t, i) => ({
      currency: null,
      currencySymbol: 'ETH',
      target: t.address,
      targetSymbol: t.symbol,
      // One target deliberately has no route and no floor: it is the state an
      // owner has to be able to spot, because it is why a conversion that looks
      // configured refuses.
      venue: i === 3 ? 0 : 1,
      floorPriceE18: i === 3 ? 0n : e18(1) / BigInt(i + 2),
      floorSetAt: i === 3 ? 0 : now - 900,
    }));

    const ethIn = 4_182_000_000_000_000_000n;
    const ethClaimable = (ethIn * 2000n) / 10000n;
    const rows: TreasuryRow[] = [
      {
        currency: null, symbol: 'ETH', decimals: 18,
        cumulativeIn: ethIn, balance: ethIn - 2_400_000_000_000_000_000n,
        claimable: ethClaimable, convertible: 356_400_000_000_000_000n,
      },
      {
        currency: ADDRESSES.Avians, symbol: 'AVIANS', decimals: 18,
        cumulativeIn: e18(2_140_000), balance: e18(2_140_000),
        claimable: e18(2_140_000), convertible: 0n,
      },
      ...REWARD_TOKENS.map((t) => ({
        currency: t.address, symbol: t.symbol, decimals: t.decimals,
        cumulativeIn: 0n, balance: 0n, claimable: 0n, convertible: 0n,
      })),
    ];

    return {
      you: who,
      ownership,
      ownersAgree: a !== 'owners-disagree',
      isOwner: !!who && a !== 'not-the-owner' && a !== 'you-are-pending',
      isPendingOwner: !!who && (a === 'you-are-pending'),
      collection: {
        mintOpen: true,
        freeMintOpen: true,
        price: overlay.price ?? PRICE,
        minPrice: MIN_PRICE,
        allowlistRoot: '0x9f2c1a0b7e5d43681caf0e29bd7541ac03e8b96f2d5470a1cb83e6f0947d21ba' as Hex,
        royalty: { receiver: ADDRESSES.Treasury, bps: overlay.royaltyBps ?? 500 },
        renderer: ADDRESSES.BirdRenderer,
        rendererLocked: a === 'everything-locked',
        transferValidator: '0x721C002B0059009a671D00aD1700c9748146cd1B' as Address,
        transferValidatorLocked: a === 'everything-locked',
        freeMinted: 1_284,
        freeAllocation: FREE_ALLOCATION,
        freeAllocationReleased: false,
        freeReleaseAvailableAt: now + (a === 'release-ready' ? -60 : 43_200),
        freeReleaseDelay: 86_400,
        aviansHeld: e18(206_400_000),
        requiredBacking: e18(71_600_000),
        ethHeld: 0n,
      },
      perch: { feeRecipient: ADDRESSES.Treasury },
      nest: {
        rewards,
        snapshotCount: a === 'reward-list-full' ? 8 : 5,
        maxRewardTokens: 8,
        minDuration: 3_600,
        maxDuration: 365 * 86_400,
        totalWeight: 4_188n,
      },
      treasury: {
        rows,
        conversion: {
          enabled: true,
          minInterval: overlay.conversionMinInterval ?? 86_400,
          maxPerCallBps: 2_000,
          slippageBps: 100,
          streamDuration: 7 * 86_400,
          maxPriceAge: 3_600,
        },
        bounds: {
          minIntervalFloor: 86_400,
          maxPerCallBpsCap: 5_000,
          slippageBpsCap: 500,
          minPriceAge: 600,
          maxPriceAge: 86_400,
          maxTargets: 8,
          maxHops: 3,
          minStreamDuration: 3_600,
          maxStreamDuration: 365 * 86_400,
        },
        targets,
        pairs,
        priceKeeper: NOT_YOU,
        maxKeeperDropBps: 500,
      },
      vault: {
        tokenId: 41_902,
        unlockAt: now + (a === 'lock-expired' ? -3_600 : LOCK_SECONDS - 86_400 * 12),
        isLocked: a !== 'lock-expired',
        positionLiquidity: 8_419_002_311_004_772_119n,
        lockSeconds: LOCK_SECONDS,
        // Real in the sense that matters: collecting sets them to zero, so
        // the control's "nothing accrued yet" state is reachable.
        pendingFees: overlay.feesCollected
          ? { eth: 0n, avians: 0n }
          : { eth: 41_900_231_100_477_211n, avians: e18(11_402) },
      },
    };
  });
}

/**
 * A token nobody vetted. The mock answers for two: one that behaves, and one
 * with six decimals and a long hostile symbol, which is the case the panel's
 * clamping and raw-alongside-formatted rule exist for.
 */
export function readForeignToken(address: Address): Promise<ForeignToken> {
  return read(() => {
    const odd = address.toLowerCase().endsWith('6');
    return {
      address,
      symbol: odd
        ? 'USDC (OFFICIAL) — CLAIM AT https'.slice(0, 16)
        : 'STRAY',
      decimals: odd ? 6 : 18,
      holdings: [
        { holder: 'Treasury' as AdminContract, balance: odd ? 4_182_000_000n : e18(1_204), refusal: null },
        { holder: 'ThePerch' as AdminContract, balance: 0n, refusal: null },
        { holder: 'AvianStock' as AdminContract, balance: e18(12), refusal: null },
      ],
      treasuryClaimable: odd ? 4_182_000_000n : e18(1_204),
    };
  });
}

/** The mock's encoder: enough to show a preview, never sent anywhere. */
export function encodeValidatorOperation(op: ValidatorOperation): Hex {
  const body = JSON.stringify(op).replace(/[^a-f0-9]/gi, '').slice(0, 96).padEnd(96, '0');
  return `0x${body}` as Hex;
}

export const readRoute = (_c: Address | null, target: Address): Promise<AdminRoute> =>
  Promise.resolve(
    target.toLowerCase() === REWARD_TOKENS[3].address.toLowerCase()
      ? { venue: 0, v4: [], v3: [] }
      : {
        venue: 1,
        v4: [{ currencyOut: target, fee: 3000, tickSpacing: 60, hooks: ADDRESSES.AviansHook }],
        v3: [],
      },
  );

export const allowanceOf = (_t: Address, _w: Address, _s: Address): Promise<Amount> =>
  Promise.resolve(scenario().admin === 'probe-approved' ? e18(1) : 0n);

export const balanceOfToken = (_t: Address, _w: Address): Promise<Amount> =>
  Promise.resolve(e18(500));

export const hasVault = () => true;
export const adminAddress = (c: AdminContract): Address => ADDRESSES[c];

// ── writes ────────────────────────────────────────────────────────────────

export const setMintOpen = (_o: boolean, on?: OnPhase) => send(on, () => ({}));
export const setFreeMintOpen = (_o: boolean, on?: OnPhase) => send(on, () => ({}));
export const setAllowlistRoot = (_r: Hex, on?: OnPhase) => send(on, () => ({}));
export const setAllowlisted = (_a: Address[], _b: boolean, on?: OnPhase) => send(on, () => ({}));
/** Actually sets it, so the pages that read `price` visibly follow. */
export const setPrice = (price: Amount, on?: OnPhase) =>
  send(on, () => { overlay.price = price; return {}; });
export const setDefaultRoyalty = (_r: Address, bps: number, on?: OnPhase) =>
  send(on, () => { overlay.royaltyBps = bps; return {}; });
export const deleteDefaultRoyalty = (on?: OnPhase) =>
  send(on, () => { overlay.royaltyBps = 0; return {}; });
export const setRenderer = (_r: Address, on?: OnPhase) => send(on, () => ({}));
export const setTransferValidator = (_v: Address, on?: OnPhase) => send(on, () => ({}));

export async function releaseFreeAllocation(on?: OnPhase) {
  if (scenario().admin !== 'release-ready') {
    throw new ContractError('FreeAllocationReleaseTooEarly');
  }
  return send(on, () => ({ released: 716n }));
}

export async function lockRenderer(_expected: Address, on?: OnPhase) {
  if (scenario().admin === 'everything-locked') throw new ContractError('RendererLocked');
  return send(on, () => ({}));
}

export async function lockTransferValidator(_expected: Address, on?: OnPhase) {
  if (scenario().admin === 'everything-locked') throw new ContractError('TransferValidatorLocked');
  return send(on, () => ({}));
}

export async function configureTransferValidator(op: ValidatorOperation, on?: OnPhase) {
  const data = encodeValidatorOperation(op);
  const out = await send(on, () => ({}));
  return { ...out, data };
}

export async function rescueFromCollection(token: Address | null, _to: Address, on?: OnPhase) {
  if (token && token.toLowerCase() === ADDRESSES.Avians.toLowerCase()) {
    // Everything the collection holds in AVIANS is the free mint's backing.
    throw new ContractError('NothingToRescue');
  }
  return send(on, () => ({}));
}

export const setFeeRecipient = (_r: Address, on?: OnPhase) => send(on, () => ({}));

export async function rescueFromPerch(token: Address, _to: Address, on?: OnPhase) {
  const refused = [ADDRESSES.Avians, ADDRESSES.AvianStock].map((x) => x.toLowerCase());
  if (refused.includes(token.toLowerCase())) {
    throw new ContractError('CannotRescue', { token });
  }
  return send(on, () => ({ amount: e18(1_204) }));
}

export const approveForProbe = (_t: Address, _a: Amount, on?: OnPhase) => send(on, () => ({}));

export async function addRewardToken(token: Address, probeAmount: Amount, on?: OnPhase) {
  if (probeAmount === 0n) throw new ContractError('ZeroProbe');
  if (scenario().admin === 'reward-list-full') throw new ContractError('TooManyRewardTokens');
  if (REWARD_TOKENS.some((t) => t.address.toLowerCase() === token.toLowerCase())) {
    throw new ContractError('AlreadyListed', { token });
  }
  return send(on, () => ({}));
}

export const retireRewardToken = (_t: Address, on?: OnPhase) => send(on, () => ({}));

export async function restream(token: Address, _d: number, on?: OnPhase) {
  if (scenario().admin !== 'surplus-to-restream') {
    throw new ContractError('NoSurplusToRestream', { token });
  }
  return send(on, () => ({ amount: e18(38_500) }));
}

export const setFunder = (_f: Address, _a: boolean, on?: OnPhase) => send(on, () => ({}));
export const rescueUnstaked = (_id: TokenId, _to: Address, on?: OnPhase) => send(on, () => ({}));

export async function claimAdmin(currency: Address | null, _to: Address, on?: OnPhase) {
  return send(on, () => ({
    amount: currency === null ? 836_400_000_000_000_000n : e18(2_140_000),
  }));
}

export const setConversionConfig = (c: { minInterval: number }, on?: OnPhase) =>
  send(on, () => { overlay.conversionMinInterval = c.minInterval; return {}; });
export const setTargets = (_t: AdminTargetRow[], on?: OnPhase) => send(on, () => ({}));
export const setRoute = (_c: Address | null, _t: Address, _h: unknown[], on?: OnPhase) => send(on, () => ({}));
export const setV3Route = (_c: Address | null, _t: Address, _h: unknown[], on?: OnPhase) => send(on, () => ({}));
export const setPriceKeeper = (_k: Address, on?: OnPhase) => send(on, () => ({}));
export const setKeeperDropBps = (_b: number, on?: OnPhase) => send(on, () => ({}));
export const setFloorPrice = (_c: Address | null, _t: Address, _p: Amount, on?: OnPhase) =>
  send(on, () => ({}));

export const collectFees = (_to: Address, on?: OnPhase) =>
  send(on, () => {
    overlay.feesCollected = true;
    return { amount0: 41_900_231_100_477_211n, amount1: e18(11_402) };
  });

/**
 * The mock's list is the fixture's: the owner's own address by the manual
 * door, anything ending in an even hex digit by the root, the rest not listed.
 * An address ending in 'c' has claimed. Enough to walk every sentence.
 */
export async function checkAllowlist(address: Address): Promise<AllowlistCheck> {
  await sleep(300);
  const last = address.toLowerCase().slice(-1);
  const isOwner = address.toLowerCase() === YOU.toLowerCase();
  const verdict: AllowlistCheck['verdict'] = last === 'c' ? 'claimed'
    : isOwner ? 'manual'
      : /[02468ace]/.test(last) ? 'merkle'
        : 'not-listed';
  const w = world();
  const freeMintStatus = !w.collection.freeMintOpen ? 'FreeMintClosed'
    : verdict === 'claimed' ? 'FreeMintAlreadyClaimed'
      : verdict === 'not-listed' ? 'NotAllowlisted'
        : null;
  return { address, proofLength: verdict === 'merkle' ? 3 : 0, verdict, freeMintStatus };
}

export async function extendLock(newUnlockAt: number, on?: OnPhase) {
  const now = Math.floor(Date.now() / 1000);
  if (newUnlockAt <= now + LOCK_SECONDS - 86_400 * 12) throw new ContractError('UnlockNotLater');
  return send(on, () => ({}));
}

export async function withdrawPosition(_to: Address, on?: OnPhase) {
  if (scenario().admin !== 'lock-expired') throw new ContractError('StillLocked');
  return send(on, () => ({}));
}

export const transferOwnership = (_c: AdminContract, _to: Address, on?: OnPhase) =>
  send(on, () => ({}));

export async function acceptOwnership(_c: AdminContract, on?: OnPhase) {
  // The pending owner is not the owner yet, so the usual owner check does not
  // apply to this one call — which is the whole reason they can open the panel.
  requireChain();
  on?.('signing');
  await sleep(600);
  const h = hash();
  on?.('pending', h);
  await sleep(1200);
  on?.('confirmed', h);
  settled();
  return { hash: h };
}
