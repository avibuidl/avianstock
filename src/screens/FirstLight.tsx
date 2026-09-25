// First Light — the first five minutes, drawn from the contract's own numbers.
//
// Before the launch every swap reverts, and the revert carries the timestamp,
// so this countdown is built from the refusal itself.

import { Icon } from '../components/Icon';
import { ErrorState, PanelSkeleton, Tag } from '../components/Primitives';
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
        <ErrorState title="The pool could not be read." detail="Try again in a moment."
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
          <h2>First Light</h2>
          <p className="lede" style={{ marginTop: 8 }}>
            The pool&rsquo;s first five minutes: a buy fee that starts at {formatBps(l.feeBps + l.maxExtraFeeBps)} and falls to {formatBps(l.feeBps)}.
          </p>
        </div>
        <span className="spacer" />
        {before ? <Tag><Icon name="clock" size={11} /> Not launched</Tag>
          : inWindow ? <Tag tone="hot">Window running, {formatCountdown(leftInWindow)} left</Tag>
            : <Tag tone="ok">Window over</Tag>}
      </div>

      <div className="fl-grid">
        <section className="panel" aria-labelledby="fee-h">
          <h3 id="fee-h" className="sr-only">The buy fee</h3>
          <div className="row row--wrap" style={{ gap: 24, alignItems: 'flex-end' }}>
            <div>
              <span className="label">
                {before ? 'Buy fee at the first second' : inWindow ? 'Buy fee right now' : 'Buy fee'}
              </span>
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
              <p className="tiny dim" style={{ marginTop: 4 }}>Taken on the ETH side of the swap.</p>
            </div>
            <span className="spacer" />
            <div style={{ textAlign: 'right', paddingBottom: 8 }}>
              <span className="label">Sell fee</span>
              <div className="num" style={{ fontSize: 24 }}>{formatBps(l.sellFeeBps)}</div>
              <p className="tiny dim" style={{ margin: '2px 0 0' }}>flat, in and out of the window</p>
            </div>
          </div>

          <div className="inset" style={{ marginTop: 20, padding: '12px 8px 4px' }}>
            <FeeCurve launchAt={l.launchAt} now={now} windowSeconds={l.windowSeconds} />
          </div>

          <p className="tiny dim" style={{ marginTop: 12 }}>
            {formatBps(l.feeBps + l.maxExtraFeeBps)} at the first second, falling in a straight
            line to {formatBps(l.feeBps)} at the last. Nobody can change either end: the contract
            that enforces it has no owner and no settings.
          </p>
        </section>

        <div className="stack">
          <section className="panel" aria-labelledby="cap-h">
            <h3 id="cap-h" style={{ fontSize: 20 }}>The per-transaction cap</h3>
            <div className="num" style={{ fontSize: 28, marginTop: 12 }}>{avians(l.maxBuyPerTx)}</div>
            <p className="small" style={{ marginTop: 8 }}>
              No single transaction may buy more than that while the window is running. Several
              swaps bundled into one transaction count together.
            </p>
          </section>

          <section className="panel" aria-labelledby="get-h">
            <div className="row">
              <h3 id="get-h" style={{ fontSize: 20 }}>Get AVIAN</h3>
              <span className="spacer" />
              {inWindow ? <Tag tone="hot">{formatBps(bps)} right now</Tag> : null}
            </div>
            <p className="small" style={{ marginTop: 8 }}>
              Buying AVIAN mints nothing. Get the token first, then compose a bird.
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
              The fee belongs to this pool, not to the token. Anyone can open a pool without it.
            </p>
          </section>

          <section className="panel" aria-labelledby="vault-h">
            <div className="row">
              <h3 id="vault-h" style={{ fontSize: 20 }}>The Vault</h3>
              <span className="spacer" />
              {vault.data?.isLocked ? <Tag tone="ok"><Icon name="lock" size={11} /> Locked</Tag> : null}
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
            {before ? formatCountdown(l.launchAt - now) : 'Open'}
          </div>
          <p className="small" style={{ marginTop: 10 }}>
            Every swap reverts until the launch time. The countdown is read from the contract.
          </p>
        </section>

        <section className="panel">
          <div className="row">
            <h3 style={{ fontSize: 20 }}>After the window</h3>
            <span className="spacer" />
            <Tag tone="ok">Settled</Tag>
          </div>
          <div className="num" style={{ fontSize: 40, marginTop: 14 }}>
            {formatBps(l.feeBps)} <span className="dim" style={{ fontSize: 18 }}>on buys, {formatBps(l.sellFeeBps)} on sells</span>
          </div>
          <p className="small" style={{ marginTop: 10 }}>
            No extra fee, no cap, forever. No key can change any of it.
          </p>
          <p className="tiny dim" style={{ marginTop: 10 }}>
            A swap either fills completely or reverts. There are no partial fills.
          </p>
        </section>
      </div>


    </div>
  );
}

