// The Content-Security-Policy, generated from the deployment manifests that
// are present at build time.
//
// `script-src 'self'` with no `'unsafe-inline'` and no `'unsafe-eval'` is the
// line that would survive a compromised dependency: injected inline script does
// not run, and there is no `eval` surface to reach. That is the point of having
// one at all.
//
// `connect-src` is the awkward part and is worth being explicit about. CSP is
// static; the RPC endpoint is not — it comes from a manifest that can be
// dropped in after the build. So the origins are collected from the manifests
// present when the site is built, and a manifest added later with a NEW RPC
// origin needs this regenerated (`npm run build`). The trade is deliberate: the
// alternative, `connect-src https:`, keeps the pure drop-in property and gives
// up most of the protection. The failure mode is loud — the call is blocked and
// the site says the deployment's RPC is not allowed by this build.
//
// `style-src` carries 'unsafe-inline' because React sets style ATTRIBUTES (the
// pixel art's integer sizing does exactly this). `style-src-attr` is the
// narrower rule and is set alongside for browsers that honour it.
//
// `img-src data:` is required and is safe: the birds are rendered as
// `data:image/svg+xml` in an <img>, which cannot execute script. Nothing from a
// contract is ever inserted into the DOM as markup.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function originsFrom(deploymentsDir) {
  const origins = new Set();
  if (!existsSync(deploymentsDir)) return origins;
  for (const file of readdirSync(deploymentsDir)) {
    if (!file.endsWith('.json') || file === 'index.json') continue;
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(join(deploymentsDir, file), 'utf8'));
    } catch {
      continue;
    }
    if (manifest?.driver === 'mock') continue;      // opens no socket
    for (const url of manifest?.network?.rpcUrls ?? []) {
      try { origins.add(new URL(url).origin); } catch { /* validated elsewhere */ }
    }
  }
  return origins;
}

export function buildCsp(deploymentsDir) {
  const connect = ["'self'", ...[...originsFrom(deploymentsDir)].sort()];
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src ${connect.join(' ')}`,
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'none'",
    "worker-src 'self'",
    "manifest-src 'self'",
  ].join('; ');
}
