// One bird: the art, its six choices with their lore, where it is, and its
// satchel.

import { Avian, Box, ErrorState, Note, PanelSkeleton, Tag } from '../components/Primitives';
import { CATEGORIES } from '../art/traits';
import { comboHex } from '../art/render';
import { avians, avianNumber, formatCount, formatEth, formatReward, formatSince } from '../lib/format';
import { href } from '../router';
import { PERCH_BUY_NAMED, PERCH_BASE, satchelBlocksStaking, useBird } from '../mock';

export function BirdDetail({ id }: { id: number }) {
  const bird = useBird(id);
  const now = Math.floor(Date.now() / 1000);

  if (bird.loading && !bird.data) {
    return <div className="page"><div className="panel"><PanelSkeleton lines={5} art /></div></div>;
  }
  if (bird.error || !bird.data) {
    return (
      <div className="page">
        <ErrorState
          title="No such bird — or that read failed."
          detail={`Avian #${formatCount(id)} has either not been minted or could not be read.`}
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
  const nested = satchelBlocksStaking(b);

  return (
    <div className="page page--wide">
      <p className="small"><a href={href({ name: 'flock' })}>← The flock</a></p>

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
                  : loc.where === 'roost' ? <Tag tone="ok">Brooding · Tier {loc.tier}</Tag>
                    : loc.where === 'satchel' ? <Tag tone="hot">In a satchel</Tag>
                      : loc.where === 'burnt' ? <Tag tone="bad">Burnt</Tag>
                        : <Tag>Held</Tag>}
              </div>
              <p className="mono tiny" style={{ margin: '8px 0 0', overflowWrap: 'anywhere', color: 'var(--text)' }}>
                {loc.where === 'wallet' ? loc.owner
                  : loc.where === 'roost' ? <>Brooded by {loc.staker}</>
                    : loc.where === 'satchel' ? <>Inside {avianNumber(loc.hostId)}&rsquo;s satchel</>
                      : loc.where === 'burnt' ? 'Nobody — it was burnt by the perch'
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
                  Its six choices stay taken — the combination below can never be minted again by
                  anyone. Its wallet is orphaned: whatever was inside it is unreachable.
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
          ) : loc.where === 'roost' ? (
            <p className="small dim" style={{ marginTop: 14 }}>
              Brooding for {formatSince(now - loc.since)} at tier {loc.tier}, so it counts {loc.tier}{' '}
              {loc.tier === 1 ? 'share' : 'shares'} of weight. Its satchel is locked with it until it
              comes home.
            </p>
          ) : null}
        </div>

        <div>
          <section className="panel" aria-labelledby="traits-h">
            <h3 id="traits-h" style={{ fontSize: 20 }}>Attributes</h3>
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
              <span className="tiny dim">REGISTER KEY</span>
              <span className="spacer" />
              <span className="mono" style={{ fontSize: 13 }}>{comboHex(b.combo)}</span>
            </div>
            <p className="tiny dim" style={{ marginTop: 10 }}>
              This combination is refused to everyone else, permanently.
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
              An ERC-6551 account that belongs to the bird and is controlled by whoever owns it. It
              exists and can receive assets before anybody deploys it.
            </p>

            {b.satchel.holds.length > 0 ? (
              <>
                <p className="eyebrow" style={{ margin: '18px 0 0' }}>Holding</p>
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

            {nested.length > 0 ? (
              <div style={{ marginTop: 16 }}>
                <Box tone="warn">
                  <Note tone="warn">
                    <span className="small">
                      Brooding this bird locks {nested.length === 1 ? 'the bird' : 'both birds'}{' '}
                      inside it until it comes home. And nothing may be sent into a satchel that
                      would close an ownership loop — we check before every send.
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
