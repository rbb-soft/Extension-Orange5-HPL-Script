/**
 * Motor de analisis del lenguaje HPL.
 *
 * Punto de entrada del linter. `analyze()` es una funcion pura: recibe el
 * texto del documento y devuelve la lista de diagnosticos, sin estado
 * compartido y sin dependencias de VS Code.
 *
 * El motor NO genera HPX, no invoca la implementacion de referencia y no accede
 * a ningun recurso externo.
 */
import { ParsedUnit, SectionDecl, StatementNode, SYSTEM_SECTIONS } from './ast';
import { DiagnosticSink, HplDiagnostic, Range, Severity } from './diagnostics';
import { parseUnit } from './parser';
import { parseInteger } from './literals';
import { isRegister, operandToken } from './operands';
import { processHeaders } from './rules/headers';
import { createStatementContext, validateBody } from './rules/statements';
import { readSource } from './source';
import { createTables, SymbolTables } from './symbols';

export { ALL_RULE_CODES, defaultSeverity, RULE_SEVERITIES } from './diagnostics';
export type { HplDiagnostic, Range, Severity } from './diagnostics';

const MAX_USER_SECTIONS = 16;
const MAX_MACROS = 64;
const CODE_SLOT_LIMIT = 4096;
const SLOT_WARNING_RATIO = 0.9;

/**
 * Analiza un documento HPL completo.
 *
 * @param text contenido integro del archivo
 */
export function analyze(text: string): HplDiagnostic[] {
  const sink = new DiagnosticSink();
  try {
    analyzeInternal(text, sink);
  } catch (error) {
    sink.add(
      'hpl.internalError',
      { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
      'Internal analyser error: ' + describe(error),
    );
  }
  return sink.finish();
}

/**
 * Aplica la severidad configurada por el usuario a cada diagnostico.
 *
 * `ignore` elimina el diagnostico de la lista publicada.
 */
export function applySeverityOverrides(
  diagnostics: HplDiagnostic[],
  overrides: Record<string, string> | undefined,
): HplDiagnostic[] {
  if (!overrides) {
    return diagnostics;
  }
  const result: HplDiagnostic[] = [];
  for (const diagnostic of diagnostics) {
    const override = overrides[diagnostic.code];
    if (!override) {
      result.push(diagnostic);
      continue;
    }
    if (override === 'ignore') {
      continue;
    }
    if (override === 'error' || override === 'warning' || override === 'hint') {
      result.push({ ...diagnostic, severity: override });
      continue;
    }
    result.push(diagnostic);
  }
  return result;
}

/** `true` si el diagnostico tiene severidad de error. */
export function hasError(diagnostics: HplDiagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === 'error');
}

