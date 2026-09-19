// One bird: the art, its six choices with their lore, where it is, and its
// satchel.

import { Avian, Box, ErrorState, Note, PanelSkeleton, Tag } from '../components/Primitives';
import { CATEGORIES } from '../art/traits';
import { comboHex } from '../art/render';
import { avians, avianNumber, formatCount, formatEth, formatReward, formatSince, shortAddress } from '../lib/format';
import { href } from '../router';
import { SettleControl } from '../components/Settle';
import { PERCH_BUY_NAMED, PERCH_BASE, useBird } from '../mock';

export function BirdDetail({ id, onConnect }: { id: number; onConnect: () => void }) {
  const bird = useBird(id);
  const now = Math.floor(Date.now() / 1000);

  if (bird.loading && !bird.data) {
    return <div className="page"><div className="panel"><PanelSkeleton lines={5} art /></div></div>;
  }
  if (bird.error || !bird.data) {
    return (
      <div className="page">
        <ErrorState
          title={`Avian #${formatCount(id)} could not be read.`}
          detail="It has not been minted, or the read failed. Try again in a moment."
          onRetry={bird.reload}
        />
        <p className="small" style={{ marginTop: 16 }}>
          <a href={href({ name: 'flock' })}>Back to the flock</a>
        </p>
      </div>
    );
  }

  const b = bird.data;
  const loc = b.location;
  const nested = b.satchel.holds.filter((h) => h.kind === 'avian').length;
  const lines = b.broodLines ?? [];
  const symbolOf = (token: string) => {
    const l = lines.find((x) => x.token.address.toLowerCase() === token.toLowerCase());
    return l ? { symbol: l.token.symbol, decimals: l.token.decimals } : { symbol: shortAddress(token), decimals: 18 };
  };
  const unsettled = lines.some((l) => l.unsettled > 0n);

  return (
    <div className="page page--wide">
      <p className="small"><a href={href({ name: 'flock' })}>Back to the flock</a></p>

      <div className="bird-detail">
        <div>
          {/*
            WHICH BIRD, AND WHOSE, UNDER THE ART.

            Both used to head the right-hand column, which pushed everything
            beside the picture down by a heading's height — the traits panel
            started level with the bird's chest rather than with the top of the
            card holding it. They belong to the picture more than to the data
            anyway: the number names what you are looking at and the line under
            it says where it currently lives.

            The 32 × 32 note that used to sit here is gone. It described the
            whole collection rather than this bird, and the Docs page says it in
            more detail than a caption can.
          */}
          <div className="panel panel--tight">
            <Avian traits={b.traits} alt={avianNumber(b.id)} />
            <div className="bird-detail__id">
              <div className="row row--wrap" style={{ gap: 10 }}>
                <h2 style={{ fontSize: 22 }}>{avianNumber(b.id)}</h2>
                <span className="spacer" />
                {loc.where === 'perch' ? <Tag>In the perch</Tag>
                  : loc.where === 'satchel' ? <Tag tone="hot">In a satchel</Tag>
                    : loc.where === 'burnt' ? <Tag tone="bad">Burnt</Tag>
                      : b.brood?.live ? <Tag tone="ok">Brooding, tier {b.brood.tier}</Tag>
                        : b.brood ? <Tag tone="warn">Brood ended</Tag>
                          : <Tag>Held</Tag>}
              </div>
              <p className="mono tiny" style={{ margin: '8px 0 0', overflowWrap: 'anywhere', color: 'var(--text)' }}>
                {loc.where === 'wallet' ? loc.owner
                  : loc.where === 'satchel' ? <>Inside {avianNumber(loc.hostId)}&rsquo;s satchel</>
                    : loc.where === 'burnt' ? 'Nobody. It was burnt by the perch.'
                      : 'Held by the perch'}
              </p>
            </div>
          </div>

          {/*
            A BURNT BIRD IS NOT A BROKEN PAGE. `ownerOf`, `tokenURI` and
            `traitsOf` all revert for one; `tokenCombo` is kept on purpose, and
            the art above is drawn from it. Everything below still reads: its six
            choices are still taken forever, which is the whole point of keeping
            the combo.
          */}
          {loc.where === 'burnt' ? (
            <div style={{ marginTop: 14 }}>
              <Box tone="warn" title="This bird was burnt">
                <p className="small" style={{ margin: 0 }}>
                  It was the hundredth bird sold into the perch, so the perch burnt it in the same
                  transaction. Its seller was paid the full {avians(PERCH_BASE - 10000n * 10n ** 18n)}.
                  Nobody owns it now and nobody can.
                </p>
                <p className="tiny dim" style={{ margin: '10px 0 0' }}>
                  Its six choices stay taken: nobody can mint this combination again. Its wallet is
                  orphaned, and whatever was inside it is unreachable.
                </p>
              </Box>
            </div>
          ) : null}

          {loc.where === 'perch' ? (
            <p className="small dim" style={{ marginTop: 14 }}>
              The perch will sell it for {avians(PERCH_BUY_NAMED)} if you name it, and it buys any
              bird back for {avians(PERCH_BASE - 10000n * 10n ** 18n)}.{' '}
              <a href={href({ name: 'perch' })}>Go to the perch</a>
            </p>
          ) : b.brood?.live ? (
            <p className="small dim" style={{ marginTop: 14 }}>
              Brooding for {formatSince(now - b.brood.activatedAt)} at tier {b.brood.tier}, so it counts{' '}
              {b.brood.tier} {b.brood.tier === 1 ? 'share' : 'shares'} of weight. It stays in its
              holder&rsquo;s wallet; rewards are delivered{' '}
              {b.brood.delivery.toWallet ? 'to the holder’s wallet' : 'into its satchel, and go with the bird'}.
            </p>
          ) : b.brood ? (
            <p className="small dim" style={{ marginTop: 14 }}>
              Its brooding ended when it changed hands. What it earned before that goes to the
              wallet that brooded it, {shortAddress(b.brood.activator)}, when anyone next settles it; the
              rest returns to the stream, and the new holder broods afresh.
            </p>
          ) : null}
        </div>

        <div>
          <section className="panel" aria-labelledby="traits-h">
            <h3 id="traits-h" style={{ fontSize: 20 }}>Traits</h3>
            <div style={{ marginTop: 16 }}>
              {CATEGORIES.map((cat, i) => (
                <div key={cat.key} className="trait-row">
                  <div className="row">
                    <span className="numbox" aria-hidden="true">{i + 1}</span>
                    <span className="small dim">{cat.display}</span>
                    <span className="spacer" />
                    <span className="mono strong">{cat.traits[b.traits[i]].display}</span>
                  </div>
                  {cat.traits[b.traits[i]].lore ? (
                    <p className="tiny dim" style={{ marginTop: 8 }}>{cat.traits[b.traits[i]].lore}</p>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="row" style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
              <span className="label">Combination</span>
              <span className="spacer" />
              <span className="mono" style={{ fontSize: 13 }}>{comboHex(b.combo)}</span>
            </div>
            <p className="tiny dim" style={{ marginTop: 10 }}>
              Nobody else can mint this combination, ever.
            </p>
          </section>

          <section className="panel" style={{ marginTop: 24 }} aria-labelledby="sat-h">
            <div className="row">
              <h3 id="sat-h" style={{ fontSize: 20 }}>Its satchel</h3>
              <span className="spacer" />
              {b.satchel.deployed ? <Tag tone="ok">Deployed</Tag> : <Tag>Not deployed yet</Tag>}
            </div>
            <p className="mono" style={{ marginTop: 10, fontSize: 12.5, overflowWrap: 'anywhere', color: 'var(--text-strong)' }}>
              {b.satchel.address}
            </p>
            <p className="small dim" style={{ marginTop: 10 }}>
              The bird&rsquo;s own wallet (an ERC-6551 account), controlled by whoever holds the
              bird. It can receive assets before it is deployed.
            </p>

            {b.satchel.holds.length > 0 ? (
              <>
                <h4 style={{ margin: '18px 0 0' }}>Inside it</h4>
                {b.satchel.holds.map((h, i) => (
                  <div key={i} className="hold-row">
                    {h.kind === 'avian' ? (
                      <>
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
                        <Tag>ETH</Tag><span className="small num">{formatEth(h.amount)}</span>
                        <span className="spacer" /><span className="tiny dim">gas</span>
                      </>
                    ) : (
                      <>
                        <Tag>NFT</Tag><span className="small">{h.collection} #{h.id}</span>
                        <span className="spacer" /><span className="tiny dim">an NFT</span>
                      </>
                    )}
                  </div>
                ))}
              </>
            ) : (
              <p className="small dim" style={{ marginTop: 12 }}>Empty.</p>
            )}

            {b.brood && lines.length > 0 ? (
              <div style={{ marginTop: 18 }}>
                <div className="row">
                  <h4 style={{ margin: 0 }}>Rewards</h4>
                  <span className="spacer" />
                  <span className="tiny dim">
                    {b.brood.delivery.toWallet ? 'Delivered to the holder’s wallet' : 'Delivered here'}
                  </span>
                </div>
                {lines.map((l) => (
                  <div key={l.token.address} className="hold-row">
                    <Tag>{l.token.symbol}</Tag>
                    <span className="small">
                      <span className="num">{formatReward(l.unsettled, l.token.decimals)}</span>
                      <span className="dim"> unsettled</span>
                    </span>
                    <span className="spacer" />
                    <span className="small">
                      <span className="num">{formatReward(l.settled, l.token.decimals)}</span>
                      <span className="dim"> settled</span>
                    </span>
                  </div>
                ))}
                {!b.brood.live && lines.some((l) => l.pending.toActivator > 0n || l.pending.returned > 0n) ? (
                  <p className="tiny dim" style={{ marginTop: 8 }}>
                    At settle: {lines.filter((l) => l.pending.toActivator > 0n || l.pending.returned > 0n).map((l) =>
                      `${formatReward(l.pending.toActivator, l.token.decimals)} ${l.token.symbol} to ${shortAddress(b.brood!.activator)}, ${formatReward(l.pending.returned, l.token.decimals)} back to the stream`).join('; ')}.
                  </p>
                ) : null}
                {unsettled || !b.brood.live ? (
                  <div style={{ marginTop: 12 }}>
                    <SettleControl
                      ids={[b.id]}
                      label={b.brood.live ? 'Settle what it has earned' : 'Settle the ended brood'}
                      symbolOf={symbolOf} onConnect={onConnect} onDone={() => bird.reload()} ghost
                    />
                  </div>
                ) : null}
              </div>
            ) : b.brood && lines.length === 0 ? (
              <p className="small dim" style={{ marginTop: 12 }}>
                Brooding, with nothing streaming yet. Its weight is counted; rewards begin when a
                token is listed.
              </p>
            ) : null}

            {nested > 0 ? (
              <div style={{ marginTop: 16 }}>
                <Box>
                  <Note>
                    <span className="small">
                      {nested === 1 ? 'The bird' : `The ${nested} birds`} inside can be moved by
                      whoever holds this one, brooding or not. Nothing may be sent into a satchel
                      that would close an ownership loop; the site checks before every send.
                    </span>
                  </Note>
                </Box>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}
