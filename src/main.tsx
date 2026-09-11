// Boot.
//
// Nothing renders until a deployment manifest has been loaded, validated and
// cross-checked against the chain it names. That order is the point: the site
// is pointed at a deployment by dropping in a file, and a file that does not
// describe a working set of contracts must stop the app rather than produce a
// page that fails at somebody's first transaction.

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { BootFailure } from './components/Boot';
import {
  ManifestError, chosenId, loadIndex, loadManifest, rememberChoice, setActiveManifest,
  type DeploymentIndex, type Problem,
} from './chain/manifest';
import { runStartupChecks } from './chain/startup';
import { initWallet, onChainOrAccountChange } from './chain/provider';
import { invalidateAll } from './chain/reads';
import { resetClient } from './chain/client';

import './styles/tokens.css';
import './styles/base.css';
import './styles/type.css';
import './styles/components.css';
import './styles/screens.css';
import './components/app.css';

/**
 * Refuse to run inside a frame.
 *
 * `frame-ancestors 'none'` is in the CSP, but browsers honour that directive
 * ONLY from a real response header — in a `<meta>` tag it is ignored. The
 * header is in `dist/_headers`, which covers hosts that read one; this build
 * also deliberately targets `file://` and IPFS gateways (`base: './'`), where
 * no headers are applied at all. A page with Approve, Mint and Claim buttons
 * on it should not be frameable anywhere.
 *
 * This runs before the root is created and before any chain code loads, so a
 * framed copy renders nothing to click. The wallet's own confirmation is the
 * real backstop — a clickjacked button still cannot sign — which is why this
 * is a guard and not a panic.
 */
function framed(): boolean {
  try {
    return window.top !== window.self;
  } catch {
    // A cross-origin parent throws on access, which is itself the answer.
    return true;
  }
}

if (framed()) {
  // Built with DOM methods, not markup: `innerHTML` is banned across this
  // codebase and `npm run check` fails on it, guard included.
  const say = document.createElement('div');
  say.style.cssText = 'font:16px/1.6 system-ui,sans-serif;padding:32px;max-width:36em;'
    + 'color:#F2F0FA;background:#06050C;min-height:100vh;box-sizing:border-box';
  const h = document.createElement('h1');
  h.style.cssText = 'font-size:20px;margin:0 0 12px';
  h.textContent = 'This page will not run inside a frame.';
  const p = document.createElement('p');
  p.style.cssText = 'margin:0 0 12px';
  p.textContent = 'Avian Stock is being displayed inside another site. It has buttons that '
    + 'spend money, so it refuses to render anywhere it cannot show you whose page you are on.';
  const a = document.createElement('a');
  a.href = location.href;
  a.target = '_top';
  a.rel = 'noopener';
  a.style.color = '#43C4BC';
  a.textContent = 'Open it directly';
  say.append(h, p, a);
  // Replaces everything, #root included, so nothing of the app is left to click.
  (document.body ?? document.documentElement).replaceChildren(say);
  throw new Error('refusing to run in a frame');
}

const root = createRoot(document.getElementById('root')!);

function fail(title: string, source: string, o: {
  problems?: Problem[];
  checks?: Awaited<ReturnType<typeof runStartupChecks>>['failures'];
  index?: DeploymentIndex | null;
  current?: string;
} = {}) {
  root.render(
    <StrictMode>
      <BootFailure
        title={title}
        source={source}
        problems={o.problems}
        checks={o.checks}
        deployments={o.index?.deployments.map((d) => ({ id: d.id, label: d.label }))}
        current={o.current}
      />
    </StrictMode>,
  );
}

async function boot() {
  let index: DeploymentIndex | null = null;
  let id = '(unknown)';

  try {
    index = await loadIndex();
    id = chosenId(index);
    const manifest = await loadManifest(index, id);
    setActiveManifest(manifest);
    rememberChoice(manifest.id);

    // The dev-only injected wallet, for walking the write path against a fork.
    // `import.meta.env.DEV` is a literal `false` in a build, so Vite eliminates
    // this branch and the module never enters the bundle — `npm run check`
    // fails if its marker string ever appears in `dist/`.
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('devwallet')) {
      const q = new URLSearchParams(location.search);
      const { installDevWallet } = await import('./dev/injected-wallet');
      installDevWallet({
        rpcUrl: manifest.network.rpcUrls[0],
        chainId: manifest.network.chainId,
        account: Number(q.get('devwallet')) || 1,
        pretendChainId: q.has('wrongchain') ? Number(q.get('wrongchain')) || 1 : undefined,
        pretendUnknownChain: q.has('unknownchain'),
      });
    }

    if (manifest.driver === 'chain') {
      const startup = await runStartupChecks();
      if (startup.failures.length) {
        fail(
          'This deployment does not check out.',
          `public/deployments/${id}.json`,
          { checks: startup.failures, index, current: id },
        );
        return;
      }
      // Nothing survives a chain change or an account change: every balance,
      // allowance and address on the page was read from the other one.
      onChainOrAccountChange(() => { invalidateAll(); resetClient(); });
      await initWallet();
    }
  } catch (e) {
    if (e instanceof ManifestError) {
      fail('This deployment manifest is not usable.', e.source, { problems: e.problems, index, current: id });
    } else {
      fail('The deployment could not be loaded.', `public/deployments/${id}.json`, {
        problems: [{ path: '(startup)', says: (e as Error)?.message ?? String(e) }],
        index,
        current: id,
      });
    }
    return;
  }

  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void boot();
