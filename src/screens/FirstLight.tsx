// First Light — the first five minutes, drawn from the contract's own numbers.
//
// Before the launch every swap reverts, and the revert carries the timestamp,
// so this countdown is built from the refusal itself.

import { Icon } from '../components/Icon';
import { Box, ErrorState, Note, PanelSkeleton, Tag } from '../components/Primitives';
import { avians, formatBps, formatCountdown, formatDays } from '../lib/format';
import { buyFeeBpsAt, useLaunch, useNow, useVault } from '../mock';

export function FirstLight() {
  const launch = useLaunch();
  const vault = useVault();
  const now = useNow();

  const l = launch.data;

  if (launch.loading && !l) {
    return <div className="page page--wide"><div className="panel"><PanelSkeleton lines={6} /></div></div>;
  }
  if (launch.error || !l) {
    return (
      <div className="page page--wide">
        <ErrorState title="That read failed." detail="We could not reach the pool's hook."
          onRetry={launch.reload} />
      </div>
    );
  }

  const before = now < l.launchAt;
  const inWindow = !before && now < l.windowEndsAt;
  const bps = buyFeeBpsAt(now, l.launchAt);
  const leftInWindow = Math.max(0, l.windowEndsAt - now);

  return (
    <div className="page page--wide">
      <div className="row row--wrap" style={{ gap: 16, alignItems: 'flex-end' }}>
        <div>
          <p className="eyebrow">First Light</p>
          <h2>The first five minutes.</h2>
        </div>
        <span className="spacer" />
        {before ? <Tag><Icon name="clock" size={11} /> Not launched</Tag>
          : inWindow ? <Tag tone="hot">Window running · {formatCountdown(leftInWindow)} left</Tag>
            : <Tag tone="ok">Settled · 1% both ways</Tag>}
      </div>

      <div className="fl-grid">
        <section className="panel" aria-labelledby="fee-h">
          <h3 id="fee-h" className="sr-only">The buy fee</h3>
          <div className="row row--wrap" style={{ gap: 24, alignItems: 'flex-end' }}>
            <div>
              <p className="eyebrow" style={{ margin: 0 }}>
                {before ? 'Buy fee at the first second' : inWindow ? 'Buy fee right now' : 'Buy fee'}
              </p>
              <div className="num" style={{ fontSize: 64, lineHeight: 1, color: inWindow ? 'var(--attention)' : 'var(--chalk)', marginTop: 8 }}>
                {formatBps(bps)}
              </div>
            </div>
            <div style={{ paddingBottom: 8 }}>
              {inWindow ? (
                <p className="small" style={{ margin: 0 }}>
                  falling to <span className="num">1%</span> in{' '}
                  <span className="num">{formatCountdown(leftInWindow)}</span>
                </p>
              ) : before ? (
                <p className="small" style={{ margin: 0 }}>
                  Before the launch the contract returns the opening number, not zero.
                </p>
              ) : (
                <p className="small" style={{ margin: 0 }}>The window is over. This is the standing fee.</p>
              )}
              <p className="tiny dim" style={{ marginTop: 4 }}>Taken on the ETH side, both directions.</p>
            </div>
            <span className="spacer" />
            <div style={{ textAlign: 'right', paddingBottom: 8 }}>
              <p className="eyebrow" style={{ margin: 0 }}>Selling</p>
              <div className="num" style={{ fontSize: 24 }}>{formatBps(l.sellFeeBps)}</div>
              <p className="tiny dim" style={{ margin: '2px 0 0' }}>flat, in and out of the window</p>
            </div>
          </div>

          <div className="inset" style={{ marginTop: 20, padding: '12px 8px 4px' }}>
            <FeeCurve launchAt={l.launchAt} now={now} windowSeconds={l.windowSeconds} />
          </div>

          <p className="tiny dim" style={{ marginTop: 12 }}>
            It starts at 24% on top of the standing 1% — {formatBps(l.feeBps + l.maxExtraFeeBps)} at
            the first second — and falls linearly to {formatBps(l.feeBps)} at the last. Nobody can
            change either end. The hook that enforces it has no owner and no settings.
          </p>
        </section>

        <div className="stack">
          <section className="panel" aria-labelledby="cap-h">
            <h3 id="cap-h" style={{ fontSize: 20 }}>The per-transaction cap</h3>
            <div className="num" style={{ fontSize: 28, marginTop: 12 }}>{avians(l.maxBuyPerTx)}</div>
            <p className="small" style={{ marginTop: 8 }}>
              No single transaction may buy more than that while the window is running. The cap is
              per <em>transaction</em>, not per swap — several swaps bundled into one router call are
              added together.
            </p>
            <div style={{ marginTop: 14 }}>
              <Box>
                <p className="tiny" style={{ margin: 0 }}>
                  The contract cannot tell us how much a transaction has already used — that counter
                  lives in transient storage and is gone at the end of the transaction. So we add up
                  what you are about to bundle and keep it under the cap ourselves.
                </p>
              </Box>
            </div>
          </section>

          <section className="panel" aria-labelledby="get-h">
            <div className="row">
              <h3 id="get-h" style={{ fontSize: 20 }}>Get AVIANS</h3>
              <span className="spacer" />
              {inWindow ? <Tag tone="hot">{formatBps(bps)} right now</Tag> : null}
            </div>
            <p className="small" style={{ marginTop: 8 }}>
              Buying AVIANS mints nothing. They are two different acts: get the token first, compose
              a bird second.
            </p>
            <a
              className="btn btn--ghost btn--wide"
              style={{ marginTop: 14 }}
              href="https://app.uniswap.org"
              target="_blank"
              rel="noreferrer noopener"
            >
              Open the pool <Icon name="ext" size={14} />
            </a>
            <p className="tiny dim" style={{ marginTop: 12 }}>
              The 1% is a property of <em>this</em> pool, not a tax on the token. Anyone can open a
              pool without it, and a router will take whichever is cheaper.
            </p>
          </section>

          <section className="panel" aria-labelledby="vault-h">
            <div className="row">
              <h3 id="vault-h" style={{ fontSize: 20 }}>The Vault</h3>
              <span className="spacer" />
              {vault.data?.isLocked ? <Tag tone="ok"><Icon name="lock" size={11} /> Locked</Tag> : <Tag>Unknown</Tag>}
            </div>
            {vault.loading && !vault.data ? (
              <div style={{ marginTop: 14 }}><PanelSkeleton lines={3} /></div>
            ) : vault.data ? (
              <dl className="kv" style={{ marginTop: 14, gridTemplateColumns: '130px 1fr' }}>
                <dt>Locked for</dt><dd>{formatDays(vault.data.lockSeconds)} minimum</dd>
                <dt>Unlocks in</dt><dd>{formatDays(Math.max(0, vault.data.unlockAt - now))}</dd>
                <dt>In the pool</dt><dd>{avians(vault.data.positionLiquidity)}</dd>
              </dl>
            ) : null}
            <p className="tiny dim" style={{ marginTop: 12 }}>
              The lock can be extended. It cannot be shortened.
            </p>
          </section>
        </div>
      </div>

      <div className="fl-pair">
        <section className="panel">
          <div className="row">
            <h3 style={{ fontSize: 20 }}>Before it opens</h3>
            <span className="spacer" />
            <Tag><Icon name="clock" size={11} /> Not launched</Tag>
          </div>
          <div className="num" style={{ fontSize: 40, marginTop: 14 }}>
            {before ? formatCountdown(l.launchAt - now) : '—'}
          </div>
          <p className="small" style={{ marginTop: 10 }}>
            Every swap reverts until the launch time, and the revert carries the timestamp — this
            countdown is built from the contract&rsquo;s own refusal.
          </p>
          <p className="tiny dim" style={{ marginTop: 10 }}>
            We won&rsquo;t post a date we might have to move.
          </p>
        </section>

        <section className="panel">
          <div className="row">
            <h3 style={{ fontSize: 20 }}>After the window</h3>
            <span className="spacer" />
            <Tag tone="ok">Settled</Tag>
          </div>
          <div className="num" style={{ fontSize: 40, marginTop: 14 }}>
            1% <span className="dim" style={{ fontSize: 18 }}>both ways</span>
          </div>
          <p className="small" style={{ marginTop: 10 }}>
            No extra fee, no cap, forever. There is no key that can change any of it.
          </p>
          <p className="tiny dim" style={{ marginTop: 10 }}>
            A swap either fills completely or reverts. There are no partial fills.
          </p>
        </section>
      </div>

      <div style={{ marginTop: 24 }}>
        <Note tone="info">
          <span className="small">
            Two more things worth knowing during the window: the fee is on the ETH side of the swap,
            and a swap that would move nothing is refused rather than filled at zero.
          </span>
        </Note>
      </div>
    </div>
  );
}

