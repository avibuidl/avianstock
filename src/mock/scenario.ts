// The state switcher's model.
//
// Everything the mock shows is derived from this one object, so every state in
// HANDOVER is reachable without a chain. It lives in the URL (?s=…) so a
// reviewer can send a link to a broken screen, and in localStorage so a reload
// keeps it.
//
// When the site is wired, this file and the panel that drives it are deleted;
// nothing outside src/mock imports it except DevPanel.

import { useSyncExternalStore } from 'react';
import type { ErrorName } from './types';

export type Scenario = {
  connection: 'no-wallet' | 'disconnected' | 'connecting' | 'wrong-network' | 'unknown-network' | 'connected';
  data: 'loading' | 'error' | 'empty' | 'populated';

  launch: 'before' | 'window' | 'after';
  /** 0..300 — where we are inside First Light. */
  windowElapsed: number;

  paidMint: 'closed' | 'open' | 'sold-out' | 'wallet-cap';
  freeMint: 'closed' | 'open-allowlisted' | 'open-not-allowlisted' | 'already-claimed' | 'exhausted' | 'released';

  balance: 'none' | 'short' | 'enough' | 'plenty';
  approvals: 'none' | 'partial' | 'sufficient';
  approvalRoute: 'approve' | 'permit';

  combo: 'available' | 'taken';

  perch: 'empty' | 'some' | 'full';
  /**
   * How close the Perch is to burning one. The countdown is real arithmetic on
   * `deposits` in the fixture, so "one away" really does make the sell card
   * name a bird and ask for a confirmation.
   */
  burnClock: 'far' | 'near' | 'one-away';
  roost: 'nothing-staked' | 'tier-1' | 'tier-2' | 'tier-3' | 'mixed';
  rewards: 'none-listed' | 'accruing' | 'one-paused' | 'all-paused';

  /**
   * The Treasury card. Each value is one of the contract's guards failing, or
   * a currency state worth seeing — every branch the card can draw.
   */
  treasury:
    | 'flowing'              // healthy: ETH convertible, something streamed already
    | 'disabled'             // guard 1
    | 'cooling-down'         // guard 2
    | 'nothing-staked'       // guard 3
    | 'no-rewards'           // guard 4
    | 'no-targets'           // guard 5
    | 'nothing-convertible'  // guard 6
    | 'accidental-deposit'   // an ERC-20 turned up; 100% of it is the admin's
    | 'nothing-claimable';   // the owner has already withdrawn
  /**
   * The admin panel. Each value is a state the screen has to be able to draw —
   * including the two where the connected wallet is not the owner, because
   * "you are not the owner" is a screen too, and the one people will most
   * often see.
   */
  admin:
    | 'owner'                 // the ordinary case
    | 'not-the-owner'         // the refusal, with both addresses
    | 'you-are-pending'       // you can accept, and do nothing else
    | 'transfer-pending'      // a hand-off is in flight and nobody has noticed
    | 'owners-disagree'       // the five do not name the same owner
    | 'everything-locked'     // renderer and validator, permanently
    | 'release-ready'         // the free allocation can be released
    | 'reward-list-full'      // the 8-token cap is reached
    | 'surplus-to-restream'   // there is something to re-schedule
    | 'probe-approved'        // step one of adding a reward token is done
    | 'lock-expired';         // the vault's position can leave

  /**
   * Trading AVIANS. The launch window is NOT here — it comes from `launch` and
   * `windowElapsed`, which First Light and the Docs timeline already use, so
   * there is one model of the window and not two. What is here is everything
   * those cannot say.
   */
  swap:
    | 'ready'            // both approvals granted; a sell can go straight through
    | 'needs-approval'   // step one outstanding: AVIANS -> Permit2
    | 'needs-permit2'    // step two outstanding: Permit2 -> the router
    | 'quote-fails'      // the node will not answer a quote
    | 'no-pool';         // this deployment has no pool at all

  satchel: 'empty' | 'holds-tokens' | 'holds-birds';
  operatorWhitelist: 'applied' | 'missing';

  /** Force the next write to fail with this. Cleared after one throw. */
  nextError: ErrorName | null;
};

export const DEFAULT_SCENARIO: Scenario = {
  connection: 'connected',
  data: 'populated',
  launch: 'after',
  windowElapsed: 138,
  paidMint: 'open',
  freeMint: 'open-allowlisted',
  balance: 'enough',
  approvals: 'sufficient',
  approvalRoute: 'permit',
  combo: 'available',
  perch: 'some',
  burnClock: 'far',
  roost: 'mixed',
  rewards: 'one-paused',
  treasury: 'flowing',
  admin: 'owner',
  swap: 'needs-approval',
  satchel: 'holds-birds',
  operatorWhitelist: 'applied',
  nextError: null,
};

export type Preset = { name: string; group: string; patch: Partial<Scenario> };

