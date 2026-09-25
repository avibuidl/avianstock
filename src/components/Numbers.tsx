// The numbers table (moved out of screens/Docs.tsx on 2026-09-25): a heading,
// then label and value rows with a single hairline under the group. Docs'
// "The numbers" draws with it, and so does its "The contracts" section, whose
// value cells hold an address that is its own copy control and, for the
// project's own contracts, the explorer link directly after it.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { shortAddress } from '../lib/format';
import s from './Numbers.module.css';

export type NumberRow = [label: string, value: ReactNode];

export function NumberGroup({ title, rows, children }: { title?: string; rows: NumberRow[]; children?: ReactNode }) {
  return (
    <div className={s.group}>
      {title ? <h4>{title}</h4> : null}
      {children}
      <dl className={s.numbers}>
        {rows.map(([k, v]) => (
          <div key={k} className={s.numberRow}>
            <dt className="small dim">{k}</dt>
            <dd className="small">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * An address that copies itself (2026-09-25). The address is the button:
 * a click, or Enter or Space on it, copies the whole address and says
 * "Copied" in its place for a moment, in the same box so nothing moves. At
 * 375px it shows the middle truncated (0x12aC…89ab) and still copies in full.
 */
export function CopyAddress({ value, label, after }: { value: string; label: string; after?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch { /* no clipboard (an insecure origin, a refusal): the address is still selectable */ }
  };
  return (
    <span className={s.value}>
      <button
        type="button"
        className={`${s.addr}${copied ? ` ${s.copied}` : ''}`}
        onClick={copy}
        title="Copy"
        aria-label={`Copy the ${label} address, ${value}`}
      >
        <span className={s.full} aria-hidden="true">{value}</span>
        <span className={s.short} aria-hidden="true">{shortAddress(value)}</span>
        <span className={s.done} aria-hidden="true">Copied</span>
      </button>
      <span className="sr-only" role="status">{copied ? `${label} address copied` : ''}</span>
      {after}
    </span>
  );
}

/** The explorer link, directly after an address: an icon with its name spoken and shown on hover. */
export function ExplorerLink({ href, label }: { href: string; label: string }) {
  return (
    <a className={s.tool} href={href} target="_blank" rel="noreferrer noopener" aria-label={`${label} on the explorer`} title="Open in the explorer">
      <Icon name="ext" size={14} />
    </a>
  );
}
