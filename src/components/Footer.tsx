import { href } from '../router';

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
          <p className="small foot__links" style={{ marginTop: 12 }}>
            <a href={href({ name: 'compose' })}>Compose</a>
            <a href={href({ name: 'flock' })}>The Flock</a>
            <a href={href({ name: 'perch' })}>The Perch</a>
            <a href={href({ name: 'nest' })}>The Nest</a>
            <a href={href({ name: 'roost' })}>The Roost</a>
            <a href={href({ name: 'contracts' })}>Contracts</a>
            <a href={href({ name: 'docs' })}>Docs</a>
          </p>
          <p className="tiny dim" style={{ marginTop: 20 }}>
            Avian Stock is an independent project with no relationship to Robinhood, NVIDIA,
            SpaceX, Apple or S&amp;P. NVDA, SPY, SPCX and AAPL are tokenized stock products issued
            and controlled by their issuer, not by us, and that issuer can pause or freeze them at
            any time. Reward streams depend on income arriving and may be zero. AVIANS is a token
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
