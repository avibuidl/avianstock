// Connection and network.
//
// The real thing is EIP-6963 discovery plus EIP-1193 on the chosen provider —
// never `window.ethereum` straight, because two installed wallets fight over
// that property and the winner is arbitrary. This mock produces the same
// shapes, including the 4902 "chain unknown to this wallet" path, which is two
// prompts and the place people give up.
//
// Connection is not authentication. Nothing here asks for a signature to log
// in, because nothing here needs one.

import type { Connection, WalletInfo } from './types';
import { CHAIN_ID } from './types';
import { WALLETS, YOU } from './fixtures';
import { scenario, setScenario, subscribeScenario } from './scenario';
import { ContractError } from './errors';

const listeners = new Set<(c: Connection) => void>();
let chosen: WalletInfo = WALLETS[0];

export function listWallets(): Promise<WalletInfo[]> {
  return delay(scenario().connection === 'no-wallet' ? [] : WALLETS, 120);
}

export function connection(): Connection {
  const s = scenario();
  switch (s.connection) {
    case 'no-wallet': return { status: 'no-wallet' };
    case 'disconnected': return { status: 'disconnected', wallets: WALLETS };
    case 'connecting': return { status: 'connecting', wallet: chosen };
    case 'wrong-network': return { status: 'wrong-network', wallet: chosen, address: YOU, chainId: 1 };
    case 'unknown-network': return { status: 'unknown-network', wallet: chosen, address: YOU, chainId: 137 };
    case 'connected': return { status: 'connected', wallet: chosen, address: YOU, chainId: CHAIN_ID };
  }
}

export async function connect(rdns: string): Promise<Connection> {
  const w = WALLETS.find((x) => x.rdns === rdns);
  if (!w) throw new ContractError('NoWallet');
  chosen = w;
  setScenario({ connection: 'connecting' });
  await sleep(700);
  // A wallet that has never seen chain 4663 lands on the add-then-switch path.
  setScenario({ connection: 'connected' });
  return connection();
}

export function disconnect() {
  // Local only. There is no chain call for this, and no session to end.
  setScenario({ connection: 'disconnected' });
}

/**
 * `wallet_switchEthereumChain`, and on 4902 `wallet_addEthereumChain` and then
 * switch again. Two prompts, and the UI says so before it starts.
 */
export async function switchNetwork(): Promise<Connection> {
  const unknown = scenario().connection === 'unknown-network';
  await sleep(unknown ? 1100 : 600);
  setScenario({ connection: 'connected' });
  return connection();
}

export function onConnectionChanged(cb: (c: Connection) => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

// `accountsChanged` and `chainChanged` arrive here. Never carry state across a
// chain change — every balance and allowance is re-read.
subscribeScenario(() => { const c = connection(); listeners.forEach((l) => l(c)); });

/** Every write path is gated on this, immediately before it builds anything. */
export function requireChain(): void {
  const c = connection();
  if (c.status === 'no-wallet') throw new ContractError('NoWallet');
  if (c.status !== 'connected') throw new ContractError('WrongNetwork');
}

export function address(): `0x${string}` | null {
  const c = connection();
  return c.status === 'connected' ? c.address : null;
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const delay = <T>(v: T, ms: number) => new Promise<T>((r) => setTimeout(() => r(v), ms));
