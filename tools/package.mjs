/**
 * Empaqueta la extension en `dist/`.
 *
 * Deriva el nombre del archivo del propio manifiesto (publicador, nombre y
 * version), de modo que cada version conserva el suyo sin que haya que
 * editar ningun script a mano.
 *
 * Uso:  node tools/package.mjs
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(
  readFileSync(path.join(ROOT, 'package.json'), 'utf8'),
);

const outDir = path.join(ROOT, 'dist');
mkdirSync(outDir, { recursive: true });

const target = path.join(
  outDir,
  manifest.publisher + '.' + manifest.name + '-' + manifest.version + '.vsix',
);

const result = spawnSync(
  'vsce',
  ['package', '--no-dependencies', '--out', '"' + target + '"'],
  { cwd: ROOT, stdio: 'inherit', shell: true },
);

if (result.error) {
  console.error('No se pudo ejecutar vsce: ' + result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
