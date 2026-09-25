import { Icon } from './Icon';
import { ELSEWHERE } from '../lib/links';

export function Footer() {
  return (
    <footer className="foot">
      <div className="foot__inner">
        <img className="px" src="./logo/mark.svg" width={32} height={32} alt="" />
        <div style={{ maxWidth: 900 }}>
          <p className="small" style={{ margin: 0 }}>
            <strong className="strong">Avian Stock</strong>
            <span className="dim">, 5,555 pixel birds on Robinhood Chain, stored on-chain.</span>
          </p>
          {/*
            The project's places off this site (2026-09-25), where the page
            links were: the sidebar is always there. Four marks from one
            constant, `lib/links.ts`; one with no URL yet is drawn inert.
          */}
          <ul className="foot__marks" aria-label="Elsewhere">
            {ELSEWHERE.map((p) => (
              <li key={p.id}>
                {p.url ? (
                  <a className="foot__mark" href={p.url} target="_blank" rel="noopener noreferrer" aria-label={p.label} title={p.label}>
                    <Icon name={p.id} size={16} />
                  </a>
                ) : (
                  <a className="foot__mark foot__mark--soon" role="link" aria-disabled="true" aria-label={`${p.label}, soon`} title="Soon">
                    <Icon name={p.id} size={16} />
                  </a>
                )}
              </li>
            ))}
          </ul>
          <p className="tiny dim" style={{ marginTop: 20 }}>
            Avian Stock is an independent project with no relationship to Robinhood, NVIDIA,
            SpaceX, Apple or S&amp;P. NVDA, SPY, SPCX and AAPL are tokenized stock products issued
            and controlled by their issuer, not by us, and that issuer can pause or freeze them at
            any time. Reward streams depend on income arriving and may be zero. AVIAN is a token
            with a market price that can go to anything. Nothing here is a promise of value, return
            or income, and nothing here is financial advice. The contracts are tested (hundreds of
            tests, invariants, adversarial review and fork tests) and have not had a paid
            third-party audit.
          </p>
        </div>
      </div>
    </footer>
  );
}
