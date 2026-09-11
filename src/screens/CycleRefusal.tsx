// The one thing this site must refuse to do.
//
// A bird can be put inside another bird's satchel — that is a feature. The
// failure is a cycle: if A's satchel holds B and B's satchel is then given A,
// nobody owns either of them and neither can ever be moved again. The chain
// catches depth one and cannot catch anything deeper, so this refusal is the
// tooling's job. There is no override.

import { useEffect } from 'react';
import { Icon } from '../components/Icon';
import { Box, Note, Tag } from '../components/Primitives';
import { avianNumber, shortAddress } from '../lib/format';
import { satchelAddressOf, type Bird, type TransferSafety } from '../mock';

export function CycleRefusal({
  bird, safety, onClose, onLookInside,
}: {
  bird: Bird;
  safety: Extract<TransferSafety, { ok: false }>;
  onClose: () => void;
  onLookInside: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const other = safety.path.find((id) => id !== bird.id) ?? safety.path[0];

  return (
    <div className="scrim" role="alertdialog" aria-modal="true" aria-labelledby="refuse-h" onClick={onClose}>
      <div className="modal modal--bad" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <Tag tone="bad">Refused</Tag>
          <span className="spacer" />
          <span className="tiny dim">CHECKED BEFORE ANYTHING WAS SIGNED</span>
        </div>

        <h3 id="refuse-h" style={{ marginTop: 16, fontSize: 30 }}>
          {safety.reason === 'own-account'
            ? 'A bird cannot be sent into its own satchel.'
            : safety.reason === 'collection-address'
              ? 'Nothing recovers a bird sent to the collection.'
              : safety.reason === 'depth-cap'
                ? 'This ownership chain is too deep to be sure about.'
                : 'This would trap both birds forever.'}
        </h3>

        <p className="small" style={{ marginTop: 12, maxWidth: 660 }}>
          {safety.reason === 'own-account' ? (
            <>It would be stuck there forever, so the chain refuses it too. Nothing was taken.</>
          ) : safety.reason === 'collection-address' ? (
            <>That is the collection&rsquo;s own address — a standard ERC-721 dead end. Nothing was taken.</>
          ) : safety.reason === 'depth-cap' ? (
            <>
              We follow ownership upward to a depth of 32 and this chain does not end inside that.
              We refuse rather than guess. Nothing was taken.
            </>
          ) : (
            <>
              {avianNumber(other)} is already inside {avianNumber(bird.id)}&rsquo;s satchel. Sending{' '}
              {avianNumber(bird.id)} into {avianNumber(other)}&rsquo;s satchel closes the loop:{' '}
              {avianNumber(bird.id)} would be owned by {avianNumber(other)}, which is owned by{' '}
              {avianNumber(bird.id)}. Neither bird could ever be moved again, and neither satchel
              could ever be used again.
            </>
          )}
        </p>

        {safety.reason === 'cycle' ? (
          <div className="inset" style={{ marginTop: 20, padding: '8px 12px' }}>
            <CycleDiagram from={bird.id} to={other} />
          </div>
        ) : null}

        <div style={{ marginTop: 20 }}>
          <Box tone="bad">
            <Note tone="bad">
              <span className="small">
                The chain refuses only the simplest version of this — a bird sent into its{' '}
                <em>own</em> satchel. Anything deeper it cannot see inside a transfer, so we refuse
                it here. This is a documented limit of the contracts, and closing it is this
                site&rsquo;s job.
              </span>
            </Note>
          </Box>
        </div>

        <div className="row row--wrap" style={{ gap: 12, marginTop: 22 }}>
          <button type="button" className="btn" onClick={onClose}>Choose another destination</button>
          <button type="button" className="btn btn--ghost" onClick={onLookInside}>
            <Icon name="search" size={14} /> Look inside the satchel
          </button>
          <span className="spacer" />
          <span className="tiny dim">There is no way to send it anyway.</span>
        </div>
      </div>
    </div>
  );
}

function CycleDiagram({ from, to }: { from: number; to: number }) {
  const box = (x: number, y: number, title: string, sub: string, tone: string) => (
    <g key={title}>
      <rect x={x} y={y} width={200} height={66} fill="var(--panel-inset)" stroke={tone} strokeWidth={1} />
      <text x={x + 14} y={y + 27} fill="var(--chalk)" fontSize={14} fontWeight={600} fontFamily="Inter, sans-serif">{title}</text>
      <text x={x + 14} y={y + 47} fill="var(--ash)" fontSize={11} fontFamily="JetBrains Mono, monospace">{sub}</text>
    </g>
  );
  const label = (x: number, y: number, t: string, anchor: 'middle' | 'start' | 'end' = 'middle') => (
    <text x={x} y={y} fill="var(--ash)" fontSize={11} textAnchor={anchor} fontFamily="Inter, sans-serif">{t}</text>
  );
  const arrow = (x1: number, y1: number, x2: number, y2: number) => (
    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--crimson-light)" strokeWidth={1.5} markerEnd="url(#ah)" />
  );

  return (
    <svg viewBox="0 0 700 300" width="100%" role="img"
      aria-label={`An ownership loop: ${avianNumber(from)} into its satchel, into ${avianNumber(to)}, and back`}>
      <defs>
        <marker id="ah" viewBox="0 0 8 8" refX={7} refY={4} markerWidth={6} markerHeight={6} orient="auto">
          <path d="M0 0L8 4L0 8z" fill="var(--crimson-light)" />
        </marker>
      </defs>
      {box(20, 24, avianNumber(from), 'the bird you are sending', 'var(--crimson-light)')}
      {box(470, 24, `${avianNumber(to)}'s satchel`, shortAddress(satchelAddressOf(to)), 'var(--crimson-light)')}
      {box(470, 200, avianNumber(to), 'lives in your satchel', 'var(--slate)')}
      {box(20, 200, `${avianNumber(from)}'s satchel`, shortAddress(satchelAddressOf(from)), 'var(--slate)')}
      {arrow(226, 57, 462, 57)}{label(344, 48, 'you would send it here')}
      {arrow(570, 96, 570, 192)}{label(584, 148, 'is controlled by', 'start')}
      {arrow(462, 233, 232, 233)}{label(347, 224, 'sits inside')}
      {arrow(120, 192, 120, 100)}{label(106, 148, 'is controlled by', 'end')}
    </svg>
  );
}
