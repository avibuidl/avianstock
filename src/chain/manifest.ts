// The deployment manifest: one JSON file per deployment, carrying BOTH the
// network and the addresses.
//
// No contract address and no chain parameter is written anywhere in this
// application. The site is pointed at a deployment by dropping a file into
// `public/deployments/`, and the network it talks to is whichever network that
// file describes — which is what lets one build serve a local fork, the testnet
// and mainnet without a rebuild.
//
// A manifest that is missing a field, or carries a malformed address, stops the
// app before it renders anything, and says which field. A half-configured site
// that renders and then fails at the first call is worse than one that will not
// open.

export type Address = `0x${string}`;

export type NetworkSpec = {
  chainId: number;
  chainName: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  rpcUrls: string[];
  blockExplorerUrls: string[];
};

/**
 * HANDOVER section 10's creation order, plus the two from the pool deployment.
 * `AviansHook` and `LiquidityVault` may be `null` — but only together, and only
 * as an explicit statement that this deployment's pool has not been launched
 * yet. A MISSING key is still a hard failure; `null` is a sentence, absence is
 * a mistake.
 */
export type ContractSet = {
  Avians: Address;
  TraitRegistry: Address;
  BirdRenderer: Address;
  TheNest: Address;
  Treasury: Address;
  ThePerch: Address;
  AvianStock: Address;
  AviansHook: Address | null;
  LiquidityVault: Address | null;
};

/**
 * Contracts we did not deploy but have to call.
 *
 * Swapping ETH for AVIANS goes through Uniswap's UniversalRouter, is quoted by
 * its V4Quoter, and — when selling — needs Permit2 in the middle. None of those
 * addresses may be written in `src/`: the hygiene check forbids it and is
 * right to, because an address in the source is a deployment assumption that
 * cannot be corrected without a rebuild.
 *
 * All four are present at the same addresses on 4663 and on testnet 46630. The
 * bytecode of the router and Permit2 differs between the two — same length,
 * different hash, which is what chain-local immutables look like — so the
 * addresses live here per deployment rather than being assumed to be universal.
 */
export type ThirdPartySet = {
  PoolManager: Address;
  UniversalRouter: Address;
  Permit2: Address;
  V4Quoter: Address;
  /** Holds the vault's position. Read for its pool and tick range. */
  PositionManager: Address;
  /** Uniswap's view into the PoolManager: fee growth, for the pending fees. */
  StateView: Address;
};

export const THIRD_PARTY_NAMES = [
  'PoolManager', 'UniversalRouter', 'Permit2', 'V4Quoter', 'PositionManager', 'StateView',
] as const;

export type Manifest = {
  id: string;
  label: string;
  driver: 'chain' | 'mock';
  network: NetworkSpec;
  contracts: ContractSet;
  /**
   * Null ⇒ this deployment has no pool, so nothing can be swapped. Null
   * together with `AviansHook` and `LiquidityVault`, never on its own.
   */
  thirdParty: ThirdPartySet | null;
  /** Canonical Multicall3, if this chain has one. Null ⇒ JSON-RPC batching. */
  multicall3: Address | null;
  /**
   * The Sweeper (HANDOVER section 5, "Collecting from many birds at once"),
   * or null when this deployment has none. Not in `contracts`: it is not part
   * of the seven-contract deployment, any key may deploy it at any time after
   * the collection, and the site works without it — on null the "collect from
   * my birds" panel does not exist. The key must be present either way.
   */
  sweeper: Address | null;
  /**
   * THE ROOST AND AVIANS STAKING (2026-09-18). Two of the nine creations in
   * the deploy — the Roost is what the Nest and the Perch send every AVIANS
   * fee to, and the staking contract is its first leg — so both are REQUIRED
   * and never null: a deployment without them is a deployment of the old
   * contracts, and the site refuses it rather than showing a screen that
   * reads nothing.
   */
  aviansStaking: Address;
  roost: Address;
  /** The deploy block. Where the site's event reads start. */
  startBlock: number;
  /** Where `proofs.json` lives for this deployment, or null for no allowlist file. */
  allowlistProofs: string | null;
  generated?: { at?: string; from?: string };
};

