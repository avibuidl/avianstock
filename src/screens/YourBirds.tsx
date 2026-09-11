// Your birds, their satchels, and the transfer screen — which is where the one
// thing this site must refuse to do lives.

import { useState } from 'react';
import {
  Address, Avian, Box, EmptyState, ErrorState, Note, PanelSkeleton, Tag,
} from '../components/Primitives';
import { WriteGate } from '../components/Wallet';
import { useTx } from '../components/Tx';
import { CycleRefusal } from './CycleRefusal';
import { avians, avianNumber, formatCount, formatEth, formatReward } from '../lib/format';
import { traitNames } from '../art/traits';
import { href, navigate } from '../router';
import {
  checkTransferSafety, satchelBlocksStaking, transferBird, useConnection, useRoost,
  usePerch, useYourBirds, type Address as Addr, type Amount, type Bird, type TransferSafety,
} from '../mock';

export function YourBirds({ onConnect }: { onConnect: () => void }) {
  const yours = useYourBirds();
  const roost = useRoost();
  const perch = usePerch();
  const c = useConnection();
  const tx = useTx();

  const [selected, setSelected] = useState<number | null>(null);
  const [to, setTo] = useState('');
  const [safety, setSafety] = useState<TransferSafety | null>(null);
  const [checking, setChecking] = useState(false);
  const [refusal, setRefusal] = useState<{ bird: Bird; safety: Extract<TransferSafety, { ok: false }> } | null>(null);
  const [busy, setBusy] = useState(false);

  if (c.status !== 'connected') {
    return (
      <div className="page">
        <p className="eyebrow">My Birds</p>
        <h2>Connect a wallet to see them.</h2>
        <div style={{ marginTop: 24, maxWidth: 380 }}>
          <WriteGate onConnect={onConnect}><span /></WriteGate>
        </div>
      </div>
    );
  }

  if (yours.loading && !yours.data) {
    return <div className="page page--wide"><div className="panel"><PanelSkeleton lines={5} art /></div></div>;
  }
  if (yours.error) {
    return (
      <div className="page page--wide">
        <ErrorState title="That read failed." detail="Your birds are exactly where they were."
          onRetry={yours.reload} />
      </div>
    );
  }

  const birds = yours.data ?? [];
  const sellPrice = perch.data?.sell;
  const staked = roost.data?.staked ?? [];
  const current = birds.find((b) => b.id === selected) ?? birds[0];

  const doCheck = async () => {
    if (!current || !/^0x[0-9a-fA-F]{40}$/.test(to)) return;
    setChecking(true);
    const r = await checkTransferSafety(current.id, to as Addr);
    setSafety(r);
    setChecking(false);
  };

  const doSend = async () => {
    if (!current) return;
    const r = await checkTransferSafety(current.id, to as Addr);
    if (!r.ok) { setRefusal({ bird: current, safety: r }); return; }
    setBusy(true);
    await tx.run(`Sending ${avianNumber(current.id)}`, (on) => transferBird(current.id, to as Addr, on), {
      outcome: () => `${avianNumber(current.id)} is on its way. Its satchel goes with it.`,
    });
    setTo(''); setSafety(null);
    setBusy(false);
  };

  return (
    <div className="page page--wide">
      <div className="row row--wrap" style={{ gap: 16 }}>
        <div>
          <p className="eyebrow">My Birds</p>
          <h2>
            {birds.length === 0 && staked.length === 0 ? 'Nothing yet.'
              : `${formatCount(birds.length)} in the wallet, ${formatCount(staked.length)} in the nest.`}
          </h2>
        </div>
        <span className="spacer" />
        <span className="wchip"><Address value={c.address} /></span>
      </div>

      {birds.length === 0 && staked.length === 0 ? (
        <div style={{ marginTop: 32, maxWidth: 620 }}>
          <EmptyState title="You haven't composed a bird yet.">
            Six choices and it&rsquo;s yours, and nobody can mint the same combination again.{' '}
            <a href={href({ name: 'compose' })}>Compose your Avian</a>.
          </EmptyState>
        </div>
      ) : (
        <div className="birds-split">
          <div>
            {birds.length > 0 ? (
              <div className="bird-cards">
                {birds.map((b) => (
                  <BirdCard
                    key={b.id}
                    bird={b}
                    sellPrice={sellPrice}
                    selected={current?.id === b.id}
                    onSelect={() => setSelected(b.id)}
                  />
                ))}
              </div>
            ) : null}

            {staked.length > 0 ? (
              <>
                <div className="row" style={{ marginTop: 28, gap: 12 }}>
                  <h3 style={{ fontSize: 18 }}>In the nest</h3>
                  <Tag tone="ok">Weight {roost.data?.yourWeight.toString()}</Tag>
                </div>
                <div className="bird-cards" style={{ marginTop: 14 }}>
                  {staked.map((b) => <BirdCard key={b.id} bird={b} sellPrice={sellPrice} />)}
                </div>
              </>
            ) : null}
          </div>

          <div className="stack">
            {current ? <SatchelPanel bird={current} sellPrice={sellPrice} /> : null}

            {current ? (
              <section className="panel" aria-labelledby="send-h">
                <h3 id="send-h" style={{ fontSize: 20 }}>Send {avianNumber(current.id)}</h3>
                <p className="eyebrow" style={{ margin: '16px 0 8px' }}>To</p>
                <div className={`field${safety && !safety.ok ? ' field--bad' : ''}`}>
                  <input
                    value={to}
                    onChange={(e) => { setTo(e.target.value); setSafety(null); }}
                    placeholder="0x…"
                    aria-label="Destination address"
                    spellCheck={false}
                  />
                  <button
                    type="button" className="btn btn--small"
                    style={{ borderLeft: '1px solid var(--line-strong)' }}
                    disabled={checking || !/^0x[0-9a-fA-F]{40}$/.test(to)}
                    onClick={doCheck}
                  >
                    {checking ? 'Checking…' : 'Check'}
                  </button>
                </div>

                {safety ? (
                  <div style={{ marginTop: 12 }}>
                    {safety.ok ? (
                      <Note tone="ok">
                        Checked. That address is not a bird&rsquo;s satchel, and nothing in your
                        ownership tree leads back to this bird.
                      </Note>
                    ) : (
                      <Note tone="bad">
                        {safety.reason === 'own-account'
                          ? 'That is this bird’s own satchel. It would be stuck there forever.'
                          : safety.reason === 'collection-address'
                            ? 'That is the collection’s own address. Nothing recovers a bird sent there.'
                            : 'This would trap both birds forever.'}
                      </Note>
                    )}
                  </div>
                ) : null}

                <div style={{ marginTop: 16 }}>
                  <WriteGate onConnect={onConnect}>
                    <button
                      type="button" className="btn btn--wide"
                      disabled={busy || tx.busy || !/^0x[0-9a-fA-F]{40}$/.test(to)}
                      onClick={doSend}
                    >
                      Send the bird
                    </button>
                  </WriteGate>
                </div>

                <p className="tiny dim" style={{ marginTop: 12 }}>
                  We walk the destination&rsquo;s ownership upward before every send. A bird that
                  ends up inside its own ownership loop can never be moved again, and the chain can
                  only catch the simplest version of that.
                </p>
              </section>
            ) : null}
          </div>
        </div>
      )}

      {refusal ? (
        <CycleRefusal
          bird={refusal.bird}
          safety={refusal.safety}
          onClose={() => setRefusal(null)}
          onLookInside={() => { navigate({ name: 'bird', id: refusal.bird.id }); setRefusal(null); }}
        />
      ) : null}
    </div>
  );
}

