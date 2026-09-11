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
          <p className="eyebrow">The flock</p>
          <h2>
            {total === 0 ? 'Nothing has been minted yet.'
              : c
                ? `${formatCount(total)} minted. ${formatCount(c.maxSupply - total)} remaining. ${formatCount(c.burned)} burnt`
                : `${formatCount(total)} minted.`}
          </h2>
        </div>
        <span className="spacer" />
        <p className="small dim" style={{ maxWidth: 380, textAlign: 'right', margin: 0 }}>
          {formatCount(COMBINATIONS)} combinations are possible.
        </p>
      </div>

      <div className="filters">
        <span className="tiny dim" style={{ letterSpacing: '0.14em' }}>FILTER</span>
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
              title="That read failed."
              detail="This gallery is read one bird at a time, so a slow answer stops the page rather than a row of it. Nothing is wrong with your birds — they are exactly where they were."
              onRetry={minted.reload}
            />
          ) : total === 0 ? (
            <EmptyState title="The flock is empty.">
              Before the first mint there is nothing to show. When the doors open, every bird
              composed appears here — with whatever the flock turns out to have chosen.
            </EmptyState>
          ) : birds.length === 0 ? (
            <EmptyState title="Nothing on this page matches that filter.">
              Try another page, or clear the filter.
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
                        {b.location.where === 'perch' ? <Tag>Perch</Tag>
                          : b.location.where === 'roost' ? <Tag tone="ok">Nest</Tag> : null}
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
                  {formatCount(page * PAGE + 1)}–{formatCount(Math.min((page + 1) * PAGE, total))} of {formatCount(total)}
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