export type DeploymentIndex = {
  default: string;
  deployments: { id: string; label: string; file: string }[];
};

export const CONTRACT_NAMES = [
  'Avians', 'TraitRegistry', 'BirdRenderer', 'TheNest',
  'Treasury', 'ThePerch', 'AvianStock', 'AviansHook', 'LiquidityVault',
] as const;

/** The two that may be null, and only as a pair. */
const POOL_CONTRACTS = ['AviansHook', 'LiquidityVault'] as const;

// ── validation ────────────────────────────────────────────────────────────

export type Problem = { path: string; says: string };

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const ZERO = '0x0000000000000000000000000000000000000000';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function checkAddress(v: unknown, path: string, problems: Problem[]): Address | null {
  if (typeof v !== 'string') {
    problems.push({ path, says: `required, got ${describe(v)}` });
    return null;
  }
  if (!ADDRESS_RE.test(v)) {
    problems.push({
      path,
      says: `not a 20-byte hex address (${JSON.stringify(v)} — ${v.length} characters)`,
    });
    return null;
  }
  if (v.toLowerCase() === ZERO) {
    problems.push({ path, says: 'is the zero address' });
    return null;
  }
  return v as Address;
}

function describe(v: unknown): string {
  if (v === undefined) return 'undefined';
  if (v === null) return 'null';
  if (Array.isArray(v)) return `an array of ${v.length}`;
  return `${typeof v} ${JSON.stringify(v)}`;
}

function checkUrl(v: unknown, path: string, problems: Problem[]): string | null {
  if (typeof v !== 'string' || v === '') {
    problems.push({ path, says: `required, got ${describe(v)}` });
    return null;
  }
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    problems.push({ path, says: `not a URL (${JSON.stringify(v)})` });
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    problems.push({ path, says: `must be http or https, got ${u.protocol}` });
    return null;
  }
  return v;
}

/**
 * Everything that can be decided without touching a chain. The rest — code at
 * every address, and the cross-check in HANDOVER section 10 — is `startup.ts`,
 * and it is just as fatal.
 */
