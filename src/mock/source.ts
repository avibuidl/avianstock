// The seam, dispatched.
//
// `src/mock/index.ts` is still the only module any component imports from, and
// its export surface has not changed. What changed is what stands behind it:
// the active deployment manifest's `driver` decides whether a call goes to the
// fixtures in this directory or to the contracts in `src/chain/`.
//
// That is also what keeps the dev state switcher alive after wiring. It is not
// a build flag and it is not dead code behind an `if` — the mock is simply a
// DEPLOYMENT, `public/deployments/mock.json`, that the site can be pointed at
// like any other. Every scenario in `scenario.ts` stays reachable by URL.
//
// (The directory is called `mock` for one reason: renaming it would rewrite the
// import line at the top of fourteen screen components, and those screens are
// being edited. The name is a misnomer now. It is worth one commit later, when
// the UI is still.)

import * as fake from './reads';
import * as fakeWrites from './writes';
import * as fakeWallet from './wallet';
import * as fakeSwap from './swap';
import * as fakePrices from './prices';
import * as fakeRoost from './roost';
import * as fakeFlywheel from './flywheel';
import * as fakeCouncil from './council';
import * as fakeSeat from './seat';
import * as chain from '../chain/reads';
import * as chainWrites from '../chain/writes';
import * as chainWallet from '../chain/provider';
import * as chainSwap from '../chain/swap';
import * as chainPrices from '../chain/prices';
import * as chainRoost from '../chain/roost';
import * as chainFlywheel from '../chain/flywheel';
import * as chainCouncil from '../chain/council';
import * as chainBirds from '../chain/birds';
import { hasManifest, manifest, sweeperAddress } from '../chain/manifest';
import { buyFeeBpsAt as chainBuyFeeBpsAt } from '../chain/launch';
import {
  ADDRESSES as MOCK_ADDRESSES, THIRD_PARTY as MOCK_THIRD_PARTY,
  buyFeeBpsAt as mockBuyFeeBpsAt, rewardTokenMeta as mockRewardTokenMeta,
  satchelAddressOf as mockSatchelAddressOf, traitsForId as mockTraitsForId,
} from './fixtures';
import { CHAIN_ID } from './types';
import type {
  AdminContract, AdminRoute, AdminState, AdminTargetRow, Address, AllowlistCheck, Amount, Bird,
  BroodState, SettlePreview,
  CollectionState, Connection, Deployment, ErrorName, ForeignToken, Hex,
  LaunchState, NetworkDescription, OnPhase, PerchState, PermitSignature, RewardToken,
  OwnerStatus, RewardSplit, SwapQuote, SwapState, SweepResult, SweepState, Tier, TokenId, TraitIndices,
  TransferSafety,
  TreasuryState, PriceBoard, RoostState, StakingState, DistributeResult, DeliverResult, FlywheelSnapshot,
  CouncilState,
  OwnedSeat,
  SeatRun,
  SeatState,
  V3Hop, V4Hop, ValidatorOperation, VaultState, WalletInfo, WalletState,
} from './types';

/**
 * No manifest yet means nothing has booted, and the only thing that can answer
 * is the mock. Once `main.tsx` has loaded one, this is the manifest's own word.
 */
export function isMock(): boolean {
  return !hasManifest() || manifest().driver === 'mock';
}

const MOCK_NETWORK: NetworkDescription = {
  chainId: CHAIN_ID,
  chainIdHex: '0x1237',
  chainName: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: ['https://rpc.mainnet.chain.robinhood.com'],
  blockExplorerUrls: ['https://robinhoodchain.blockscout.com'],
};

/** The network, from the manifest. There is no second source for it. */
export function network(): NetworkDescription {
  if (isMock()) return MOCK_NETWORK;
  const n = manifest().network;
  return {
    chainId: n.chainId,
    chainIdHex: `0x${n.chainId.toString(16)}` as `0x${string}`,
    chainName: n.chainName,
    nativeCurrency: n.nativeCurrency,
    rpcUrls: n.rpcUrls,
    blockExplorerUrls: n.blockExplorerUrls,
  };
}

/**
 * A getter would be the honest shape, but the UI reads `NETWORK.chainName` as a
 * value. A Proxy keeps the call sites unchanged and still resolves against
 * whichever deployment is active.
 */
