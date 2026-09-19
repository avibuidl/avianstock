// Contracts and proofs.
//
// Every address, and the lock.
//
// Two cards that used to live here are gone. The start-up cross-check listed
// eleven claims one contract makes about another, but `main.tsx` runs those
// same checks before the app mounts and REFUSES TO BOOT on a single failure, so
// the card could only ever render eleven green ticks. The network card (chain
// facts, the bird counts, the AVIANS supply) came out on 2026-09-18 at the
// founder's request, and the Treasury card moved to the nest, which is where
// its income ends up.

import { Icon } from '../components/Icon';
import { ErrorState, PanelSkeleton, Tag } from '../components/Primitives';
import { formatDays } from '../lib/format';
import { NETWORK, useDeployment, useNow, useVault } from '../mock';

export function Contracts() {
  const deployment = useDeployment();
  const vault = useVault();
  const now = useNow(30000);

  const d = deployment.data;

  return (
    <div className="page page--wide">
      <h2>Contracts</h2>
      <p className="lede" style={{ maxWidth: 860 }}>
        Every contract this site talks to, with an explorer link for each, and the lock on the
        pool&rsquo;s liquidity.
      </p>

      {/*
        THIS PANEL OWNS THE DEPLOYMENT READ'S REPORTING.

        The cross-check card was the only place a pending or failed
        `useDeployment` appeared. Both tables below render `d ? … : null`, so
        losing that card would have turned a failed read into two empty tables
        with nothing said — a read that fails has to render as a failure.
      */}
      <section className="panel" style={{ marginTop: 32 }} aria-labelledby="addr-h">
        <h3 id="addr-h" style={{ fontSize: 20 }}>The project&rsquo;s own contracts</h3>

        {deployment.loading && !d ? (
          <div style={{ marginTop: 16 }}><PanelSkeleton lines={8} /></div>
        ) : deployment.error ? (
          <div style={{ marginTop: 16 }}>
            <ErrorState
              title="The addresses could not be read."
              detail="Nothing is wrong with the contracts. Try again in a moment."
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

      {/*
        Alone under the addresses, so it takes the same width they do: three
        figures in a row rather than a key-value list down a half-width card
        with a hole beside it.
      */}
      <section className="panel" style={{ marginTop: 24 }} aria-labelledby="lock-h">
        <div className="row">
          <h3 id="lock-h" style={{ fontSize: 20 }}>The liquidity lock</h3>
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
      </section>
    </div>
  );
}