export function validateManifest(raw: unknown, expectedId: string): {
  manifest: Manifest | null; problems: Problem[];
} {
  const problems: Problem[] = [];
  if (!isPlainObject(raw)) {
    return { manifest: null, problems: [{ path: '(document)', says: `expected a JSON object, got ${describe(raw)}` }] };
  }

  if (typeof raw.id !== 'string' || raw.id === '') {
    problems.push({ path: 'id', says: `required, got ${describe(raw.id)}` });
  } else if (raw.id !== expectedId) {
    problems.push({ path: 'id', says: `is ${JSON.stringify(raw.id)} but this file is ${JSON.stringify(expectedId)}.json` });
  }

  if (typeof raw.label !== 'string' || raw.label === '') {
    problems.push({ path: 'label', says: `required, got ${describe(raw.label)}` });
  }

  const driver = raw.driver;
  if (driver !== 'chain' && driver !== 'mock') {
    problems.push({ path: 'driver', says: `must be "chain" or "mock", got ${describe(driver)}` });
  }

  // ── network ──
  const net = raw.network;
  let network: NetworkSpec | null = null;
  if (!isPlainObject(net)) {
    problems.push({ path: 'network', says: `required, got ${describe(net)}` });
  } else {
    const chainId = net.chainId;
    if (typeof chainId !== 'number' || !Number.isInteger(chainId) || chainId <= 0) {
      problems.push({ path: 'network.chainId', says: `must be a positive integer, got ${describe(chainId)}` });
    }
    if (typeof net.chainName !== 'string' || net.chainName === '') {
      problems.push({ path: 'network.chainName', says: `required, got ${describe(net.chainName)}` });
    }
    const cur = net.nativeCurrency;
    if (!isPlainObject(cur)) {
      problems.push({ path: 'network.nativeCurrency', says: `required, got ${describe(cur)}` });
    } else {
      if (typeof cur.name !== 'string' || cur.name === '') problems.push({ path: 'network.nativeCurrency.name', says: `required, got ${describe(cur.name)}` });
      if (typeof cur.symbol !== 'string' || cur.symbol === '') problems.push({ path: 'network.nativeCurrency.symbol', says: `required, got ${describe(cur.symbol)}` });
      if (cur.decimals !== 18) problems.push({ path: 'network.nativeCurrency.decimals', says: `must be 18 (gas is ETH), got ${describe(cur.decimals)}` });
    }
    for (const key of ['rpcUrls', 'blockExplorerUrls'] as const) {
      const list = net[key];
      if (!Array.isArray(list) || list.length === 0) {
        problems.push({ path: `network.${key}`, says: `must be a non-empty array, got ${describe(list)}` });
      } else {
        list.forEach((u, i) => checkUrl(u, `network.${key}[${i}]`, problems));
      }
    }
    network = net as unknown as NetworkSpec;
  }

  // ── contracts ──
  const cs = raw.contracts;
  const contracts: Partial<Record<string, Address | null>> = {};
  if (!isPlainObject(cs)) {
    problems.push({ path: 'contracts', says: `required, got ${describe(cs)}` });
  } else {
    for (const name of CONTRACT_NAMES) {
      const nullable = (POOL_CONTRACTS as readonly string[]).includes(name);
      if (!(name in cs)) {
        problems.push({
          path: `contracts.${name}`,
          says: nullable
            ? 'required — use null to say this deployment has no pool yet, but the key must be present'
            : `required, got undefined`,
        });
        continue;
      }
      const v = cs[name];
      if (v === null && nullable) { contracts[name] = null; continue; }
      contracts[name] = checkAddress(v, `contracts.${name}`, problems);
    }
    // The pool pair is all or nothing: a hook without its vault is a half-run
    // DeployLaunch, which is the state you want to be told about loudly.
    const hook = contracts.AviansHook;
    const vault = contracts.LiquidityVault;
    if ((hook === null) !== (vault === null)) {
      problems.push({
        path: 'contracts.AviansHook / contracts.LiquidityVault',
        says: 'must be null together or set together — a pool deployment produces both',
      });
    }
    // Two names on one address is what a copy-paste error looks like.
    const seen = new Map<string, string>();
    for (const [name, addr] of Object.entries(contracts)) {
      if (!addr) continue;
      const key = addr.toLowerCase();
      const first = seen.get(key);
      if (first) {
        problems.push({ path: `contracts.${name}`, says: `is the same address as contracts.${first}` });
      } else {
        seen.set(key, name);
      }
    }
  }

  // ── third-party contracts ──
  //
  // Tied to the pool: no hook means no pool means nothing to swap through, and
  // a deployment that claims a router but no pool is a half-run launch — the
  // same state the hook/vault pair is checked for above, for the same reason.
  let thirdParty: ThirdPartySet | null = null;
  const poolPresent = contracts.AviansHook != null;
  if (!('thirdParty' in raw)) {
    problems.push({
      path: 'thirdParty',
      says: poolPresent
        ? 'required once there is a pool — PoolManager, UniversalRouter, Permit2 and V4Quoter'
        : 'required — use null to say this deployment has no pool, but the key must be present',
    });
  } else if (raw.thirdParty === null) {
    if (poolPresent) {
      problems.push({
        path: 'thirdParty',
        says: 'is null but contracts.AviansHook is set — a pool with no router cannot be traded',
      });
    }
  } else if (!isPlainObject(raw.thirdParty)) {
    problems.push({ path: 'thirdParty', says: `must be an object or null, got ${describe(raw.thirdParty)}` });
  } else {
    if (!poolPresent) {
      problems.push({
        path: 'thirdParty',
        says: 'is set but contracts.AviansHook is null — there is no pool for these to reach',
      });
    }
    const out: Partial<Record<string, Address | null>> = {};
    for (const name of THIRD_PARTY_NAMES) {
      out[name] = checkAddress((raw.thirdParty as Record<string, unknown>)[name], `thirdParty.${name}`, problems);
    }
    const seen = new Map<string, string>();
    for (const [name, addr] of Object.entries(out)) {
      if (!addr) continue;
      const first = seen.get(addr.toLowerCase());
      if (first) problems.push({ path: `thirdParty.${name}`, says: `is the same address as thirdParty.${first}` });
      else seen.set(addr.toLowerCase(), name);
    }
    if (problems.length === 0) thirdParty = out as ThirdPartySet;
  }

  // ── the rest ──
  let multicall3: Address | null = null;
  if (!('multicall3' in raw)) {
    problems.push({ path: 'multicall3', says: 'required — use null if this chain has no Multicall3' });
  } else if (raw.multicall3 !== null) {
    multicall3 = checkAddress(raw.multicall3, 'multicall3', problems);
  }

  // `lens` existed for one day (2026-09-11), while "who holds what" was a
  // separate contract. The two views are the collection's own now, and a
  // manifest that still names a lens was generated against contracts that
  // predate every 2026-09-11 change — the Nest's, the Perch's floor, the
  // collection's hook. It is refused rather than tolerated, because the site
  // would otherwise boot against a deployment it cannot drive.
  if ('lens' in raw) {
    problems.push({
      path: 'lens',
      says: 'this manifest predates 2026-09-11 (the lens folded into the collection) — regenerate it against the redeployed contracts',
    });
  }

  // The Sweeper: required as a key, null as a statement. An address that is
  // also one of the seven is the paste error it looks like.
  let sweeper: Address | null = null;
  if (!('sweeper' in raw)) {
    problems.push({ path: 'sweeper', says: 'required — use null if this deployment has no Sweeper yet' });
  } else if (raw.sweeper !== null) {
    sweeper = checkAddress(raw.sweeper, 'sweeper', problems);
    if (sweeper) {
      const clash = Object.entries(contracts).find(([, a]) => a && a.toLowerCase() === sweeper!.toLowerCase());
      if (clash) problems.push({ path: 'sweeper', says: `is the same address as contracts.${clash[0]}` });
    }
  }

  // The Roost and the staking contract: required, addresses, and neither may
  // be one of the others — the same paste-error check the seven get.
  const roostSet: Record<string, Address | null> = { aviansStaking: null, roost: null };
  for (const key of ['aviansStaking', 'roost'] as const) {
    if (!(key in raw) || raw[key] === null) {
      problems.push({ path: key, says: `required — this manifest predates 2026-09-18 (the Roost); regenerate it against the redeployed contracts` });
      continue;
    }
    const a = checkAddress(raw[key], key, problems);
    if (!a) continue;
    const clash = Object.entries(contracts).find(([, x]) => x && x.toLowerCase() === a.toLowerCase());
    if (clash) problems.push({ path: key, says: `is the same address as contracts.${clash[0]}` });
    if (sweeper && sweeper.toLowerCase() === a.toLowerCase()) problems.push({ path: key, says: 'is the same address as sweeper' });
    roostSet[key] = a;
  }
  if (roostSet.aviansStaking && roostSet.roost && roostSet.aviansStaking.toLowerCase() === roostSet.roost.toLowerCase()) {
    problems.push({ path: 'roost', says: 'is the same address as aviansStaking' });
  }

  if (typeof raw.startBlock !== 'number' || !Number.isInteger(raw.startBlock) || raw.startBlock < 0) {
    problems.push({ path: 'startBlock', says: `must be a non-negative integer (the deploy block), got ${describe(raw.startBlock)}` });
  }

  if (!('allowlistProofs' in raw)) {
    problems.push({ path: 'allowlistProofs', says: 'required — use null if this deployment serves no proofs file' });
  } else if (raw.allowlistProofs !== null && (typeof raw.allowlistProofs !== 'string' || raw.allowlistProofs === '')) {
    problems.push({ path: 'allowlistProofs', says: `must be a path or null, got ${describe(raw.allowlistProofs)}` });
  }

  if (problems.length) return { manifest: null, problems };

  return {
    manifest: {
      id: raw.id as string,
      label: raw.label as string,
      driver: driver as 'chain' | 'mock',
      network: network as NetworkSpec,
      contracts: contracts as ContractSet,
      thirdParty,
      multicall3,
      sweeper,
      aviansStaking: roostSet.aviansStaking!,
      roost: roostSet.roost!,
      startBlock: raw.startBlock as number,
      allowlistProofs: (raw.allowlistProofs ?? null) as string | null,
      generated: isPlainObject(raw.generated) ? (raw.generated as Manifest['generated']) : undefined,
    },
    problems: [],
  };
}

