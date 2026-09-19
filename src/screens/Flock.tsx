// The flock: everything minted so far, and what the flock actually chose.

import { useState } from 'react';
import { Icon } from '../components/Icon';
import { Avian, EmptyState, ErrorState, PanelSkeleton, Tag } from '../components/Primitives';
import { CATEGORIES } from '../art/traits';
import { avianNumber, formatCount } from '../lib/format';
import { href } from '../router';
import { COMBINATIONS } from '../art/traits';
import { useCollection, useMintedBirds, type CategoryId } from '../mock';

export function Flock() {
  const collection = useCollection();
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState<{ category: CategoryId; index: number } | null>(null);

  const PAGE = 24;
  const minted = useMintedBirds(page * PAGE, PAGE);

  const c = collection.data;
  const total = minted.data?.total ?? c?.totalMinted ?? 0;
  const birds = (minted.data?.birds ?? []).filter(
    (b) => !filter || b.traits[filter.category] === filter.index,
  );

  return (
    <div className="page page--wide">
      <div className="row row--wrap" style={{ gap: 20, alignItems: 'flex-end' }}>
        <div>
          <h2>The flock</h2>
          <p className="lede" style={{ marginTop: 8 }}>
            {total === 0 ? 'Every bird minted so far. None yet.'
              : c
                ? `${formatCount(total)} minted, ${formatCount(c.burned)} burnt, ${formatCount(c.maxSupply - total)} still to mint.`
                : `${formatCount(total)} minted so far.`}
          </p>
        </div>
        <span className="spacer" />
        <p className="small dim" style={{ maxWidth: 380, textAlign: 'right', margin: 0 }}>
          {formatCount(COMBINATIONS)} combinations are possible.
        </p>
      </div>

      <div className="filters">
        <span className="label">Filter</span>
        {CATEGORIES.map((cat) => (
          <label
            key={cat.key}
            className={`select${filter?.category === cat.id ? ' select--on' : ''}`}
          >
            <span className="sr-only">Filter by {cat.display}</span>
            <select
              value={filter?.category === cat.id ? filter.index : ''}
              style={{ background: 'transparent', border: 0, color: 'inherit', outline: 'none' }}
              onChange={(e) => {
                const v = e.target.value;
                setFilter(v === '' ? null : { category: cat.id as CategoryId, index: Number(v) });
              }}
            >
              <option value="">{cat.display}</option>
              {cat.traits.map((t) => <option key={t.index} value={t.index}>{t.display}</option>)}
            </select>
          </label>
        ))}
        {filter ? (
          <button type="button" className="select select--on" onClick={() => setFilter(null)}>
            Clear <Icon name="cross" size={13} color="var(--accent)" />
          </button>
        ) : null}
      </div>

      <div style={{ marginTop: 24 }}>
        <div>
          {minted.loading && !minted.data ? (
            <div className="panel"><PanelSkeleton lines={4} art /></div>
          ) : minted.error ? (
            // The reader gets a plain sentence; the engineering note lives here.
            // The collection has totalSupply() but is NOT ERC721Enumerable, so
            // there is no on-chain way to walk it — this page is one traitsOf
            // per id and a real deployment wants an indexer behind it.
            <ErrorState
              title="The flock could not be read."
              detail="This gallery is read one bird at a time, so one slow answer stops the page. Nothing is wrong with your birds. Try again in a moment."
              onRetry={minted.reload}
            />
          ) : total === 0 ? (
            <EmptyState title="Nothing has been minted yet.">
              Every bird composed appears here once the mint opens.
            </EmptyState>
          ) : birds.length === 0 ? (
            <EmptyState title="Nothing on this page matches that filter.">
              Try the next page, or clear the filter.
            </EmptyState>
          ) : (
            <>
              <div className="gallery">
                {birds.map((b) => (
                  <a key={b.id} className="gal" href={href({ name: 'bird', id: b.id })}>
                    <Avian traits={b.traits} alt={avianNumber(b.id)} />
                    <div style={{ padding: '8px 10px 10px' }}>
                      <div className="row">
                        <span className="mono" style={{ color: 'var(--text-strong)', fontSize: 12.5 }}>
                          #{formatCount(b.id)}
                        </span>
                        <span className="spacer" />
                        {/* A brooding bird is in a wallet; the badge is about the bird, not a place. */}
                        {b.location.where === 'perch' ? <Tag>Perch</Tag>
                          : b.brood?.live ? <Tag tone="ok">Brooding, tier {b.brood.tier}</Tag> : null}
                      </div>
                    </div>
                  </a>
                ))}
              </div>

              <div className="row" style={{ justifyContent: 'center', marginTop: 24, gap: 12 }}>
                <button
                  type="button" className="btn btn--ghost btn--small"
                  disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  Newer
                </button>
                <span className="small dim">
                  {formatCount(page * PAGE + 1)} to {formatCount(Math.min((page + 1) * PAGE, total))} of {formatCount(total)}
                </span>
                <button
                  type="button" className="btn btn--ghost btn--small"
                  disabled={(page + 1) * PAGE >= total} onClick={() => setPage((p) => p + 1)}
                >
                  Older
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
