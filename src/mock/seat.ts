// The owner's seat, without a chain (2026-09-24).
//
// Five scenes for the "Your seat" control on the Owner page: heard from
// today; heard from 26 days ago, four days before the council may act alone,
// which is the warning; a proposal standing on all six; the six disagreeing;
// and "Still here" caught three seats into its six.
//
// Once wired this is `src/chain/council.ts`: `lastSeenAt()`, `silentAt()` and
// `pendingOwner()` on each owned seat, `stillHere()` and
// `transferOwnership(key)` sent to each in turn.

import type { Address, OnPhase, OwnedSeat, SeatRun, SeatState } from './types';
import { ContractError } from './errors';
import { scenario, subscribeScenario, takeForcedError } from './scenario';
import { read } from './reads';
import { address, requireChain, sleep } from './wallet';
import { settled } from './writes';

const DAY = 86_400;
const SILENCE = 30 * DAY;

/** The key the owner has proposed, and a second one for the six to disagree over. Fixtures. */
const PROPOSED = '0x12F0a3C9d85E7b41A6c2D09e4B7f3a51C8d289ab' as Address;
const OTHER = '0x9f4E2b8C61aD7305Fe9b1C42A8d06E7B3c5F1024' as Address;
/** Whoever holds the seats when it is not you. */
const NOT_YOU = '0x00000000000000000000000000000000000000A1' as Address;

const SEATS: Pick<OwnedSeat, 'id' | 'name' | 'veil'>[] = [
  { id: 'collection', name: 'the collection' },
  { id: 'perch', name: 'the Perch' },
  { id: 'nest', name: 'the Nest' },
  { id: 'treasury', name: 'the Treasury' },
  { id: 'vault', name: 'the vault' },
  { id: 'traitMarket', name: 'the trait market', veil: 'traitMarket' },
];

/** The scene as it stands, written to by the two senders; rebuilt when the scene changes. */
let live: OwnedSeat[] | null = null;
subscribeScenario(() => { live = null; });

function build(): OwnedSeat[] {
  const now = Math.floor(Date.now() / 1000);
  const scene = scenario().seat;
  return SEATS.map((s, i) => {
    // When the owner was last heard from on this seat, in seconds ago.
    const ago = scene === 'quiet-26' ? 26 * DAY
      : scene === 'proposed' || scene === 'disagree' ? 3 * DAY
        : scene === 'midway' ? (i < 3 ? 60 : 12 * DAY)
          : 5 * 60;
    const proposed = scene === 'proposed' ? PROPOSED
      : scene === 'disagree' ? (s.id === 'nest' ? OTHER : s.id === 'treasury' ? null : PROPOSED)
        : null;
    const lastSeenAt = now - ago;
    // The connected wallet holds every seat when the scene is the owner's; a
    // stranger holds them otherwise, so the control's refusal can be walked.
    const owner = scenario().admin === 'owner' ? (address() ?? NOT_YOU) : NOT_YOU;
    return { ...s, lastSeenAt, silentAt: lastSeenAt + SILENCE, proposed, owner };
  });
}

function seats(): OwnedSeat[] {
  if (!live) live = build();
  return live;
}

export function getSeat(): Promise<SeatState> {
  return read(() => ({
    seats: seats().map((s) => ({ ...s })),
    silence: SILENCE,
    chainNow: Math.floor(Date.now() / 1000),
  }));
}

/**
 * "Still here" caught mid-way, for the fifth scene: three seats confirmed, the
 * Treasury's signature waiting in the wallet. Only the mock has one; on a
 * chain a run in flight is the control's own state and nothing to read.
 */
export function seatRunFixture(): SeatRun | null {
  return scenario().seat === 'midway'
    ? { kind: 'still', done: 3, of: 6, at: 'the Treasury', phase: 'signing' }
    : null;
}

async function send(on: OnPhase | undefined, make: () => void): Promise<{ hash: `0x${string}` }> {
  requireChain();
  const forced = takeForcedError();
  if (scenario().admin !== 'owner') throw new ContractError('OwnableUnauthorizedAccount');
  on?.('signing');
  await sleep(650);
  if (forced) throw new ContractError(forced);
  const h = `0x${Array.from({ length: 64 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('')}` as `0x${string}`;
  on?.('pending', h);
  await sleep(1400);
  make();
  on?.('confirmed', h);
  settled();
  return { hash: h };
}

function seat(id: OwnedSeat['id']): OwnedSeat {
  const s = seats().find((x) => x.id === id);
  if (!s) throw new Error(`no owned seat "${id}" on this deployment`);
  return s;
}

/** `stillHere()` on one seat: its thirty days start again from now. */
export function stillHere(id: OwnedSeat['id'], on?: OnPhase) {
  return send(on, () => {
    const s = seat(id);
    s.lastSeenAt = Math.floor(Date.now() / 1000);
    s.silentAt = s.lastSeenAt + SILENCE;
  });
}

/** `transferOwnership(key)` on one seat: a proposal, and a sign of life with it. */
export function proposeOwner(id: OwnedSeat['id'], key: Address, on?: OnPhase) {
  return send(on, () => {
    const s = seat(id);
    s.proposed = key;
    s.lastSeenAt = Math.floor(Date.now() / 1000);
    s.silentAt = s.lastSeenAt + SILENCE;
  });
}

/** The addresses the fixtures name, for the tests. */
export const SEAT_FIXTURES = { PROPOSED, OTHER, SILENCE };