// ── loading, at runtime ───────────────────────────────────────────────────

export class ManifestError extends Error {
  constructor(readonly source: string, readonly problems: Problem[]) {
    super(`${source}: ${problems.length} problem${problems.length === 1 ? '' : 's'}`);
    this.name = 'ManifestError';
  }
}

const INDEX_URL = './deployments/index.json';

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new ManifestError(url, [{ path: '(fetch)', says: `${res.status} ${res.statusText}` }]);
  try {
    return await res.json();
  } catch (e) {
    throw new ManifestError(url, [{ path: '(json)', says: `is not valid JSON — ${(e as Error).message}` }]);
  }
}

export async function loadIndex(): Promise<DeploymentIndex> {
  const raw = await fetchJson(INDEX_URL);
  if (!isPlainObject(raw) || !Array.isArray(raw.deployments) || typeof raw.default !== 'string') {
    throw new ManifestError(INDEX_URL, [{ path: '(document)', says: 'expected { default, deployments: [{ id, label, file }] }' }]);
  }
  for (const [i, d] of raw.deployments.entries()) {
    if (!isPlainObject(d) || typeof d.id !== 'string' || typeof d.file !== 'string') {
      throw new ManifestError(INDEX_URL, [{ path: `deployments[${i}]`, says: 'needs id, label and file' }]);
    }
  }
  const index = raw as unknown as DeploymentIndex;
  if (!index.deployments.some((d) => d.id === index.default)) {
    throw new ManifestError(INDEX_URL, [{ path: 'default', says: `names ${JSON.stringify(index.default)}, which is not in deployments` }]);
  }
  return index;
}

