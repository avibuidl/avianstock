// Documentation.
//
// The reference page: why the register is the whole product, every number in
// one table, what the contracts guarantee, how the art is built, exactly what
// the owner can and cannot do, the order the launch happens in, and a glossary
// between the words in the code and the words on the site.
//
// Sourced from LORE-BRIEF.md Parts A and B and the appendix. Every number here
// is canon and unrounded.

import { useEffect, useRef, useState } from 'react';
import s from './Docs.module.css';
import { Icon } from '../components/Icon';
import { StockDisclaimer } from '../components/Primitives';
import { avians, formatBps, rewardSplitLine } from '../lib/format';
import { href } from '../router';
import { useCollection, useRewardSplit } from '../mock';

const SECTIONS = [
  ['choose', 'Why “you choose” was the hard part'],
  ['numbers', 'The numbers, all of them'],
  ['guarantees', 'What the contracts guarantee'],
  ['art', 'The art, as built'],
  ['powers', 'Who can do what'],
  ['sequence', 'The order it happens in'],
  ['words', 'The words'],
] as const;

export function Docs() {
  // This page states the collection's numbers, and three of them are the
  // owner's to change: the price, the floor it may not go under (an immutable,
  // but a constructor argument rather than a literal), and the royalty — which
  // the admin panel can now set to anything up to 100%. A reference page that
  // is confidently out of date is worse than one that says it does not know,
  // so where a read has not landed the figure is an em-dash in a table and
  // simply absent in prose.
  const collection = useCollection();
  const c = collection.data;
  // Which tokens earn and in what proportion: both owner-set, neither a
  // constant. This row said "equal parts" and was read from nothing.
  const split = useRewardSplit();
  const [active, setActive] = useState<string>(SECTIONS[0][0]);
  const refs = useRef<Record<string, HTMLElement | null>>({});

  // Mark the section you are actually reading, not the one you clicked.
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        const seen = entries.filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (seen?.target.id) setActive(seen.target.id);
      },
      { rootMargin: '-96px 0px -60% 0px' },
    );
    Object.values(refs.current).forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  // In-page anchors would fight the hash router, so scroll rather than navigate.
  const go = (id: string) => {
    refs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActive(id);
  };

  const section = (id: string, title: string, children: React.ReactNode) => (
    <section
      id={id}
      className={s.sec}
      ref={(el) => { refs.current[id] = el; }}
      aria-labelledby={`${id}-h`}
    >
      <h2 id={`${id}-h`}>{title}</h2>
      {children}
    </section>
  );

  return (
    <div className={s.wrap}>
      <nav className={s.toc} aria-label="On this page">
        <p className="eyebrow" style={{ margin: '0 0 8px' }}>On this page</p>
        {SECTIONS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={s.tocItem}
            aria-current={active === id}
            onClick={() => go(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      <div>
        <p className="eyebrow">Documentation</p>
        <h1 style={{ fontSize: 'clamp(34px, 4.4vw, 54px)' }}>How it works, in full.</h1>
        <p className="lede" style={{ maxWidth: 720 }}>
          Everything the contracts actually do, with the real numbers. Nothing here is aspirational
          and nothing is rounded.
        </p>

        <div style={{ marginTop: 40 }}>
          {/* ── moved from the front page, unchanged ─────────────────── */}
          {section('choose', 'Why “you choose” was the hard part', (
            <div className={s.two} style={{ marginTop: 24 }}>
              <p className="lede" style={{ marginTop: 0 }}>
                Letting people pick is easy. Guaranteeing nobody picks the same thing is not. The
                moment a mint is chosen rather than rolled, the chain has to keep a register — and
                refuse, in the same transaction, any combination that already exists. That refusal is
                the whole product. It&rsquo;s why there&rsquo;s no reveal, no waiting and no chance
                you and a stranger end up with the same bird in different wallets.
              </p>
              <div>
                <p className="lede" style={{ marginTop: 0 }}>
                  Everything else follows from it. Seventy traits over one locked base. One light,
                  from the upper left, on every bird ever made. A palette called Nightjar,
                  forty-eight colours deep, drawn for birds that are awake when the markets are shut.
                  And a perch that will always take a bird back, so that changing your mind costs you
                  a transaction rather than a search for a buyer.
                </p>
                <p style={{ marginTop: 28 }}>
                  <a className="small" href={href({ name: 'perch' })}>
                    Read how the perch works <Icon name="arrow" size={13} color="var(--accent)" />
                  </a>
                </p>
              </div>
            </div>
          ))}

          {section('numbers', 'The numbers, all of them', (
            <>
              <div className="scroll-x">
                <table className="table" style={{ marginTop: 28 }}>
                  <tbody>
                    <tr><td>Birds that will ever exist</td><td>5,555</td></tr>
                    <tr><td>Free birds, one per allowlisted wallet</td><td>2,000</td></tr>
                    <tr><td>Paid birds</td><td>3,555 + any free birds released unclaimed</td></tr>
                    <tr><td>Price of a bird</td><td>{c ? avians(c.price) : '—'} — never ETH</td></tr>
                    <tr><td>Can the price change?</td><td>Raised, yes. Never below {c ? avians(c.minPrice) : '—'}</td></tr>
                    <tr><td>The perch buys any bird for</td><td>90,000 AVIANS, instantly, always</td></tr>
                    <tr><td>The perch sells the next bird for</td><td>110,000 AVIANS — or 115,000 for a specific one</td></tr>
                    <tr><td>Perch fees</td><td>50% burned, 50% to the Treasury</td></tr>
                    <tr><td>Birds burnt by the perch</td><td>one in every 100 sold to it</td></tr>
                    <tr><td>Brooding tiers (burned)</td><td>5,000 / 15,000 / 25,000 AVIANS for 1x / 2x / 3x weight</td></tr>
                    <tr><td>Reward tokens</td><td>{rewardSplitLine(split.data)}</td></tr>
                    <tr><td>AVIANS supply</td><td>1,000,000,000, minted once, no owner</td></tr>
                    <tr><td>In the launch pool</td><td>800,000,000 AVIANS, single-sided</td></tr>
                    <tr><td>Behind the free birds</td><td>200,000,000 AVIANS, moving to the perch as each is claimed</td></tr>
                    <tr><td>Opening window</td><td>5 minutes; buy fee 25% → ~1%; max 50,000,000 AVIANS per transaction</td></tr>
                    <tr><td>Pool fee afterwards</td><td>1% of the ETH side, both directions, forever</td></tr>
                    <tr><td>Liquidity lock</td><td>365 days minimum, extendable, never shortenable</td></tr>
                    <tr>
                      <td>Royalty</td>
                      <td>
                        {c ? (c.royaltyBps === 0 ? 'None' : `${formatBps(c.royaltyBps)}, to the Treasury`) : '—'}
                      </td>
                    </tr>
                    <tr><td>Art</td><td>32 × 32, 48 colours, 70 traits, 6 categories, 100% on-chain</td></tr>
                    <tr><td>The whole collection, on one contract</td><td>12,872 bytes</td></tr>
                    <tr><td>Possible combinations</td><td>1,866,240</td></tr>
                    <tr><td>Wallets per bird</td><td>1, from the moment it is minted</td></tr>
                    <tr><td>Review passes the art went through</td><td>13, all judged at 1:1 pixel scale</td></tr>
                  </tbody>
                </table>
              </div>

              <p className="eyebrow" style={{ marginTop: 40 }}>Where the money goes, in one line each</p>
              <div className={s.money}>
                <div><p className="small" style={{ margin: 0 }}>
                  A paid mint&rsquo;s {c ? avians(c.price) : 'payment'} → the perch, same transaction, never us.
                </p></div>
                <div><p className="small" style={{ margin: 0 }}>Pool fees and royalties → the Treasury → converted to stock tokens for the nest, with the admin capped at 20% of what comes in.</p></div>
                <div><p className="small" style={{ margin: 0 }}>Brooding tiers → burned, gone from the supply entirely.</p></div>
              </div>
            </>
          ))}

          {section('guarantees', 'What the contracts guarantee', (
            <>
              <p className="lede" style={{ maxWidth: 760 }}>
                Each of these is a tested property of the contracts rather than a policy anyone
                keeps.
              </p>
              <div className={s.rules} style={{ marginTop: 28 }}>
                <div>
                  <h4>You compose your bird; you are not dealt one.</h4>
                  <p className="small">
                    One option in each of the six categories, against the locked base. If that exact
                    combination already exists the mint is refused. No random roll, no reveal, no
                    waiting.
                  </p>
                </div>
                <div>
                  <h4>Nothing is rare by decree.</h4>
                  <p className="small">
                    There are no per-trait caps. Whatever is rare is rare because few people chose
                    it. Rarity is social, not scheduled, and nobody — including the owner — can
                    arrange it in advance.
                  </p>
                </div>
                <div>
                  <h4>The mint is paid in AVIANS, and the payment does not come to us.</h4>
                  <p className="small">
                    It goes, in the same transaction, to the buy-back perch that will buy the bird
                    back. The collection contract never holds a paid mint&rsquo;s proceeds and the
                    owner cannot redirect them.
                  </p>
                </div>
                <div>
                  <h4>Every bird can always be sold back for 90,000 AVIANS.</h4>
                  <p className="small">
                    The perch always holds enough to pay it — a proven invariant, which is why the
                    mint price has a floor{c ? ` of ${avians(c.minPrice)}` : ''}: a cheaper mint
                    could drain it. The owner cannot move the perch&rsquo;s AVIANS or its birds.
                  </p>
                </div>
                <div>
                  <h4>One bird in every hundred sold to the perch is burnt.</h4>
                  <p className="small">
                    The perch counts every paid sale into it — pull or push, resales included, never
                    a registration — and the bird whose arrival makes that count a multiple of a
                    hundred is destroyed in the same transaction. Its seller is paid the usual
                    90,000, in full. No AVIANS move for the burn: a bird sitting in the perch has no
                    reserves behind it, because they went to whoever sold it. What the pool gives up
                    is the 110,000 it would have made selling that bird on.
                  </p>
                  <p className="tiny dim" style={{ marginTop: 10 }}>
                    The number burnt is bounded by sales, not by the collection: the same bird sold
                    and bought back repeatedly counts every time. A burnt bird&rsquo;s id is never
                    reused, its six choices stay taken forever, and its wallet is orphaned — whatever
                    is inside it stays there. The sell screen shows the countdown and names the bird
                    it would land on before you sign.
                  </p>
                </div>
                <div>
                  <h4>One bird in every hundred sold to the perch is burnt.</h4>
                  <p className="small">
                    The perch counts every paid sale into it — pull or push, resales included, never
                    a registration — and the bird whose arrival makes that count a multiple of a
                    hundred is destroyed in the same transaction. Its seller is paid the usual
                    90,000, in full. No AVIANS move for the burn: a bird sitting in the perch has no
                    reserves behind it, because they went to whoever sold it. What the pool gives up
                    is the 110,000 it would have made selling that bird on.
                  </p>
                  <p className="tiny dim" style={{ marginTop: 10 }}>
                    The number burnt is bounded by sales, not by the collection: the same bird sold
                    and bought back repeatedly counts every time. A burnt bird&rsquo;s id is never
                    reused, its six choices stay taken forever, and its wallet is orphaned — whatever
                    is inside it stays there. The sell screen shows the countdown and names the bird
                    it would land on before you sign.
                  </p>
                </div>
                <div>
                  <h4>One bird in every hundred sold to the perch is burnt.</h4>
                  <p className="small">
                    The perch counts every paid sale into it — pull or push, resales included, never
                    a registration — and the bird whose arrival makes that count a multiple of a
                    hundred is destroyed in the same transaction. Its seller is paid the usual
                    90,000, in full. No AVIANS move for the burn: a bird sitting in the perch has no
                    reserves behind it, because they went to whoever sold it. What the pool gives up
                    is the 110,000 it would have made selling that bird on.
                  </p>
                  <p className="tiny dim" style={{ marginTop: 10 }}>
                    The number burnt is bounded by sales, not by the collection: the same bird sold
                    and bought back repeatedly counts every time. A burnt bird&rsquo;s id is never
                    reused, its six choices stay taken forever, and its wallet is orphaned — whatever
                    is inside it stays there. The sell screen shows the countdown and names the bird
                    it would land on before you sign.
                  </p>
                </div>
                <div>
                  <h4>The token has no owner.</h4>
                  <p className="small">
                    No mint function, no pause, no blacklist, no tax, no upgrade. One billion, once.
                    Nobody can make more.
                  </p>
                </div>
                <div>
                  <h4>The opening cannot be bent.</h4>
                  <p className="small">
                    Five minutes, a buy fee starting at 25% and falling to about 1%, and no
                    transaction may buy more than 50,000,000 AVIANS. Then 1% both ways, forever. The
                    hook enforcing it has no owner and no settings.
                  </p>
                </div>
                <div>
                  <h4>The liquidity is locked.</h4>
                  <p className="small">
                    In a vault, for at least 365 days. The lock can be extended. It cannot be
                    shortened.
                  </p>
                </div>
                <div>
                  <h4>Brooding is custodial, and the offering is burned.</h4>
                  <p className="small">
                    A bird broods at tier 1, 2 or 3; the tier&rsquo;s cost is burned and the supply
                    falls. The weight lasts that stay and is gone when the bird comes home.
                  </p>
                </div>
                <div>
                  <h4>A bird always comes home.</h4>
                  <p className="small">
                    Whatever the reward tokens do — paused, frozen, empty — unstaking never touches
                    them, so nothing about a reward token can trap a bird.
                  </p>
                </div>
                <div>
                  <h4>Every bird has a wallet.</h4>
                  <p className="small">
                    From the moment it is minted. It can hold tokens, other NFTs, even other birds.
                    Whoever holds the bird controls the wallet; while it broods, the wallet is locked
                    with it and nothing inside is lost.
                  </p>
                </div>
                <div>
                  <h4>The royalty is enforced on-chain.</h4>
                  <p className="small">
                    Only marketplaces on the whitelist may move a bird on your behalf, so one that
                    ignores the royalty{c && c.royaltyBps > 0 ? ` — currently ${formatBps(c.royaltyBps)} — ` : ' '}
                    can be kept off the list. Sending a bird to another person yourself is free and
                    always allowed.
                  </p>
                </div>
                <div>
                  <h4>Ownership cannot be renounced.</h4>
                  <p className="small">
                    A lost key would stop configuration — opening a mint not yet open, releasing
                    unclaimed free birds. It would never stop trading, minting, redeeming or
                    unstaking.
                  </p>
                </div>
              </div>
            </>
          ))}

          {section('art', 'The art, as built', (
            <>
              <div className={s.two} style={{ marginTop: 24 }}>
                <div>
                  <h4>One bird, one base.</h4>
                  <p className="small">
                    Every Avian shares a single locked silhouette — the owlish base: round-skulled,
                    front-facing, broad-breasted, wings folded with their creases running to the
                    bottom of the frame. Plumage, neckwear, eyes, beak and headwear are painted over
                    and around it. Nobody composes the base and nobody can change it.
                  </p>

                  <h4 style={{ marginTop: 28 }}>One light.</h4>
                  <p className="small">
                    The whole collection is lit from the upper left, slightly above, frontal — the
                    same direction for every bird, every trait, every background. Skulls are lit as
                    spheres, breasts as cylinders, each wing as its own narrower cylinder. Nothing is
                    flat-filled. One sun, one hour, one flock.
                  </p>

                  <h4 style={{ marginTop: 28 }}>One palette, Nightjar.</h4>
                  <p className="small">
                    Near-black ink against saturated jewel plumage, five steps deep per hue,
                    forty-eight colours in all. Its recorded mood is nocturnal and high-contrast.
                    Hue families: neutral, keratin for the bill, crimson, teal, violet, moss, azure
                    and rose, plus eye-white, gold and one signal colour.
                  </p>
                </div>

                <div>
                  <h4>A fixed order of layers.</h4>
                  <p className="small">
                    Background, plumage, the base outline, neckwear, eyes, beak, headwear — painted
                    in that order every time. Row 18 of the canvas belongs to no trait at all: it is
                    the deliberate gap between the eyes and the bill, on every bird, forever.
                  </p>

                  <h4 style={{ marginTop: 28 }}>Thirteen gates.</h4>
                  <p className="small">
                    Every one judged at 1:1 pixel scale, because a downscaled contact sheet flatters
                    pixel art and hides what is wrong with it. A spotted plumage was rebuilt because
                    it shared a head with its neighbour. A crest moved one column, because the eye
                    reads a tuft from where it is rooted rather than from its bounding box. A
                    lightning bolt was redrawn three times until it stopped reading as a Z.
                  </p>

                  <h4 style={{ marginTop: 28 }}>Entirely on-chain.</h4>
                  <p className="small">
                    The whole collection&rsquo;s pixels live in one 12,872-byte contract, and the
                    image is rendered from chain state. No server, no IPFS, no link that can die. If
                    the chain is there, the birds are there.
                  </p>
                </div>
              </div>

              <div className={s.facts} style={{ marginTop: 32 }}>
                <div><div className="num" style={{ fontSize: 22 }}>32 × 32</div><div className="tiny dim" style={{ marginTop: 4 }}>PIXELS</div></div>
                <div><div className="num" style={{ fontSize: 22 }}>48</div><div className="tiny dim" style={{ marginTop: 4 }}>COLOURS</div></div>
                <div><div className="num" style={{ fontSize: 22 }}>70</div><div className="tiny dim" style={{ marginTop: 4 }}>TRAITS, PLUS THE LOCKED BASE</div></div>
              </div>
            </>
          ))}

          {section('powers', 'Who can do what', (
            <>
              <p className="lede" style={{ maxWidth: 760 }}>
                The honest map, contract by contract. The right-hand column is the part worth
                reading.
              </p>
              <div className="scroll-x" style={{ marginTop: 24 }}>
                <table className="table" style={{ minWidth: 720 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 150 }}>Contract</th>
                      <th>The owner can</th>
                      <th style={{ textAlign: 'left' }}>The owner cannot</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>AVIANS, the token</td>
                      <td className="small">Nothing. It has no owner.</td>
                      <td className="small" style={{ textAlign: 'left', fontFamily: 'inherit', fontSize: 13 }}>Mint, pause, tax, blacklist or upgrade.</td>
                    </tr>
                    <tr>
                      <td>The birds</td>
                      <td className="small">Open and close mints, raise the price — the floor is {c ? avians(c.minPrice) : 'set at deployment'} and there is no ceiling — set allowlists, set the royalty, which is bounded only by the 100% the ERC-2981 standard itself allows, and whitelist the marketplaces allowed to move a bird on your behalf.</td>
                      <td className="small" style={{ textAlign: 'left', fontFamily: 'inherit', fontSize: 13 }}>Lower the price below {c ? avians(c.minPrice) : 'that floor'}, redirect mint proceeds, mint without paying, or renounce ownership.</td>
                    </tr>
                    <tr>
                      <td>The perch</td>
                      <td className="small">Set who receives the fee half; rescue tokens that are not AVIANS.</td>
                      <td className="small" style={{ textAlign: 'left', fontFamily: 'inherit', fontSize: 13 }}>Move the perch&rsquo;s AVIANS, move its birds, or change 90,000 / 110,000 / 115,000.</td>
                    </tr>
                    <tr>
                      <td>The nest</td>
                      <td className="small">List and retire reward tokens; set who may fund a stream.</td>
                      <td className="small" style={{ textAlign: 'left', fontFamily: 'inherit', fontSize: 13 }}>Touch your stake, or touch rewards you have already accrued.</td>
                    </tr>
                    <tr>
                      <td>The Treasury</td>
                      <td className="small">Claim 20% of what arrives — and all of any AVIANS that arrives — set conversion guardrails, targets and routes. A conversion runs at most once every 24 hours, on one clock shared by every currency, and the owner cannot configure it any faster.</td>
                      <td className="small" style={{ textAlign: 'left', fontFamily: 'inherit', fontSize: 13 }}>Take more than 20%, or send a conversion anywhere but the nest.</td>
                    </tr>
                    <tr>
                      <td>The launch hook</td>
                      <td className="small">Nothing. It has no owner.</td>
                      <td className="small" style={{ textAlign: 'left', fontFamily: 'inherit', fontSize: 13 }}>Change the 1%, the five-minute window or the per-transaction cap.</td>
                    </tr>
                    <tr>
                      <td>The Vault</td>
                      <td className="small">Extend the lock, collect fees, withdraw after it unlocks.</td>
                      <td className="small" style={{ textAlign: 'left', fontFamily: 'inherit', fontSize: 13 }}>Shorten the lock.</td>
                    </tr>
                  </tbody>
                </table>
              </div>

            </>
          ))}

          {section('sequence', 'The order it happens in', (
            <>
              <p className="lede" style={{ maxWidth: 760 }}>
                The order is fixed even though the clock is not. We won&rsquo;t post a date we might
                have to move.
              </p>
              <div className={s.steps} style={{ marginTop: 28 }}>
                {[
                  ['Contracts deployed, art on chain', 'Nothing is mintable yet.'],
                  ['The allowlist is collected', 'Snapshots, sign-ups, and addresses added by hand.'],
                  ['Enforcement, the flywheel and the reward list are configured', 'NVDA, SPY, SPCX and AAPL are listed. Nothing streams yet, because nothing has earned yet.'],
                  ['The pool launches', '800,000,000 AVIANS, single-sided, at a published time — and the five-minute window runs.'],
                  ['The free mint opens', 'The allowlist root is set; 2,000 birds, one per listed wallet.'],
                  ['The paid mint opens', `${c ? avians(c.price) : 'A fixed price in AVIANS'} each, and several may be minted in one transaction.`],
                  ['The flywheel turns', 'Brooding is live from deployment; the stream starts once fees and royalties have actually arrived and somebody triggers a conversion.'],
                  ['Unclaimed free birds may be released', 'Only after the free door has been open for a total of 24 hours.'],
                ].map(([title, body], i) => (
                  <div key={title} className={s.step}>
                    <span className="numbox" aria-hidden="true">{i + 1}</span>
                    <div>
                      <h4>{title}</h4>
                      <p className="small">{body}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 28, maxWidth: 860 }}><StockDisclaimer /></div>
            </>
          ))}

          {section('words', 'The words', (
            <>
              <p className="lede" style={{ maxWidth: 760 }}>
                What things are called in the contracts, and what we call them here.
              </p>
              <div className="scroll-x">
                <table className="table" style={{ marginTop: 24 }}>
                  <thead>
                    <tr><th style={{ width: 260 }}>In the code</th><th style={{ textAlign: 'left' }}>On this site</th></tr>
                  </thead>
                  <tbody>
                    {[
                      ['ThePerch', 'the perch — the buy-back pool'],
                      ['mint(bg, plumage, eyes, beak, neckwear, headwear)', 'composing and minting a bird'],
                      ['comboTaken', 'the register — “that bird already exists”'],
                      ['ERC-6551 token-bound account', 'the satchel — the bird’s own wallet'],
                      ['ERC-721C transfer validator', 'the Gate — on-chain royalty enforcement'],
                      ['Uniswap v4 pool + hook', 'the launch pool and its 1%'],
                      ['LAUNCH_AT, WINDOW', 'First Light — the opening time and the five minutes'],
                      ['LiquidityVault', 'the Vault — the 365-day liquidity lock'],
                      ['TheNest, tiers, weight', 'the nest, the offering, the share'],
                      ['Treasury, convertAndStream', 'the flywheel — fees in, stock tokens out to the nest'],
                      ['claimable', 'the admin’s capped cut'],
                      ['Merkle root, setAllowlisted', 'the flocklist'],
                      ['releaseFreeAllocation', 'unclaimed free birds moving to the paid mint'],
                      ['mintMany', 'minting several at once'],
                      ['Nightjar', 'the palette'],
                      ['owlish', 'the base bird'],
                      ['AVISTOCK', 'the on-chain symbol. We say Avian Stock.'],
                      ['burnt', 'a bird destroyed by the perch as the hundredth sold to it. Gone, and its combination with it.'],
                    ].map(([code, plain]) => (
                      <tr key={code}>
                        <td><span className="mono" style={{ fontSize: 12.5 }}>{code}</span></td>
                        <td style={{ textAlign: 'left', fontFamily: 'inherit', fontSize: 14 }}>{plain}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="small" style={{ marginTop: 32 }}>
                <a href={href({ name: 'contracts' })}>
                  Every address, and the checks we run against them <Icon name="arrow" size={13} color="var(--accent)" />
                </a>
              </p>
            </>
          ))}
        </div>
      </div>
    </div>
  );
}
