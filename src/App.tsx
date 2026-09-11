import { Suspense, lazy, useState } from 'react';
import { Header } from './components/Header';
import { Footer } from './components/Footer';

/*
  THE STATE SWITCHER DOES NOT SHIP.

  It was a static import rendered unconditionally, so it was in the production
  bundle and on the deployed site. `import.meta.env.DEV` is a build-time
  constant: Vite replaces it with `false` for a build, the conditional folds
  to null, and — because the import is DYNAMIC — the module is never reached
  and never emitted. A static import would still be bundled even behind a false
  condition. Same arrangement as `src/dev/injected-wallet.ts`, and the same
  guard: `npm run check` fails if "State switcher" is found in `dist/`.
*/
const DevPanel = import.meta.env.DEV
  ? lazy(() => import('./components/DevPanel').then((m) => ({ default: m.DevPanel })))
  : null;
import { ErrorBoundary } from './components/ErrorBoundary';
import { TxProvider } from './components/Tx';
import { NetworkBar, WalletDialog } from './components/Wallet';
import { TradeModal } from './components/TradeModal';
import { Landing } from './screens/Landing';
import { Compose } from './screens/Compose';
import { Flock } from './screens/Flock';
import { BirdDetail } from './screens/BirdDetail';
import { Perch } from './screens/Perch';
import { Nest } from './screens/Nest';
import { YourBirds } from './screens/YourBirds';
import { FirstLight } from './screens/FirstLight';
import { Contracts } from './screens/Contracts';

/**
 * The owner's panel, loaded on demand.
 *
 * Not hidden — `#/admin` works for anyone who types it, and the page itself
 * says plainly when the connected wallet is not the owner. Split out because
 * it and its ABIs are a screen one person opens, and there is no reason to put
 * it in front of everybody else's mint.
 */
const Admin = lazy(() => import('./screens/Admin').then((m) => ({ default: m.Admin })));
import { Docs } from './screens/Docs';
import { useRoute, useScrollReset } from './router';

export function App() {
  const route = useRoute();
  const [walletOpen, setWalletOpen] = useState(false);
  // The trade modal is opened from the nav, so it lives here rather than on any
  // one screen — it is reachable from the flock, the perch and the nest as
  // readily as from the mint.
  const [tradeOpen, setTradeOpen] = useState(false);
  useScrollReset(route);

  const openWallet = () => setWalletOpen(true);

  return (
    <TxProvider>
      <a className="skip-link" href="#main">Skip to the content</a>
      <Header onWallet={openWallet} onTrade={() => setTradeOpen(true)} />
      <NetworkBar onFix={openWallet} />

      <main id="main">
        <ErrorBoundary where={route.name}>
        {route.name === 'landing' ? <Landing />
          : route.name === 'compose' ? <Compose onConnect={openWallet} />
            : route.name === 'flock' ? <Flock />
              : route.name === 'bird' ? <BirdDetail id={route.id} />
                : route.name === 'perch' ? <Perch onConnect={openWallet} />
                  : route.name === 'nest' ? <Nest onConnect={openWallet} />
                    : route.name === 'birds' ? <YourBirds onConnect={openWallet} />
                      : route.name === 'first-light' ? <FirstLight />
                        : route.name === 'docs' ? <Docs />
                          : route.name === 'admin'
                            ? <Suspense fallback={null}><Admin onConnect={openWallet} /></Suspense>
                              : <Contracts />}
        </ErrorBoundary>
      </main>

      {route.name !== 'landing' ? <Footer /> : null}

      <WalletDialog open={walletOpen} onClose={() => setWalletOpen(false)} />
      <TradeModal open={tradeOpen} onClose={() => setTradeOpen(false)} />
      {DevPanel ? <Suspense fallback={null}><DevPanel /></Suspense> : null}
    </TxProvider>
  );
}
