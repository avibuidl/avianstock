// The council, without a chain (2026-09-24).
//
// Four scenes, one per state the card has to draw: nothing pending, a
// replacement waiting out its three days, the rescue waiting out its one,
// and a deployment where no council seat was ever named. The addresses are
// the mock's own, and the timestamps are relative to the read, so the
// countdowns tick and a screenshot can be taken at any moment.
//
// Once wired this is `src/chain/council.ts`: `council()`, `MULTISIG()`, the
// two delays, and one log scan for what is scheduled and not yet executed.

import type { Address, CouncilChange, CouncilState, Hex } from './types';
import { scenario } from './scenario';
import { read } from './reads';

const DAY = 86_400;
const STRUCTURAL_DELAY = 3 * DAY;
const RESCUE_DELAY = DAY;

/** The timelock and the multisig that may propose to it. Fixtures, like every address here. */
const COUNCIL = '0x2c9F4E17ba1DbAeF0FbC3D8a7c3ee6C1b09F5A84' as Address;
const MULTISIG = '0x7D1B84c55eA3bE9C2f0aD26a5b1Cc4f9E03d7b12' as Address;
/** Where a pending change would point: a fresh Treasury, and a fresh admin key. */
const NEW_TREASURY = '0x12aC5b7e9F3d04Ba61c8e25D7f0b4A9c3E6d89ab' as Address;
const NEW_ADMIN = '0x9f4E2b8C61aD7305Fe9b1C42A8d06E7B3c5F1024' as Address;
/** A fresh Roost for the Nest's cost sink, for the price band's three-waiting scene. */
const NEW_ROOST = '0x5E3a90C4b7D21f86aE0c3B59d14F7a2C68e0B3d7' as Address;

const id = (n: number): Hex => `0x${n.toString(16).padStart(64, '0')}` as Hex;

export function getCouncil(): Promise<CouncilState> {
  return read(() => {
    const s = scenario();
    const now = Math.floor(Date.now() / 1000);

    const pending: CouncilChange[] = s.council === 'replacement'
      ? [{
        id: id(1),
        index: 0,
        says: `The hook's Treasury moves to ${NEW_TREASURY}`,
        readyAt: now + 2 * DAY + 4 * 3600,
        kind: 'structural',
      }]
      : s.council === 'rescue'
        // Path A: the owner proposed the key, and the council seats it a day on.
        ? [{
          id: id(2),
          index: 0,
          says: `The admin key moves to ${NEW_ADMIN}, as the owner proposed`,
          readyAt: now + DAY,
          kind: 'structural',
        }]
        : s.council === 'silent-rescue'
          // Path B: thirty days of silence, then the structural wait of three.
          ? [{
            id: id(3),
            index: 0,
            says: `The admin key moves to ${NEW_ADMIN}, after the owner's silence`,
            readyAt: now + 3 * DAY,
            kind: 'rescue',
          }]
          : s.council === 'three'
            // The price band's crowded day (2026-09-25): three waiting, soonest
            // first, so the band's left half has to scroll.
            ? [
              { id: id(4), index: 0, says: `The hook's Treasury moves to ${NEW_TREASURY}`, readyAt: now + 2 * DAY + 4 * 3600, kind: 'structural' },
              { id: id(5), index: 0, says: `The Nest's Roost moves to ${NEW_ROOST}`, readyAt: now + 2 * DAY + 20 * 3600, kind: 'structural' },
              { id: id(6), index: 0, says: `The admin key moves to ${NEW_ADMIN}, after the owner's silence`, readyAt: now + 3 * DAY, kind: 'rescue' },
            ]
            : s.council === 'overdue'
              // Its wait is over and nobody has executed it yet: "lands any moment".
              ? [{ id: id(7), index: 0, says: `The hook's Treasury moves to ${NEW_TREASURY}`, readyAt: now - 7 * 60, kind: 'structural' }]
              : [];

    return {
      council: COUNCIL,
      // A seat that was never named: the Nest's pointers are frozen where they are.
      unnamedOn: s.council === 'none' ? ['the Nest'] : [],
      multisig: MULTISIG,
      structuralDelay: STRUCTURAL_DELAY,
      rescueDelay: RESCUE_DELAY,
      chainNow: now,
      pending,
    };
  });
}

/** The addresses the card's sentences name, for the tests. */
export const COUNCIL_FIXTURES = { COUNCIL, MULTISIG, NEW_TREASURY, NEW_ADMIN, NEW_ROOST };
