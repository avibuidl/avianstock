// The Treasury card.
//
// Two figures people confuse for each other, and one button anybody may press.
//
// RECEIVED vs BALANCE. The contract derives `cumulativeIn` as
// `balance + adminClaimed + convertedOut`, so "everything that ever arrived"
// and "what is here now" differ by exactly what has been taken out. That is an
// identity, not an approximation, which is why the sentence under the table can
// state it flatly.
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
// AND NO AVIANS ROW. The Treasury's AVIANS position is not itemised on a
// public page — the owner sees it on the admin panel instead. Being plain
// about what that is and is not: the balance is a public fact on chain and
// anyone can read it from a block explorer in a few seconds. Leaving it out
// here removes it from THIS SITE, and claims nothing more than that. The row is
// dropped rather than blanked, because a visibly redacted cell announces that
// there is something to go and look for, which is the opposite of the point.

import { useState } from 'react';
import { ErrorState, PanelSkeleton, Note } from './Primitives';
import { useTx } from './Tx';
import { avians, formatCountdown, formatEth, formatReward } from '../lib/format';
import {
  ADDRESSES, convertAndStream, useNow, useTreasury,
  type Amount, type TreasuryRow, type TreasuryState,
} from '../mock';

/** 86,400 -> "24 hours". The conversion interval, which the owner sets. */
function formatHours(seconds: number): string {
  const h = Math.round(seconds / 3600); /* count */
  if (h >= 48 && h % 24 === 0) return `${h / 24} days`;
  return `${h} hour${h === 1 ? '' : 's'}`;
}

/** One amount, in the currency's own units. Never a bare number. */
function money(row: TreasuryRow, v: Amount): string {
  if (row.symbol === 'AVIANS') return avians(v);
  if (row.currency === null) return `${formatEth(v)} ${row.symbol}`;
  return `${formatReward(v, row.decimals)} ${row.symbol}`;
}

/**
 * Why a conversion cannot run, from the five guards that are cheap reads.
 * Guards 6 and 7 — the per-currency amount and the floor prices — are the
 * write's own simulation to answer, and it produces a better sentence than a
 * disabled button could.
 */
function blockedBecause(t: TreasuryState, now: number): { short: string; long: string } | null {
  if (!t.conversion.enabled) {
    return {
      short: 'Not switched on yet',
      long: 'Conversion is off at deployment. The owner turns it on once the pool and the streams are running — income is still arriving in the meantime.',
    };
  }
  if (t.conversion.nextAllowedAt > now) {
    return {
      short: `Ready in ${formatCountdown(t.conversion.nextAllowedAt - now)}`,
      // The INTERVAL is the owner's to set; the FLOOR under it is not. So the
      // first half of this sentence is read and the second half is a constant,
      // and they are different kinds of fact.
      long: `One conversion every ${formatHours(t.conversion.minInterval)}, on one clock shared by every currency. The owner cannot configure it any faster than once a day.`,
    };
  }
  if (t.totalWeight === 0n) {
    return {
      short: 'Nothing is brooding',
      long: 'A stream cannot start while nobody has sent a bird to the nest, so there is nobody to convert this income for yet.',
    };
  }
  if (t.rewardTokenCount === 0) {
    return {
      short: 'No reward tokens yet',
      long: 'No reward token has passed the incubator’s transferability gate, so a conversion would have nowhere to send anything.',
    };
  }
  if (t.targetCount === 0) {
    return {
      short: 'No targets configured',
      long: 'The owner sets which reward tokens the income is split into. Until that is done there is nothing for a conversion to buy.',
    };
  }
  return null;
}

