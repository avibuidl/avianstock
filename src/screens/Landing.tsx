// The landing page. Every line is from lore/site-copy.md; the numbers come
// from the mock layer rather than the copy, so they are live.

import { useState } from 'react';
import s from './Landing.module.css';
import { Icon } from '../components/Icon';
import { Avian, Note, StockDisclaimer, Swatch, Tag } from '../components/Primitives';
import { Footer } from '../components/Footer';
import { CATEGORIES } from '../art/traits';
import type { TraitIndices } from '../art/render';
import { avians, formatAvians, formatCount, rewardTokenNames } from '../lib/format';
import { href } from '../router';
import { useCollection, useSupply, useRewardSplit } from '../mock';

// The hero bird and the row of hats beneath it are the same bird: one plumage,
// Wideawake eyes, a Seedcracker bill, a bare throat. Only the headwear moves.
// The big preview keeps its background because a background is one of the six
// attributes and every real Avian has one; the swatches drop it so the hat is
// the only thing changing.
const HERO_FACE = { plumage: 6, eyes: 0, beak: 0 };
const HERO: TraitIndices = [5, HERO_FACE.plumage, HERO_FACE.eyes, HERO_FACE.beak, 0, 7];
const GALLERY: TraitIndices[] = [
  [1, 4, 14, 1, 3, 4], [11, 10, 12, 7, 1, 12], [3, 2, 6, 5, 1, 4], [7, 8, 10, 2, 4, 10],
  [9, 5, 3, 8, 2, 15], [0, 11, 13, 0, 5, 8], [6, 9, 1, 6, 3, 13], [2, 1, 4, 3, 0, 1],
];

