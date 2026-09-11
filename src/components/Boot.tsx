// What is on screen when the site refuses to start.
//
// A manifest that is missing a field, carries a malformed address, or names a
// contract that disagrees with the others stops the app HERE, before anything
// renders. HANDOVER section 10: "fail loudly rather than showing a half-working
// site" — and a half-configured site that renders and then fails at the first
// call is worse than one that will not open, because the first thing it breaks
// is somebody's transaction.
//
// The screen's whole job is to name the field.

import type { Problem } from '../chain/manifest';
import type { Check } from '../chain/startup';

export function BootFailure({
  title, source, problems, checks, deployments, current,
}: {
  title: string;
  source: string;
  problems?: Problem[];
  checks?: Check[];
  deployments?: { id: string; label: string }[];
  current?: string;
}) {
  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <p className="eyebrow" style={{ color: 'var(--crimson-light)' }}>Deployment</p>
      <h2 style={{ marginTop: 8 }}>{title}</h2>
      <p className="lede" style={{ maxWidth: 680, marginTop: 12 }}>
        The site is pointed at a deployment by a manifest file, and this one cannot be trusted to
        describe a working set of contracts. Nothing is rendered until it does — a page that opens
        and then fails at the first transaction is the worse of the two.
      </p>

      <div className="panel" style={{ marginTop: 24 }}>
        <p className="eyebrow">Source</p>
        <p className="mono small" style={{ marginTop: 8, wordBreak: 'break-all' }}>{source}</p>

        {problems?.length ? (
          <>
            <p className="eyebrow" style={{ marginTop: 24 }}>
              {problems.length} problem{problems.length === 1 ? '' : 's'}
            </p>
            <ul className="stack" style={{ marginTop: 10, gap: 10, listStyle: 'none', padding: 0 }}>
              {problems.map((p, i) => (
                <li key={i} className="inset">
                  <span className="mono small" style={{ color: 'var(--amber)' }}>{p.path}</span>
                  <span className="small" style={{ marginLeft: 10 }}>{p.says}</span>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {checks?.length ? (
          <>
            <p className="eyebrow" style={{ marginTop: 24 }}>
              {checks.length} cross-check{checks.length === 1 ? '' : 's'} disagreed
            </p>
            <ul className="stack" style={{ marginTop: 10, gap: 10, listStyle: 'none', padding: 0 }}>
              {checks.map((c, i) => (
                <li key={i} className="inset">
                  <div className="mono small" style={{ color: 'var(--amber)' }}>{c.claim}</div>
                  <div className="small dim mono" style={{ marginTop: 6, wordBreak: 'break-all' }}>
                    manifest says {c.expected ?? '—'}
                  </div>
                  <div className="small mono" style={{ marginTop: 2, wordBreak: 'break-all' }}>
                    the chain says {c.actual ?? '—'}
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>

      {deployments && deployments.length > 1 ? (
        <div className="panel" style={{ marginTop: 20 }}>
          <p className="eyebrow">Other deployments on this build</p>
          <div className="row" style={{ marginTop: 12, gap: 8, flexWrap: 'wrap' }}>
            {deployments.map((d) => (
              <a
                key={d.id}
                className={`btn btn--small${d.id === current ? ' btn--ghost' : ''}`}
                href={`?d=${encodeURIComponent(d.id)}`}
              >
                {d.label}
              </a>
            ))}
          </div>
        </div>
      ) : null}

      <p className="tiny dim" style={{ marginTop: 20, maxWidth: 680 }}>
        A manifest is a JSON file in <span className="mono">public/deployments/</span>. It carries
        the network and every contract address, is loaded at runtime rather than compiled in, and
        can be replaced without rebuilding the site.
        {' '}<span className="mono">scripts/make-manifest.mjs</span> writes one from a forge
        broadcast and runs these same checks before it saves.
      </p>
    </div>
  );
}