export const NETWORK: NetworkDescription = new Proxy({} as NetworkDescription, {
  get: (_t, key) => (network() as unknown as Record<string | symbol, unknown>)[key],
  has: (_t, key) => key in network(),
  ownKeys: () => Reflect.ownKeys(network()),
  getOwnPropertyDescriptor: (_t, key) =>
    ({ value: (network() as unknown as Record<string | symbol, unknown>)[key], enumerable: true, configurable: true }),
});

// ── wallet and network ────────────────────────────────────────────────────

export const listWallets = (): Promise<WalletInfo[]> =>
  (isMock() ? fakeWallet.listWallets() : chainWallet.listWallets());

export const connect = (rdns: string): Promise<Connection> =>
  (isMock() ? fakeWallet.connect(rdns) : chainWallet.connect(rdns));

export const disconnect = (): void =>
  (isMock() ? fakeWallet.disconnect() : chainWallet.disconnect());

export const switchNetwork = (): Promise<Connection> =>
  (isMock() ? fakeWallet.switchNetwork() : chainWallet.switchNetwork());

export const connection = (): Connection =>
  (isMock() ? fakeWallet.connection() : chainWallet.connection());

export const onConnectionChanged = (cb: (c: Connection) => void): () => void =>
  (isMock() ? fakeWallet.onConnectionChanged(cb) : chainWallet.onConnectionChanged(cb));

function account(): Address | null {
  const c = connection();
  return c.status === 'connected' ? c.address : null;
}

// ── reads ─────────────────────────────────────────────────────────────────

export const getCollection = (): Promise<CollectionState> =>
  (isMock() ? fake.getCollection() : chain.getCollection());

export function getWallet(): Promise<WalletState> {
  if (isMock()) return fake.getWallet();
  const who = account();
  if (!who) return Promise.reject(new Error('no account'));
  return chain.getWallet(who);
}

export const getBird = (id: TokenId): Promise<Bird> =>
  (isMock() ? fake.getBird(id) : chain.getBird(id));

export const getBirdsOf = (who: Address): Promise<Bird[]> =>
  (isMock() ? fake.getBirdsOf(who) : chain.getBirdsOf(who));

export const getMintedBirds = (o?: { offset?: number; limit?: number }): Promise<{ birds: Bird[]; total: number }> =>
  (isMock() ? fake.getMintedBirds(o) : chain.getMintedBirds(o));

export const getPerch = (): Promise<PerchState> =>
  (isMock() ? fake.getPerch() : chain.getPerch(account()));

export const getBrood = (who: Address | null): Promise<BroodState> =>
  (isMock() ? fake.getBrood(who) : chain.getBrood(who));

/** What a settle would move, token by token — the receipt in advance. */
export const simulateSettle = (who: Address, ids: TokenId[]): Promise<SettlePreview> =>
  (isMock() ? fake.simulateSettle(who, ids) : chain.simulateSettle(who, ids));

/**
 * Whether this deployment has a Sweeper at all. The mock always does; a chain
 * deployment has one when its manifest names it, and the panel does not exist
 * otherwise — no read, no call, no ABI touched.
 */
export const canSweep = (): boolean =>
  (isMock() ? true : sweeperAddress() !== null);

export const getSweep = (who: Address, extra: Address[] = []): Promise<SweepState> =>
  (isMock() ? fake.getSweep(who, extra) : chain.getSweep(who, extra));

export const getLaunch = (): Promise<LaunchState> =>
  (isMock() ? fake.getLaunch() : chain.getLaunch());

export const getVault = (): Promise<VaultState> =>
  (isMock() ? fake.getVault() : chain.getVault());

export const getTreasury = (): Promise<TreasuryState> =>
  (isMock() ? fake.getTreasury() : chain.getTreasury());

export const getDeployment = (): Promise<Deployment> =>
  (isMock() ? fake.getDeployment() : chain.getDeployment());

export const getRewardSplit = (): Promise<RewardSplit> =>
  (isMock() ? fake.getRewardSplit() : chain.getRewardSplit());

export const getSupply = (): Promise<{ total: Amount; inPool: Amount; burned: Amount }> =>
  (isMock() ? fake.getSupply() : chain.getSupply());

export const comboTaken = (t: TraitIndices): Promise<{ taken: boolean; tokenId?: TokenId }> =>
  (isMock() ? fake.comboTaken(t) : chain.comboTaken(t));