/** The named walkthrough. Each one is a URL. */
export const PRESETS: Preset[] = [
  { group: 'Opening', name: 'Before launch', patch: { launch: 'before', paidMint: 'closed', freeMint: 'closed' } },
  { group: 'Opening', name: 'First Light, second 3', patch: { launch: 'window', windowElapsed: 3, paidMint: 'closed', freeMint: 'closed' } },
  { group: 'Opening', name: 'First Light, second 280', patch: { launch: 'window', windowElapsed: 280, paidMint: 'closed', freeMint: 'closed' } },
  { group: 'Opening', name: 'After the window', patch: { launch: 'after' } },

  { group: 'The free door', name: "Open, you're on the list", patch: { freeMint: 'open-allowlisted', paidMint: 'closed', launch: 'after' } },
  { group: 'The free door', name: "Open, you're not", patch: { freeMint: 'open-not-allowlisted', paidMint: 'closed', launch: 'after' } },
  { group: 'The free door', name: 'Already claimed', patch: { freeMint: 'already-claimed', launch: 'after' } },
  { group: 'The free door', name: 'All 2,000 claimed', patch: { freeMint: 'exhausted', paidMint: 'open', launch: 'after' } },
  { group: 'The free door', name: 'Released to the paid mint', patch: { freeMint: 'released', paidMint: 'open', launch: 'after' } },

  { group: 'The paid door', name: 'Closed', patch: { paidMint: 'closed', freeMint: 'closed', launch: 'after' } },
  { group: 'The paid door', name: 'Open, no AVIANS', patch: { paidMint: 'open', freeMint: 'closed', balance: 'none', approvals: 'none', launch: 'after' } },
  { group: 'The paid door', name: 'Open, needs approval', patch: { paidMint: 'open', freeMint: 'closed', balance: 'enough', approvals: 'none', approvalRoute: 'approve', launch: 'after' } },
  { group: 'The paid door', name: 'Open, ready', patch: { paidMint: 'open', freeMint: 'closed', balance: 'enough', approvals: 'sufficient', combo: 'available', launch: 'after' } },
  { group: 'The paid door', name: 'Combination just went', patch: { paidMint: 'open', freeMint: 'closed', combo: 'taken', launch: 'after' } },
  { group: 'The paid door', name: 'Wallet cap reached', patch: { paidMint: 'wallet-cap', freeMint: 'closed', launch: 'after' } },
  { group: 'The paid door', name: 'Sold out', patch: { paidMint: 'sold-out', freeMint: 'released', launch: 'after' } },

  { group: 'The perch', name: 'Empty', patch: { perch: 'empty' } },
  { group: 'The perch', name: 'Holding 37', patch: { perch: 'some' } },
  { group: 'The perch', name: 'Holding 214', patch: { perch: 'full' } },
  { group: 'The perch', name: 'Batch route refused', patch: { operatorWhitelist: 'missing' } },
  { group: 'The perch', name: 'The burn is far off', patch: { burnClock: 'far' } },
  { group: 'The perch', name: 'The burn is three away', patch: { burnClock: 'near' } },
  { group: 'The perch', name: 'The next bird burns', patch: { burnClock: 'one-away' } },

  { group: 'The nest', name: 'Nothing roosting', patch: { roost: 'nothing-staked', rewards: 'accruing' } },
  { group: 'The nest', name: 'Roosting at tier 1', patch: { roost: 'tier-1', rewards: 'accruing' } },
  { group: 'The nest', name: 'Roosting at tier 2', patch: { roost: 'tier-2', rewards: 'accruing' } },
  { group: 'The nest', name: 'Roosting at tier 3', patch: { roost: 'tier-3', rewards: 'accruing' } },
  { group: 'The nest', name: 'Nothing streams yet', patch: { roost: 'mixed', rewards: 'none-listed' } },
  { group: 'The nest', name: 'One token paused', patch: { roost: 'mixed', rewards: 'one-paused' } },
  { group: 'The nest', name: 'Every token paused', patch: { roost: 'mixed', rewards: 'all-paused' } },

  { group: 'The Treasury', name: 'Flowing', patch: { treasury: 'flowing' } },
  { group: 'The Treasury', name: 'Conversion disabled', patch: { treasury: 'disabled' } },
  { group: 'The Treasury', name: 'Cooling down', patch: { treasury: 'cooling-down' } },
  { group: 'The Treasury', name: 'Nothing staked', patch: { treasury: 'nothing-staked' } },
  { group: 'The Treasury', name: 'No reward tokens', patch: { treasury: 'no-rewards' } },
  { group: 'The Treasury', name: 'No targets set', patch: { treasury: 'no-targets' } },
  { group: 'The Treasury', name: 'Nothing convertible', patch: { treasury: 'nothing-convertible' } },
  { group: 'The Treasury', name: 'An accidental ERC-20 deposit', patch: { treasury: 'accidental-deposit' } },
  { group: 'The Treasury', name: 'An ERC-20 turned up', patch: { treasury: 'accidental-deposit' } },

  { group: 'The owner', name: 'The panel, as the owner', patch: { admin: 'owner' } },
  { group: 'The owner', name: 'Not the owner', patch: { admin: 'not-the-owner' } },
  { group: 'The owner', name: 'You are the pending owner', patch: { admin: 'you-are-pending' } },
  { group: 'The owner', name: 'A hand-off is in flight', patch: { admin: 'transfer-pending' } },
  { group: 'The owner', name: 'The five disagree', patch: { admin: 'owners-disagree' } },
  { group: 'The owner', name: 'Renderer and validator locked', patch: { admin: 'everything-locked' } },
  { group: 'The owner', name: 'The free allocation can be released', patch: { admin: 'release-ready' } },
  { group: 'The owner', name: 'The reward list is full', patch: { admin: 'reward-list-full' } },
  { group: 'The owner', name: 'Something to restream', patch: { admin: 'surplus-to-restream' } },
  { group: 'The owner', name: 'The probe is approved', patch: { admin: 'probe-approved' } },
  { group: 'The owner', name: 'The lock has expired', patch: { admin: 'lock-expired' } },

  { group: 'Trading', name: 'Before trading opens', patch: { launch: 'before', swap: 'needs-approval' } },
  { group: 'Trading', name: 'Second 3 of the window', patch: { launch: 'window', windowElapsed: 3, swap: 'ready' } },
  { group: 'Trading', name: 'Second 280 of the window', patch: { launch: 'window', windowElapsed: 280, swap: 'ready' } },
  { group: 'Trading', name: 'After the window', patch: { launch: 'after', swap: 'ready' } },
  { group: 'Trading', name: 'A sell needs its first approval', patch: { launch: 'after', swap: 'needs-approval' } },
  { group: 'Trading', name: 'A sell needs Permit2', patch: { launch: 'after', swap: 'needs-permit2' } },
  { group: 'Trading', name: 'The quote fails', patch: { launch: 'after', swap: 'quote-fails' } },
  { group: 'Trading', name: 'No pool on this deployment', patch: { swap: 'no-pool' } },

  { group: 'Satchels', name: 'Empty satchel', patch: { satchel: 'empty' } },
  { group: 'Satchels', name: 'Holds tokens', patch: { satchel: 'holds-tokens' } },
  { group: 'Satchels', name: 'Holds two birds', patch: { satchel: 'holds-birds' } },

  { group: 'Wallet', name: 'No wallet installed', patch: { connection: 'no-wallet' } },
  { group: 'Wallet', name: 'Not connected', patch: { connection: 'disconnected' } },
  { group: 'Wallet', name: 'Wrong network', patch: { connection: 'wrong-network' } },
  { group: 'Wallet', name: 'Unknown network (4902)', patch: { connection: 'unknown-network' } },

  { group: 'Data', name: 'Loading', patch: { data: 'loading' } },
  { group: 'Data', name: 'Nothing here yet', patch: { data: 'empty', perch: 'empty', roost: 'nothing-staked' } },
  { group: 'Data', name: 'Reads failing', patch: { data: 'error' } },
  { group: 'Data', name: 'Everything working', patch: { data: 'populated' } },
];