const STORAGE_KEY = 'avian-stock.deployment';

/**
 * A PER-MACHINE deployment: a fork somebody started themselves, whose
 * addresses exist nowhere else. Such a manifest is never in the index — an
 * entry for it would point every other clone at a file nobody else has — so
 * it is loaded straight from `?d=local-fork`, from the file of that name
 * beside the index, and it is never the remembered choice: a stale
 * `local-*` in storage after the file is gone would break the next boot.
 * The slug is strict so the id can only ever name a file in that folder.
 */
const LOCAL_ID = /^local-[a-z0-9-]+$/;
export function isLocalId(id: string): boolean { return LOCAL_ID.test(id); }

/** Mainnet. The one chain a configured deployment on it is preferred to any other. */
export const MAINNET_CHAIN_ID = 4663;

/**
 * One indexed entry, once its file has been read: what its manifest said it
 * was, or nulls when the file did not load or did not validate. A chain
 * deployment is CONFIGURED when `driver` is "chain" here — the file is
 * indexed, loads, and passes the same validation the boot applies.
 */
export type IndexedDeployment = { id: string; driver: 'chain' | 'mock' | null; chainId: number | null };

/**
 * The id to open (2026-09-19). The site opens on a real deployment whenever
 * one is configured, and on the mock only when none is. In order:
 *
 *   1. `?d=<id>`: an indexed id, or a local-* file. Once a chain deployment
 *      exists this is the only way to the mock: `?d=mock`.
 *   2. The remembered choice, if still indexed, unless it is the mock while a
 *      chain deployment is configured: a mock remembered from the design work
 *      must not pin a visitor to it.
 *   3. Mainnet (chain 4663), if configured.
 *   4. The last configured chain deployment in the index. The generator
 *      appends, so the last is the newest.
 *   5. The mock, only when no chain deployment is configured.
 *
 * `index.default` is no longer what the site opens on. It is read as a
 * tie-break among chain deployments (two on mainnet, say) and to pick among
 * mock entries, never as a reason to open the mock over a chain deployment.
 *
 * Pure, so the cases are unit tests: the browser's `?d=` and localStorage
 * are read by `chooseId` and passed in.
 */