export const nearestAvailable = (t: TraitIndices, n?: number): Promise<TraitIndices[]> =>
  (isMock() ? fake.nearestAvailable(t, n) : chain.nearestAvailable(t, n));

export const quoteSell = (n: number): Promise<Amount> =>
  (isMock() ? fake.quoteSell(n) : chain.quoteSell(n));

export const quoteBuyNext = (n: number): Promise<Amount> =>
  (isMock() ? fake.quoteBuyNext(n) : chain.quoteBuyNext(n));

export const quoteBuy = (ids: TokenId[]): Promise<Amount> =>
  (isMock() ? fake.quoteBuy(ids) : chain.quoteBuy(ids));

export const nextBirds = (n: number): Promise<TokenId[]> =>
  (isMock() ? fake.nextBirds(n) : chain.nextBirds(n));

export const freeMintStatus = (who: Address, proof: Hex[]): Promise<ErrorName | null> =>
  (isMock() ? fake.freeMintStatus(who, proof) : chain.freeMintStatus(who, proof));

// ── the site's own logic ──────────────────────────────────────────────────

export const checkTransferSafety = (id: TokenId, to: Address): Promise<TransferSafety> =>
  (isMock() ? fake.checkTransferSafety(id, to) : chain.checkTransferSafety(id, to));


export const satchelAddressOf = (id: TokenId): Address =>
  (isMock() ? mockSatchelAddressOf(id) : chain.computeSatchel(id));

export const traitsForId = (id: TokenId): TraitIndices =>
  (isMock() ? mockTraitsForId(id) : chain.traitsForId(id));

/**
 * Warm the trait cache for ids a picker is about to draw, so the synchronous
 * `traitsForId` above never misses. The perch's picker asks a page at a time
 * as it is scrolled. Nothing to do on the mock, whose traits are all known.
 */
export const warmTraits = (ids: TokenId[]): Promise<void> =>
  (isMock() ? Promise.resolve() : chainBirds.traitsFor(ids).then(() => undefined));

export const rewardTokenMeta = (a: Address): RewardToken =>
  (isMock() ? mockRewardTokenMeta(a) : chain.rewardTokenMeta(a));

export const buyFeeBpsAt = (t: number, launchAt: number): number =>
  (isMock() ? mockBuyFeeBpsAt(t, launchAt) : chainBuyFeeBpsAt(t, launchAt));

export function ADDRESSES_FOR_DISPLAY(): Record<string, Address> {
  if (isMock()) return MOCK_ADDRESSES;
  const out: Record<string, Address> = {};
  for (const [name, address] of Object.entries(manifest().contracts)) if (address) out[name] = address;
  const sweeper = sweeperAddress();
  if (sweeper) out.Sweeper = sweeper;
  return out;
}

export const ADDRESSES: Record<string, Address> = new Proxy({} as Record<string, Address>, {
  get: (_t, key) => ADDRESSES_FOR_DISPLAY()[key as string],
  has: (_t, key) => (key as string) in ADDRESSES_FOR_DISPLAY(),
  ownKeys: () => Reflect.ownKeys(ADDRESSES_FOR_DISPLAY()),
  getOwnPropertyDescriptor: (_t, key) =>
    ({ value: ADDRESSES_FOR_DISPLAY()[key as string], enumerable: true, configurable: true }),
});

export const THIRD_PARTY = MOCK_THIRD_PARTY;

// ── writes ────────────────────────────────────────────────────────────────

export const approveAviansForMint = (amount: Amount, on?: OnPhase) =>
  (isMock() ? fakeWrites.approveAviansForMint(amount, on) : chainWrites.approveAviansForMint(amount, on));

export const approveAviansForPerch = (amount: Amount, on?: OnPhase) =>
  (isMock() ? fakeWrites.approveAviansForPerch(amount, on) : chainWrites.approveAviansForPerch(amount, on));

export const approveAviansForNest = (amount: Amount, on?: OnPhase) =>
  (isMock() ? fakeWrites.approveAviansForNest(amount, on) : chainWrites.approveAviansForNest(amount, on));

export const setPerchApproval = (enabled: boolean, on?: OnPhase) =>
  (isMock() ? fakeWrites.setPerchApproval(enabled, on) : chainWrites.setPerchApproval(enabled, on));

export const signMintPermit = (count: number): Promise<PermitSignature> =>
  (isMock() ? fakeWrites.signMintPermit(count) : chainWrites.signMintPermit(count));

