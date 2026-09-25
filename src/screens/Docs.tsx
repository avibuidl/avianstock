// Documentation.
//
// The reference page: why the register is the whole product, every number in
// one place, every contract and the liquidity lock (the Contracts page's, since
// 2026-09-25), what the contracts guarantee, how the art is built, exactly
// what the owner can and cannot do, and a glossary between the words in the
// code and the words on the site.
//
// Sourced from LORE-BRIEF.md Parts A and B, HANDOVER.md and the appendix.
// Every number here is canon and unrounded.

import { useEffect, useRef, useState } from 'react';
import s from './Docs.module.css';
import { Icon } from '../components/Icon';
import { CopyAddress, ExplorerLink, NumberGroup } from '../components/Numbers';
import { ErrorState, PanelSkeleton, Tag, Unread } from '../components/Primitives';
import { avians, formatBps, formatDays, rewardSplitLine } from '../lib/format';
import { href, useOpenAt } from '../router';
import {
  ADDRESSES, NETWORK, unveiled, useCollection, useDeployment, useLaunch, useNow, useRewardSplit, useVault,
} from '../mock';

const SECTIONS = [
  ['choose', 'Why choosing was the hard part'],
  ['numbers', 'The numbers'],
  ['contracts', 'The contracts'],
  ['guarantees', 'What the contracts guarantee'],
  ['art', 'The art'],
  ['powers', 'Who can do what'],
  ['words', 'The words'],
] as const;

