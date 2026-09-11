// Connecting a wallet. HANDOVER section 9a.
//
// Injected providers only — no WalletConnect, no RainbowKit, no aggregator SDK.
// EIP-6963 for discovery, because when two wallets are installed they fight
// over `window.ethereum` and the winner is arbitrary; `window.ethereum` is a
// fallback for the case where nothing announces itself, and an install prompt
// is what happens when there is nothing at all.
//
// Two rules that are not negotiable:
//
//   * CONNECTING IS NOT AUTHENTICATION. `eth_requestAccounts` tells us an
//     address; it does not prove control of it, and this site does not need it
//     to. Nothing here asks for a login signature.
//   * THE CHAIN IS RE-READ IMMEDIATELY BEFORE EVERY WRITE, from the provider,
//     not from React state. `requireChain()` below is that check, and it is the
//     first thing every write does.

import { addEthereumChainParams, chainId, chainIdHex, hasManifest } from './manifest';
import { ContractError } from '../mock/errors';
import { asContractError } from './errors';
import type { Address, Connection, WalletInfo } from '../mock/types';

// ── EIP-1193 ──────────────────────────────────────────────────────────────

export type Eip1193Provider = {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  on?(event: string, handler: (...args: never[]) => void): void;
  removeListener?(event: string, handler: (...args: never[]) => void): void;
};

type Announced = { info: WalletInfo; provider: Eip1193Provider };

const announced = new Map<string, Announced>();

/**
 * An announcement is untrusted input from an extension. The name is clamped and
 * only ever rendered as text; the icon is accepted only as a `data:image/…`
 * URI, which cannot reach the network and cannot execute script in an <img>.
 */
function sanitise(raw: unknown, index: number): WalletInfo | null {
  const info = (raw ?? {}) as Record<string, unknown>;
  const rdns = typeof info.rdns === 'string' && info.rdns ? info.rdns.slice(0, 128) : null;
  const name = typeof info.name === 'string' && info.name ? info.name.slice(0, 40) : null;
  if (!rdns || !name) return null;
  const icon = typeof info.icon === 'string' && /^data:image\/(png|jpeg|gif|webp|svg\+xml);/i.test(info.icon)
    ? info.icon
    : initials(name, index);
  return { rdns, name, icon };
}

function initials(name: string, index: number): string {
  const letters = name.replace(/[^A-Za-z ]/g, '').split(/\s+/).filter(Boolean);
  const from = letters.length >= 2
    ? letters[0][0] + letters[1][0]
    : (letters[0] ?? String(index + 1)).slice(0, 2);
  return from.toUpperCase();
}

let discovering = false;

function startDiscovery() {
  if (discovering || typeof window === 'undefined') return;
  discovering = true;
  window.addEventListener('eip6963:announceProvider', (event: Event) => {
    const detail = (event as CustomEvent).detail as { info?: unknown; provider?: Eip1193Provider };
    const info = sanitise(detail?.info, announced.size);
    if (!info || !detail?.provider) return;
    if (!announced.has(info.rdns)) {
      announced.set(info.rdns, { info, provider: detail.provider });
      notify();
    }
  });
}

function requestAnnouncements() {
  if (typeof window === 'undefined') return;
  startDiscovery();
  window.dispatchEvent(new Event('eip6963:requestProvider'));
}

/** The wallets that announced themselves, plus the legacy fallback if none did. */
export async function listWallets(): Promise<WalletInfo[]> {
  requestAnnouncements();
  // Announcements are synchronous in practice; one frame is enough, and a
  // second short wait covers a wallet that injects late.
  await sleep(60);
  if (announced.size === 0) await sleep(240);

  if (announced.size === 0) {
    const legacy = (window as unknown as { ethereum?: Eip1193Provider }).ethereum;
    if (legacy) {
      const info: WalletInfo = { rdns: 'legacy.window.ethereum', name: legacyName(legacy), icon: 'W' };
      announced.set(info.rdns, { info, provider: legacy });
    }
  }
  return [...announced.values()].map((a) => a.info);
}

function legacyName(p: Eip1193Provider): string {
  const flags = p as unknown as Record<string, unknown>;
  if (flags.isRabby) return 'Rabby';
  if (flags.isCoinbaseWallet) return 'Coinbase Wallet';
  if (flags.isMetaMask) return 'MetaMask';
  return 'Injected wallet';
}

// ── the connection ────────────────────────────────────────────────────────

type State =
  | { kind: 'no-wallet' }
  | { kind: 'disconnected' }
  | { kind: 'connecting'; wallet: WalletInfo }
  | { kind: 'wrong-network'; wallet: WalletInfo; address: Address; chainId: number }
  | { kind: 'unknown-network'; wallet: WalletInfo; address: Address; chainId: number }
  | { kind: 'connected'; wallet: WalletInfo; address: Address };

let state: State = { kind: 'disconnected' };
let chosen: Announced | null = null;
const listeners = new Set<(c: Connection) => void>();

