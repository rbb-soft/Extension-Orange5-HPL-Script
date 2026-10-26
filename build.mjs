import { build, context } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes('--watch');

/** Shared esbuild options. `vscode` is provided by the extension host. */
const common = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  sourcemap: false,
  minify: false,
  logLevel: 'info',
  legalComments: 'none',
};

const targets = [
  {
    ...common,
    entryPoints: [path.join(root, 'client/src/extension.ts')],
    outfile: path.join(root, 'client/out/extension.js'),
    external: ['vscode'],
  },
  {
    ...common,
    entryPoints: [path.join(root, 'server/src/server.ts')],
    outfile: path.join(root, 'server/out/server.js'),
    external: [],
  },
];

if (watch) {
  const contexts = await Promise.all(targets.map((options) => context(options)));
  await Promise.all(contexts.map((ctx) => ctx.watch()));
  console.log('[orange5-hpl-script] watching for changes');
} else {
  await Promise.all(targets.map((options) => build(options)));
  console.log('[orange5-hpl-script] build complete');
}
