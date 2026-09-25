// Is a failed start-up check a wrong deployment, or a council change?
// (2026-09-24)
//
// Some of what the cross-checks ask used to be immutables and is now the
// council's to move after a public delay: which contract is the Treasury on
// the hook, the Perch and the Nest on the collection, the Roost on the Nest
// and on the staking contract and the lockers, the Nest on the Roost and the
// Treasury, and the council's own seat. A manifest written before such a
// change fails exactly those checks, and every other check still passes. That
// is not a pasted-wrong address, and saying "wrong deployment" would send the
// founder looking for a mistake that is not there.

/** A start-up check, as far as this question needs one. `drift`: the council may move it. */
export type DriftCheck = { ok: boolean; drift?: boolean };

/**
 * True when something failed and every failure is a check the council may
 * legitimately move: the manifest is behind a council change, and the fix is
 * to regenerate it. False when anything else failed too, or nothing did.
 */
export function behindCouncilChange(checks: readonly DriftCheck[]): boolean {
  const failed = checks.filter((c) => !c.ok);
  return failed.length > 0 && failed.every((c) => c.drift === true);
}

export const BEHIND_COUNCIL_CHANGE = 'The manifest is behind a council change; regenerate it.';