export const mint = (t: TraitIndices, o?: { permit?: PermitSignature }, on?: OnPhase) =>
  (isMock() ? fakeWrites.mint(t, o, on) : chainWrites.mint(t, o, on));

export const mintMany = (t: TraitIndices[], o?: { permit?: PermitSignature }, on?: OnPhase) =>
  (isMock() ? fakeWrites.mintMany(t, o, on) : chainWrites.mintMany(t, o, on));

export const mintFree = (t: TraitIndices, proof: Hex[], on?: OnPhase) =>
  (isMock() ? fakeWrites.mintFree(t, proof, on) : chainWrites.mintFree(t, proof, on));

export const sellToPerch = (ids: TokenId[], o?: { route?: 'batch' | 'push' }, on?: OnPhase) =>
  (isMock() ? fakeWrites.sellToPerch(ids, o, on) : chainWrites.sellToPerch(ids, o, on));

export const buyNext = (n: number, on?: OnPhase) =>
  (isMock() ? fakeWrites.buyNext(n, on) : chainWrites.buyNext(n, on));

export const buyNamed = (ids: TokenId[], on?: OnPhase) =>
  (isMock() ? fakeWrites.buyNamed(ids, on) : chainWrites.buyNamed(ids, on));

// Brooding: nothing moves a bird. One `broodTo` for the batch, a choice per bird.
export const brood = (entries: { id: TokenId; tier: Tier; toWallet: boolean }[], on?: OnPhase) =>
  (isMock() ? fakeWrites.brood(entries, on) : chainWrites.brood(entries, on));

export const upgrade = (id: TokenId, newTier: Tier, on?: OnPhase) =>
  (isMock() ? fakeWrites.upgrade(id, newTier, on) : chainWrites.upgrade(id, newTier, on));

export const redirect = (id: TokenId, toWallet: boolean, on?: OnPhase) =>
  (isMock() ? fakeWrites.redirect(id, toWallet, on) : chainWrites.redirect(id, toWallet, on));

export const settle = (ids: TokenId[], on?: OnPhase) =>
  (isMock() ? fakeWrites.settle(ids, on) : chainWrites.settle(ids, on));

export const claim = (token: Address, on?: OnPhase) =>
  (isMock() ? fakeWrites.claim(token, on) : chainWrites.claim(token, on));

export const transferBird = (id: TokenId, to: Address, on?: OnPhase) =>
  (isMock() ? fakeWrites.transferBird(id, to, on) : chainWrites.transferBird(id, to, on));

// ── the Roost and AVIAN staking (2026-09-18) ────────────────────────────

export const getRoost = (): Promise<RoostState> =>
  (isMock() ? fakeRoost.getRoost() : chainRoost.getRoost());

/** The flywheel snapshot (2026-09-22): `src/chain/flywheel.ts`, one pin and one multicall. */
export const getFlywheel = (): Promise<FlywheelSnapshot> =>
  (isMock() ? fakeFlywheel.getFlywheel() : chainFlywheel.getFlywheel());

/**
 * The council (2026-09-24): `src/chain/council.ts`, the seats' `council()`,
 * the multisig, the two delays, and one log scan for what is scheduled and
 * not yet executed or cancelled.
 */
export const getCouncil = (): Promise<CouncilState> =>
  (isMock() ? fakeCouncil.getCouncil() : chainCouncil.getCouncil());

// ── the owner's seat (2026-09-24) ─────────────────────────────────────────
//
// The "Your seat" control on the Owner page (part 18): the clock is read in
// `src/chain/council.ts`; the two senders are owner calls and live in
// `src/chain/admin-writes.ts`, the one place an owner ABI may be held.

/** `owner()`, `lastSeenAt()`, `silentAt()` and `pendingOwner()` on each owned seat, and `SILENCE()`. */
export const getSeat = (): Promise<SeatState> =>
  (isMock() ? fakeSeat.getSeat() : chainCouncil.getSeat());

/** `stillHere()` on one owned seat. The control sends it to each in turn. */
export const stillHere = async (id: OwnedSeat['id'], on?: OnPhase): Promise<{ hash: Hex }> =>
  (isMock() ? fakeSeat.stillHere(id, on) : (await import('../chain/admin-writes')).stillHere(id, on));

