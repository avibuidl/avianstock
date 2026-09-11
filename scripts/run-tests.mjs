// `node --test` over the TypeScript sources.
//
// The tests are written in TS against the real modules — not against copies of
// their logic, which is the way a test suite stops noticing a change. esbuild
// bundles each `tests/*.test.ts` into `.test-build/` first (it is already the
// bundler Vite uses, pinned here explicitly for that reason), and node runs the
// result.

import { rmSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outdir = join(root, '.test-build');

const tests = readdirSync(join(root, 'tests')).filter((f) => f.endsWith('.test.ts'));
if (tests.length === 0) {
  console.error('no tests in tests/');
  process.exit(1);
}

rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

await build({
  entryPoints: tests.map((f) => join(root, 'tests', f)),
  outdir,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  sourcemap: 'inline',
  // Node provides these; bundling them would be pointless and slow.
  external: ['node:*'],
  logLevel: 'warning',
});

const built = readdirSync(outdir).filter((f) => f.endsWith('.js')).map((f) => join(outdir, f));
const result = spawnSync(process.execPath, ['--test', ...built], { stdio: 'inherit' });
process.exit(result.status ?? 1);
