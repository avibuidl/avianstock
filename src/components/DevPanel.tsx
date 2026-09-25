// The state switcher. Development only.
//
// Every state in HANDOVER is reachable from here without a chain, and each
// preset is a URL, so a reviewer can send a link to a broken screen. When the
// site is wired, this component and src/mock/scenario.ts are deleted together.

import { useState } from 'react';
import { Icon } from './Icon';
import { Tag } from './Primitives';
import {
  DEFAULT_SCENARIO, PRESETS, applyPreset, presetHref, resetScenario, setScenario, useScenario,
  type Scenario,
} from '../mock/scenario';
import { SELECTORS, refreshAll, setUnveiledForDev, unveiled, type ErrorName } from '../mock';

type Row = { key: keyof Scenario; label: string; options: string[] };

const ROWS: Row[] = [
  { key: 'connection', label: 'connection', options: ['no-wallet', 'disconnected', 'connecting', 'wrong-network', 'unknown-network', 'connected'] },
  { key: 'data', label: 'data', options: ['loading', 'empty', 'error', 'populated'] },
  { key: 'launch', label: 'launch', options: ['before', 'imminent', 'window', 'after'] },
  { key: 'paidMint', label: 'paid door', options: ['closed', 'open', 'sold-out', 'wallet-cap'] },
  { key: 'freeMint', label: 'free door', options: ['closed', 'open-allowlisted', 'open-not-allowlisted', 'already-claimed', 'exhausted', 'released'] },
  { key: 'balance', label: 'balance', options: ['none', 'short', 'enough', 'plenty'] },
  { key: 'approvals', label: 'approvals', options: ['none', 'partial', 'sufficient'] },
  { key: 'approvalRoute', label: 'approval route', options: ['approve', 'permit'] },
  { key: 'combo', label: 'combination', options: ['available', 'taken'] },
  { key: 'perch', label: 'perch', options: ['empty', 'some', 'full'] },
  { key: 'brood', label: 'brood', options: ['none', 'brooding', 'brooding-to-wallet', 'expired-unsettled', 'settled-claimable', 'mixed'] },
  { key: 'rewards', label: 'rewards', options: ['none-listed', 'accruing', 'one-paused', 'all-paused'] },
  { key: 'sweeper', label: 'sweeper', options: ['none-granted', 'some-granted', 'all-granted', 'all-swept'] },
  { key: 'satchel', label: 'satchel', options: ['empty', 'holds-tokens', 'holds-birds'] },
  { key: 'recompose', label: 'recompose', options: ['as-minted', 'swapped', 'restored'] },
  { key: 'operatorWhitelist', label: 'operators', options: ['applied', 'missing'] },
  { key: 'ticker', label: 'ticker', options: ['all', 'one-missing', 'reduced-motion'] },
  { key: 'roost', label: 'roost', options: ['ready', 'nest-held', 'nest-held-brooding', 'too-soon'] },
  { key: 'rotation', label: 'rotation', options: ['week-0', 'week-1', 'week-2'] },
  { key: 'staking', label: 'staking', options: ['mid-week', 'nothing-staked', 'held-with-staker', 'held-nobody-staked'] },
  { key: 'flywheel', label: 'flywheel', options: ['live', 'first-day', 'no-usd', 'turn-due'] },
  { key: 'stakers', label: 'stakers', options: ['streaming', 'ended', 'unfunded', 'unlisted'] },
  { key: 'council', label: 'council', options: ['quiet', 'replacement', 'rescue', 'silent-rescue', 'three', 'overdue', 'none'] },
  { key: 'seat', label: 'your seat', options: ['today', 'quiet-26', 'proposed', 'disagree', 'midway'] },
  { key: 'deployment', label: 'deployment read', options: ['ok', 'fails'] },
];

/** Every error a user-facing call can return — HANDOVER section 7. */
const FORCEABLE = (Object.keys(SELECTORS) as ErrorName[]).filter((n) => n !== 'Unknown');