/** `transferOwnership(key)` on one owned seat: a proposal, which the council seats a day later. */
export const proposeOwner = async (id: OwnedSeat['id'], key: Address, on?: OnPhase): Promise<{ hash: Hex }> =>
  (isMock() ? fakeSeat.proposeOwner(id, key, on) : (await import('../chain/admin-writes')).proposeOwner(id, key, on));

/** The mock's fifth scene, "Still here" caught mid-way. Never anything on a chain. */
export const seatRunFixture = (): SeatRun | null =>
  (isMock() ? fakeSeat.seatRunFixture() : null);

/** The Roost screen's one read: both cards under one pin. */
export const getRoostScreen = (): Promise<{ roost: RoostState; staking: StakingState }> =>
  (isMock() ? fakeRoost.getRoostScreen(account()) : chainRoost.getRoostScreen(account()));

/** Send a held leg on. Anyone, any time. */
export const deliverHeld = (on?: OnPhase): Promise<DeliverResult & { hash: Hex }> =>
  (isMock() ? fakeRoost.deliverHeld(on) : chainRoost.deliverHeld(on));

export const getStaking = (): Promise<StakingState> =>
  (isMock() ? fakeRoost.getStaking(account()) : chainRoost.getStaking(account()));

export const distribute = (on?: OnPhase): Promise<DistributeResult & { hash: Hex }> =>
  (isMock() ? fakeRoost.distribute(on) : chainRoost.distribute(on));

export const approveAviansForStaking = (amount: Amount, on?: OnPhase) =>
  (isMock() ? fakeRoost.approveAviansForStaking(amount, on) : chainRoost.approveAviansForStaking(amount, on));

export const stake = (amount: Amount, on?: OnPhase) =>
  (isMock() ? fakeRoost.stake(amount, on) : chainRoost.stake(amount, on));

export const withdrawStake = (amount: Amount, on?: OnPhase) =>
  (isMock() ? fakeRoost.withdrawStake(amount, on) : chainRoost.withdrawStake(amount, on));

export const claimStakingReward = (on?: OnPhase): Promise<{ hash: Hex; paid: Amount }> =>
  (isMock() ? fakeRoost.claimStakingReward(on) : chainRoost.claimStakingReward(on));

export const exitStaking = (on?: OnPhase): Promise<{ hash: Hex; paid: Amount }> =>
  (isMock() ? fakeRoost.exitStaking(on) : chainRoost.exitStaking(on));

/** The Roost's tenth, spent on AVIAN and sent whole to the Roost (2026-09-22). */
export const buyForRoost = (on?: OnPhase) =>
  (isMock() ? fakeWrites.buyForRoost(on) : chainWrites.buyForRoost(on));

export const takeRoostReading = (on?: OnPhase) =>
  (isMock() ? fakeWrites.takeRoostReading(on) : chainWrites.takeRoostReading(on));

export const convertAndStream = (currency: Address | null, on?: OnPhase) =>
  (isMock() ? fakeWrites.convertAndStream(currency, on) : chainWrites.convertAndStream(currency, on));

export const createSatchel = (id: TokenId, on?: OnPhase) =>
  (isMock() ? fakeWrites.createSatchel(id, on) : chainWrites.createSatchel(id, on));

// The Sweeper: deploy for a batch, grant on each satchel, sweep the granted.
export const prepareSatchels = (ids: TokenId[], on?: OnPhase) =>
  (isMock() ? fakeWrites.prepareSatchels(ids, on) : chainWrites.prepareSatchels(ids, on));

export const grantSweeper = (id: TokenId, enabled: boolean, on?: OnPhase) =>
  (isMock() ? fakeWrites.grantSweeper(id, enabled, on) : chainWrites.grantSweeper(id, enabled, on));

export const sweep = (ids: TokenId[], tokens: Address[], on?: OnPhase): Promise<SweepResult> =>
  (isMock() ? fakeWrites.sweep(ids, tokens, on) : chainWrites.sweep(ids, tokens, on));

export const routeFor = (count: number, approved: boolean, whitelisted: boolean) =>
  (isMock() ? fakeWrites.routeFor(count, approved, whitelisted) : chainWrites.routeFor(count, approved, whitelisted));