/** The whole decay curve, drawn from `buyFeeBpsAt`; the axis runs to the opening figure, whatever the hook says it is. */
function FeeCurve({ launchAt, now, windowSeconds }: { launchAt: number; now: number; windowSeconds: number }) {
  const W = 820, H = 260;
  const pad = { l: 56, r: 20, t: 18, b: 34 };
  const top = buyFeeBpsAt(launchAt, launchAt);
  const ticks = [0, 1, 2, 3, 4, 5, 6].map((i) => Math.round((top * i) / 6));
  const x = (t: number) => pad.l + (t / windowSeconds) * (W - pad.l - pad.r);
  const y = (bps: number) => pad.t + (1 - bps / (top * 1.04)) * (H - pad.t - pad.b);

  const points = [0, windowSeconds].map((t) => `${x(t).toFixed(1)},${y(buyFeeBpsAt(launchAt + t, launchAt)).toFixed(1)}`).join(' ');
  const elapsed = Math.min(Math.max(0, now - launchAt), windowSeconds);
  const inWindow = now >= launchAt && now < launchAt + windowSeconds;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
      aria-label={`The buy fee falls from ${formatBps(top)} to ${formatBps(buyFeeBpsAt(launchAt + windowSeconds, launchAt))} over five minutes. Right now it is ${formatBps(buyFeeBpsAt(now, launchAt))}.`}>
      {ticks.map((b) => (
        <g key={b}>
          <line x1={pad.l} y1={y(b)} x2={W - pad.r} y2={y(b)} stroke="var(--slate)" strokeWidth={1} />
          <text x={pad.l - 10} y={y(b) + 4} fill="var(--ash)" fontSize={10} textAnchor="end" fontFamily="Geist Mono, monospace">
            {formatBps(b, 0)}
          </text>
        </g>
      ))}
      <polygon points={`${x(0)},${y(0)} ${points} ${x(windowSeconds)},${y(0)}`} fill="var(--teal-dark)" opacity={0.45} />
      <polyline points={points} fill="none" stroke="var(--teal)" strokeWidth={2} />
      {inWindow ? (
        <>
          <line x1={x(elapsed)} y1={pad.t} x2={x(elapsed)} y2={y(0)} stroke="var(--amber)" strokeWidth={1} strokeDasharray="3 3" />
          <rect x={x(elapsed) - 4} y={y(buyFeeBpsAt(now, launchAt)) - 4} width={8} height={8} fill="var(--amber)" />
          <text x={x(elapsed) + 12} y={y(buyFeeBpsAt(now, launchAt)) - 10} fill="var(--amber)" fontSize={12} fontFamily="Geist Mono, monospace">
            now {formatBps(buyFeeBpsAt(now, launchAt))}
          </text>
        </>
      ) : null}
      <line x1={pad.l} y1={y(0)} x2={W - pad.r} y2={y(0)} stroke="var(--steel)" strokeWidth={1} />
      {[0, 60, 120, 180, 240, 300].map((t) => (
        <text key={t} x={x(t)} y={H - 12} fill="var(--ash)" fontSize={10} textAnchor="middle" fontFamily="Geist Mono, monospace">
          {t}s
        </text>
      ))}
    </svg>
  );
}