export function Landing() {
  const collection = useCollection();
  const supply = useSupply();
  // Which tokens a brooder actually claims. Owner-set, so it is read.
  const rewardNames = rewardTokenNames(useRewardSplit().data);
  const [hw, setHw] = useState(7);
  const c = collection.data;
  const hero = HERO.slice() as number[];
  hero[5] = hw;

  return (
    <>
      <section className={s.hero}>
        <div>
          <p className="eyebrow">5,555 composed pixel birds · Robinhood Chain</p>
          <h1>Build your<br />own bird.</h1>
          <p className="lede" style={{ maxWidth: 600 }}>
            5,555 pixel birds you compose yourself — six attributes to choose from, no reveal, no
            duplicate birds possible, all stored on-chain.
          </p>
          <div className="row row--wrap" style={{ gap: 24, marginTop: 36 }}>
            <a className="btn" href={href({ name: 'compose' })}>
              Compose your Avian <Icon name="arrow" size={16} color="var(--ink)" />
            </a>
            <span className="small">
              <a href={href({ name: 'flock' })}>See the flock</a>
              <span className="dim"> · </span>
              <a href={href({ name: 'perch' })}>Read how the perch works</a>
            </span>
          </div>

          {/*
            Four figures, none of them written down here. The ceiling, the
            price and the burn were all literals at one point or another, and a
            literal on this row is a number that goes wrong silently: the owner
            can raise the price with `setPrice` whenever they like, and the
            page would go on saying 100,000 with a straight face.

            A read that has not landed, or that failed, shows `—`. Never a
            zero — "we could not ask" is not "there is none", and on this row a
            zero would read as a fact about the collection.
          */}
          <div className={s.stats}>
            <div>
              <div className="num" style={{ fontSize: 24 }}>
                {c ? (
                  <>
                    {formatCount(c.totalMinted)}{' '}
                    <span className="dim" style={{ fontSize: 15 }}>/ {formatCount(c.maxSupply)}</span>
                  </>
                ) : '—'}
              </div>
              <div className="tiny dim" style={{ marginTop: 4 }}>MINTED SO FAR</div>
            </div>
            <div>
              <div className="num" style={{ fontSize: 24 }}>{c ? formatCount(c.reservedFree) : '—'}</div>
              <div className="tiny dim" style={{ marginTop: 4 }}>FREE BIRDS LEFT ON THE LIST</div>
            </div>
            <div>
              <div className="num" style={{ fontSize: 24 }}>
                {c ? (
                  <>
                    {formatAvians(c.price)}{' '}
                    <span className="dim" style={{ fontSize: 15 }}>AVIANS</span>
                  </>
                ) : '—'}
              </div>
              <div className="tiny dim" style={{ marginTop: 4 }}>MINT PRICE</div>
            </div>
            {/*
              Two things burn AVIANS: the perch destroys half of every fee it
              takes, and a brooding tier is burned outright. `burned` is
              `initialSupply - totalSupply`, so it counts both — which is why
              the label does not name either one.
            */}
            {/*
              Burnt AVIANS, not burnt birds — two different burns on one row
              would be a trap. The birds' count is on the Contracts page beside
              the minted total, where the subtraction it implies can be shown.
            */}
            <div>
              <div className="num" style={{ fontSize: 24 }}>
                {supply.data ? (
                  <>
                    {formatAvians(supply.data.burned)}{' '}
                    <span className="dim" style={{ fontSize: 15 }}>AVIANS</span>
                  </>
                ) : '—'}
              </div>
              <div className="tiny dim" style={{ marginTop: 4 }}>BURNED SO FAR</div>
            </div>
          </div>
        </div>

        {/* Not a grid of birds: one bird mid-composition. The hero of the image
            is the act of choosing, so the headwear row here actually works. */}
        <div className="panel panel--tight">
          <div className="row" style={{ marginBottom: 14 }}>
            <Tag tone="ok">Available</Tag>
            <span className="spacer" />
            <span className="tiny dim">LIVE PREVIEW · NOT MINTED</span>
          </div>
          <Avian traits={hero as unknown as TraitIndices} alt="A bird being composed" />
          <div style={{ marginTop: 18 }}>
            <div className="row" style={{ marginBottom: 10 }}>
              <span className="numbox" aria-hidden="true">6</span>
              <h4 style={{ fontSize: 15 }}>Headwear</h4>
              <span className="spacer" />
              <span className="mono" style={{ color: 'var(--accent)', fontSize: 13 }}>
                {CATEGORIES[5].traits[hw].display}
              </span>
            </div>
            {/* This row is making a point about ONE attribute, so every swatch
                is the same bird as the preview above it — only the hat moves. */}
            <div className="strip">
              {[5, 6, 7, 8, 9, 10, 11].map((i) => (
                <Swatch
                  key={i}
                  category={5}
                  index={i}
                  isolated
                  isolatedFace={HERO_FACE}
                  selected={hw === i}
                  label={`Headwear: ${CATEGORIES[5].traits[i].display}`}
                  onClick={() => setHw(i)}
                />
              ))}
            </div>
            <p className="tiny dim" style={{ marginTop: 12 }}>
              Six attributes. Change any one of them and the bird changes with it.
            </p>
          </div>
        </div>
      </section>

      <section className={s.sec}>
        <h2>Four things that are true here<br />and rare everywhere else.</h2>
        <div className={s.four}>
          <div>
            <div className="numbox numbox--big">1</div>
            <h4 style={{ marginTop: 14 }}>Six attributes to choose from.</h4>
            <p className="small">
              Background, plumage, eyes, beak, neckwear, headwear. Seventy traits over one locked
              owlish base. No roll, no reveal, no waiting for an image to load.
            </p>
          </div>
          <div>
            <div className="numbox numbox--big">2</div>
            <h4 style={{ marginTop: 14 }}>All minted birds are unique.</h4>
            <p className="small">
              Your combination goes into the contract&rsquo;s own register. 1,866,240 birds are
              possible. 5,555 will be minted. A duplicate is refused on-chain, permanently.
            </p>
          </div>
          <div>
            <div className="numbox numbox--big">3</div>
            <h4 style={{ marginTop: 14 }}>Rarity results from mint behavior.</h4>
            <p className="small">
              There are no caps on any trait. Whatever turns out rare is rare because few people
              chose it — and we find out at the same time you do.
            </p>
          </div>
          <div>
            <div className="numbox numbox--big">4</div>
            <h4 style={{ marginTop: 14 }}>There is always a bid.</h4>
            <p className="small">
              The perch buys any bird back for 90,000 AVIANS, and its ability to pay is a proven
              property of the contract, not a promise from us.
            </p>
          </div>
        </div>
      </section>

      <section className="band">
        <div className={s.sec}>
          <h2>The receipts</h2>
          <div className={s.receipts}>
            <div>
              <Note tone="ok">
                <strong className="strong">All on-chain.</strong>{' '}
                <span className="small">
                  The whole collection is 12,872 bytes on one contract. There is no link to break,
                  because there is no link.
                </span>
              </Note>
            </div>
            <div>
              <Note tone="ok">
                {/*
                  The same literal the hero's MINT PRICE stat used to be, in a
                  sentence rather than a stat. `setPrice` moves it, and this
                  line would go on naming the old one.

                  The fallback is not an em-dash, because "A paid mint's —
                  AVIANS never touches us" is not a sentence. The claim here is
                  about CUSTODY, and it is true whatever the price is, so when
                  the read has not landed the amount simply drops out and the
                  sentence still says the thing it is there to say.
                */}
                <strong className="strong">
                  {c
                    ? <>A paid mint&rsquo;s {avians(c.price)} never touches us.</>
                    : <>A paid mint&rsquo;s payment never touches us.</>}
                </strong>{' '}
                <span className="small">
                  It goes to the buy-back perch in the same transaction. We can&rsquo;t hold it and we
                  can&rsquo;t redirect it. Pool fees and royalties are a separate matter — see what
                  the owner can do with the Treasury.
                </span>
              </Note>
            </div>
            <div>
              <Note tone="ok">
                <strong className="strong">Nobody can print AVIANS.</strong>{' '}
                <span className="small">
                  1,000,000,000, minted once. No mint function, no pause, no blacklist, no tax, no
                  upgrade — and no owner at all.
                </span>
              </Note>
            </div>
          </div>
        </div>
      </section>

      <section className={s.sec}>
        <h2>Three steps. That&rsquo;s the whole thing.</h2>
        <div className={s.steps} style={{ marginTop: 40 }}>
          <div className={s.step}>
            <div className="eyebrow row" style={{ color: 'var(--accent)' }}>
              <span className="numbox" aria-hidden="true">1</span> GET AVIANS
            </div>
            <p className="small">
              On the pool. You can buy during the opening window too — it costs more, starting at 25%
              and falling to about 1% over five minutes.{' '}
              <a href={href({ name: 'first-light' })}>See how the opening works</a>
            </p>
          </div>
          <div className={s.step}>
            <div className="eyebrow row" style={{ color: 'var(--accent)' }}>
              <span className="numbox" aria-hidden="true">2</span> COMPOSE YOUR BIRD
            </div>
            <p className="small">
              One pick in each of six categories. Combinations already taken are greyed out, so you
              can&rsquo;t waste a transaction on a bird that exists.
            </p>
          </div>
          <div className={s.step}>
            <div className="eyebrow row" style={{ color: 'var(--accent)' }}>
              <span className="numbox" aria-hidden="true">3</span> MINT IT
            </div>
            <p className="small">
              It&rsquo;s yours, it has its own wallet, and the perch will buy it back for 90,000
              AVIANS whenever you want.
            </p>
          </div>
        </div>
        <div style={{ marginTop: 40 }}>
          <a className="btn" href={href({ name: 'compose' })}>
            Compose your Avian <Icon name="arrow" size={16} color="var(--ink)" />
          </a>
        </div>

        <div className="panel" style={{ marginTop: 56 }}>
          <h3>Want it to brood?</h3>
          <div className={s.steps} style={{ marginTop: 24 }}>
            <div className={s.step}>
              <div className="eyebrow row" style={{ color: 'var(--accent)' }}>
                <span className="numbox" aria-hidden="true">1</span> STAKE AT A TIER
              </div>
              <p className="small">
                5,000, 15,000 or 25,000 AVIANS, burned, for one, two or three shares of weight.
              </p>
            </div>
            <div className={s.step}>
              <div className="eyebrow row" style={{ color: 'var(--accent)' }}>
                <span className="numbox" aria-hidden="true">2</span> WAIT FOR THE FLYWHEEL TO TURN
              </div>
              <p className="small">
                Pool fees and royalties reach the Treasury, and anyone at all can trigger the
                conversion — at most once every 24 hours, on one clock shared by every currency.
              </p>
            </div>
            <div className={s.step}>
              <div className="eyebrow row" style={{ color: 'var(--accent)' }}>
                <span className="numbox" aria-hidden="true">3</span> CLAIM YOUR SHARE
              </div>
              {/*
                The four names are TheNest's listing, not a constant — the owner
                can add and retire reward tokens. Read, with a sentence that
                still reads while the read is in flight and if the listing is
                ever empty. (The FAQ below names them literally on purpose: it
                is a disclaimer about what those particular tickers ARE, and
                generating it would make it say nothing at load.)
              */}
              <p className="small">
                {rewardNames
                  ? `${rewardNames}, split by weight.`
                  : 'Whatever the Treasury converted, split by weight.'}
              </p>
            </div>
          </div>
          <div style={{ marginTop: 26 }}><StockDisclaimer /></div>
        </div>
      </section>

      <section className="band">
        <div className={s.sec}>
          <h2>The honest answers</h2>
          <div style={{ marginTop: 36 }}>
            <Faq q="Is 90,000 AVIANS a floor price?">
              It&rsquo;s a standing offer in <em>tokens</em>, not in dollars or ETH. The perch will
              always buy your bird for 90,000 AVIANS — that part is a proven property of the
              contract. What those 90,000 AVIANS are worth is whatever the market says, and it can be
              anything. We will never tell you what a bird will be worth, because we don&rsquo;t know
              and neither does anyone else.
            </Faq>
            <Faq q="Are the rewards stocks?">
              No. NVDA, SPY, SPCX and AAPL here are <strong className="strong">tokenized stock
              products issued and controlled by Robinhood</strong>. They are not stocks, shares,
              dividends or equity, and holding them isn&rsquo;t ownership in any company. Robinhood
              can pause them or freeze an address, including ours. We have no relationship with
              Robinhood, NVIDIA, SpaceX, Apple or S&amp;P — we&rsquo;re a third party building on a
              public chain.
            </Faq>
            <Faq q="How much will I earn from brooding?">
              Possibly nothing. The stream depends on Treasury income arriving, on Uniswap pools
              other people provide, and on the issuer not pausing the tokens. There is no yield, no
              APY and no promise. What the contracts do guarantee is that your bird is held safely
              and comes home whenever you unstake, whatever the reward tokens are doing.
            </Faq>
            <Faq q="Can the team rug?">
              Here is the honest map. Nobody can print AVIANS, pause it, blacklist an address or
              upgrade it — the token has no owner. Nobody can move the perch&rsquo;s AVIANS or its
              birds, change 90,000/110,000/115,000, lower the mint price, redirect mint proceeds,
              touch your stake or your accrued rewards, shorten the liquidity lock, or change the
              opening window and its 1%. Ownership can&rsquo;t even be renounced, so a lost key would
              stop new configuration but never stop trading, minting, redeeming or unstaking.
              <br /><br />
              What the owner <em>can</em> do: open and close mints, raise the price, set allowlists,
              set the royalty, and whitelist the marketplaces allowed to move a bird on your behalf.
              The price has a floor{c ? <> of {avians(c.minPrice)}</> : null} and no ceiling, so it
              can be raised as far as the owner likes. The royalty has no ceiling either beyond the 100% the standard itself
              allows.
              <br /><br />
              And the Treasury: the owner may take 20% of everything that reaches it — the pool&rsquo;s
              1%, the royalties, and the perch&rsquo;s fee half — plus 100% of any AVIANS that
              reaches it. Two things bound that. The 20% is a constant with no setter, so no key can
              raise it. And it is reserved rather than merely claimable: a conversion can only ever
              spend the other 80%, however long the share goes unclaimed.
            </Faq>
            <Faq q="The free mint — what's the catch?">
              There isn&rsquo;t one, and it also isn&rsquo;t free money. A free bird is a real Avian:
              composed the same way, in the same register, with its own wallet, and it can be sold to
              the perch for the same 90,000 AVIANS as any bird that was paid for. It&rsquo;s{' '}
              {c ? formatCount(c.freeAllocation) : '2,000'} birds, one per allowlisted wallet. If the door has been open 24 hours and some are
              unclaimed, the rest can be released to the paid mint.
            </Faq>
            <Faq q={c ? `Why ${avians(c.minPrice)} and not less?` : 'Why is there a floor under the price?'}>
              Because the perch has to be able to pay 90,000 for every bird that exists, forever. A
              cheaper mint could drain it. The floor under the price is there to keep the floor under
              the birds.
            </Faq>
            <Faq q="Why was my bird burnt when I sold it?">
              Because it was the hundredth into the perch. The perch destroys one bird for every
              hundred sold to it, and the one it takes is whichever lands on the count — which can
              be yours. You were paid the full 90,000 for it, the same as any other sale. Nothing
              was deducted and the burn moved no AVIANS at all.
              <br /><br />
              The sell screen shows how many sales are left before the next one and names the bird
              in your list it would fall on. It says <em>likely</em> rather than <em>will</em>,
              because anyone else selling in between moves the count — the receipt afterwards is the
              only certain answer. A burnt bird is gone: nobody owns it, its combination can never
              be minted again by anyone, and its wallet and whatever is inside it are unreachable.
            </Faq>
            <Faq q="What's a bird's wallet for?">
              Anything you like. Every Avian has its own account from the moment it&rsquo;s minted —
              it can hold tokens, other NFTs, even other birds. Whoever holds the bird controls the
              wallet. When it broods, the wallet is locked with it; nothing is lost and nothing is
              reachable until it comes home.
            </Faq>
          </div>
          <p style={{ marginTop: 32 }}>
            <a className="small" href={href({ name: 'docs' })}>
              Every number, every guarantee, and exactly what the owner can do{' '}
              <Icon name="arrow" size={13} color="var(--accent)" />
            </a>
          </p>
        </div>
      </section>

      <section className={s.sec} style={{ textAlign: 'center', paddingBottom: 80 }}>
        <div className={s.band} style={{ marginBottom: 44 }}>
          {GALLERY.map((t) => <Avian key={t.join('-')} traits={t} size={72} alt="An Avian" />)}
        </div>
        <h2 style={{ maxWidth: 1000, margin: '0 auto' }}>
          1,866,240 birds are possible. 5,555 will exist.<br />
          One of them is a decision you haven&rsquo;t made yet.
        </h2>
        <div style={{ marginTop: 36 }}>
          <a className="btn" href={href({ name: 'compose' })}>
            Compose your Avian <Icon name="arrow" size={16} color="var(--ink)" />
          </a>
        </div>
        <p className="small" style={{ marginTop: 20 }}>
          <a href={href({ name: 'flock' })}>See the flock</a>
          <span className="dim"> · </span>
          <a href={href({ name: 'perch' })}>Read how the perch works</a>
        </p>
      </section>

      <Footer />
    </>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div className={s.faq}>
      <h4>{q}</h4>
      <p className="small" style={{ margin: 0 }}>{children}</p>
    </div>
  );
}
