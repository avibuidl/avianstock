// Contracts and proofs.
//
// The network, every address, the Treasury and the lock.
//
// The start-up cross-check used to have a card of its own here, listing eleven
// claims one contract makes about another. It is gone, and nothing was lost:
// `main.tsx` runs those same checks before the app mounts and REFUSES TO BOOT on
// a single failure — "This deployment does not check out." So the card could
// only ever render eleven green ticks. A list that is all-pass by construction
// is not evidence, it is decoration, and it took the top half of the page.

import { Icon } from '../components/Icon';
import { ErrorState, PanelSkeleton, Tag } from '../components/Primitives';
import { TreasuryCard } from '../components/TreasuryCard';
import { avians, formatCount, formatDays } from '../lib/format';
import { NETWORK, useCollection, useDeployment, useNow, useSupply, useVault } from '../mock';

export function Contracts() {
  const collection = useCollection();
  const deployment = useDeployment();
  const vault = useVault();
  const supply = useSupply();
  const now = useNow(30000);

  const d = deployment.data;

  return (
    <div className="page page--wide">
      <p className="eyebrow">Contracts</p>
      <h2>Everything, and where to check it.</h2>
      <p className="lede" style={{ maxWidth: 860 }}>
        Below are the protocol&rsquo;s contract addresses — all verified and accessible onchain
      </p>

      {/*
        WITH THE CROSS-CHECK GONE THIS CARD IS ALONE, and a lone card in a
        two-column grid is a card with a hole beside it. It goes full width and
        its three groups of facts sit side by side instead of stacked — an
        auto-fit track rather than a fixed count, because "The birds" and
        "AVIANS" only appear once their reads land, and a fixed three columns
        would leave gaps until they did.
      */}
      <section className="panel net-facts" style={{ marginTop: 32 }} aria-labelledby="net-h">
        <h3 id="net-h" style={{ fontSize: 20 }}>The network</h3>
        <div className="net-facts__grid">
          <div>
            <p className="eyebrow" style={{ margin: '0 0 8px' }}>Chain</p>
            <dl className="kv" style={{ gridTemplateColumns: '92px 1fr' }}>
            <dt>Network</dt><dd>{NETWORK.chainName}</dd>
            <dt>Chain id</dt><dd>{NETWORK.chainId} · {NETWORK.chainIdHex}</dd>
            <dt>Gas</dt><dd>ETH</dd>
            <dt>RPC</dt><dd style={{ fontSize: 11.5 }}>{NETWORK.rpcUrls[0]}</dd>
            <dt>Explorer</dt><dd style={{ fontSize: 11.5 }}>{NETWORK.blockExplorerUrls[0]}</dd>
            </dl>
          </div>

          {collection.data ? (
            <div>
              <p className="eyebrow" style={{ margin: '0 0 8px' }}>The birds</p>
              <dl className="kv" style={{ gridTemplateColumns: '92px 1fr' }}>
                    <dt>Minted</dt><dd>{formatCount(collection.data.totalMinted)}</dd>
                    <dt>Burnt</dt><dd>{formatCount(collection.data.burned)}</dd>
                    {/* Not a third read: the contract's own totalSupply IS this
                        subtraction, and showing the arithmetic is the point. */}
                <dt>In existence</dt>
                <dd>{formatCount(collection.data.totalMinted - collection.data.burned)}</dd>
              </dl>
              <p className="tiny dim" style={{ marginTop: 12 }}>
                One bird in every hundred sold to the perch is burnt. Ids are never reused and a
                burnt bird&rsquo;s combination stays taken, so the number minted never falls — what
                falls is the number that still exist.
              </p>
            </div>
          ) : null}

          {supply.data ? (
            <div>
              <p className="eyebrow" style={{ margin: '0 0 8px' }}>AVIANS</p>
              <dl className="kv" style={{ gridTemplateColumns: '92px 1fr' }}>
                <dt>Supply</dt><dd>{avians(supply.data.total)}</dd>
                <dt>In the pool</dt><dd>{avians(supply.data.inPool)}</dd>
                {/* Not "by tiers": the perch burns half of every fee it takes,
                    and this figure is the whole supply reduction. */}
                <dt>Burned</dt><dd>{avians(supply.data.burned)}</dd>
              </dl>
              <p className="tiny dim" style={{ marginTop: 12 }}>
                Minted once, fixed forever. No mint function, no pause, no blacklist, no tax, no
                upgrade — and no owner at all.
              </p>
            </div>
          ) : null}
        </div>
      </section>

      {/*
        THIS PANEL NOW OWNS THE DEPLOYMENT READ'S REPORTING.

        The cross-check card was the only place a pending or failed
        `useDeployment` appeared. Both tables below render `d ? … : null`, so
        losing that card would have turned a failed read into two empty tables
        with nothing said — a read that fails has to render as a failure.
      */}
      <section className="panel" style={{ marginTop: 24 }} aria-labelledby="addr-h">
        <h3 id="addr-h" style={{ fontSize: 20 }}>The project&rsquo;s own contracts</h3>

        {deployment.loading && !d ? (
          <div style={{ marginTop: 16 }}><PanelSkeleton lines={8} /></div>
        ) : deployment.error ? (
          <div style={{ marginTop: 16 }}>
            <ErrorState
              title="That read failed."
              detail="We could not read the deployment's addresses. Nothing is wrong with the contracts."
              onRetry={deployment.reload}
            />
          </div>
        ) : (
        <>
        <div className="scroll-x" style={{ marginTop: 16 }}>
          <table className="table">
            <tbody>
              {d ? Object.entries(d.addresses).map(([name, addr]) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td>
                    <a
                      className="mono"
                      href={`${NETWORK.blockExplorerUrls[0]}/address/${addr}`}
                      target="_blank" rel="noreferrer noopener"
                    >
                      {addr} <Icon name="ext" size={12} color="var(--accent)" />
                    </a>
                  </td>
                </tr>
              )) : null}
            </tbody>
          </table>
        </div>

        <h4 style={{ marginTop: 28 }}>Third-party contracts on this chain</h4>
        <div className="scroll-x" style={{ marginTop: 12 }}>
          <table className="table">
            <tbody>
              {d ? Object.entries(d.thirdParty).map(([name, addr]) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td><span className="mono">{addr}</span></td>
                </tr>
              )) : null}
            </tbody>
          </table>
        </div>
        </>
        )}
      </section>

      <div className="contracts-grid" style={{ marginTop: 24 }}>
        <TreasuryCard />

        <section className="panel" aria-labelledby="lock-h">
          <div className="row">
            <h3 id="lock-h" style={{ fontSize: 20 }}>The liquidity lock</h3>
            <span className="spacer" />
            {vault.data?.isLocked ? <Tag tone="ok"><Icon name="lock" size={11} /> Locked</Tag> : null}
          </div>
          {vault.data ? (
            <dl className="kv" style={{ marginTop: 16, gridTemplateColumns: '130px 1fr' }}>
              <dt>Position</dt><dd>#{vault.data.tokenId}</dd>
              <dt>Locked for</dt><dd>{formatDays(vault.data.lockSeconds)} minimum</dd>
              <dt>Unlocks in</dt><dd>{formatDays(Math.max(0, vault.data.unlockAt - now))}</dd>
            </dl>
          ) : null}
          <p className="small" style={{ marginTop: 14 }}>
            The lock can be extended. It cannot be shortened. This is the on-chain proof, not a
            statement from us.
          </p>

        </section>
      </div>
    </div>
  );
}