export function chooseDeployment(
  index: DeploymentIndex, known: IndexedDeployment[], fromUrl: string | null, stored: string | null,
): string {
  const indexed = (id: string | null): id is string => !!id && index.deployments.some((d) => d.id === id);
  const configured = index.deployments
    .map((d) => known.find((k) => k.id === d.id))
    .filter((k): k is IndexedDeployment => !!k && k.driver === 'chain');
  const isMock = (id: string) => known.find((k) => k.id === id)?.driver === 'mock' || id === 'mock';
  const preferDefault = (among: IndexedDeployment[]) =>
    among.find((k) => k.id === index.default) ?? among[among.length - 1];

  if (fromUrl && isLocalId(fromUrl)) return fromUrl;
  if (indexed(fromUrl)) return fromUrl;
  if (indexed(stored) && !(configured.length > 0 && isMock(stored))) return stored;
  const mainnet = configured.filter((k) => k.chainId === MAINNET_CHAIN_ID);
  if (mainnet.length > 0) return preferDefault(mainnet).id;
  if (configured.length > 0) return configured[configured.length - 1].id;
  const mocks = index.deployments.filter((d) => isMock(d.id));
  if (mocks.length > 0) return mocks.find((d) => d.id === index.default)?.id ?? mocks[0].id;
  // Nothing loaded at all. The index's default is indexed (loadIndex checked),
  // and loading it is what will say what is wrong with it.
  return index.default;
}

/**
 * `?d=<id>` wins — an index entry, or a local-* file — otherwise every indexed
 * manifest is read to learn which chain deployments are configured, and
 * `chooseDeployment` decides. The files are small and are fetched again by
 * `loadManifest` for the one that wins; the double read is the price of
 * keeping that function as it is.
 */
export async function chooseId(index: DeploymentIndex): Promise<string> {
  const fromUrl = new URLSearchParams(location.search).get('d');
  let stored: string | null = null;
  try { stored = localStorage.getItem(STORAGE_KEY); } catch { /* private mode */ }
  if (fromUrl && (isLocalId(fromUrl) || index.deployments.some((d) => d.id === fromUrl))) return fromUrl;

  const known = await Promise.all(index.deployments.map(async (d): Promise<IndexedDeployment> => {
    try {
      const raw = await fetchJson(new URL(d.file, new URL(INDEX_URL, location.href)).toString());
      const { manifest: m, problems } = validateManifest(raw, d.id);
      // A chain manifest that does not validate is not configured, and the
      // site opens elsewhere; say so where a developer will look, because
      // opening the mock in silence would hide a broken deploy.
      if (!m) console.warn(`deployments/${d.id}.json is not usable, so it is not a deployment the site will open on:`, problems.map((p) => `${p.path}: ${p.says}`).join('; '));
      return { id: d.id, driver: m?.driver ?? null, chainId: m?.network.chainId ?? null };
    } catch (e) {
      console.warn(`deployments/${d.id}.json could not be read:`, (e as Error)?.message ?? String(e));
      return { id: d.id, driver: null, chainId: null };
    }
  }));
  return chooseDeployment(index, known, fromUrl, stored);
}

export function rememberChoice(id: string) {
  if (isLocalId(id)) return;                          // per-machine, and possibly gone tomorrow
  try { localStorage.setItem(STORAGE_KEY, id); } catch { /* private mode */ }
}