function analyzeInternal(text: string, sink: DiagnosticSink): void {
  if (text.includes('�')) {
    sink.add(
      'hpl.adv.encodingMismatch',
      { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
      'The file contains bytes that are not valid UTF-8; the reference implementation reads it as Latin-1',
      'hint',
    );
  }

  const source = readSource(text);
  const rangeOf = (start: number, end: number): Range => {
    const from = positionAt(source, start);
    const to = positionAt(source, end);
    return { start: from, end: to };
  };

  const { unit } = parseUnit(source, sink);
  const tables = createTables();

  processHeaders(unit.headers, tables, sink, rangeOf);
  dropReservedAliases(tables);

  collectSections(unit, tables, sink, rangeOf);
  validateBodies(unit, tables, sink, rangeOf);
}

/**
 * Limpieza final de los alias, como en la implementacion de referencia.
 *
 * Un alias que colisione con un registro, `DATA`, `ADR`, `MARK`, `LOG` o `I`
 * se elimina de las tablas de pines y buses y deja de ser resoluble. La
 * clasificacion usa la misma funcion de operando que el resto del analizador.
 */
function dropReservedAliases(tables: SymbolTables): void {
  for (const table of [tables.pins, tables.inputs, tables.buses, tables.busInputs]) {
    for (const alias of [...table.keys()]) {
      const token = operandToken(tables, alias).token;
      if (
        token !== alias ||
        isRegister(token) ||
        ['DATA', 'ADR', 'MARK', 'LOG', 'I'].includes(token) ||
        /^(R[0-9A-Fa-f]{1,2}|CONST|DATA|ADR)\[.*\]$/.test(token)
      ) {
        table.delete(alias);
      }
    }
  }
}

/**
 * Comprueba duplicados y limites de seccion, y registra las macros.
 *
 * Reproduce el bucle de secciones de la implementacion de referencia.
 */
function collectSections(
  unit: ParsedUnit,
  tables: ReturnType<typeof createTables>,
  sink: DiagnosticSink,
  rangeOf: (start: number, end: number) => Range,
): void {
  const visible: string[] = [];
  const systemDefined = new Set<string>();
  const macros = new Set<string>();

  for (const section of unit.sections) {
    const range = rangeOf(section.offset, section.endOffset);

    if (section.local) {
      const key = section.name.replace('_#', '_');
      if (macros.has(key)) {
        sink.add('hpl.macro.duplicate', range, 'Duplicate macro: ' + section.name);
      } else if (macros.size >= MAX_MACROS) {
        sink.add('hpl.macro.tooMany', range, 'Too many user functions');
      } else {
        macros.add(key);
      }
      tables.macros.set(key, section.line);
      continue;
    }

    const systemIndex = SYSTEM_SECTIONS.indexOf(section.name);
    if (section.name && systemIndex >= 0) {
      if (systemDefined.has(section.name)) {
        sink.add(
          'hpl.section.systemAlreadyDefined',
          range,
          'Section already defined: ' + section.name,
        );
        continue;
      }
      systemDefined.add(section.name);
      continue;
    }

    if (section.name && visible.includes(section.name) && !section.flags) {
      sink.add('hpl.section.duplicate', range, 'Duplicate section: ' + section.name);
      continue;
    }
    if (10 + visible.length >= 26) {
      sink.add('hpl.section.tooMany', range, 'Too many user sections');
      continue;
    }
    visible.push(section.name);
    tables.sections.set(section.name, section.line);
  }
}

/** Valida el cuerpo de cada seccion. */
function validateBodies(
  unit: ParsedUnit,
  tables: ReturnType<typeof createTables>,
  sink: DiagnosticSink,
  rangeOf: (start: number, end: number) => Range,
): void {
  for (const section of unit.sections) {
    const ctx = createStatementContext(tables, sink, rangeOf);
    validateBody(section.body, ctx);
  }

  const estimated = estimateSlots(unit);
  if (estimated > CODE_SLOT_LIMIT) {
    sink.add(
      'hpl.codeSlotsExceeded',
      { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
      `Estimated ${estimated} code slots exceeds the native limit of ${CODE_SLOT_LIMIT}`,
    );
  } else if (estimated >= CODE_SLOT_LIMIT * SLOT_WARNING_RATIO) {
    sink.add(
      'hpl.adv.codeSlotsNearLimit',
      { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
      `Estimated ${estimated} code slots approaches the native limit of ${CODE_SLOT_LIMIT}`,
      'hint',
    );
  }
}

/**
 * Estimacion de los slots de codigo generados.
 *
 * Reproduce la contabilidad de la implementacion de referencia:
 * una instruccion por sentencia, dos por bloque (comparacion y guarda, o
 * indice y cierre), una por `BREAK`, el payload de `PRINT`/`GET` mas su
 * instruccion, y una instruccion de cierre por seccion.
 */
export function estimateSlots(unit: ParsedUnit): number {
  let slots = 0;

  const walk = (nodes: StatementNode[]): void => {
    for (const node of nodes) {
      if (node.kind === 'block') {
        slots += 2;
        walk(node.body);
        continue;
      }
      const text = node.text;
      if (text === 'BREAK') {
        slots += 1;
        continue;
      }
      if (/^R[0-9A-Fa-f]{1,2}=LOG$/.test(text)) {
        // `LOG` no genera instruccion: la implementacion de referencia lo descarta.
        continue;
      }
      const payload = /^(?:PRINT|GET)(?:=[SPEALIT]?)?\(([\s\S]*)\)$/i.exec(text);
      if (payload) {
        const raw = payload[1];
        if (!raw) {
          // Un payload de longitud cero no reserva slots.
          continue;
        }
        slots += 1 + ((raw.length + 1) >> 3) + 1;
        continue;
      }
      slots += 1;
    }
  };

  for (const section of unit.sections) {
    walk(section.body);
    slots += 1;
  }
  return slots;
}

function positionAt(
  source: ReturnType<typeof readSource>,
  offset: number,
): { line: number; character: number } {
  const { lineStarts } = source;
  let low = 0;
  let high = lineStarts.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (lineStarts[middle] <= offset) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return { line: low, character: offset - lineStarts[low] };
}

function describe(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export type { SectionDecl };
