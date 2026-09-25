// The Treasury card. On the Bird Engine page since 2026-09-25, beside the
// Roost's; it was on the nest before that, and on Contracts until 2026-09-18.
//
// Two figures, and the two shares of the ETH anybody may act on: the
// rewards' (CONVERT) and the Roost's (BUY), one row each so the two buttons
// read as peers. The protocol's share has no row: claiming it is the owner's.
//
// NOTHING BUT WHAT IS LIVE (2026-09-25). The card states figures, the clock,
// the two rows and a row's reason when its button is refused. Every
// explanation it used to carry is gone; the Docs page has them.
//
// RECEIVED vs BALANCE. The contract derives `cumulativeIn` as
// `balance + adminClaimed + convertedOut`, so "everything that ever arrived"
// and "what is here now" differ by exactly what has been taken out. That is an
// identity, not an approximation.
//
// THE CONVERT BUTTON IS PUBLIC. `convertAndStream` is callable by anyone and
// that is a selling point, so it is drawn for every visitor rather than hidden
// behind an owner check. It appears on a row when — and only when —
// `convertible > 0`. That one rule does all the work: `convertible` is the
// balance less the admin's outstanding claim, and since every ERC-20 is 100%
// the admin's, it is permanently zero for all of them. Exactly one live trigger
// ends up on the card, on ETH, without this file knowing which currency that is.
//
// NO OWNER CONTROL LIVES HERE ANY MORE. The withdraw button and the `claimable`
// figure that labelled it are on `#/admin` with the rest of the owner surface.
// There is no `isOwner` in this file, no `owner()` read behind it, and no
// import of `claimAdmin`.
//
// AND NO AVIAN ROW. The Treasury's AVIAN position is not itemised on a
// public page — the owner sees it on the admin panel instead. Being plain
// about what that is and is not: the balance is a public fact on chain and
// anyone can read it from a block explorer in a few seconds. Leaving it out
// here removes it from THIS SITE, and claims nothing more than that. The row is
// dropped rather than blanked, because a visibly redacted cell announces that
// there is something to go and look for, which is the opposite of the point.

import { useState } from 'react';
import s from './TreasuryCard.module.css';
import { ErrorState, PanelSkeleton } from './Primitives';
import { useTx } from './Tx';
import { avians, formatCountdown, formatEth, formatReward } from '../lib/format';
import { readingPlan } from '../lib/pricing';
import { clockState, formatOpenAt } from '../lib/opening';
import {
  ADDRESSES, buyForRoost, convertAndStream, takeRoostReading, useNow, useTreasury,
  type Amount, type TreasuryRow, type TreasuryState,
} from '../mock';

/** One amount, in the currency's own units. Never a bare number. */
function money(row: TreasuryRow, v: Amount): string {
  if (row.symbol === 'AVIAN') return avians(v);
  if (row.currency === null) return `${formatEth(v)} ${row.symbol}`;
  return `${formatReward(v, row.decimals)} ${row.symbol}`;
}

/** A row's one-line reason; `clock` when it is the opening clock, which both rows share. */
type Blocked = { short: string; clock?: boolean };

/**
 * THE CLOCK (2026-09-24). Nobody switches conversions on: both buttons open by
 * themselves six hours after trading opened on the AVIAN pool. Until they do,
 * both say the same sentence the line above them says, and nothing else —
 * a per-button reason before the clock has passed would be answering a
 * question nobody can act on yet. Null once the clock has passed, or on a
 * Treasury from before the clock.
 */
function clockBlocked(t: TreasuryState, now: number): Blocked | null {
  if (!t.opening) return null;
  const c = clockState(t.opening, now);
  if (c.kind === 'unknown') {
    return {
      clock: true,
      short: 'The Treasury does not know when trading opened yet',
    };
  }
  if (c.kind === 'waiting') {
    return {
      clock: true,
      short: `Conversions open at ${formatOpenAt(c.openAt)} (${formatCountdown(c.openAt - now)})`,
    };
  }
  return null;
}

/**
 * The owner's flag. A pause since 2026-09-24, and the switch that had not been
 * thrown on a Treasury from before: the words have to match the contract the
 * card is reading.
 */
function pausedBecause(t: TreasuryState): Blocked | null {
  if (t.conversion.enabled) return null;
  return { short: t.opening ? 'Paused' : 'Not switched on yet' };
}

/**
 * Why a conversion cannot run, from the five guards that are cheap reads.
 * Guards 6 and 7 — the per-currency amount and the floor prices — are the
 * write's own simulation to answer, and it produces a better sentence than a
 * disabled button could.
 */