// ── the owner ─────────────────────────────────────────────────────────────
//
// Dispatched like everything above, with one difference: the owner surface is
// LOADED ON DEMAND, on both sides of the seam.
//
// Every function below reaches its driver through a dynamic `import()`, which
// puts `src/chain/admin.ts`, `src/chain/admin-writes.ts` and their six admin
// ABIs in a chunk of their own. A collector opening the mint never downloads
// any of it. That is a bundle decision, not a security one — the ABIs would
// protect nothing if they shipped, and `onlyOwner` protects the contracts
// either way — but there is no reason to make five thousand people fetch a
// screen one person opens.
//
// `getOwnerStatus` is deliberately NOT here: it lives with the ordinary reads,
// because the header asks it on every page and pulling this chunk to answer it
// would defeat the whole arrangement.

export const getOwnerStatus = (who: Address | null): Promise<OwnerStatus> =>
  (isMock() ? fake.getOwnerStatus(who) : chain.getOwnerStatus(who));

export const getAdmin = async (who: Address | null): Promise<AdminState> =>
  (isMock()
    ? (await import('./admin')).getAdmin(who)
    : (await import('../chain/admin')).getAdmin(who));

export const checkAllowlist = async (address: Address): Promise<AllowlistCheck> =>
  (isMock()
    ? (await import('./admin')).checkAllowlist(address)
    : (await import('../chain/admin')).checkAllowlist(address));

export const readForeignToken = async (address: Address): Promise<ForeignToken> =>
  (isMock()
    ? (await import('./admin')).readForeignToken(address)
    : (await import('../chain/admin')).readForeignToken(address));

export const encodeValidatorOperation = async (op: ValidatorOperation): Promise<Hex> =>
  (isMock()
    ? (await import('./admin')).encodeValidatorOperation(op)
    : (await import('../chain/admin')).encodeValidatorOperation(op));

export const allowanceOf = async (token: Address, who: Address, spender: Address): Promise<Amount> =>
  (isMock()
    ? (await import('./admin')).allowanceOf(token, who, spender)
    : (await import('../chain/admin')).allowanceOf(token, who, spender));

export const balanceOfToken = async (token: Address, who: Address): Promise<Amount> =>
  (isMock()
    ? (await import('./admin')).balanceOfToken(token, who)
    : (await import('../chain/admin')).balanceOfToken(token, who));

export const readRoute = async (currency: Address | null, target: Address): Promise<AdminRoute> =>
  (isMock()
    ? (await import('./admin')).readRoute(currency, target)
    : (await import('../chain/admin')).readRoute(currency, target));


// the writes, every one of them through the same lazily loaded pair


export const setMintOpen = async (open: boolean, on?: OnPhase) =>
  (isMock()
    ? (await import('./admin')).setMintOpen(open, on)
    : (await import('../chain/admin-writes')).setMintOpen(open, on));

export const setFreeMintOpen = async (open: boolean, on?: OnPhase) =>
  (isMock()
    ? (await import('./admin')).setFreeMintOpen(open, on)
    : (await import('../chain/admin-writes')).setFreeMintOpen(open, on));

export const setAllowlistRoot = async (root: Hex, on?: OnPhase) =>
  (isMock()
    ? (await import('./admin')).setAllowlistRoot(root, on)
    : (await import('../chain/admin-writes')).setAllowlistRoot(root, on));

export const setAllowlisted = async (accounts: Address[], allowed: boolean, on?: OnPhase) =>
  (isMock()
    ? (await import('./admin')).setAllowlisted(accounts, allowed, on)
    : (await import('../chain/admin-writes')).setAllowlisted(accounts, allowed, on));

export const releaseFreeAllocation = async (on?: OnPhase) =>
  (isMock()
    ? (await import('./admin')).releaseFreeAllocation(on)
    : (await import('../chain/admin-writes')).releaseFreeAllocation(on));

export const setPrice = async (price: Amount, on?: OnPhase) =>
  (isMock()
    ? (await import('./admin')).setPrice(price, on)
    : (await import('../chain/admin-writes')).setPrice(price, on));

export const setRenderer = async (renderer: Address, on?: OnPhase) =>
  (isMock()
    ? (await import('./admin')).setRenderer(renderer, on)
    : (await import('../chain/admin-writes')).setRenderer(renderer, on));

export const lockRenderer = async (expected: Address, on?: OnPhase) =>
  (isMock()
    ? (await import('./admin')).lockRenderer(expected, on)
    : (await import('../chain/admin-writes')).lockRenderer(expected, on));

export const setTransferValidator = async (v: Address, on?: OnPhase) =>
  (isMock()
    ? (await import('./admin')).setTransferValidator(v, on)
    : (await import('../chain/admin-writes')).setTransferValidator(v, on));

