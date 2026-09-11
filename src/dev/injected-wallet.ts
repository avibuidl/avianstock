// A dev-only injected wallet, announced over EIP-6963.
//
// WHY THIS EXISTS. The wallet path — discovery, the chooser, connect, the
// 4902 add-then-switch, sending, `accountsChanged`, `chainChanged` — is the
// part of this site that cannot be tested without a browser extension. This is
// an EIP-1193 provider that behaves like one, so the whole path can be walked
// against a local fork.
//
// WHY IT IS SAFE. It is `import.meta.env.DEV`-gated at the only place it is
// imported (`main.tsx`, inside a dynamic import in a branch Vite eliminates at
// build time), it only ever holds a well-known anvil test key that is printed
// on anvil's own console, and `scripts/check-hygiene.mjs` fails the build if
// the marker below appears anywhere in `dist/`.
//
// It is NEVER a way to hold a real key. There is no input for one, it will not
// read one from storage, and it refuses to run outside a dev build.

import {
  createWalletClient, createPublicClient, http, type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

/** The string the bundle check looks for. If this ships, the build fails. */
export const DEV_WALLET_MARKER = 'AVIAN_STOCK_DEV_WALLET_MUST_NOT_SHIP';

/**
 * anvil's first two accounts, printed on its own console at start-up — and a
 * third throwaway.
 *
 * The third one is not decoration. MEASURED ON CHAIN 4663: every well-known
 * test address, anvil's included, carries an EIP-7702 delegation to
 * `0x8a5b10eb…3b005df6`, an implementation that does not implement
 * `onERC721Received`. On a fork of that chain the anvil accounts therefore look
 * like contracts to `_safeMint` and CANNOT RECEIVE A BIRD — which is a real
 * discovery about the chain (see `assertCanReceiveNfts` in chain/writes.ts) but
 * makes them useless for walking a mint. Index 2 is an address nobody has
 * touched, so it is a plain EOA.
 */
const ANVIL_KEYS: Hex[] = [
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  '0x00000000000000000000000000000000000000000000000000000000deadbeef',
];

type Handler = (...args: never[]) => void;

export type DevWalletOptions = {
  rpcUrl: string;
  chainId: number;
  /** 0 or 1: which anvil account. */
  account?: number;
  /** Report this chain instead, to exercise the wrong-network path. */
  pretendChainId?: number;
  /** Refuse the first `wallet_switchEthereumChain` with 4902. */
  pretendUnknownChain?: boolean;
  /**
   * READ AS this address instead of the anvil account's. For looking at a real
   * wallet's pages on a real chain — nine birds on the testnet, say — without
   * holding its key. Every read takes the address at face value; a write would
   * be signed by the anvil key for a different sender and refused by the node,
   * which is the correct outcome for a wallet you do not control.
   */
  as?: `0x${string}`;
};

export function installDevWallet(o: DevWalletOptions) {
  if (!import.meta.env.DEV) return;                     // belt, in case of a stray import
  const key = ANVIL_KEYS[o.account ?? 1];
  const account = privateKeyToAccount(key);
  const reportedAddress = o.as ?? account.address;

  const chain = {
    id: o.chainId,
    name: 'dev',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [o.rpcUrl] } },
  } as const;

  const publicClient = createPublicClient({ chain, transport: http(o.rpcUrl) });
  const wallet = createWalletClient({ account, chain, transport: http(o.rpcUrl) });

  let reported = o.pretendChainId ?? o.chainId;
  let unknownChain = !!o.pretendUnknownChain;
  let connected = false;
  const listeners = new Map<string, Set<Handler>>();

  const emit = (event: string, ...args: unknown[]) => {
    for (const h of listeners.get(event) ?? []) (h as (...a: unknown[]) => void)(...args);
  };

  const provider = {
    isDevWallet: true,
    async request({ method, params }: { method: string; params?: unknown[] }) {
      switch (method) {
        case 'eth_requestAccounts':
          connected = true;
          return [reportedAddress];
        case 'eth_accounts':
          return connected ? [reportedAddress] : [];
        case 'eth_chainId':
          return `0x${reported.toString(16)}`;

        case 'wallet_switchEthereumChain': {
          const wanted = Number.parseInt((params?.[0] as { chainId: string })?.chainId ?? '0x0', 16);
          if (unknownChain) {
            // The 4902 path: "this wallet has never heard of that chain".
            unknownChain = false;
            const err = new Error('Unrecognized chain ID. Try adding the chain first.');
            (err as Error & { code?: number }).code = 4902;
            throw err;
          }
          reported = wanted;
          emit('chainChanged', `0x${reported.toString(16)}`);
          return null;
        }
        case 'wallet_addEthereumChain':
          return null;

        case 'eth_signTypedData_v4': {
          const typed = JSON.parse(params?.[1] as string);
          return wallet.signTypedData({
            account,
            domain: { ...typed.domain, chainId: Number(typed.domain.chainId) },
            types: typed.types,
            primaryType: typed.primaryType,
            message: Object.fromEntries(Object.entries(typed.message).map(
              ([k, v]) => [k, /^\d+$/.test(String(v)) ? BigInt(v as string) : v],
            )) as never,
          });
        }

        case 'eth_sendTransaction': {
          const tx = params?.[0] as {
            to: Hex; data: Hex; value?: Hex; gas?: Hex; chainId?: Hex;
          };
          // The guard this exists to test: a wallet on another chain must not
          // quietly send anyway.
          if (tx.chainId && Number.parseInt(tx.chainId, 16) !== reported) {
            const err = new Error('the wallet is not on that chain');
            (err as Error & { code?: number }).code = 4901;
            throw err;
          }
          return wallet.sendTransaction({
            account,
            to: tx.to,
            data: tx.data,
            value: tx.value ? BigInt(tx.value) : undefined,
            gas: tx.gas ? BigInt(tx.gas) : undefined,
            chain: null,
          });
        }

        default:
          return publicClient.request({ method, params } as never);
      }
    },
    on(event: string, handler: Handler) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(handler);
    },
    removeListener(event: string, handler: Handler) {
      listeners.get(event)?.delete(handler);
    },
  };

  const info = {
    uuid: 'a2f1a0f0-0000-4000-8000-devwallet0001',
    name: 'Dev Wallet (anvil)',
    rdns: 'dev.anvil.wallet',
    icon: 'data:image/svg+xml;base64,'
      + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#43C4BC"/></svg>'),
  };

  const announce = () => window.dispatchEvent(
    new CustomEvent('eip6963:announceProvider', { detail: Object.freeze({ info, provider }) }),
  );
  window.addEventListener('eip6963:requestProvider', announce);
  announce();

  // A handle for driving the session from the console during a walkthrough.
  (window as unknown as Record<string, unknown>).devWallet = {
    marker: DEV_WALLET_MARKER,
    address: account.address,
    setChain(id: number) { reported = id; emit('chainChanged', `0x${id.toString(16)}`); },
    setUnknownChain(on = true) { unknownChain = on; },
    setAccounts(list: string[]) { emit('accountsChanged', list); },
  };

  // eslint-disable-next-line no-console
  console.info(`[dev wallet] ${account.address} on chain ${reported} via ${o.rpcUrl}`);
}