const RDNS_KEY = 'avian-stock.wallet';

export function connection(): Connection {
  switch (state.kind) {
    case 'no-wallet': return { status: 'no-wallet' };
    case 'disconnected': return { status: 'disconnected', wallets: [...announced.values()].map((a) => a.info) };
    case 'connecting': return { status: 'connecting', wallet: state.wallet };
    case 'wrong-network': return { status: 'wrong-network', wallet: state.wallet, address: state.address, chainId: state.chainId };
    case 'unknown-network': return { status: 'unknown-network', wallet: state.wallet, address: state.address, chainId: state.chainId };
    case 'connected': return { status: 'connected', wallet: state.wallet, address: state.address, chainId: chainId() as 4663 };
  }
}

function set(next: State) { state = next; notify(); }

function notify() {
  const c = connection();
  listeners.forEach((l) => l(c));
}

export function onConnectionChanged(cb: (c: Connection) => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function address(): Address | null {
  return state.kind === 'connected' ? state.address : null;
}

// ── connecting ────────────────────────────────────────────────────────────

export async function connect(rdns: string): Promise<Connection> {
  await listWallets();
  const entry = announced.get(rdns);
  if (!entry) throw new ContractError('NoWallet');

  detach();
  chosen = entry;
  set({ kind: 'connecting', wallet: entry.info });

  try {
    const accounts = await request<string[]>(entry.provider, 'eth_requestAccounts');
    const account = accounts?.[0];
    if (!account) { set({ kind: 'disconnected' }); return connection(); }
    try { localStorage.setItem(RDNS_KEY, rdns); } catch { /* private mode */ }
    attach(entry.provider);
    await settle(entry.info, account as Address);
  } catch (e) {
    set({ kind: 'disconnected' });
    throw asContractError(e, { where: 'connecting' });
  }
  return connection();
}

/**
 * Reconnect on load WITHOUT prompting: `eth_accounts` returns what has already
 * been granted, and returns nothing if it has not. A page that opens a wallet
 * prompt by itself trains people to approve prompts they did not ask for.
 */
export async function restore(): Promise<Connection> {
  const wallets = await listWallets();
  if (wallets.length === 0) { set({ kind: 'no-wallet' }); return connection(); }

  let remembered: string | null = null;
  try { remembered = localStorage.getItem(RDNS_KEY); } catch { /* private mode */ }
  const entry = (remembered && announced.get(remembered)) || null;
  if (!entry) { set({ kind: 'disconnected' }); return connection(); }

  try {
    const accounts = await request<string[]>(entry.provider, 'eth_accounts');
    const account = accounts?.[0];
    if (!account) { set({ kind: 'disconnected' }); return connection(); }
    chosen = entry;
    attach(entry.provider);
    await settle(entry.info, account as Address);
  } catch {
    set({ kind: 'disconnected' });
  }
  return connection();
}

/** Where a freshly-known account lands: on our chain, or not. */
async function settle(wallet: WalletInfo, account: Address) {
  const current = await providerChainId();
  if (current === chainId()) set({ kind: 'connected', wallet, address: account });
  else set({ kind: 'wrong-network', wallet, address: account, chainId: current });
}

export function disconnect(): void {
  // Local only. There is no chain call for this and no session to end.
  detach();
  chosen = null;
  try { localStorage.removeItem(RDNS_KEY); } catch { /* private mode */ }
  set({ kind: 'disconnected' });
}

// ── the network ───────────────────────────────────────────────────────────

/**
 * `wallet_switchEthereumChain`, and on 4902 — "this wallet has never heard of
 * that chain" — `wallet_addEthereumChain` and then switch again. Two prompts,
 * and the second only appears after the first is accepted, which is where
 * people give up; the UI says so before it starts.
 *
 * The chain asked for is always the manifest's. There is no second source.
 */
export async function switchNetwork(): Promise<Connection> {
  if (!chosen) throw new ContractError('NoWallet');
  const wallet = chosen.info;
  const hex = chainIdHex();

  try {
    await request(chosen.provider, 'wallet_switchEthereumChain', [{ chainId: hex }]);
  } catch (e) {
    if (!isUnrecognisedChain(e)) throw asContractError(e, { where: 'switching network' });

    // Tell the UI what is about to happen, so the second prompt is expected.
    if (state.kind === 'wrong-network') {
      set({ kind: 'unknown-network', wallet, address: state.address, chainId: state.chainId });
    }
    try {
      await request(chosen.provider, 'wallet_addEthereumChain', [addEthereumChainParams()]);
      await request(chosen.provider, 'wallet_switchEthereumChain', [{ chainId: hex }]);
    } catch (inner) {
      throw asContractError(inner, { where: 'adding the network' });
    }
  }

  const accounts = await request<string[]>(chosen.provider, 'eth_accounts');
  const account = accounts?.[0];
  if (!account) { set({ kind: 'disconnected' }); return connection(); }
  await settle(wallet, account as Address);
  return connection();
}

/**
 * 4902 is the documented code, but wallets bury it: some return it at the top
 * level, some wrap it in -32603, and some only say it in the message.
 */
function isUnrecognisedChain(e: unknown): boolean {
  const seen = new Set<unknown>();
  const walk = (x: unknown, depth: number): boolean => {
    if (!x || typeof x !== 'object' || depth > 6 || seen.has(x)) return false;
    seen.add(x);
    const o = x as Record<string, unknown>;
    if (o.code === 4902 || o.code === -32603) {
      if (o.code === 4902) return true;
    }
    const message = typeof o.message === 'string' ? o.message : '';
    if (/unrecognized chain|unrecognised chain|chain .* not (been )?added|add(ing)? the chain|4902/i.test(message)) return true;
    return walk(o.cause, depth + 1) || walk(o.data, depth + 1) || walk(o.error, depth + 1);
  };
  return walk(e, 0);
}

// ── provider events ───────────────────────────────────────────────────────

let attached: { provider: Eip1193Provider; handlers: Record<string, (...a: never[]) => void> } | null = null;

const chainChangeHooks = new Set<() => void>();

/** Everything cached anywhere is dropped on either of these. */
export function onChainOrAccountChange(fn: () => void): () => void {
  chainChangeHooks.add(fn);
  return () => { chainChangeHooks.delete(fn); };
}

function attach(provider: Eip1193Provider) {
  detach();
  if (!provider.on) return;

  const onAccounts = ((accounts: string[]) => {
    chainChangeHooks.forEach((f) => f());
    if (!accounts || accounts.length === 0) { disconnect(); return; }
    const wallet = chosen?.info;
    if (!wallet) return;
    void settle(wallet, accounts[0] as Address);
  }) as (...a: never[]) => void;

  const onChain = (() => {
    // Never carry state across a chain change: everything on the page was read
    // from the other network.
    chainChangeHooks.forEach((f) => f());
    const wallet = chosen?.info;
    const account = state.kind === 'connected' || state.kind === 'wrong-network' || state.kind === 'unknown-network'
      ? state.address : null;
    if (wallet && account) void settle(wallet, account);
  }) as (...a: never[]) => void;

  const onDisconnect = (() => { disconnect(); }) as (...a: never[]) => void;

  provider.on('accountsChanged', onAccounts);
  provider.on('chainChanged', onChain);
  provider.on('disconnect', onDisconnect);
  attached = { provider, handlers: { accountsChanged: onAccounts, chainChanged: onChain, disconnect: onDisconnect } };
}

function detach() {
  if (!attached?.provider.removeListener) { attached = null; return; }
  for (const [event, handler] of Object.entries(attached.handlers)) {
    attached.provider.removeListener(event, handler);
  }
  attached = null;
}

// ── the guard every write starts with ─────────────────────────────────────

export type Guarded = { provider: Eip1193Provider; account: Address };

/**
 * Read the chain and the account FROM THE PROVIDER, right now — not from React
 * state, not from a value cached at page load. HANDOVER section 9a: a person
 * can switch networks at any moment, and a mint sent to the wrong chain is a
 * real loss. This runs before a write is built AND again after it is
 * simulated, because a simulation takes time.
 */
export async function requireChain(): Promise<Guarded> {
  if (!hasManifest()) throw new ContractError('Unknown');
  if (!chosen) throw new ContractError('NoWallet');

  const live = await providerChainId();
  if (live !== chainId()) {
    const wallet = chosen.info;
    const account = state.kind === 'connected' ? state.address : null;
    if (account) set({ kind: 'wrong-network', wallet, address: account, chainId: live });
    throw new ContractError('WrongNetwork');
  }

  const accounts = await request<string[]>(chosen.provider, 'eth_accounts');
  const account = accounts?.[0] as Address | undefined;
  if (!account) { disconnect(); throw new ContractError('NoWallet'); }

  // The account can change between opening a screen and pressing a button.
  if (state.kind === 'connected' && state.address.toLowerCase() !== account.toLowerCase()) {
    chainChangeHooks.forEach((f) => f());
    set({ kind: 'connected', wallet: chosen.info, address: account });
  }
  return { provider: chosen.provider, account };
}

async function providerChainId(): Promise<number> {
  if (!chosen) return 0;
  const hex = await request<string>(chosen.provider, 'eth_chainId');
  return typeof hex === 'string' ? Number.parseInt(hex, 16) : Number(hex);
}

export function currentProvider(): Eip1193Provider | null {
  return chosen?.provider ?? null;
}

// ── plumbing ──────────────────────────────────────────────────────────────

async function request<T>(provider: Eip1193Provider, method: string, params?: unknown[]): Promise<T> {
  return (await provider.request({ method, params })) as T;
}

export function providerRequest<T>(method: string, params?: unknown[]): Promise<T> {
  if (!chosen) throw new ContractError('NoWallet');
  return request<T>(chosen.provider, method, params);
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Called once at boot, before anything renders. */
export async function initWallet(): Promise<void> {
  await restore();
}
