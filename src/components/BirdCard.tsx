// A bird's card on My Nest (2026-09-27): the picture, its name and state,
// two lines of the same height in every state (its weight and where it
// settles; an ended brood's age and its settle; blank otherwise), and one row
// of three at the foot: the thing to do next (Brood, or Settle), Sell, and
// a menu with the rest. Every card is one height whatever its state (the
// founder's pass, 2026-09-28). Turning a brood's rewards to the wallet is
// not on the card: it is in the bird's sheet, beside its settle.
//
// The card is a sixth of the page, so the labels are one word and the
// Perch's price sits on the set's button and on the sheet's rather than
// here. The buttons are the compact size the section's "Settle all" is
// (2026-09-27, the founder's pass), hugging their labels. What a brooding bird has earned so far is valued the way the
// homepage values what the Nest has paid out; with no price it names the
// first token and how many more.

import { useEffect, useRef, useState } from 'react';
import s from '../screens/MyNest.module.css';
import { Icon } from './Icon';
import { Avian, Tag } from './Primitives';
import { avianNumber, formatCount, formatSince } from '../lib/format';
import { href } from '../router';
import { type Bird, type BroodEntry } from '../mock';

export type CardActions = {
  onOpen: () => void;
  onBrood: () => void;
  onSettle: () => void;
  onSell: () => void;
  onUpgrade: () => void;
};

export function BirdCard({
  bird, entry, now, picked, onPick, busy, actions,
}: {
  bird: Bird; entry: BroodEntry | null; now: number;
  picked: boolean; onPick?: () => void; busy: boolean; actions: CardActions;
}) {
  const b = bird.brood;
  const state: 'brooding' | 'ended' | 'resting' = b?.live ? 'brooding' : b ? 'ended' : 'resting';
  const nested = bird.satchel.holds.filter((h) => h.kind === 'avian').length;
  const inWallet = bird.location.where === 'wallet';
  const lines = entry?.lines ?? [];
  const unsettled = lines.some((l) => l.unsettled > 0n);

  const line1 = state === 'brooding' ? `${b!.tier}x weight, settles to ${b!.delivery.toWallet ? 'your wallet' : 'its satchel'}`
    : state === 'ended' ? `Ended ${b!.expiredAt ? `${formatSince(now - b!.expiredAt)} ago` : 'when it changed hands'}`
      : '';
  // What a brooding bird has earned is not on the card (the founder's pass, 2026-09-28): its sheet has it.
  const line2 = state === 'ended' ? 'Settle to collect its share' : '';

  return (
    <article className={`bird-card${picked ? ' bird-card--on' : ''}`}>
      {onPick ? (
        <button
          type="button"
          className={`bird-card__pick${picked ? ' bird-card__pick--on' : ''}`}
          aria-pressed={picked}
          aria-label={picked ? `Take ${avianNumber(bird.id)} out of the set` : `Put ${avianNumber(bird.id)} in the set`}
          onClick={onPick}
        >
          {picked ? <Icon name="check" size={12} /> : null}
        </button>
      ) : null}
      <button
        type="button"
        onClick={actions.onOpen}
        style={{ display: 'block', width: '100%', padding: 0, border: 0, background: 'transparent', cursor: 'pointer' }}
        aria-label={`Open ${avianNumber(bird.id)}’s satchel`}
      >
        <Avian traits={bird.traits} alt={avianNumber(bird.id)} />
      </button>
      <div className={s.cardBody}>
        {/* One line, never two: the name gives way (an ellipsis) before the tag wraps under it. */}
        <div className={s.cardName}>
          <a className="strong" href={href({ name: 'bird', id: bird.id })} style={{ fontWeight: 600 }} title={avianNumber(bird.id)}>
            #{formatCount(bird.id)}
          </a>
          <span className="spacer" />
          <span style={{ flexShrink: 0 }}>
            {state === 'brooding' ? <Tag tone="ok">Brooding</Tag>
              : state === 'ended' ? <Tag tone="warn">Brood ended</Tag>
                : nested ? <Tag tone="hot">Holds {nested} {nested === 1 ? 'bird' : 'birds'}</Tag>
                  : <Tag>Not brooding</Tag>}
          </span>
        </div>
        <div className={`${s.cardLine} ${s.cardLine1}`}>{line1}</div>
        <div className={`${s.cardLine} ${s.cardLine2}`}>{line2}</div>
        <div className={s.cardActions}>
          {state === 'resting' ? (
            <button type="button" className="btn btn--ghost btn--compact" disabled={busy || !inWallet} onClick={actions.onBrood}>Brood</button>
          ) : (
            <button type="button" className="btn btn--ghost btn--compact" disabled={busy || (state === 'brooding' && !unsettled)} onClick={actions.onSettle}>Settle</button>
          )}
          <button type="button" className="btn btn--ghost btn--compact" disabled={busy || !inWallet} onClick={actions.onSell}>Sell</button>
          <CardMenu bird={bird} state={state} busy={busy} actions={actions} />
        </div>
      </div>
    </article>
  );
}

/** The rest of a card's actions, behind one press: never a second row of buttons. */
function CardMenu({ bird, state, busy, actions }: { bird: Bird; state: 'brooding' | 'ended' | 'resting'; busy: boolean; actions: CardActions }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', key); };
  }, [open]);
  const pick = (f: () => void) => () => { setOpen(false); f(); };
  const b = bird.brood;
  return (
    <div ref={box} className={s.menuWrap}>
      <button
        type="button" className={s.menuButton} aria-haspopup="menu" aria-expanded={open}
        aria-label={`More for ${avianNumber(bird.id)}`} onClick={() => setOpen((v) => !v)}
      >
        <Icon name="dots" size={14} />
      </button>
      {open ? (
        <div className={s.menu} role="menu">
          {state === 'brooding' && b && b.tier < 3 ? (
            <button type="button" role="menuitem" className={s.menuItem} disabled={busy} onClick={pick(actions.onUpgrade)}>Upgrade the tier</button>
          ) : null}
          {state === 'ended' ? (
            <button type="button" role="menuitem" className={s.menuItem} disabled={busy} onClick={pick(actions.onBrood)}>Brood it again</button>
          ) : null}
          <button type="button" role="menuitem" className={s.menuItem} onClick={pick(actions.onOpen)}>Manage bird</button>
          <a role="menuitem" className={s.menuItem} href={href({ name: 'bird', id: bird.id })}>Open its page</a>
        </div>
      ) : null}
    </div>
  );
}