export function Docs({ at }: { at?: string } = {}) {
  // This page states the collection's numbers, and three of them are the
  // owner's to change: the price, the floor it may not go under (an immutable,
  // but a constructor argument rather than a literal), and the royalty, which
  // the admin panel can set to anything up to 100%. A reference page that is
  // confidently out of date is worse than one that says it does not know, so
  // where a read has not landed the figure is a blank block in a table and
  // simply absent in prose.
  const collection = useCollection();
  const c = collection.data;
  // Which tokens earn and in what proportion: both owner-set, neither a
  // constant.
  const split = useRewardSplit();
  // The opening fee's ceiling is the hook's own: FEE_BPS + MAX_EXTRA_FEE_BPS,
  // read, so this page cannot quote a figure the contract stopped charging
  // (it said 25% for a day after the hook went to 90%).
  const launch = useLaunch();
  const opening = launch.data ? formatBps(launch.data.feeBps + launch.data.maxExtraFeeBps) : null;
  const [active, setActive] = useState<string>(SECTIONS[0][0]);
  const refs = useRef<Record<string, HTMLElement | null>>({});
  // #/docs/contracts (and the old #/contracts) opens the page at that section.
  useOpenAt(at);

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

  const price = c ? avians(c.price) : null;
  const floor = c ? avians(c.minPrice) : null;

  return (
    <div className={s.wrap}>
      <nav className={s.toc} aria-label="On this page">
        <h4 style={{ margin: '0 0 8px' }}>On this page</h4>
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
        <h1 style={{ fontSize: 'clamp(34px, 4.4vw, 54px)' }}>How it works</h1>
        <p className="lede" style={{ maxWidth: 720 }}>
          Everything the contracts do, with the real numbers. Nothing here is rounded and nothing
          is a plan.
        </p>

        <div style={{ marginTop: 40 }}>
          {section('choose', 'Why choosing was the hard part', (
            <div style={{ marginTop: 24, maxWidth: 760 }}>
              <p className="lede" style={{ marginTop: 0 }}>
                Letting people pick is easy. Guaranteeing nobody picks the same thing is not. A
                chosen mint means the chain has to keep a register and refuse, in the same
                transaction, any combination that already exists. That refusal is the whole
                product: no reveal, no waiting, and no chance you and a stranger end up with the
                same bird. Everything else follows from it.
              </p>
            </div>
          ))}

          {section('numbers', 'The numbers', (
            <>
              <NumberGroup title="The birds" rows={[
                ['Birds that will ever be minted', '5,555'],
                ['Free birds, one per allowlisted wallet', '2,000'],
                ['Paid birds', '3,555, plus any free birds released unclaimed'],
                ['Price of a bird', price ? `${price}, never ETH` : <Unread />],
                ['Can the price change?', floor ? `Raised, yes. Never below ${floor}.` : <Unread />],
                ['Wallets per bird', '1, from the moment it is minted'],
                ['Possible combinations', '1,866,240'],
              ]} />
              <NumberGroup title="The perch and the Roost" rows={[
                ['The perch buys any bird for', '90,000 AVIAN, always'],
                ['It sells the next bird for', '110,000 AVIAN, or 115,000 AVIAN for one you pick'],
                ['Birds burnt by the perch', 'one in every hundred sold to it; the seller is paid in full'],
                ['The burn stops at', '2,222 living birds: nothing burns until 2,223 are alive'],
                ['Perch fees', 'whole to the Roost'],
                ['Brooding tiers, paid to the Roost', '10,000 / 30,000 / 50,000 AVIAN for 1x / 2x / 3x weight'],
                ['The Roost splits everything', unveiled('vaults')
                  ? '35 / 30 / 20 between AVIAN stakers, brooding birds and vault users, rotating weekly; 10% to the protocol, 5% burnt; at most once a day'
                  : 'this week\'s shares to AVIAN stakers and brooding birds, rotating weekly; 10% to the protocol, 5% burnt; at most once a day'],
                ['AVIAN staking', 'each delivery streams over 7 days; no lock, no cooldown, no fee'],
                ['Reward tokens', split.data ? rewardSplitLine(split.data, ADDRESSES.Avians) : <Unread />],
              ]} />
              <NumberGroup title="The token and the pool" rows={[
                ['AVIAN supply', '1,000,000,000, minted once, no owner'],
                ['In the launch pool', '800,000,000 AVIAN, single-sided'],
                ['Behind the free birds', '200,000,000 AVIAN, moving to the perch as each is claimed'],
                ['Opening window', opening ? `5 minutes; the buy fee starts at ${opening} and falls to 1%; at most 50,000,000 AVIAN per transaction` : <Unread />],
                ['Pool fee afterwards', '1% on buys, 2% on sells, on the ETH side, forever'],
                ['Liquidity lock', '365 days minimum, extendable, never shortenable'],
                ['Royalty', c ? (c.royaltyBps === 0 ? 'None' : `${formatBps(c.royaltyBps)}, to the Treasury`) : <Unread />],
              ]} />
              <NumberGroup title="The art" rows={[
                ['Canvas', '32 × 32 pixels, 48 colours, one palette'],
                ['Traits', '70, in 6 categories, over one locked base'],
                ['Stored', 'on-chain, 12,866 bytes for the whole collection, on one contract'],
              ]} />

              <h4 style={{ marginTop: 40 }}>Where the money goes</h4>
              <div className={s.money}>
                <div><p className="small" style={{ margin: 0 }}>
                  A paid mint&rsquo;s {price ?? 'payment'}: to the perch, in the same transaction.
                  Never to us.
                </p></div>
                <div><p className="small" style={{ margin: 0 }}>
                  Pool fees and royalties, in ETH: to the Treasury, which converts them to reward
                  tokens for the nest. The admin may take 20% of the ETH that arrives, and all of
                  any other token.
                </p></div>
                <div><p className="small" style={{ margin: 0 }}>
                  Perch fees and brooding tiers, in AVIAN: to the Roost. This week&rsquo;s figures
                  to AVIAN stakers{unveiled('vaults') ? ', brooding birds and vault users (35 / 30 / 20, moving one place a week)' : ' and brooding birds, moving one place a week'},
                  10% to the protocol, 5% burnt, once a day.
                </p></div>
              </div>
            </>
          ))}

          {section('contracts', 'The contracts', <TheContracts />)}

          {section('guarantees', 'What the contracts guarantee', (
            <>
              <p className="lede" style={{ maxWidth: 760 }}>
                Each of these is a tested property of the contracts, not a policy anyone keeps.
              </p>
              <div className={s.rules} style={{ marginTop: 28 }}>
                <div>
                  <h4>You compose your bird. You are not dealt one.</h4>
                  <p className="small">
                    One pick in each of six categories, over the locked base. If that combination
                    already exists, the mint is refused. No roll, no reveal, no waiting.
                  </p>
                </div>
                <div>
                  <h4>Nothing is rare by decree.</h4>
                  <p className="small">
                    There are no per-trait caps. Whatever is rare is rare because few people chose
                    it, and nobody, the owner included, can arrange it in advance.
                  </p>
                </div>
                <div>
                  <h4>The mint is paid in AVIAN, and the payment does not come to us.</h4>
                  <p className="small">
                    It goes, in the same transaction, to the perch that will buy the bird back. The
                    collection never holds it and the owner cannot redirect it.
                  </p>
                </div>
                <div>
                  <h4>Every bird can always be sold back for 90,000 AVIAN.</h4>
                  <p className="small">
                    The perch always holds enough to pay it, a proven invariant, which is why the
                    mint price has a floor{floor ? ` of ${floor}` : ''}: a cheaper mint could drain
                    it. One bird in every hundred sold is burnt; the seller is paid in full either
                    way.
                  </p>
                </div>
                <div>
                  <h4>One bird in every hundred sold to the perch is burnt.</h4>
                  <p className="small">
                    The perch counts every sale into it, resales included, and the bird whose
                    arrival makes the count a multiple of a hundred is burnt in the same
                    transaction. Its seller is paid the usual 90,000 AVIAN in full; no AVIAN move
                    for the burn. Nothing burns while 2,222 or fewer birds are alive.
                  </p>
                  <p className="tiny dim" style={{ marginTop: 10 }}>
                    A burnt bird&rsquo;s id is never reused, its six choices stay taken, and its
                    wallet is orphaned with whatever is inside. The sell screen shows the countdown
                    and names the bird it would land on before you sign.
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
                    Five minutes, a buy fee starting at {opening ?? 'up to 90%'} and falling to 1%, and no
                    transaction may buy more than 50,000,000 AVIAN. Then 1% on buys and 2% on sells,
                    forever. The contract enforcing it has no owner and no settings.
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
                  <h4>Every bird has a wallet, and brooding never moves the bird.</h4>
                  <p className="small">
                    Each bird has its own wallet from the moment it is minted; it can hold tokens,
                    other NFTs, even other birds. A bird broods in its holder&rsquo;s wallet at tier
                    1, 2 or 3. The tier&rsquo;s cost goes to the Roost and does not come back, and
                    the rewards are delivered into the bird&rsquo;s own wallet, or the
                    holder&rsquo;s, by choice.
                  </p>
                </div>
                <div>
                  <h4>Brooding ends the moment the bird changes hands.</h4>
                  <p className="small">
                    A sale, a transfer, anything. What the bird earned before that second goes to
                    the wallet that brooded it; what came after goes back to the stream; the buyer
                    broods afresh. A reward token that will not move is held and delivered later.
                  </p>
                </div>
                <div>
                  <h4>The royalty is enforced on-chain.</h4>
                  <p className="small">
                    Only marketplaces on the whitelist may move a bird on your behalf, so one that
                    ignores the royalty{c && c.royaltyBps > 0 ? ` (currently ${formatBps(c.royaltyBps)})` : ''}
                    {' '}can be kept off the list. Sending a bird to another person yourself is
                    always allowed.
                  </p>
                </div>
                <div>
                  <h4>Ownership cannot be renounced.</h4>
                  <p className="small">
                    A lost key would stop configuration: opening a mint not yet open, releasing
                    unclaimed free birds. It would never stop trading, minting, selling to the
                    perch or brooding.
                  </p>
                </div>
              </div>
            </>
          ))}

          {section('art', 'The art', (
            <>
              <div className={s.two} style={{ marginTop: 24 }}>
                <div>
                  <h4>One bird, one base.</h4>
                  <p className="small">
                    Every Avian shares a single locked silhouette: round-skulled, front-facing,
                    broad-breasted, wings folded. Plumage, neckwear, eyes, beak and headwear are
                    painted over and around it. Nobody composes the base and nobody can change it.
                  </p>

                  <h4 style={{ marginTop: 28 }}>One palette, Nightjar.</h4>
                  <p className="small">
                    Near-black ink against saturated jewel plumage, five steps deep per hue,
                    forty-eight colours in all. Hue families: neutral, keratin for the bill,
                    crimson, teal, violet, moss, azure and rose, plus eye-white, gold and one
                    signal colour.
                  </p>
                </div>

                <div>
                  <h4>A fixed order of layers.</h4>
                  <p className="small">
                    Background, plumage, the base outline, neckwear, eyes, beak, headwear, painted
                    in that order every time. Row 18 of the canvas belongs to no trait at all: it
                    is the gap between the eyes and the bill, on every bird.
                  </p>

                  <h4 style={{ marginTop: 28 }}>Entirely on-chain.</h4>
                  <p className="small">
                    The whole collection&rsquo;s pixels live in one 12,866-byte contract, and the
                    image is rendered from chain state. No server, no IPFS, no link that can die.
                  </p>
                </div>
              </div>

              <div className={s.facts} style={{ marginTop: 32 }}>
                <div><div className="num" style={{ fontSize: 22 }}>32 × 32</div><div className="label" style={{ marginTop: 4 }}>Pixels</div></div>
                <div><div className="num" style={{ fontSize: 22 }}>48</div><div className="label" style={{ marginTop: 4 }}>Colours</div></div>
                <div><div className="num" style={{ fontSize: 22 }}>70</div><div className="label" style={{ marginTop: 4 }}>Traits, plus the locked base</div></div>
              </div>
            </>
          ))}

          {section('powers', 'Who can do what', (
            <>
              <p className="lede" style={{ maxWidth: 760 }}>
                Contract by contract. The right-hand column is the one worth reading.
              </p>
              <div className="scroll-x" style={{ marginTop: 24 }}>
                <table className={`table ${s.powers}`} style={{ minWidth: 720 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 150 }}>Contract</th>
                      <th>The owner can</th>
                      <th>The owner cannot</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>AVIAN, the token</td>
                      <td>Nothing. It has no owner.</td>
                      <td>Mint, pause, tax, blacklist or upgrade.</td>
                    </tr>
                    <tr>
                      <td>The birds</td>
                      <td>Open and close the mints; raise the price (the floor is {floor ?? 'set at deployment'}, and there is no ceiling); set the allowlist; set the royalty, up to the 100% the ERC-2981 standard allows; whitelist the marketplaces allowed to move a bird on your behalf.</td>
                      <td>Lower the price below {floor ?? 'the floor'}, redirect a mint payment, mint without paying, or renounce ownership.</td>
                    </tr>
                    <tr>
                      <td>The perch</td>
                      <td>Set where the fees are sent (the Roost today); rescue tokens that are not AVIAN.</td>
                      <td>Move the perch&rsquo;s AVIAN, move its birds, or change 90,000 / 110,000 / 115,000.</td>
                    </tr>
                    <tr>
                      <td>The nest</td>
                      <td>List and retire reward tokens; set who may fund a stream.</td>
                      <td>Move a brooding bird, or touch rewards a bird has accrued.</td>
                    </tr>
                    <tr>
                      <td>The Roost and staking</td>
                      <td>Claim the protocol&rsquo;s tenth. The staking contract has no owner.</td>
                      <td>Change the split or its rotation, turn the Roost more than once a day, or touch a stake.</td>
                    </tr>
                    <tr>
                      <td>The Treasury</td>
                      <td>Take 20% of the ETH that arrives, and all of any other token; set conversion guardrails, targets and routes. A conversion runs at most once every 24 hours.</td>
                      <td>Take more than 20% of the ETH, or send a conversion anywhere but the nest.</td>
                    </tr>
                    <tr>
                      <td>The launch hook</td>
                      <td>Nothing. It has no owner.</td>
                      <td>Change the fees, the five-minute window or the per-transaction cap.</td>
                    </tr>
                    <tr>
                      <td>The Vault</td>
                      <td>Extend the lock, collect fees, withdraw after it unlocks.</td>
                      <td>Shorten the lock.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          ))}

          {section('words', 'The words', (
            <>
              <p className="lede" style={{ maxWidth: 760 }}>
                What things are called in the contracts, and what this site calls them.
              </p>
              <div className="scroll-x">
                <table className={`table ${s.words}`} style={{ marginTop: 24 }}>
                  <thead>
                    <tr><th style={{ width: 260 }}>In the code</th><th>On this site</th></tr>
                  </thead>
                  <tbody>
                    {[
                      ['ThePerch', 'the perch: the pool that buys birds back'],
                      ['mint(bg, plumage, eyes, beak, neckwear, headwear)', 'composing and minting a bird'],
                      ['comboTaken', 'the register: "that bird already exists"'],
                      ['ERC-6551 token-bound account', 'the satchel: the bird’s own wallet'],
                      ['TheNest, brood, tiers, weight', 'the nest: brooding, the tier, the share of the stream'],
                      ['settle', 'delivering what a brooding bird has accrued'],
                      ['TheRoost, distribute', 'the Roost: every AVIAN fee, split once a day'],
                      ['AviansStaking', 'staking AVIAN, on the Roost page'],
                      ['ERC-721C transfer validator', 'the Gate: on-chain royalty enforcement'],
                      ['Uniswap v4 pool + hook', 'the pool, and its fee'],
                      ['LAUNCH_AT, WINDOW', 'First Light: the opening time and the five minutes'],
                      ['LiquidityVault', 'the Vault: the 365-day liquidity lock'],
                      ['Treasury, convertAndStream', 'the flywheel: fees in, reward tokens out to the nest'],
                      ['Merkle root, setAllowlisted', 'the allowlist, and the founding flock it names'],
                      ['releaseFreeAllocation', 'unclaimed free birds moving to the paid mint'],
                      ['mintMany', 'minting several at once'],
                      ['Nightjar', 'the palette'],
                      ['owlish', 'the base bird'],
                      ['AVISTOCK', 'the on-chain symbol. We say Avian Stock.'],
                      ['burnt', 'a bird destroyed by the perch as the hundredth sold to it; its combination stays taken'],
                    ].map(([code, plain]) => (
                      <tr key={code}>
                        <td><span className="mono" style={{ fontSize: 12.5 }}>{code}</span></td>
                        <td>{plain}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="small" style={{ marginTop: 32 }}>
                <a href={href({ name: 'docs', at: 'contracts' })} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  Every address, with an explorer link <Icon name="arrow" size={13} color="var(--accent)" />
                </a>
              </p>
            </>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * THE CONTRACTS (2026-09-25), the Contracts page's content as a section of
 * Docs: every address, and the lock on the pool's liquidity.
 *
 * THIS SECTION OWNS THE DEPLOYMENT READ'S REPORTING, as the Contracts page
 * did. Both tables render only from a read that landed, so a pending read is
 * drawn as pending and a failed one as a failure, never as two empty tables
 * with nothing said.
 */
function TheContracts() {
  const deployment = useDeployment();
  const vault = useVault();
  const now = useNow(30000);
  const d = deployment.data;

  return (
    <>
      {deployment.loading && !d ? (
        <div style={{ marginTop: 24 }}><PanelSkeleton lines={8} /></div>
      ) : deployment.error || !d ? (
        <div style={{ marginTop: 24 }}>
          <ErrorState
            title="The addresses could not be read."
            detail="Nothing is wrong with the contracts. Try again in a moment."
            onRetry={deployment.reload}
          />
        </div>
      ) : (
        <>
          <NumberGroup
            title="The project’s own contracts"
            rows={Object.entries(d.addresses).map(([name, addr]) => [
              name,
              <CopyAddress
                value={addr}
                label={name}
                after={<ExplorerLink href={`${NETWORK.blockExplorerUrls[0]}/address/${addr}`} label={name} />}
              />,
            ])}
          />
          <NumberGroup
            title="Third-party contracts on this chain"
            rows={Object.entries(d.thirdParty).map(([name, addr]) => [name, <CopyAddress value={addr} label={name} />])}
          />
        </>
      )}

      {/* The lock, as it was on the Contracts page: three figures and its one rule. */}
      <div style={{ marginTop: 32 }}>
        <div className="row">
          <h4 style={{ margin: 0 }}>The liquidity lock</h4>
          <span className="spacer" />
          {vault.data?.isLocked ? <Tag tone="ok"><Icon name="lock" size={11} /> Locked</Tag> : null}
        </div>
        <p className="small dim" style={{ marginTop: 6 }}>
          The pool&rsquo;s liquidity position, held by the vault. The lock can be extended. It
          cannot be shortened.
        </p>

        {vault.loading && !vault.data ? (
          <div style={{ marginTop: 16 }}><PanelSkeleton lines={2} /></div>
        ) : vault.error ? (
          <div style={{ marginTop: 16 }}>
            <ErrorState title="The lock could not be read." onRetry={vault.reload} />
          </div>
        ) : vault.data ? (
          <div className="lock-facts">
            <div>
              <div className="num" style={{ fontSize: 22 }}>#{vault.data.tokenId}</div>
              <div className="label" style={{ marginTop: 4 }}>Position</div>
            </div>
            <div>
              <div className="num" style={{ fontSize: 22 }}>{formatDays(vault.data.lockSeconds)}</div>
              <div className="label" style={{ marginTop: 4 }}>Locked for, at least</div>
            </div>
            <div>
              <div className="num" style={{ fontSize: 22 }}>{formatDays(Math.max(0, vault.data.unlockAt - now))}</div>
              <div className="label" style={{ marginTop: 4 }}>Unlocks in</div>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