export function DevPanel() {
  const s = useScenario();
  const [open, setOpen] = useState(false);
  // The veil's two toggles (2026-09-22): the proof that an unveiling reverses
  // everything with no other change. They flip the active manifest in memory
  // (DEV only) and re-read every panel; nothing is stored anywhere.
  const [veilTick, setVeilTick] = useState(0);
  const flip = (what: 'vaults' | 'traitMarket') => { setUnveiledForDev(what, !unveiled(what)); setVeilTick(veilTick + 1); refreshAll(); };

  if (!open) {
    return (
      <button type="button" className="dev__toggle" onClick={() => setOpen(true)}>
        STATE SWITCHER
      </button>
    );
  }

  const groups = [...new Set(PRESETS.map((p) => p.group))];

  return (
    <aside className="dev" aria-label="State switcher, development only">
      <div className="dev__head">
        <span className="dot" style={{ background: 'var(--accent)' }} aria-hidden="true" />
        <strong className="small strong">State switcher</strong>
        <span className="spacer" />
        <button type="button" className="btn btn--ghost btn--small" onClick={() => setOpen(false)} aria-label="Close">
          <Icon name="cross" size={14} />
        </button>
      </div>

      <div className="dev__body">
        <p className="tiny dim" style={{ margin: 0 }}>
          Development only. Every state below is one the contracts can actually produce.
        </p>

        {groups.map((g) => (
          <div key={g}>
            <div className="dev__group">{g}</div>
            {PRESETS.filter((p) => p.group === g).map((p) => {
              const full = { ...DEFAULT_SCENARIO, ...p.patch };
              const on = (Object.keys(full) as (keyof Scenario)[]).every((k) => s[k] === full[k]);
              return (
                <a
                  key={p.name}
                  className={`dev__preset${on ? ' dev__preset--on' : ''}`}
                  href={presetHref(p)}
                  onClick={(e) => { e.preventDefault(); applyPreset(p); }}
                >
                  {p.name}
                </a>
              );
            })}
          </div>
        ))}

        <div className="dev__group">Every switch</div>
        {ROWS.map((r) => (
          <div key={r.key} className="dev__row">
            <div className="tiny dim" style={{ letterSpacing: '0.1em', marginBottom: 6 }}>
              {r.label.toUpperCase()}
            </div>
            <div className="dev__opts">
              {r.options.map((o) => (
                <button
                  key={o}
                  type="button"
                  className={`dev__opt${s[r.key] === o ? ' dev__opt--on' : ''}`}
                  onClick={() => setScenario({ [r.key]: o } as Partial<Scenario>)}
                >
                  {o}
                </button>
              ))}
            </div>
          </div>
        ))}

        <div className="dev__row">
          <div className="tiny dim" style={{ letterSpacing: '0.1em', marginBottom: 6 }}>
            THE VEIL (the manifest's `unveiled`, flipped in memory)
          </div>
          <div className="row row--wrap" style={{ gap: 6 }}>
            {(['vaults', 'traitMarket'] as const).map((what) => (
              <button
                key={what} type="button"
                className={`select select--tight${unveiled(what) ? ' select--on' : ''}`}
                aria-pressed={unveiled(what)}
                onClick={() => flip(what)}
              >
                {what === 'vaults' ? 'vaults' : 'trait market'}: {unveiled(what) ? 'unveiled' : 'veiled'}
              </button>
            ))}
          </div>
        </div>

        <div className="dev__row">
          <div className="tiny dim" style={{ letterSpacing: '0.1em', marginBottom: 6 }}>
            SECONDS INTO FIRST LIGHT — {s.windowElapsed}
          </div>
          <input
            type="range" min={0} max={300} value={s.windowElapsed}
            aria-label="Seconds into First Light"
            style={{ width: '100%' }}
            onChange={(e) => setScenario({ launch: 'window', windowElapsed: Number(e.target.value) })}
          />
        </div>

        <div className="dev__row">
          <div className="tiny dim" style={{ letterSpacing: '0.1em', marginBottom: 6 }}>
            FAIL THE NEXT WRITE WITH
          </div>
          <select
            className="select"
            style={{ width: '100%' }}
            value={s.nextError ?? ''}
            aria-label="Fail the next write with"
            onChange={(e) => setScenario({ nextError: (e.target.value || null) as ErrorName | null })}
          >
            <option value="">— nothing, let it succeed —</option>
            {FORCEABLE.map((n) => (
              <option key={n} value={n}>{n}{SELECTORS[n] ? ` · ${SELECTORS[n]}` : ''}</option>
            ))}
          </select>
          {s.nextError ? (
            <p className="tiny" style={{ marginTop: 8, color: 'var(--attention)' }}>
              The next write throws this once, then clears.
            </p>
          ) : null}
        </div>

        <div className="row" style={{ marginTop: 16, gap: 8 }}>
          <button type="button" className="btn btn--ghost btn--small" onClick={resetScenario}>
            <Icon name="refresh" size={14} /> Reset
          </button>
          <span className="spacer" />
          <Tag>{Object.keys(DEFAULT_SCENARIO).length} switches</Tag>
        </div>

        <p className="tiny dim" style={{ marginTop: 16 }}>
          The address bar carries the whole scenario, so this link opens the site in exactly this
          state.
        </p>
      </div>
    </aside>
  );
}