function BirdCard({
  bird, sellPrice, selected, onSelect,
}: { bird: Bird; sellPrice?: Amount; selected?: boolean; onSelect?: () => void }) {
  const nested = satchelBlocksStaking(bird);
  const loc = bird.location;
  return (
    <article className={`bird-card${selected ? ' bird-card--on' : ''}`}>
      <button
        type="button"
        onClick={onSelect}
        disabled={!onSelect}
        style={{ display: 'block', width: '100%', padding: 0, border: 0, background: 'transparent', cursor: onSelect ? 'pointer' : 'default' }}
        aria-label={`Select ${avianNumber(bird.id)}`}
      >
        <Avian traits={bird.traits} alt={avianNumber(bird.id)} />
      </button>
      <div style={{ padding: '12px 14px 14px' }}>
        <div className="row">
          <a className="strong" href={href({ name: 'bird', id: bird.id })} style={{ fontWeight: 600 }}>
            {avianNumber(bird.id)}
          </a>
          <span className="spacer" />
          {loc.where === 'roost' ? <Tag tone="ok">Tier {loc.tier}</Tag>
            : nested.length ? <Tag tone="hot">Satchel: {nested.length} birds</Tag>
              : <Tag>In your wallet</Tag>}
        </div>
        <p className="tiny dim" style={{ marginTop: 6, lineHeight: 1.45 }}>
          {traitNames(bird.traits).join(' · ')}
        </p>
        {loc.where === 'wallet' ? (
          <div className="row row--wrap" style={{ gap: 8, marginTop: 12 }}>
            <a className="btn btn--ghost btn--small" href={href({ name: 'nest' })}>Brood</a>
            <a className="btn btn--ghost btn--small" href={href({ name: 'perch' })}>
              {sellPrice === undefined ? 'Sell' : `Sell for ${avians(sellPrice)}`}
            </a>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function SatchelPanel({ bird, sellPrice }: { bird: Bird; sellPrice?: Amount }) {
  const nested = satchelBlocksStaking(bird);
  return (
    <section className="panel" aria-labelledby="satchel-h">
      <div className="row">
        <h3 id="satchel-h" style={{ fontSize: 20 }}>The satchel</h3>
        <span className="spacer" />
        <Tag>{avianNumber(bird.id)}</Tag>
      </div>
      <p className="small dim" style={{ marginTop: 8 }}>
        Every bird has its own wallet from the moment it is minted. Whoever holds the bird controls
        it.
      </p>

      <div className="inset" style={{ marginTop: 14 }}>
        <div className="row">
          <span className="tiny dim">ADDRESS</span>
          <span className="spacer" />
          {bird.satchel.deployed ? <Tag tone="ok">Deployed</Tag> : <Tag>Not deployed yet</Tag>}
        </div>
        <p className="mono" style={{ marginTop: 6, fontSize: 12.5, overflowWrap: 'anywhere', color: 'var(--text-strong)' }}>
          {bird.satchel.address}
        </p>
        {!bird.satchel.deployed ? (
          <p className="tiny dim" style={{ marginTop: 8 }}>
            The address exists and can receive assets before anybody deploys it. Deploying costs
            about 105,000 gas and anyone may do it.
          </p>
        ) : null}
      </div>

      <p className="eyebrow" style={{ margin: '18px 0 0' }}>It is holding</p>
      {bird.satchel.holds.length === 0 ? (
        <p className="small dim" style={{ marginTop: 8 }}>Nothing yet.</p>
      ) : (
        bird.satchel.holds.map((h, i) => (
          <div key={i} className="hold-row">
            {h.kind === 'avian' ? (
              <>
                <Avian traits={[0, 0, 0, 0, 0, 0]} size={44} alt="" className="hold-art" />
                <a className="small strong" href={href({ name: 'bird', id: h.id })}>{avianNumber(h.id)}</a>
                <span className="spacer" /><span className="tiny dim">a bird</span>
              </>
            ) : h.kind === 'erc20' ? (
              <>
                <Tag>{h.symbol}</Tag>
                <span className="small num">{formatReward(h.amount, h.decimals)}</span>
                <span className="spacer" /><span className="tiny dim">a token</span>
              </>
            ) : h.kind === 'eth' ? (
              <>
                <Tag>ETH</Tag>
                <span className="small num">{formatEth(h.amount)}</span>
                <span className="spacer" /><span className="tiny dim">gas</span>
              </>
            ) : (
              <>
                <Tag>NFT</Tag>
                <span className="small">{h.collection} #{h.id}</span>
                <span className="spacer" /><span className="tiny dim">an NFT</span>
              </>
            )}
          </div>
        ))
      )}

      {nested.length > 0 ? (
        <div style={{ marginTop: 16 }}>
          <Box tone="warn">
            <Note tone="warn">
              <span className="small">
                Brooding this bird locks {nested.length === 1 ? 'the bird' : `both birds`} inside it
                until it comes home.
              </span>
            </Note>
          </Box>
        </div>
      ) : null}

      <p className="tiny dim" style={{ marginTop: 14 }}>
        Sending this bird sends its satchel and everything in it. There is no way to keep one and
        give away the other.
      </p>
      <p className="small" style={{ marginTop: 10 }}>
        <span className="dim">Perch would pay </span>
        <span className="num">{sellPrice === undefined ? '—' : avians(sellPrice)}</span>
      </p>
    </section>
  );
}
