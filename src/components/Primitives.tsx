// The small pieces every screen is built from.

import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { avianDataUri, isolatedTraitDataUri, swatchDataUri, traitOnlyDataUri } from '../art/render';
import type { CategoryId, TraitIndices } from '../art/render';
import { avians, formatCount, shortAddress } from '../lib/format';

// ── status ────────────────────────────────────────────────────────────────

export type Tone = 'ok' | 'warn' | 'hot' | 'bad' | 'info' | 'accent';

const TONE_ICON: Record<Tone, IconName> = {
  ok: 'check', warn: 'warn', hot: 'clock', bad: 'cross', info: 'info', accent: 'info',
};

export function Tag({ tone, children }: { tone?: Tone; children: ReactNode }) {
  const cls = tone && tone !== 'info' ? `tag tag--${tone}` : 'tag';
  return (
    <span className={cls}>
      {tone && tone !== 'info' ? <Icon name={TONE_ICON[tone]} size={11} /> : null}
      {children}
    </span>
  );
}

export function Note({ tone = 'info', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <div className={`note note--${tone === 'accent' ? 'info' : tone === 'hot' ? 'warn' : tone}`}>
      <Icon name={TONE_ICON[tone]} size={16} />
      <span>{children}</span>
    </div>
  );
}

export function Box({ tone, title, children }: { tone?: Tone; title?: string; children: ReactNode }) {
  return (
    <div className={tone ? `box box--${tone === 'hot' ? 'warn' : tone}` : 'box'}>
      {title ? <p className="eyebrow" style={{ margin: '0 0 8px' }}>{title}</p> : null}
      {children}
    </div>
  );
}

/** The stock-token disclaimer. It travels with every mention, in the same
    viewport — never in a footnote. */
/**
 * The four names are today's list. A screen that can also show a token which
 * was listed once and is not any more passes it in `alsoCovers`, so the
 * disclosure never names fewer products than the page does.
 */
export function StockDisclaimer({
  compact = false, alsoCovers = [],
}: { compact?: boolean; alsoCovers?: string[] }) {
  return (
    <Box title="Disclosure">
      <p className={compact ? 'tiny italic' : 'small italic'} style={{ margin: 0 }}>
        NVDA, SPY, SPCX and AAPL are tokenized stock products issued and controlled by Robinhood —
        not stocks, shares, dividends or equity. Avian Stock has no relationship with Robinhood,
        NVIDIA, SpaceX, Apple or S&amp;P. The stream can be zero: it depends on income arriving, on
        pools other people provide, and on an issuer we don&rsquo;t control. Your bird comes home
        either way.
        {alsoCovers.length > 0 ? (
          <>
            {' '}
            {alsoCovers.join(', ')} {alsoCovers.length === 1 ? 'is' : 'are'} the same kind of product,
            no longer streamed but still claimable by anyone owed in {alsoCovers.length === 1 ? 'it' : 'them'}.
          </>
        ) : null}
      </p>
    </Box>
  );
}

// ── art ───────────────────────────────────────────────────────────────────

/**
 * A bird. The drawing is 32x32, so it is only ever placed at an integer
 * multiple and never smoothed.
 */
export function Avian({
  traits, size, alt, className,
}: { traits: TraitIndices; size?: number; alt: string; className?: string }) {
  const style = size ? { width: size, height: size } : undefined;
  return (
    <span className={`avian ${className ?? ''}`} style={style}>
      <img className="px" src={avianDataUri(traits)} alt={alt} width={size} height={size} />
    </span>
  );
}

export function Swatch({
  category, index, selected, taken, label, isolated, isolatedFace, traitOnly, onClick,
}: {
  category: CategoryId; index: number; selected?: boolean; taken?: boolean;
  label: string; isolated?: boolean;
  /** Just this trait's art, with no bird under it. The composer's picker. */
  traitOnly?: boolean;
  /** Which plumage, eyes and beak the isolated swatches share. */
  isolatedFace?: { plumage?: number; eyes?: number; beak?: number };
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={taken ? `${label} — this combination is taken` : label}
      title={label}
      className={`swatch${selected ? ' swatch--on' : ''}${taken ? ' swatch--taken' : ''}`}
    >
      <img
        className="px"
        src={traitOnly ? traitOnlyDataUri(category, index)
          : isolated ? isolatedTraitDataUri(category, index, isolatedFace)
            : swatchDataUri(category, index)}
        alt=""
      />
      {selected ? <span className="swatch__mark" aria-hidden="true"><Icon name="check" size={11} /></span> : null}
      {taken ? <span className="swatch__mark swatch__mark--bad" aria-hidden="true"><Icon name="cross" size={11} /></span> : null}
    </button>
  );
}

// ── amounts and addresses ─────────────────────────────────────────────────

/** An amount, always with its unit. A bare number invites a dollar reading. */
export function Avians({ value, className }: { value: bigint; className?: string }) {
  return <span className={`num ${className ?? ''}`}>{avians(value)}</span>;
}

export function Address({ value, long = false }: { value: string; long?: boolean }) {
  return (
    <span className="mono" title={value} style={{ overflowWrap: 'anywhere' }}>
      {long ? value : shortAddress(value)}
    </span>
  );
}

export function Count({ value }: { value: number }) {
  return <span className="num">{formatCount(value)}</span>;
}

// ── loading, empty, error ─────────────────────────────────────────────────

export function Skeleton({ w = '100%', h = 10, mt = 0 }: { w?: string | number; h?: number; mt?: number }) {
  return <div className="skel" style={{ width: w, height: h, marginTop: mt }} aria-hidden="true" />;
}

export function PanelSkeleton({ lines = 3, art = false }: { lines?: number; art?: boolean }) {
  return (
    <div className="row row--top" style={{ gap: 16 }} role="status" aria-live="polite">
      <span className="sr-only">Loading</span>
      {art ? <div className="skel" style={{ width: 88, height: 88, flex: 'none' }} /> : null}
      <div style={{ flex: 1 }}>
        {Array.from({ length: lines }, (_, i) => (
          <Skeleton key={i} w={`${[56, 82, 38, 70][i % 4]}%`} mt={i ? 8 : 0} />
        ))}
      </div>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="inset" style={{ textAlign: 'center', padding: 'var(--s6) var(--s5)' }}>
      <h4>{title}</h4>
      {children ? <p className="small dim" style={{ maxWidth: 460, margin: '8px auto 0' }}>{children}</p> : null}
    </div>
  );
}

export function ErrorState({ title, detail, onRetry }: { title: string; detail?: string; onRetry?: () => void }) {
  return (
    <div className="box box--bad" role="alert">
      <Note tone="bad"><strong className="strong">{title}</strong></Note>
      {detail ? <p className="small" style={{ marginTop: 8 }}>{detail}</p> : null}
      {onRetry ? (
        <button type="button" className="btn btn--ghost btn--small" style={{ marginTop: 12 }} onClick={onRetry}>
          <Icon name="refresh" size={14} /> Try again
        </button>
      ) : null}
    </div>
  );
}
