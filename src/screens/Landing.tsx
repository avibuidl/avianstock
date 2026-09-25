// The landing page. The numbers that an owner can move come from the mock
// layer rather than the copy, so they are live; the ones the contracts fix
// (90,000, 5,555, 1,866,240) are written down.

import { useState } from 'react';
import s from './Landing.module.css';
import { Icon } from '../components/Icon';
import { Avian, Swatch, Tag, Unread } from '../components/Primitives';
import { Footer } from '../components/Footer';
import { FlywheelSnapshotSection } from '../components/Flywheel';
import { CATEGORIES } from '../art/traits';
import { comboHex, packCombo, type TraitIndices } from '../art/render';
import { avians, formatCount } from '../lib/format';
import { href } from '../router';
import { useCollection } from '../mock';

// The hero bird and the row of hats beneath it are the same bird: one plumage,
// Wideawake eyes, a Seedcracker bill, a bare throat. Only the headwear moves.
// The big preview keeps its background because a background is one of the six
// choices and every real Avian has one; the swatches drop it so the hat is
// the only thing changing.
const HERO_FACE = { plumage: 6, eyes: 0, beak: 0 };
const HERO: TraitIndices = [5, HERO_FACE.plumage, HERO_FACE.eyes, HERO_FACE.beak, 0, 7];
const GALLERY: TraitIndices[] = [
  [1, 4, 14, 1, 3, 4], [11, 10, 12, 7, 1, 12], [3, 2, 6, 5, 1, 4], [7, 8, 10, 2, 4, 10],
  [9, 5, 3, 8, 2, 15], [0, 11, 13, 0, 5, 8], [6, 9, 1, 6, 3, 13], [2, 1, 4, 3, 0, 1],
];
// One swatch per category, the six choices of the bird at the top of the page.
const SIX: TraitIndices = [1, 4, 14, 1, 3, 4];