/** The whole decay curve, drawn from `buyFeeBpsAt`. */
function FeeCurve({ launchAt, now, windowSeconds }: { launchAt: number; now: number; windowSeconds: number }) {
  const W = 820, H = 260;
  const pad = { l: 56, r: 20, t: 18, b: 34 };
  const x = (t: number) => pad.l + (t / windowSeconds) * (W - pad.l - pad.r);
  const y = (bps: number) => pad.t + (1 - bps / 2600) * (H - pad.t - pad.b);

  const points = [0, windowSeconds].map((t) => `${x(t).toFixed(1)},${y(buyFeeBpsAt(launchAt + t, launchAt)).toFixed(1)}`).join(' ');
  const elapsed = Math.min(Math.max(0, now - launchAt), windowSeconds);
  const inWindow = now >= launchAt && now < launchAt + windowSeconds;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
      aria-label={`The buy fee falls from 25% to 1% over five minutes. Right now it is ${formatBps(buyFeeBpsAt(now, launchAt))}.`}>
      {[0, 500, 1000, 1500, 2000, 2500].map((b) => (
        <g key={b}>
          <line x1={pad.l} y1={y(b)} x2={W - pad.r} y2={y(b)} stroke="var(--slate)" strokeWidth={1} />
          <text x={pad.l - 10} y={y(b) + 4} fill="var(--ash)" fontSize={10} textAnchor="end" fontFamily="JetBrains Mono, monospace">
            {b / 100}%
          </text>
        </g>
      ))}
      <polygon points={`${x(0)},${y(0)} ${points} ${x(windowSeconds)},${y(0)}`} fill="var(--teal-dark)" opacity={0.45} />
      <polyline points={points} fill="none" stroke="var(--teal)" strokeWidth={2} />
      {inWindow ? (
        <>
          <line x1={x(elapsed)} y1={pad.t} x2={x(elapsed)} y2={y(0)} stroke="var(--amber)" strokeWidth={1} strokeDasharray="3 3" />
          <rect x={x(elapsed) - 4} y={y(buyFeeBpsAt(now, launchAt)) - 4} width={8} height={8} fill="var(--amber)" />
          <text x={x(elapsed) + 12} y={y(buyFeeBpsAt(now, launchAt)) - 10} fill="var(--amber)" fontSize={12} fontFamily="JetBrains Mono, monospace">
            now · {formatBps(buyFeeBpsAt(now, launchAt))}
          </text>
        </>
      ) : null}
      <line x1={pad.l} y1={y(0)} x2={W - pad.r} y2={y(0)} stroke="var(--steel)" strokeWidth={1} />
      {[0, 60, 120, 180, 240, 300].map((t) => (
        <text key={t} x={x(t)} y={H - 12} fill="var(--ash)" fontSize={10} textAnchor="middle" fontFamily="JetBrains Mono, monospace">
          {t}s
        </text>
      ))}
    </svg>
  );
}