function blockedBecause(t: TreasuryState, now: number): Blocked | null {
  const clock = clockBlocked(t, now);
  if (clock) return clock;
  const paused = pausedBecause(t);
  if (paused) return paused;
  if (t.conversion.nextAllowedAt > now) {
    return { short: `Ready in ${formatCountdown(t.conversion.nextAllowedAt - now)}` };
  }
  if (t.totalWeight === 0n) {
    return { short: 'Nothing is brooding' };
  }
  if (t.rewardTokenCount === 0) {
    return { short: 'No reward tokens yet' };
  }
  if (t.targetCount === 0) {
    return { short: 'No targets configured' };
  }
  return null;
}

/**
 * Why the Roost's buy cannot run, from the reads that are cheap. Its own
 * clock, the same enable switch as a conversion, and its own share: the
 * route and the floor are the write's simulation to answer, and the refusal
 * says it better than a disabled button could.
 */
function roostBlockedBecause(t: TreasuryState, now: number): Blocked | null {
  if (!t.roost) return null;
  const clock = clockBlocked(t, now);
  if (clock) return clock;
  const paused = pausedBecause(t);
  if (paused) return paused;
  if (t.roost.nextAllowedAt > now) {
    return { short: `Ready in ${formatCountdown(t.roost.nextAllowedAt - now)}` };
  }
  if (t.roost.buyable === 0n) {
    return { short: 'Spent for now' };
  }
  return null;
}

/** The wall clock when a read landed, so the chain's clock can be carried forward from it. */
const landed = new WeakMap<TreasuryState, number>();
function wallAt(t: TreasuryState): number {
  let at = landed.get(t);
  if (at === undefined) { at = Math.floor(Date.now() / 1000); landed.set(t, at); }
  return at;
}

