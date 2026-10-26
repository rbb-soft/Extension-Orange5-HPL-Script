/**
 * Pruebas unitarias del analizador HPL.
 *
 * Cada fixture de `fixtures/invalid/<codigo-de-regla>/` declara los codigos de
 * diagnostico que debe producir, con su severidad y su linea. Los fixtures de
 * `fixtures/valid/` no deben producir ninguno.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { analyze, applySeverityOverrides, hasError } from '../src/analyzer';
import { parseInteger } from '../src/analyzer/literals';

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const FIXTURES = path.join(PROJECT_ROOT, 'fixtures');

interface Expected {
  code: string;
  severity: string;
  line?: number;
}

interface Manifest {
  valid: string[];
  invalid: { file: string; expected: Expected[] }[];
}

const manifest = JSON.parse(
  readFileSync(path.join(FIXTURES, 'manifest.json'), 'utf8'),
) as Manifest;

describe('analizador HPL', () => {
  describe('fixtures validos', () => {
    for (const file of manifest.valid) {
      test(file, () => {
        const source = readFileSync(path.join(FIXTURES, file), 'utf8');
        const diagnostics = analyze(source);
        assert.deepEqual(
          diagnostics.map((item) => item.code + ' L' + (item.range.start.line + 1)),
          [],
          file + ' deberia analizarse sin diagnosticos',
        );
      });
    }
  });

  describe('fixtures invalidos', () => {
    for (const item of manifest.invalid) {
      test(item.file, () => {
        const source = readFileSync(path.join(FIXTURES, item.file), 'utf8');
        const diagnostics = analyze(source);
        for (const expected of item.expected) {
          const match = diagnostics.find((entry) => entry.code === expected.code);
          assert.ok(
            match,
            item.file + ' deberia producir ' + expected.code + '; produjo ' +
              JSON.stringify(diagnostics.map((entry) => entry.code)),
          );
          assert.equal(match.severity, expected.severity, expected.code + ' severidad');
          if (expected.line !== undefined) {
            assert.equal(
              match.range.start.line + 1,
              expected.line,
              expected.code + ' linea',
            );
          }
        }
        if (item.expected.some((entry) => entry.severity === 'error')) {
          assert.ok(
            hasError(diagnostics),
            item.file + ' deberia producir al menos un error',
          );
        }
        assert.ok(
          diagnostics.length > 0,
          item.file + ' deberia producir al menos un diagnostico',
        );
      });
    }
  });

  describe('fuentes de referencia', () => {
    const sourcesRoot = process.env.HPL_SOURCES;
    const skip =
      !sourcesRoot || !existsSync(sourcesRoot)
        ? 'HPL_SOURCES no esta definido o el directorio no existe'
        : false;

    function collectSources(directory: string): string[] {
      const found: string[] = [];
      const entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
        left.name.localeCompare(right.name),
      );
      for (const entry of entries) {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          found.push(...collectSources(full));
        } else if (entry.name.toLowerCase().endsWith('.hpl')) {
          found.push(full);
        }
      }
      return found;
    }

    test('las fuentes de referencia no producen diagnosticos', { skip }, () => {
      const files = collectSources(sourcesRoot as string);
      for (const file of files) {
        const source = readFileSync(file, 'latin1');
        assert.deepEqual(
          analyze(source),
          [],
          file + ' deberia analizarse sin diagnosticos',
        );
      }
    });
  });

  describe('literales enteros', () => {
    test('acepta las cuatro bases', () => {
      assert.deepEqual(parseInteger('42'), { ok: true, value: 42 });
      assert.deepEqual(parseInteger('0x1F'), { ok: true, value: 31 });
      assert.deepEqual(parseInteger('1FH'), { ok: true, value: 31 });
      assert.deepEqual(parseInteger('1010b'), { ok: true, value: 10 });
    });

    test('satura en 32 bits sin signo', () => {
      const result = parseInteger('FFFFFFFFH');
      assert.ok(result.ok);
      assert.equal(result.ok && result.value, 0xffffffff);
    });

    test('rechaza un literal no soportado', () => {
      const result = parseInteger('12ZZ');
      assert.equal(result.ok, false);
    });
  });

  describe('severidad configurable por codigo', () => {
    test('una regla puede degradarse a aviso', () => {
      const diagnostics = analyze('["Main"]\nINEXISTENTE=1\n');
      assert.ok(diagnostics.length > 0);
      const adjusted = applySeverityOverrides(diagnostics, {
        'hpl.operand.unknownAssignment': 'warning',
      });
      assert.equal(
        adjusted.find((item) => item.code === 'hpl.operand.unknownAssignment')
          ?.severity,
        'warning',
      );
    });

    test('una regla puede ignorarse', () => {
      const diagnostics = analyze('["Main"]\nINEXISTENTE=1\n');
      const adjusted = applySeverityOverrides(diagnostics, {
        'hpl.operand.unknownAssignment': 'ignore',
      });
      assert.equal(
        adjusted.some((item) => item.code === 'hpl.operand.unknownAssignment'),
        false,
      );
    });
  });

  describe('rendimiento', () => {
    test('analiza mil lineas en menos de 50 ms', () => {
      const body = Array.from({ length: 1000 }, (_, index) => 'R' + (index % 16) + '=' + (index % 10));
      const source = ['PINO=SCK,0', '["Main"]', ...body].join('\n') + '\n';
      const started = process.hrtime.bigint();
      analyze(source);
      const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
      assert.ok(elapsedMs < 50, 'el analisis tardo ' + elapsedMs.toFixed(2) + ' ms');
    });
  });
});
