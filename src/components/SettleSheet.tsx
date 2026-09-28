// A settle, as a sheet (2026-09-27): the settle control's preview and its
// press, over My Nest, for one bird from its card or for every bird with
// something accrued from the section's head. The card is a sixth of the
// page and cannot hold the preview; the sheet can.

import { useEffect, type ReactNode } from 'react';
import { Icon } from './Icon';
import { SettleControl } from './Settle';
import { avianNumber, formatCount } from '../lib/format';
import type { TokenId } from '../mock';

export function SettleSheet({
  ids, symbolOf, onConnect, onClose, onDone, settleLabel, extra,
}: {
  ids: TokenId[];
  /** For one brooding bird: the settle press named for its destination, and the other destination beside it. */
  settleLabel?: string;
  extra?: ReactNode;
  symbolOf: (token: string) => { symbol: string; decimals: number };
  onConnect: () => void; onClose: () => void; onDone: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="scrim scrim--fixed" role="dialog" aria-modal="true" aria-labelledby="settle-sheet-h" onClick={onClose}>
      <div className="modal modal--scroll" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <h3 id="settle-sheet-h" style={{ fontSize: 24 }}>
            {ids.length === 1 ? `Settle ${avianNumber(ids[0])}` : `Settle ${formatCount(ids.length)} birds`}
          </h3>
          <span className="spacer" />
          <button type="button" className="btn btn--ghost btn--small" onClick={onClose} aria-label="Close">
            <Icon name="cross" size={14} />
          </button>
        </div>
        <p className="small dim" style={{ marginTop: 6 }}>
          Delivers what has accrued to where each brood sends it. Anyone may settle; nothing changes hands.
        </p>
        <div style={{ marginTop: 16 }}>
          <SettleControl ids={ids} label="Settle" symbolOf={symbolOf} onConnect={onConnect} onDone={() => { onDone(); onClose(); }} autoPreview settleLabel={settleLabel} extra={extra} />
        </div>
      </div>
    </div>
  );
}
