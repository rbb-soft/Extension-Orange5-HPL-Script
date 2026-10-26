/**
 * Test diferencial contra la implementación de referencia.
 *
 * Invariante central (plan §8.2):
 *
 *   El linter jamais debe aceptar un archivo que la implementación de
 *   referencia rechaza.
 *
 * El oráculo se ejecuta como proceso separado: `tools/oracle/reference_verdicts.py`
 * importa el programa de referencia en modo de solo lectura y emite un veredicto por
 * archivo. Las rutas del corpus y del programa de referencia se toman de las variables de
 * entorno `HPL_CORPUS` y `HPL_REFERENCE_PROGRAM`; sin ellas la prueba se omite.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import * as path from 'node:path';
import { analyze, hasError } from '../src/analyzer';

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const ORACLE = path.join(PROJECT_ROOT, 'tools', 'oracle', 'reference_verdicts.py');
const VERDICTS = path.join(PROJECT_ROOT, 'out', 'verdicts.json');

interface Verdict {
  path: string;
  accepted: boolean;
  error: string | null;
}

interface OraclePayload {
  total: number;
  accepted: number;
  rejected: number;
  results: Verdict[];
}

function runOracle(): OraclePayload | null {
  const corpus = process.env.HPL_CORPUS;
  const program = process.env.HPL_REFERENCE_PROGRAM;
  if (!corpus || !program) {
    return null;
  }
  if (!existsSync(corpus) || !existsSync(program)) {
    return null;
  }

  const result = spawnSync(
    process.env.PYTHON ?? 'python',
    [
      '-B',
      ORACLE,
      '--program',
      program,
      '--corpus',
      corpus,
      '--output',
      VERDICTS,
      '--quiet',
    ],
    { encoding: 'utf8', cwd: PROJECT_ROOT },
  );
  if (result.status !== 0) {
    throw new Error(
      'El oráculo fallo: ' + (result.stderr || result.stdout || 'sin salida'),
    );
  }
  return JSON.parse(readFileSync(VERDICTS, 'utf8')) as OraclePayload;
}

describe('oráculo diferencial', () => {
  test(
    'el linter nunca acepta lo que la implementación de referencia rechaza',
    {
      skip:
        (!process.env.HPL_CORPUS || !process.env.HPL_REFERENCE_PROGRAM) &&
        'HPL_CORPUS o HPL_REFERENCE_PROGRAM no esta definido',
    },
    () => {
      const payload = runOracle();
      assert.ok(payload, 'el oráculo no produjo veredictos');
      assert.ok(payload.total > 0, 'el corpus esta vacio');

      const falseNegatives: string[] = [];
      const falsePositives: string[] = [];
      let checked = 0;

      for (const verdict of payload.results) {
        const raw = readFileSync(verdict.path, 'latin1');
        const diagnostics = analyze(raw);
        const linterAccepts = !hasError(diagnostics);
        checked += 1;

        if (!verdict.accepted && linterAccepts) {
          // Direccion peligrosa: el linter deja pasar un archivo que la
          // implementacion de referencia rechaza.
          falseNegatives.push(
            verdict.path + ' :: ' + String(verdict.error).slice(0, 160),
          );
          continue;
        }
        if (verdict.accepted && !linterAccepts) {
          const first = diagnostics.find((item) => item.severity === 'error');
          falsePositives.push(
            verdict.path +
              ' :: ' +
              String(first?.code) +
              ' L' +
              String((first?.range.start.line ?? 0) + 1) +
              ' ' +
              String(first?.message ?? '').slice(0, 120),
          );
        }
      }

      const report = {
        checked,
        corpus: payload.total,
        accepted: payload.accepted,
        rejected: payload.rejected,
        falseNegatives,
        falsePositives,
      };
      mkdirSync(path.join(PROJECT_ROOT, 'out'), { recursive: true });
      writeFileSync(
        path.join(PROJECT_ROOT, 'out', 'differential-report.json'),
        JSON.stringify(report, null, 2),
        'utf8',
      );

      assert.equal(
        falseNegatives.length,
        0,
        'el linter acepto ' +
          falseNegatives.length +
          ' archivos que la implementación de referencia rechaza:\n' +
          falseNegatives.slice(0, 20).join('\n'),
      );
    },
  );
});
