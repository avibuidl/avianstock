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

  /**
   * 'before' is a launch three hours off, and stays three hours off: the
   * fixture is relative to the read. 'imminent' (2026-09-19) is a launch
   * twenty seconds after this scene was chosen, anchored, for watching the
   * trade modal's countdown reach zero and its button open on the clock.
   */
  launch: 'before' | 'imminent' | 'window' | 'after';
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
  burnClock: 'far' | 'near' | 'one-away' | 'below-floor';
  /**
   * What your birds carry. 'expired-unsettled' is a bird you BOUGHT whose
   * previous holder's brood ended with the sale and nobody has settled;
   * 'settled-claimable' is a held-back share of yours waiting for `claim`.
   */
  brood: 'none' | 'brooding' | 'brooding-to-wallet' | 'expired-unsettled' | 'settled-claimable' | 'mixed';
  rewards: 'none-listed' | 'accruing' | 'one-paused' | 'all-paused';
  /**
   * The Sweeper, on your satchels. 'some-granted' is two of them, with stock
   * inside; 'all-swept' is every bird granted and every satchel emptied —
   * the panel with nothing left to collect. A token that will be SKIPPED
   * comes from `rewards` ('one-paused'), not from here: a paused token
   * refuses the sweep the same way it refuses a settle.
   */
  sweeper: 'none-granted' | 'some-granted' | 'all-granted' | 'all-swept';

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

  /**
   * The price ticker. Which tokens it shows comes from `rewards`
   * ('none-listed' empties it, and the band is not drawn at all); this is the
   * rest: one token whose pool is missing, and the no-motion rendering forced
   * without touching the OS setting.
   */
  ticker: 'all' | 'one-missing' | 'reduced-motion';

  /**
   * The Roost (2026-09-18). 'ready': AVIANS waiting to be split and both legs
   * deliverable; 'nest-held': the Nest's leg held ("nothing is brooding");
   * 'too-soon': turned five hours ago, so the next turn is nineteen away.
   */
  roost: 'ready' | 'nest-held' | 'nest-held-brooding' | 'too-soon';
  /** AVIANS staking: a stake with a live stream three and a half days in, or nothing staked. */
  /**
   * 'held-with-staker' (2026-09-19): the stakers' leg of an earlier turn is
   * held at the Roost and the wallet has since staked, so the DELIVER button
   * is live; 'held-nobody-staked': the same leg held with nobody staked yet.
   */
  staking: 'mid-week' | 'nothing-staked' | 'held-with-staker' | 'held-nobody-staked';

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
  brood: 'mixed',
  rewards: 'one-paused',
  sweeper: 'some-granted',
  treasury: 'flowing',
  admin: 'owner',
  swap: 'needs-approval',
  satchel: 'holds-birds',
  operatorWhitelist: 'applied',
  ticker: 'all',
  roost: 'ready',
  staking: 'mid-week',
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

  { group: 'The nest', name: 'Nothing brooding', patch: { brood: 'none', rewards: 'accruing' } },
  { group: 'The nest', name: 'Brooding, to the birds', patch: { brood: 'brooding', rewards: 'accruing' } },
  { group: 'The nest', name: 'Brooding, one to your wallet', patch: { brood: 'brooding-to-wallet', rewards: 'accruing' } },
  { group: 'The nest', name: 'A bought bird, brood expired, unsettled', patch: { brood: 'expired-unsettled', rewards: 'accruing' } },
  { group: 'The nest', name: 'A held-back share to claim', patch: { brood: 'settled-claimable', rewards: 'accruing' } },
  { group: 'The nest', name: 'Nothing streams yet', patch: { brood: 'mixed', rewards: 'none-listed' } },
  { group: 'The nest', name: 'One token paused', patch: { brood: 'mixed', rewards: 'one-paused' } },
  { group: 'The nest', name: 'Every token paused', patch: { brood: 'mixed', rewards: 'all-paused' } },
  { group: 'The perch', name: 'Below the burn floor', patch: { burnClock: 'below-floor' } },

  { group: 'Collecting', name: 'Nothing granted yet', patch: { sweeper: 'none-granted', rewards: 'accruing', satchel: 'holds-tokens' } },
  { group: 'Collecting', name: 'Some granted, with stock to collect', patch: { sweeper: 'some-granted', rewards: 'accruing' } },
  { group: 'Collecting', name: 'A token that will be skipped', patch: { sweeper: 'some-granted', rewards: 'one-paused' } },
  { group: 'Collecting', name: 'Everything swept already', patch: { sweeper: 'all-swept', rewards: 'accruing' } },

  { group: 'The Treasury', name: 'Flowing', patch: { treasury: 'flowing' } },
  { group: 'The Treasury', name: 'Conversion disabled', patch: { treasury: 'disabled' } },
  { group: 'The Treasury', name: 'Cooling down', patch: { treasury: 'cooling-down' } },
  { group: 'The Treasury', name: 'Nothing brooding', patch: { treasury: 'nothing-staked' } },
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
  { group: 'Trading', name: 'Opens in twenty seconds: the button opens on the clock', patch: { launch: 'imminent', swap: 'ready' } },
  { group: 'Trading', name: 'Second 3 of the window', patch: { launch: 'window', windowElapsed: 3, swap: 'ready' } },
  { group: 'Trading', name: 'Second 280 of the window', patch: { launch: 'window', windowElapsed: 280, swap: 'ready' } },
  { group: 'Trading', name: 'After the window', patch: { launch: 'after', swap: 'ready' } },
  { group: 'Trading', name: 'A sell needs its first approval', patch: { launch: 'after', swap: 'needs-approval' } },
  { group: 'Trading', name: 'A sell needs Permit2', patch: { launch: 'after', swap: 'needs-permit2' } },
  { group: 'Trading', name: 'The quote fails', patch: { launch: 'after', swap: 'quote-fails' } },
  { group: 'Trading', name: 'No pool on this deployment', patch: { swap: 'no-pool' } },

  { group: 'The ticker', name: 'Every listed token priced', patch: { ticker: 'all', rewards: 'accruing' } },
  { group: 'The ticker', name: 'One token with no pool', patch: { ticker: 'one-missing', rewards: 'accruing' } },
  { group: 'The ticker', name: 'No reward tokens listed — no band', patch: { ticker: 'all', rewards: 'none-listed' } },
  { group: 'The ticker', name: 'Reduced motion', patch: { ticker: 'reduced-motion', rewards: 'accruing' } },

  { group: 'The Roost', name: 'Ready to turn, both legs deliverable', patch: { roost: 'ready', staking: 'mid-week' } },
  { group: 'The Roost', name: 'The Nest leg held — nothing is brooding', patch: { roost: 'nest-held', brood: 'none' } },
  { group: 'The Roost', name: 'Too soon to turn', patch: { roost: 'too-soon' } },
  { group: 'The Roost', name: 'Staked, mid-week stream', patch: { staking: 'mid-week' } },
  { group: 'The Roost', name: 'Nothing staked', patch: { staking: 'nothing-staked' } },
  { group: 'The Roost', name: 'A held stakers’ leg, and a staker present: DELIVER is live', patch: { staking: 'held-with-staker', roost: 'ready' } },
  { group: 'The Roost', name: 'A held stakers’ leg, nobody staked yet', patch: { staking: 'held-nobody-staked', roost: 'ready' } },
  { group: 'The Roost', name: 'A held brooding leg, with birds brooding: DELIVER on the nest', patch: { roost: 'nest-held-brooding', brood: 'mixed', rewards: 'accruing' } },
  { group: 'The Roost', name: 'A brooding bird’s unsettled AVIANS ticking', patch: { brood: 'brooding', rewards: 'accruing' } },

  { group: 'Satchels', name: 'Empty satchel', patch: { satchel: 'empty' } },
  { group: 'Satchels', name: 'Holds tokens', patch: { satchel: 'holds-tokens' } },
  { group: 'Satchels', name: 'Holds two birds', patch: { satchel: 'holds-birds' } },

  { group: 'Wallet', name: 'No wallet installed', patch: { connection: 'no-wallet' } },
  { group: 'Wallet', name: 'Not connected', patch: { connection: 'disconnected' } },
  { group: 'Wallet', name: 'Wrong network', patch: { connection: 'wrong-network' } },
  { group: 'Wallet', name: 'Unknown network (4902)', patch: { connection: 'unknown-network' } },

  { group: 'Data', name: 'Loading', patch: { data: 'loading' } },
  { group: 'Data', name: 'Nothing here yet', patch: { data: 'empty', perch: 'empty', brood: 'none' } },
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
