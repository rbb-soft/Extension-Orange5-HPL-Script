/**
 * Generador de la documentacion del catalogo de reglas.
 *
 * Lee el catalogo del analizador y el manifiesto de fixtures y escribe
 * `docs/CATALOGO_REGLAS.md`, de modo que la documentacion nunca se
 * desincroniza con el codigo.
 *
 * Uso:  node tools/generate-docs.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = path.join(ROOT, 'server', 'src', 'analyzer', 'diagnostics.ts');
const MANIFEST = path.join(ROOT, 'fixtures', 'manifest.json');
const OUTPUT = path.join(ROOT, 'docs', 'CATALOGO_REGLAS.md');

const source = readFileSync(CATALOG, 'utf8');
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));

/** Extrae el catalogo del fuente del analizador. */
const rules = [];
const entry =
  /\{\s*code:\s*'([^']+)',\s*severity:\s*'([^']+)',\s*description:\s*'([^']+)'\s*\}/g;
let match;
while ((match = entry.exec(source)) !== null) {
  rules.push({
    code: match[1],
    severity: match[2],
    description: match[3],
  });
}

if (rules.length === 0) {
  throw new Error('No se pudo extraer el catalogo de ' + CATALOG);
}

/** Fixture asociado a cada codigo, si existe. */
const fixtureOf = new Map();
for (const item of manifest.invalid) {
  const code = item.expected[0]?.code;
  if (code && !fixtureOf.has(code)) {
    fixtureOf.set(code, item.file);
  }
}

const lines = [];
lines.push('# Catalogo de reglas del linter HPL');
lines.push('');
lines.push('Documento generado por `tools/generate-docs.mjs`. No editar a mano.');
lines.push('');
lines.push(
  'Cada regla se corresponde con una comprobacion del lenguaje HPL rechazada',
  'por la implementacion de referencia.',
  'La severidad por defecto se puede ajustar por el usuario mediante',
  '`hpl.diagnostics.severityOverrides`.',
);
lines.push('');
lines.push('## Severidades');
lines.push('');
lines.push('| Severidad | Significado |');
lines.push('|---|---|');
lines.push(
  '| `error` | La implementacion de referencia rechaza el archivo. |',
);
lines.push(
  '| `warning` | La implementacion de referencia lo acepta, pero hay riesgo o comportamiento no obvio. |',
);
lines.push('| `hint` | Informacion de estilo o de limite no alcanzado. |');
lines.push('');

const families = [
  ['Registros y delimitadores lexicos', (code) => code.startsWith('hpl.record.') || code.startsWith('hpl.string.') || code.startsWith('hpl.paren.') || code.startsWith('hpl.literal.')],
  ['Estructura', (code) => code.startsWith('hpl.block.') || code.startsWith('hpl.statement.') || code.startsWith('hpl.nesting.')],
  ['Secciones y macros', (code) => code.startsWith('hpl.section.') || code.startsWith('hpl.macro.')],
  ['Cabeceras', (code) => code.startsWith('hpl.header.')],
  ['Pines y buses', (code) => code.startsWith('hpl.pin.') || code.startsWith('hpl.bus.')],
  ['Registros', (code) => code.startsWith('hpl.reg.')],
  ['Arrays', (code) => code.startsWith('hpl.array.')],
  ['Condiciones, iteradores y control', (code) => code.startsWith('hpl.cond.') || code.startsWith('hpl.iter.') || code.startsWith('hpl.loop.') || code.startsWith('hpl.break.') || code.startsWith('hpl.operand.')],
  ['Aritmetica y comandos', (code) => code.startsWith('hpl.arith.') || code.startsWith('hpl.delay.') || code.startsWith('hpl.print.') || code.startsWith('hpl.get.') || code.startsWith('hpl.codeSlots')],
  ['Avisos', (code) => code.startsWith('hpl.adv.')],
  ['Interno', (code) => code === 'hpl.internalError'],
];

let covered = 0;
const missing = [];
for (const [title, matcher] of families) {
  const group = rules.filter((rule) => matcher(rule.code));
  if (group.length === 0) {
    continue;
  }
  lines.push('## ' + title);
  lines.push('');
  lines.push('| Codigo | Severidad | Descripcion | Fixture |');
  lines.push('|---|---|---|---|');
  for (const rule of group) {
    const fixture = fixtureOf.get(rule.code);
    if (fixture) {
      covered += 1;
    } else {
      missing.push(rule.code);
    }
    lines.push(
      '| `' +
        rule.code +
        '` | `' +
        rule.severity +
        '` | ' +
        rule.description +
        ' | ' +
        (fixture ? '`' + fixture + '`' : '-') +
        ' |',
    );
  }
  lines.push('');
}

lines.push('## Cobertura');
lines.push('');
lines.push(
  '- Reglas en el catalogo: **' + rules.length + '**',
);
lines.push(
  '- Reglas con fixture propio: **' + covered + '**',
);
lines.push(
  '- Cobertura: **' +
    Math.round((covered / rules.length) * 100) +
    '%** de las reglas del catalogo',
);
if (missing.length > 0) {
  lines.push(
    '- Reglas sin fixture: ' +
      missing.map((code) => '`' + code + '`').join(', '),
  );
}
lines.push('');

mkdirSync(path.dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, lines.join('\n'), 'utf8');
console.log(
  'Catalogo: ' + rules.length + ' reglas, ' + covered + ' con fixture -> ' + OUTPUT,
);
