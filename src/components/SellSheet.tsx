// Selling to the perch, from My Birds.
//
// This was the first of the Perch page's three panels. It opens now from the
// Sell button on a bird's card, with that bird ticked, or from the page's own
// "Sell N birds" button with every picked bird ticked, and the rest of the
// wallet's birds beside it so a sale of several is still one transaction.
// Everything the panel said is still said here: the price, the hundredth-bird
// warning and its acknowledgement, the brooding warning, and the route the
// sale takes (a pull per bird, or the batch with the perch approved as an
// operator).

import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { Avian, Box, Note } from './Primitives';
import { WriteGate } from './Wallet';
import { ContractError, useTx, type FixHandlers } from './Tx';
import { avians, avianNumber, formatCount } from '../lib/format';
import {
  routeFor, sellToPerch, setPerchApproval, usePerch, useWallet, useYourBirds,
  type TokenId,
} from '../mock';

/** 1 -> "st", 2 -> "nd", 100 -> "th". For "the 100th bird in this sale". */
function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return 'th';
  return ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
}

export function SellSheet({
  initial, onConnect, onClose, onSold,
}: { initial: TokenId | TokenId[]; onConnect: () => void; onClose: () => void; onSold: () => void }) {
  const perch = usePerch();
  const wallet = useWallet();
  const yours = useYourBirds();
  const tx = useTx();

  const [selling, setSelling] = useState<TokenId[]>(() => (Array.isArray(initial) ? initial : [initial]));
  // Ticked only when a bird in this sale is likely to be the hundredth. Reset
  // whenever the selection changes, so it can never carry over from a smaller
  // sale that did not reach the countdown.
  const [burnAck, setBurnAck] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const p = perch.data;
  const sellable = yours.data ?? [];

  // The drawer's fixes this sheet owns. "Try the direct route" is the answer
  // to one refusal only, the batch route not being whitelisted: the same
  // sale goes out bird by bird. Any other "Try again" is the drawer's re-run.
  const onFix: FixHandlers = {
    'approve-operator': () => { void approveBirds(); },
    retry: (_amount, error) => {
      if (!(error instanceof ContractError) || error.errorName !== 'CallerMustBeWhitelisted') return false;
      void doSell('push');
      return true;
    },
  };

  const approveBirds = async () => {
    setBusy(true);
    await tx.run('Approving the perch', (on) => setPerchApproval(true, on), {
      onFix,
      outcome: () => 'The perch can move your birds now. Nothing has moved yet.',
    });
    await wallet.reload();
    setBusy(false);
  };

  const route = routeFor(selling.length, wallet.data?.approvals.birdsToPerch ?? false, p?.operatorWhitelisted ?? false);
  // The countdown lands inside this sale: bird number `depositsUntilNextBurn`
  // of the list is the one that would be the hundredth. BELOW THE FLOOR the
  // countdown reads 0 — nothing to count down to — and 0 must never be read as
  // "the next sale burns", so the test needs the `> 0`.
  const burnRisk = !!p && selling.length > 0 && p.burnsActive && p.depositsUntilNextBurn > 0
    && p.depositsUntilNextBurn <= selling.length;
  // A sale ends a brood. Said before the sale, in HANDOVER section 5's words.
  const broodingSelected = sellable.filter((b) => selling.includes(b.id) && b.brood?.live);

  const doSell = async (forced?: 'batch' | 'push') => {
    setBusy(true);
    const r = await tx.run(`Selling ${selling.length === 1 ? 'a bird' : `${selling.length} birds`} to the perch`,
      (on) => sellToPerch(selling, { route: forced ?? route.route }, on),
      {
        onFix,
        outcome: (r) => (r.burnt.length === 0
          ? `${avians(r.paid)} is in your wallet.`
          : r.burnt.length === 1
            ? `${avianNumber(r.burnt[0])} was the hundredth bird into the perch and was burnt. You were paid in full: ${avians(r.paid)} is in your wallet.`
            : `${r.burnt.map(avianNumber).join(' and ')} were hundredth birds into the perch and were burnt. You were paid in full: ${avians(r.paid)} is in your wallet.`),
        rows: (r) => {
          const plain = r.burnt.length === 0 && r.withheld.length === 0 && r.expired.length === 0 && r.hookFailed.length === 0;
          if (plain) return [];
          return [
            ...selling.map((id) => ({
              label: avianNumber(id),
              value: r.burnt.includes(id) ? 'burnt'
                : r.withheld.includes(id) ? 'kept: the hundredth, but below the burn floor'
                  : r.expired.includes(id) ? 'in the perch; its brooding ended'
                    : 'in the perch',
              tone: (r.burnt.includes(id) ? 'warn' : r.expired.includes(id) || r.withheld.includes(id) ? 'dim' : 'ok') as 'warn' | 'ok' | 'dim',
            })),
            ...r.hookFailed.map((id) => ({ label: avianNumber(id), value: 'nest hook failed: its brood did not end on chain', tone: 'warn' as const })),
            { label: 'Paid to you', value: avians(r.paid), tone: 'ok' as const },
          ];
        },
      });
    setBusy(false);
    if (r) { onSold(); onClose(); }
  };

  return (
    <div className="scrim scrim--fixed" role="dialog" aria-modal="true" aria-labelledby="sell-h" onClick={() => { if (!busy) onClose(); }}>
      <div className="modal modal--scroll" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <h3 id="sell-h" style={{ fontSize: 24 }}>Sell to the perch</h3>
          <span className="spacer" />
          {p ? <span className="num" style={{ color: 'var(--confirm)' }}>{avians(p.sell)} each</span> : null}
          <button type="button" className="btn btn--ghost btn--small" onClick={onClose} aria-label="Close" disabled={busy}>
            <Icon name="cross" size={14} />
          </button>
        </div>

        {!p ? (
          <p className="small dim" style={{ marginTop: 12 }}>
            {perch.error ? 'The perch could not be read. Your birds are where they were.' : 'Reading the perch…'}
          </p>
        ) : (
          <>
            <p className="small dim" style={{ marginTop: 6 }}>
              You receive {avians(p.sell)} per bird, in the same transaction. The perch&rsquo;s
              base is {avians(p.base)}; its 10% fee goes whole to the Roost.
            </p>

            {/*
              THE HUNDREDTH BIRD. The perch burns one bird for every hundred
              deposited, and the count advances per bird rather than per
              transaction — so a sale of several can straddle the line, and
              the one that lands on it is the one at that position in the list.
              The warning is about LIKELIHOOD and says so: anyone else selling
              in between moves the count, and the receipt is the only truth.
              Below BURN_FLOOR living birds the burn is off, and that sentence
              is never "the next sale burns".
            */}
            <p className="tiny dim" style={{ marginTop: 10 }}>
              {!p.burnsActive || p.depositsUntilNextBurn === 0
                ? `No sale burns a bird until more than ${formatCount(p.burnFloor)} birds are alive. Above that, one bird in every ${formatCount(p.burnEvery)} sold to the perch is burnt.`
                : `One bird in every ${formatCount(p.burnEvery)} sold to the perch is burnt. ${p.depositsUntilNextBurn === 1
                  ? 'The next one in is the hundredth.'
                  : `${formatCount(p.depositsUntilNextBurn)} more sales until the next one.`}`}{' '}
              The seller is paid the full {avians(p.sell)} either way.
            </p>

            <h4 style={{ margin: '18px 0 8px' }}>In this sale <span className="dim" style={{ fontWeight: 400 }}>(tap another bird to add it)</span></h4>
            <div className="tiles">
              {sellable.map((b) => {
                const on = selling.includes(b.id);
                return (
                  <button
                    key={b.id}
                    type="button"
                    className={`tile${on ? ' tile--on' : ''}`}
                    aria-pressed={on}
                    onClick={() => {
                      setBurnAck(false);
                      setSelling((v) => (on ? v.filter((x) => x !== b.id) : [...v, b.id]));
                    }}
                  >
                    <Avian traits={b.traits} alt={avianNumber(b.id)} />
                    <span className="mono tiny dim" style={{ display: 'block', textAlign: 'center', marginTop: 4 }}>
                      #{formatCount(b.id)}
                    </span>
                    {on ? <span className="tile__mark" aria-hidden="true"><Icon name="check" size={11} /></span> : null}
                  </button>
                );
              })}
            </div>

            <div className="row" style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
              <span className="small">{selling.length} selected</span>
              <span className="spacer" />
              <span className="num" style={{ fontSize: 17 }}>{avians(p.sell * BigInt(selling.length))}</span>
            </div>

            {selling.length > 0 ? (
              <p className="tiny dim" style={{ marginTop: 10 }}>{route.reason}</p>
            ) : null}

            {route.offerApproval ? (
              <div style={{ marginTop: 14 }}>
                <WriteGate onConnect={onConnect}>
                  <button
                    type="button" className="btn btn--ghost btn--wide" disabled={busy || tx.busy}
                    onClick={approveBirds}
                  >
                    Approve the perch for your birds
                  </button>
                </WriteGate>
              </div>
            ) : null}

            {broodingSelected.length > 0 ? (
              <div style={{ marginTop: 14 }}>
                <Box tone="warn">
                  <Note tone="warn">
                    <strong className="strong">
                      {broodingSelected.length === 1
                        ? `${avianNumber(broodingSelected[0].id)} is brooding.`
                        : `${broodingSelected.map((b) => avianNumber(b.id)).join(' and ')} are brooding.`}
                    </strong>{' '}
                    <span className="small">
                      If you sell or move this bird, its brooding ends; what it has earned so far
                      comes to your wallet when anyone next settles it, and the buyer starts fresh.
                      Whatever is in its satchel goes to the buyer with it.
                    </span>
                  </Note>
                </Box>
              </div>
            ) : null}

            {burnRisk ? (
              <div style={{ marginTop: 14 }}>
                <Box tone="warn">
                  <Note tone="warn">
                    <strong className="strong">
                      {avianNumber(selling[p.depositsUntilNextBurn - 1])} is likely to be burnt.
                    </strong>{' '}
                    <span className="small">
                      {selling.length === 1
                        ? 'The perch is one deposit from its hundredth.'
                        : `It is the ${formatCount(p.depositsUntilNextBurn)}${ordinal(p.depositsUntilNextBurn)} bird in this sale, and the perch is ${formatCount(p.depositsUntilNextBurn)} deposit${p.depositsUntilNextBurn === 1 ? '' : 's'} from its hundredth.`}{' '}
                      You are paid the full {avians(p.sell * BigInt(selling.length))}
                      {selling.length === 1 ? '' : ` for all ${formatCount(selling.length)}`}{' '}
                      either way. Nothing is deducted for the burn.
                    </span>
                  </Note>
                  <p className="tiny dim" style={{ margin: '10px 0 0' }}>
                    Likely, not certain: if somebody else sells first the count moves and a
                    different bird lands on it. The receipt afterwards is the truth.
                  </p>
                  <p className="tiny dim" style={{ margin: '8px 0 0' }}>
                    A burnt bird&rsquo;s wallet is orphaned: whatever is inside it stays there
                    and nobody can reach it again.
                  </p>
                  <label className="row" style={{ gap: 8, marginTop: 12, alignItems: 'flex-start' }}>
                    <input
                      type="checkbox"
                      checked={burnAck}
                      onChange={(e) => setBurnAck(e.target.checked)}
                      style={{ marginTop: 3 }}
                    />
                    <span className="small">
                      I understand one of these birds is likely to be burnt.
                    </span>
                  </label>
                </Box>
              </div>
            ) : null}

            <div style={{ marginTop: 14 }}>
              <WriteGate onConnect={onConnect}>
                <button
                  type="button" className="btn btn--wide"
                  disabled={selling.length === 0 || busy || tx.busy || (burnRisk && !burnAck)}
                  onClick={() => { void doSell(); }}
                >
                  {selling.length === 0 ? 'Pick a bird above' : `Sell ${selling.length === 1 ? avianNumber(selling[0]) : `${selling.length} birds`} for ${avians(p.sell * BigInt(selling.length))}`}
                </button>
              </WriteGate>
            </div>

            <p className="tiny dim" style={{ marginTop: 12 }}>
              A sold bird can be bought back from the perch by anyone, you included, for {avians(p.buyNext)}.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
