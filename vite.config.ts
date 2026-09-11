import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
// @ts-expect-error — a plain .mjs helper, shared with the scripts
import { buildCsp } from './scripts/csp.mjs';

const DEPLOYMENTS = resolve(__dirname, 'public', 'deployments');

/**
 * The CSP is generated from the deployment manifests present at build time and
 * injected into the built index.html — BUILD ONLY, because Vite's dev server
 * needs inline script and a websocket that `script-src 'self'` would refuse.
 * The shipped site is the strict one; the dev server is not the shipped site.
 *
 * The same policy is written to `dist/_headers` for hosts that set headers,
 * which is the better place for it when there is one.
 */
function csp(): Plugin {
  return {
    name: 'fine-avians-club-csp',
    apply: 'build',
    transformIndexHtml(html) {
      const policy = buildCsp(DEPLOYMENTS) as string;
      return {
        html,
        tags: [{
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: policy },
          injectTo: 'head-prepend',
        }],
      };
    },
    closeBundle() {
      const policy = buildCsp(DEPLOYMENTS) as string;
      writeFileSync(
        resolve(__dirname, 'dist', '_headers'),
        `/*\n  Content-Security-Policy: ${policy}\n`
        + '  Referrer-Policy: no-referrer\n'
        + '  X-Content-Type-Options: nosniff\n'
        + '  Permissions-Policy: geolocation=(), microphone=(), camera=(), payment=()\n',
      );
      // eslint-disable-next-line no-console
      console.log(`\nContent-Security-Policy\n  ${policy.replace(/; /g, '\n  ')}\n`);
    },
  };
}

// base './' so the build works from any path, including a file:// open and
// an IPFS gateway. Routing is hash-based for the same reason.
export default defineConfig({
  base: './',
  plugins: [react(), csp()],
  build: { outDir: 'dist', assetsInlineLimit: 0, chunkSizeWarningLimit: 1200 },
  server: { port: 5178, strictPort: false },
});