export function Landing({ onTrade }: { onTrade: () => void }) {
  const collection = useCollection();
  const [hw, setHw] = useState(7);
  const c = collection.data;
  const hero = HERO.slice() as number[];
  hero[5] = hw;

  return (
    <>
      <section className={s.hero}>
        <div className={s.heroCopy}>
          <h1>The first composable PFP collection on Robinhood Chain</h1>
          <p className="lede" style={{ maxWidth: 560 }}>
            Build your birds by choosing their attributes. No reveal, no duplicates: once a bird is
            minted, nobody can mint it again.
          </p>
          <div className="row row--wrap" style={{ gap: 20, marginTop: 32 }}>
            <a className="btn" href={href({ name: 'compose' })}>
              Compose a bird <Icon name="arrow" size={16} color="var(--ink)" />
            </a>
            <a className="small" href={href({ name: 'flock' })}>See the flock</a>
          </div>
        </div>

        {/* One bird mid-composition, not a grid of birds. The point of the
            page is the act of choosing, so the headwear row here really works. */}
        <div className={`panel panel--tight ${s.heroArt}`}>
          <div className={`row ${s.heroStatus}`} style={{ marginBottom: 14 }}>
            <Tag tone="ok">Available</Tag>
            <span className="spacer" />
            <span className="label">Live preview</span>
          </div>
          <Avian traits={hero as unknown as TraitIndices} alt="A bird being composed" />
          <div style={{ marginTop: 16 }}>
            <div className="row" style={{ marginBottom: 10 }}>
              <h4>Headwear</h4>
              <span className="spacer" />
              <span className="mono" style={{ color: 'var(--accent)', fontSize: 13 }}>
                {CATEGORIES[5].traits[hw].display}
              </span>
            </div>
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
            <p className={`tiny dim ${s.heroCaption}`} style={{ marginTop: 12 }}>
              Change any one of the six and the bird changes with it.
            </p>
          </div>
        </div>
      </section>

      {/*
        Three figures, none of them written down here: the owner can raise the
        price with `setPrice` and the two counts move with every mint. A read
        that has not landed shows a blank block, never a zero.
      */}
      <div className={s.stripRow}>
        <div className={s.stripCell}>
          <span className="num">{c ? formatCount(c.totalMinted) : <Unread />}</span>
          <span className="label">of {c ? formatCount(c.maxSupply) : '5,555'} minted</span>
        </div>
        <div className={s.stripCell}>
          <span className="num">{c ? formatCount(c.reservedFree) : <Unread />}</span>
          <span className="label">free birds left</span>
        </div>
        <div className={s.stripCell}>
          <span className="num">{c ? avians(c.price) : <Unread />}</span>
          <span className="label">to mint one</span>
        </div>
      </div>

      <section className={s.sec}>
        <h2>How this mint is different.</h2>
        <div className={s.four}>
          <div>
            <div className="strip">
              {CATEGORIES.map((cat, i) => (
                <Swatch key={cat.key} category={cat.id} index={SIX[i]} traitOnly label={`${cat.display}: ${cat.traits[SIX[i]].display}`} />
              ))}
            </div>
            <h4 style={{ marginTop: 18 }}>You choose all six.</h4>
            <p className="small">
              Background, plumage, eyes, beak, neckwear, headwear. Seventy traits over one locked
              base. No roll, no reveal.
            </p>
          </div>
          <div>
            <div className="row" style={{ gap: 12 }}>
              <span className="mono" style={{ fontSize: 22, color: 'var(--text-strong)' }}>{comboHex(packCombo(SIX))}</span>
              <Tag tone="bad">Taken</Tag>
            </div>
            <h4 style={{ marginTop: 18 }}>Nobody can remint the same bird.</h4>
            <p className="small">
              Every minted combination goes into a register on the chain. 1,866,240 birds are
              possible. 5,555 will ever be minted. A repeat is refused, permanently.
            </p>
          </div>
          <div>
            <h4>Nothing is rare because we said so.</h4>
            <p className="small">
              There are no caps on any trait. Whatever turns out rare is rare because few people
              chose it, and we find out at the same time you do.
            </p>
          </div>
          {/*
            A TEASER (2026-09-25), in the Perch tile's place: "Join the Aviary"
            says what the Perch does now (its step 6). The idea only, the same
            whether or not the trait market is unveiled: no fee, no currency,
            no contract, no link. The bird page's own cells stay behind
            `unveiled('traitMarket')`, and the unveiling is its own change.
            Beside the third tile, which has no picture either, so the row's
            two headings stand level.
          */}
          <div>
            {/* The tag rides the heading's line and adds nothing to its height, so the
                heading and the paragraph stand level with the third tile's. */}
            <h4>
              A bird is not finished at mint.
              <span style={{ display: 'inline-block', verticalAlign: 'middle', margin: '-6px 0 -6px 10px' }}>
                <Tag>Soon</Tag>
              </span>
            </h4>
            <p className="small">
              Later, holders will be able to trade traits between their birds, without selling
              either one. More when it opens.
            </p>
          </div>
        </div>
      </section>

      <section className={s.sec}>
        <h2>Join the Aviary.</h2>
        {/*
          Two rows of three (2026-09-25), reading 1-2-3 then 4-5-6: the same
          grid, the same rule over each step, the row gap the column gap. The
          figures are the contracts' own: the tier costs, the Perch's price
          for the next bird, one in a hundred burnt.
        */}
        <div className={s.steps} style={{ marginTop: 32 }}>
          <div className={s.step}>
            <div className="row">
              <span className="numbox" aria-hidden="true">1</span>
              <h4>Get AVIAN</h4>
            </div>
            <p className="small">
              On the pool, from the Trade AVIAN button in the menu. Buying the token mints
              nothing; that is the next step.
            </p>
          </div>
          <div className={s.step}>
            <div className="row">
              <span className="numbox" aria-hidden="true">2</span>
              <h4>Compose a bird</h4>
            </div>
            <p className="small">
              One pick in each of six categories. Combinations already taken are marked before
              you sign anything.
            </p>
          </div>
          <div className={s.step}>
            <div className="row">
              <span className="numbox" aria-hidden="true">3</span>
              <h4>Mint it</h4>
            </div>
            <p className="small">
              It is yours, it has its own wallet, and its 100,000 AVIAN backing goes to the Perch.
            </p>
          </div>
          <div className={s.step}>
            <div className="row">
              <span className="numbox" aria-hidden="true">4</span>
              <h4>Brood it</h4>
            </div>
            <p className="small">
              In the Nest, for 10,000, 30,000 or 50,000 AVIAN. AVIAN and stock tokens stream to
              its own wallet.
            </p>
          </div>
          <div className={s.step}>
            <div className="row">
              <span className="numbox" aria-hidden="true">5</span>
              <h4>Stake AVIAN</h4>
            </div>
            <p className="small">
              Stake AVIAN in the Roost to earn more AVIAN tokens.
            </p>
          </div>
          <div className={s.step}>
            <div className="row">
              <span className="numbox" aria-hidden="true">6</span>
              <h4>Use the Perch</h4>
            </div>
            <p className="small">
              The Perch buys and sells birds for AVIAN, the next one for 110,000. One in every
              hundred sold to it is burnt.
            </p>
          </div>
        </div>
      </section>

      {/*
        The flywheel snapshot (2026-09-22): the figures a visitor checks before
        minting, staking or buying a bird, read from the chain at one block. It
        took the brooding band's place. The stock-token disclosure it carried
        went on 2026-09-25: the footer's statement covers the site.
      */}
      <section className="band">
        <div className={s.sec}>
          <FlywheelSnapshotSection onTrade={onTrade} />
        </div>
      </section>

      <section className={s.sec}>
        <h2>Questions</h2>
        <div style={{ marginTop: 28 }}>
          <Faq q="Is 90,000 AVIAN a floor price?">
            It is a standing offer in tokens, not in dollars or ETH. The perch always pays 90,000
            AVIAN for a bird. What that is worth is whatever the market says, and it can be
            anything.
          </Faq>
          <Faq q="Are the rewards stocks?">
            No. NVDA, SPY, SPCX and AAPL here are tokenized stock products issued and controlled by
            Robinhood: not stocks, shares, dividends or equity. Robinhood can pause them or freeze
            an address, including ours. We have no relationship with Robinhood, NVIDIA, SpaceX,
            Apple or S&amp;P.
          </Faq>
          <Faq q="How much will I earn from brooding?">
            Possibly nothing. The stream depends on income arriving, on pools other people provide,
            and on the issuer not pausing the tokens. There is no yield, no APY and no promise.
          </Faq>
          <Faq q="Can the team rug?">
            No. Nobody can print AVIAN, move the perch&rsquo;s AVIAN or its birds, change its
            prices, lower the mint price, redirect a mint payment, or touch a brooding bird. The
            admin can open and close the mints, set the allowlist, configure royalties, and
            collect the protocol&rsquo;s share of proceeds.{' '}
            <a href={href({ name: 'docs' })}>The full list, contract by contract.</a>
          </Faq>
          <Faq q={c ? `Where does the ${avians(c.price)} go?` : 'Where does the mint payment go?'}>
            To the perch, in the same transaction. We cannot hold it and we cannot redirect it.
            The price can never go below {c ? avians(c.minPrice) : 'its floor'}, because the perch
            has to be able to pay 90,000 AVIAN for every bird, forever.
          </Faq>
          <Faq q="The free mint: what is the catch?">
            None, and it is not free money. A free bird is a real bird: same traits, same wallet,
            same 90,000 AVIAN from the perch. {c ? formatCount(c.freeAllocation) : '2,000'} of
            them, one per allowlisted wallet. Once the free door has been open for 24 hours, any
            still unclaimed can be released to the paid mint.
          </Faq>
        </div>
      </section>

      <section className={`${s.sec} ${s.close}`}>
        <div className={s.birds}>
          {GALLERY.map((t) => <Avian key={t.join('-')} traits={t} size={72} alt="An Avian" />)}
        </div>
        <h2 style={{ maxWidth: 900, margin: '0 auto' }}>
          1,866,240 birds are possible. 5,555 will ever be minted.<br />
          One of them is a decision you haven&rsquo;t made yet.
        </h2>
        <div style={{ marginTop: 32 }}>
          <a className="btn" href={href({ name: 'compose' })}>
            Compose a bird <Icon name="arrow" size={16} color="var(--ink)" />
          </a>
        </div>
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