export const lockTransferValidator = async (expected: Address, on?: OnPhase) =>
  (isMock()
    ? (await import('./admin')).lockTransferValidator(expected, on)
    : (await import('../chain/admin-writes')).lockTransferValidator(expected, on));

export const configureTransferValidator = async (op: ValidatorOperation, on?: OnPhase) =>
  (isMock()
    ? (await import('./admin')).configureTransferValidator(op, on)
    : (await import('../chain/admin-writes')).configureTransferValidator(op, on));

export const rescueFromCollection = async (token: Address | null, to: Address, on?: OnPhase) =>
  (isMock()
    ? (await import('./admin')).rescueFromCollection(token, to, on)
    : (await import('../chain/admin-writes')).rescueFromCollection(token, to, on));

export const setFeeRecipient = async (recipient: Address, on?: OnPhase) =>
  (isMock()
    ? (await import('./admin')).setFeeRecipient(recipient, on)
    : (await import('../chain/admin-writes')).setFeeRecipient(recipient, on));

export const rescueFromPerch = async (token: Address, to: Address, on?: OnPhase) =>
  (isMock()
    ? (await import('./admin')).rescueFromPerch(token, to, on)
    : (await import('../chain/admin-writes')).rescueFromPerch(token, to, on));

export const approveForProbe = async (token: Address, amount: Amount, on?: OnPhase) =>
  (isMock()
    ? (await import('./admin')).approveForProbe(token, amount, on)
    : (await import('../chain/admin-writes')).approveForProbe(token, amount, on));

export const addRewardToken = async (token: Address, probe: Amount, on?: OnPhase) =>
  (isMock()
    ? (await import('./admin')).addRewardToken(token, probe, on)
    : (await import('../chain/admin-writes')).addRewardToken(token, probe, on));

export const retireRewardToken = async (token: Address, on?: OnPhase) =>
  (isMock()
    ? (await import('./admin')).retireRewardToken(token, on)
    : (await import('../chain/admin-writes')).retireRewardToken(token, on));

export const restream = async (token: Address, duration: number, on?: OnPhase) =>
  (isMock()
    ? (await import('./admin')).restream(token, duration, on)
    : (await import('../chain/admin-writes')).restream(token, duration, on));

export const setFunder = async (funder: Address, allowed: boolean, on?: OnPhase) =>
  (isMock()
    ? (await import('./admin')).setFunder(funder, allowed, on)
    : (await import('../chain/admin-writes')).setFunder(funder, allowed, on));

export const rescueBird = async (id: TokenId, to: Address, on?: OnPhase) =>
  (isMock()
    ? (await import('./admin')).rescueBird(id, to, on)
    : (await import('../chain/admin-writes')).rescueBird(id, to, on));

export const claimRoostAdmin = async (to: Address, on?: OnPhase) =>
  (isMock()
    ? (await import('./admin')).claimRoostAdmin(to, on)
    : (await import('../chain/admin-writes')).claimRoostAdmin(to, on));

export const claimAdmin = async (currency: Address | null, to: Address, on?: OnPhase) =>
  (isMock()
    ? (await import('./admin')).claimAdmin(currency, to, on)
    : (await import('../chain/admin-writes')).claimAdmin(currency, to, on));

export const setConversionConfig = async (c: {
  enabled: boolean; minInterval: number; maxPerCallBps: number;
  slippageBps: number; streamDuration: number; maxPriceAge: number;
}, on?: OnPhase) =>
  (isMock()
    ? (await import('./admin')).setConversionConfig(c, on)
    : (await import('../chain/admin-writes')).setConversionConfig(c, on));

export const setTargets = async (targets: AdminTargetRow[], on?: OnPhase) =>
  (isMock()
    ? (await import('./admin')).setTargets(targets, on)
    : (await import('../chain/admin-writes')).setTargets(targets, on));

export const setRoute = async (currency: Address | null, target: Address, hops: V4Hop[], on?: OnPhase) =>
  (isMock()
    ? (await import('./admin')).setRoute(currency, target, hops, on)
    : (await import('../chain/admin-writes')).setRoute(currency, target, hops, on));

export const setV3Route = async (currency: Address | null, target: Address, hops: V3Hop[], on?: OnPhase) =>
  (isMock()
    ? (await import('./admin')).setV3Route(currency, target, hops, on)
    : (await import('../chain/admin-writes')).setV3Route(currency, target, hops, on));