export function TreasuryCard() {
  const treasury = useTreasury();
  const now = useNow(1000);
  const tx = useTx();
  const [busy, setBusy] = useState<string | null>(null);
  const [showEmpty, setShowEmpty] = useState(false);

  const t = treasury.data;
  const blocked = t ? blockedBecause(t, now) : null;

  // A currency that has never received anything and holds nothing is not
  // information — it is the absence of it, and the listed reward tokens are
  // permanently in that state because nothing ever pays the Treasury in one.
  // Hiding them silently would be the same failure as showing a zero for a read
  // that did not happen, so the count stays visible and one click brings them
  // back. The rule is derived, not a list of symbols: the moment anything does
  // arrive in one of them, its row appears on its own.
  //
  // AVIANS is the one exception, and it is not derived — it is named, because
  // the decision is about that currency and nothing else. It is filtered before
  // the split, so it is not in the visible table and not in the hidden count
  // either; the disclosure below would otherwise be a signpost to it.
  //
  // Matched by ADDRESS, out of the manifest, rather than by the symbol string:
  // a symbol is a read off a contract, and the one currency this card must not
  // draw is not a thing to decide from a value that could come back as anything.
  const avianAddress = ADDRESSES.Avians?.toLowerCase();
  const rows = (t?.rows ?? [])
    .filter((r) => !r.currency || r.currency.toLowerCase() !== avianAddress);
  const active = rows.filter((r) => r.cumulativeIn > 0n || r.balance > 0n);
  const empty = rows.filter((r) => r.cumulativeIn === 0n && r.balance === 0n);
  const shown = showEmpty ? [...active, ...empty] : active;

  const doConvert = async (row: TreasuryRow) => {
    setBusy(`convert:${row.symbol}`);
    await tx.run(`Converting ${row.symbol} into rewards`, (on) => convertAndStream(row.currency, on), {
      outcome: () => `Converted and streamed to the nest. Anyone could have pressed that.`,
    });
    setBusy(null);
  };

  return (
    <section className="panel" aria-labelledby="tre-h">
      <h3 id="tre-h" style={{ fontSize: 20 }}>The Treasury</h3>
      <p className="small dim" style={{ marginTop: 8 }}>
        Where the project&rsquo;s income lands: the pool&rsquo;s 1% in ETH, and marketplace
        royalties.
      </p>

      {treasury.loading && !t ? (
        <div style={{ marginTop: 16 }}><PanelSkeleton lines={4} /></div>
      ) : treasury.error ? (
        <div style={{ marginTop: 16 }}>
          <ErrorState title="That read failed." onRetry={treasury.reload} />
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

          <p className="tiny dim" style={{ marginTop: 14 }}>
            Received is everything that has ever arrived. Balance is what is here now. The
            difference has been claimed or converted.
          </p>

          {/*
            The action lives BELOW the table, not in a fourth column.
            Measured at 375px: five columns needed 471px inside a 294px window,
            which put the buttons 177px off-screen behind a sideways scroll —
            a button nobody can see. Out here it is the full width of the card
            at every size, and the table is left as three columns of pure
            figures, which is what a table is for.
          */}
          {shown.some((r) => r.convertible > 0n) ? (
            <div className="stack" style={{ marginTop: 16, gap: 10 }}>
              {shown.filter((r) => r.convertible > 0n).map((r) => (
                <div key={r.symbol} className="inset">
                  <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span className="strong">{r.symbol}</span>
                    <span className="spacer" />
                    <button
                      type="button"
                      className="btn btn--small"
                      disabled={!!blocked || !!busy || tx.busy}
                      onClick={() => doConvert(r)}
                    >
                      {busy === `convert:${r.symbol}` ? 'Converting…' : 'Convert to rewards'}
                    </button>
                  </div>
                  <p className="tiny dim" style={{ margin: '8px 0 0' }}>
                    {blocked
                      ? blocked.short
                      : `${money(r, r.convertible)} available to convert — anyone can press this.`}
                  </p>
                </div>
              ))}
            </div>
          ) : null}

          {empty.length > 0 ? (
            <button
              type="button"
              className="btn btn--ghost btn--small"
              style={{ marginTop: 12 }}
              aria-expanded={showEmpty}
              onClick={() => setShowEmpty((v) => !v)}
            >
              {showEmpty
                ? `Hide ${empty.length} ${empty.length === 1 ? 'currency' : 'currencies'} with nothing in them`
                : `${empty.length} ${empty.length === 1 ? 'currency has' : 'currencies have'} never received anything — show ${empty.length === 1 ? 'it' : 'them'}`}
            </button>
          ) : null}

          {blocked ? (
            <div style={{ marginTop: 14 }}>
              <Note tone="info">
                <strong className="strong">{blocked.short}.</strong> {blocked.long}
              </Note>
            </div>
          ) : null}
        </>
      )}

      {/*
        A FLOOR, not the setting. The note above this one states the interval
        that is actually configured, read live, and the two read as though they
        disagreed when the owner set three days — so this one now says which
        kind of fact it is. `MIN_INTERVAL_FLOOR` is one day and is a constant,
        so "at most once a day" is true whatever the owner does.
      */}
      <p className="tiny dim" style={{ marginTop: 14 }}>
        Income is converted into reward tokens and streamed to the nest, and{' '}
        <strong className="strong">anyone at all can pull the trigger</strong> — on one clock shared
        by every currency, and at most once a day however the owner sets it. That last part is a
        floor in the contract, not a setting.
      </p>
    </section>
  );
}