// ────────────────────────────────────────────────────── the store behind it

const KEY = 'avian-stock:scenario';
let current: Scenario = load();
const listeners = new Set<() => void>();

function load(): Scenario {
  const out = { ...DEFAULT_SCENARIO };
  try {
    const stored = localStorage.getItem(KEY);
    if (stored) Object.assign(out, JSON.parse(stored));
  } catch { /* private mode, cleared storage — the default is fine */ }
  try {
    const q = new URLSearchParams(location.search).get('s');
    if (q) Object.assign(out, JSON.parse(decodeURIComponent(escape(atob(q)))));
  } catch { /* a stale or hand-edited link — the default is fine */ }
  return out;
}

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* not fatal */ }
  try {
    const url = new URL(location.href);
    url.searchParams.set('s', encode(current));
    history.replaceState(null, '', url);
  } catch { /* not fatal */ }
}

export function encode(s: Scenario): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(s))));
}

export function scenario(): Scenario { return current; }

export function setScenario(patch: Partial<Scenario>) {
  current = { ...current, ...patch };
  persist();
  listeners.forEach((l) => l());
}

export function resetScenario() { setScenario(DEFAULT_SCENARIO); }

/**
 * A preset is a COMPLETE state, not a patch onto whatever came before —
 * otherwise "Sold out" quietly inherits "reads failing" and shows neither.
 * The individual switches below it are the patch-shaped half.
 */
export function applyPreset(p: Preset) { setScenario({ ...DEFAULT_SCENARIO, ...p.patch }); }

/** Consume a one-shot forced failure. */
export function takeForcedError(): ErrorName | null {
  const e = current.nextError;
  if (e) setScenario({ nextError: null });
  return e;
}

export function subscribeScenario(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function useScenario(): Scenario {
  return useSyncExternalStore(subscribeScenario, scenario, () => DEFAULT_SCENARIO);
}

/** A link that opens the site in exactly this state. */
export function presetHref(p: Preset): string {
  const s = { ...DEFAULT_SCENARIO, ...p.patch };
  return `${location.pathname}?s=${encode(s)}${location.hash}`;
}

export const IS_MOCK = true;