export const setPriceKeeper = async (keeper: Address, on?: OnPhase) =>
  (isMock()
    ? (await import('./admin')).setPriceKeeper(keeper, on)
    : (await import('../chain/admin-writes')).setPriceKeeper(keeper, on));

export const setKeeperDropBps = async (bps: number, on?: OnPhase) =>
  (isMock()
    ? (await import('./admin')).setKeeperDropBps(bps, on)
    : (await import('../chain/admin-writes')).setKeeperDropBps(bps, on));

export const setFloorPrice = async (currency: Address | null, target: Address, priceE18: Amount, on?: OnPhase) =>
  (isMock()
    ? (await import('./admin')).setFloorPrice(currency, target, priceE18, on)
    : (await import('../chain/admin-writes')).setFloorPrice(currency, target, priceE18, on));

export const collectFees = async (to: Address, on?: OnPhase) =>
  (isMock()
    ? (await import('./admin')).collectFees(to, on)
    : (await import('../chain/admin-writes')).collectFees(to, on));

export const extendLock = async (newUnlockAt: number, on?: OnPhase) =>
  (isMock()
    ? (await import('./admin')).extendLock(newUnlockAt, on)
    : (await import('../chain/admin-writes')).extendLock(newUnlockAt, on));

export const withdrawPosition = async (to: Address, on?: OnPhase) =>
  (isMock()
    ? (await import('./admin')).withdrawPosition(to, on)
    : (await import('../chain/admin-writes')).withdrawPosition(to, on));

export const transferOwnership = async (c: AdminContract, to: Address, on?: OnPhase) =>
  (isMock()
    ? (await import('./admin')).transferOwnership(c, to, on)
    : (await import('../chain/admin-writes')).transferOwnership(c, to, on));

export const acceptOwnership = async (c: AdminContract, on?: OnPhase) =>
  (isMock()
    ? (await import('./admin')).acceptOwnership(c, on)
    : (await import('../chain/admin-writes')).acceptOwnership(c, on));

// ── trading AVIAN ────────────────────────────────────────────────────────
//
// Static, not lazily loaded like the owner surface: a collector with no AVIAN
// is exactly who needs this, so it belongs in the bundle they already have.

export const canSwap = (): boolean =>
  (isMock() ? fakeSwap.canSwap() : chainSwap.canSwap());

export const getSwapState = (who: Address | null): Promise<SwapState> =>
  (isMock() ? fakeSwap.getSwapState(who) : chainSwap.getSwapState(who));

export const quoteSwap = (
  direction: 'buy' | 'sell', amountIn: Amount, slippageBps: number,
): Promise<SwapQuote> =>
  (isMock() ? fakeSwap.quoteSwap(direction, amountIn, slippageBps) : chainSwap.quoteSwap(direction, amountIn, slippageBps));

export const swap = (direction: 'buy' | 'sell', amountIn: Amount, minOut: Amount, on?: OnPhase) =>
  (isMock() ? fakeSwap.swap(direction, amountIn, minOut, on) : chainSwap.swap(direction, amountIn, minOut, on));

export const approveAviansForPermit2 = (amount: Amount, on?: OnPhase) =>
  (isMock() ? fakeSwap.approveAviansForPermit2(amount, on) : chainSwap.approveAviansForPermit2(amount, on));

export const approvePermit2ForRouter = (amount: Amount, on?: OnPhase) =>
  (isMock() ? fakeSwap.approvePermit2ForRouter(amount, on) : chainSwap.approvePermit2ForRouter(amount, on));

/** Ours, not the chain's: the running total the hook keeps has no getter. */
export { CAP_MARGIN_BPS, overCap } from '../chain/swap';

/** Both drivers invalidate through the same signal, so the store is unchanged. */
export function onWrite(fn: () => void): () => void {
  const offMock = fakeWrites.onWrite(fn);
  const offChain = chainWrites.onWrite(fn);
  const offChange = chainWallet.onChainOrAccountChange(fn);
  return () => { offMock(); offChain(); offChange(); };
}

// ── the price ticker ──────────────────────────────────────────────────────

/** Every listed stock token's price in ETH, at one block. Nothing here is a quote. */
export function getPrices(): Promise<PriceBoard> {
  return isMock() ? fakePrices.getPrices() : chainPrices.getPrices();
}