export function TreasuryCard() {
  const treasury = useTreasury();
  const wall = useNow(1000);
  const tx = useTx();
  const [busy, setBusy] = useState<string | null>(null);

  const t = treasury.data;
  // The chain's clock, carried forward by the wall clock since the read: both
  // cooldowns are the chain's timestamps, not this machine's.
  const now = t ? t.chainNow + Math.max(0, wall - wallAt(t)) : wall;
  const blocked = t ? blockedBecause(t, now) : null;
  const roostBlocked = t ? roostBlockedBecause(t, now) : null;
  // Whether the buy can be priced at all: `roostMeanTick()` answered, or a
  // reading is wanted, or one is already on its way. A Treasury that predates
  // the readings reads 'unavailable' and the buy is offered as it always was.
  const plan = readingPlan(t?.readings ?? null, now);

  // A currency that has never received anything and holds nothing stays out
  // of the table (2026-09-25: no disclosure to bring it back). The rule is
  // derived, not a list of symbols: the moment anything arrives in one of
  // them, its row appears on its own.
  //
  // AVIAN is the one exception, and it is not derived: it is named, because
  // the decision is about that currency and nothing else.
  //
  // Matched by ADDRESS, out of the manifest, rather than by the symbol string:
  // a symbol is a read off a contract, and the one currency this card must not
  // draw is not a thing to decide from a value that could come back as anything.
  const avianAddress = ADDRESSES.Avians?.toLowerCase();
  const rows = (t?.rows ?? [])
    .filter((r) => !r.currency || r.currency.toLowerCase() !== avianAddress);
  const shown = rows.filter((r) => r.cumulativeIn > 0n || r.balance > 0n);

  const doBuyForRoost = async () => {
    setBusy('roost');
    await tx.run('Buying AVIAN for the Roost', (on) => buyForRoost(on), {
      // The route and floor refusals are the conversion's too, and the two
      // need different sentences: this says which call asked.
      context: { roostBuy: true, now },
      outcome: (r) => `Bought and sent to the Roost: ${avians((r as { amountOut: Amount }).amountOut)} for ${formatEth((r as { amountIn: Amount }).amountIn)} ETH.`,
    });
    setBusy(null);
  };

  const doTakeReading = async () => {
    setBusy('reading');
    await tx.run('Taking a reading of the AVIAN pool', (on) => takeRoostReading(on), {
      outcome: (r) => {
        const at = (r as { at: number }).at;
        const opens = new Date((at + (t?.readings?.window ?? 1_800)) * 1000);
        return `Reading taken. The Roost’s buy opens at ${opens.toLocaleTimeString()}.`;
      },
    });
    setBusy(null);
  };

  const doConvert = async (row: TreasuryRow) => {
    setBusy(`convert:${row.symbol}`);
    await tx.run(`Converting ${row.symbol} into rewards`, (on) => convertAndStream(row.currency, on), {
      context: { now },
      outcome: () => `Converted and streamed to the nest.`,
    });
    setBusy(null);
  };

  return (
    <section className="panel treasury" aria-labelledby="tre-h">
      <div>
        <h3 id="tre-h" style={{ fontSize: 20 }}>The Treasury</h3>

        {treasury.loading && !t ? (
          <div style={{ marginTop: 16 }}><PanelSkeleton lines={4} /></div>
        ) : treasury.error ? (
          <div style={{ marginTop: 16 }}>
            <ErrorState title="The Treasury could not be read." onRetry={treasury.reload} />
          </div>
        ) : (
          <>
            <div className="scroll-x" style={{ marginTop: 16 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Currency</th>
                    <th className="right">Received, total</th>
                    <th className="right">Balance now</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.symbol}>
                      <td>{r.symbol}</td>
                      <td className="num">{money(r, r.cumulativeIn)}</td>
                      <td className="num">{money(r, r.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/*
        The action, in its own column beside the figures on a wide screen and
        under them on a phone. It is not a fourth column of the table:
        measured at 375px, five columns needed 471px inside a 294px window,
        which put the buttons 177px off-screen behind a sideways scroll. Out
        here the button is the full width of its column at every size, and
        the table is left as three columns of pure figures.
      */}
      <div className="treasury__side">
        {/*
          THE TWO SHARES ANYBODY MAY PRESS: one row each, with its own state
          and its own button, matched: same size, and filled only while the
          press would do something. No percentages (2026-09-25), and no row
          for the protocol's share: claiming it is the owner's, on `#/admin`.
        */}
        {/*
          THE CLOCK'S LINE (2026-09-24), above both buttons: when they open,
          and then that they have. The pause is not in it — the line states
          the clock, and a paused button says so on its own row.
        */}
        {t?.opening ? (() => {
          const c = clockState(t.opening, now);
          return (
            <p className={`small ${c.kind === 'open' ? 'strong' : 'dim'}`} style={{ margin: '0 0 10px' }}>
              {c.kind === 'unknown' ? 'The Treasury does not know when trading opened yet'
                : c.kind === 'waiting' ? `Conversions open at ${formatOpenAt(c.openAt)} (${formatCountdown(c.openAt - now)})`
                  : 'Conversions open'}
            </p>
          );
        })() : null}

        {t ? (
          <div className={s.shares}>
            <div className={s.share}>
              <span className={`small ${s.what}`}>reward tokens for the nest</span>
              <div className={s.foot}>
                <p className={`tiny dim ${s.state}`}>
                  {shown.some((r) => r.convertible > 0n)
                    ? (blocked
                      ? blocked.short
                      : shown.filter((r) => r.convertible > 0n)
                        .map((r) => `${money(r, r.convertible)} available to convert`).join(' · '))
                    : 'Nothing to convert right now'}
                </p>
                <span className={s.buttons}>
                  {shown.filter((r) => r.convertible > 0n).map((r) => (
                    <button
                      key={r.symbol}
                      type="button"
                      className={`btn btn--compact${blocked ? ' btn--ghost' : ''}`}
                      disabled={!!blocked || !!busy || tx.busy}
                      onClick={() => doConvert(r)}
                    >
                      {busy === `convert:${r.symbol}` ? 'Converting…' : 'Convert to rewards'}
                    </button>
                  ))}
                </span>
              </div>
            </div>

            {t.roost ? (
              <div className={s.share}>
                <span className={`small ${s.what}`}>AVIAN for the Roost</span>
                <div className={s.foot}>
                  <p className={`tiny dim ${s.state}`}>
                    {roostBlocked?.clock
                      ? roostBlocked.short
                      : plan.kind === 'take'
                      ? 'The pool’s price has not been read yet'
                      : plan.kind === 'waiting'
                        ? `Opens in ${formatCountdown(Math.max(0, plan.usableAt - now))}`
                        : roostBlocked
                          ? roostBlocked.short
                          : `${formatEth(t.roost.buyable)} ETH to spend on AVIAN`}
                  </p>
                  <span className={s.buttons}>
                    {/*
                      ONE BUTTON, TWO CALLS (2026-09-24). A v4 pool keeps no
                      history, so the buy averages the AVIAN pool between two
                      readings the Treasury holds. With no usable one there is
                      nothing to price against and the buy can only refuse —
                      so the reading takes the buy's place, at the same size,
                      ghosted because it is the step before the thing itself.
                    */}
                    {plan.kind === 'take' && !roostBlocked?.clock ? (
                      <button
                        type="button"
                        className="btn btn--compact btn--ghost"
                        disabled={!!busy || tx.busy}
                        onClick={doTakeReading}
                      >
                        {busy === 'reading' ? 'Reading…' : 'Take a reading'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={`btn btn--compact${roostBlocked || plan.kind === 'waiting' ? ' btn--ghost' : ''}`}
                        disabled={!!roostBlocked || plan.kind === 'waiting' || !!busy || tx.busy}
                        onClick={doBuyForRoost}
                      >
                        {busy === 'roost' ? 'Buying…' : 'Buy for the Roost'}
                      </button>
                    )}
                  </span>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

      </div>
    </section>
  );
}