/**
 * Switching deployment reloads. Nothing is carried across, for the same reason
 * nothing is carried across a `chainChanged`: every balance, allowance and
 * address on the page belongs to the network it was read from.
 */
export function switchDeployment(id: string): void {
  rememberChoice(id);
  const url = new URL(location.href);
  url.searchParams.set('d', id);
  location.href = url.toString();
}

export async function loadManifest(index: DeploymentIndex, id: string): Promise<Manifest> {
  const entry = index.deployments.find((d) => d.id === id);
  // A local-* id has no entry by design; its file sits beside the index. A
  // missing one fails the same way a bad entry does: loudly, naming the file.
  const file = entry?.file ?? (isLocalId(id) ? `./${id}.json` : null);
  if (!file) throw new ManifestError(INDEX_URL, [{ path: 'deployments', says: `has no deployment called ${JSON.stringify(id)}` }]);
  const url = new URL(file, new URL(INDEX_URL, location.href)).toString();
  const raw = await fetchJson(url);
  const { manifest, problems } = validateManifest(raw, id);
  if (!manifest) throw new ManifestError(file, problems);
  return manifest;
}

// ── the active manifest ───────────────────────────────────────────────────

let active: Manifest | null = null;

export function setActiveManifest(m: Manifest) { active = m; }

/**
 * The manifest, or a throw. Nothing renders before `setActiveManifest`, so a
 * call site never has to handle the null.
 */
export function manifest(): Manifest {
  if (!active) throw new Error('no deployment manifest is loaded');
  return active;
}

export function hasManifest(): boolean { return active !== null; }

/** The chain the app wants. There is no second source for this number. */
export function chainId(): number { return manifest().network.chainId; }

/** `0x1237` for 4663 — derived, never a field, so the two cannot disagree. */
export function chainIdHex(): `0x${string}` {
  return `0x${chainId().toString(16)}` as `0x${string}`;
}

/** Exactly the shape `wallet_addEthereumChain` wants, built from the manifest. */
export function addEthereumChainParams() {
  const n = manifest().network;
  return {
    chainId: chainIdHex(),
    chainName: n.chainName,
    nativeCurrency: n.nativeCurrency,
    rpcUrls: [...n.rpcUrls],
    blockExplorerUrls: [...n.blockExplorerUrls],
  };
}

export function contracts(): ContractSet { return manifest().contracts; }

/**
 * The router, the quoter and Permit2 — or null on a deployment with no pool.
 * Every caller has to handle the null, because "there is no pool yet" is a real
 * state this site has been in and will be in again on a fresh chain.
 */
export function thirdParty(): ThirdPartySet | null { return manifest().thirdParty; }

/** The Sweeper, or null: no panel, no reads, no call to it anywhere. */
export function sweeperAddress(): Address | null { return manifest().sweeper; }

/** The Roost and the AVIANS staking contract. Never null: see the type. */
export function roostContracts(): { roost: Address; staking: Address } {
  const m = manifest();
  return { roost: m.roost, staking: m.aviansStaking };
}

/** The pool half of a deployment, or null when it has not been launched. */
export function poolContracts(): { hook: Address; vault: Address } | null {
  const c = contracts();
  return c.AviansHook && c.LiquidityVault ? { hook: c.AviansHook, vault: c.LiquidityVault } : null;
}

// ── explorer links ────────────────────────────────────────────────────────

function explorerBase(): string | null {
  const urls = manifest().network.blockExplorerUrls;
  return urls.length ? urls[0].replace(/\/+$/, '') : null;
}

export function explorerTx(hash: string): string | null {
  const base = explorerBase();
  return base && /^0x[0-9a-fA-F]{64}$/.test(hash) ? `${base}/tx/${hash}` : null;
}

export function explorerAddress(address: string): string | null {
  const base = explorerBase();
  return base && ADDRESS_RE.test(address) ? `${base}/address/${address}` : null;
}
