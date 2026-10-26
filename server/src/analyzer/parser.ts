/**
 * Parser estructural de HPL.
 *
 * Reproduce el analisis de la unidad y la construccion de nodos de la
 * implementacion de referencia, anotando cada nodo con su posicion.
 */
import {
  Block,
  HeaderDecl,
  ParsedUnit,
  SECTION_FLAGS,
  SectionDecl,
  Statement,
  StatementNode,
} from './ast';
import { DiagnosticSink, Range } from './diagnostics';
import { LexLine, LexError, Token, tokenize } from './lexer';
import { compactText, NormalizedSource, SourceRecord } from './source';

const LOOP_FORM = /^LOOP=?\([^)]*\)$/;

interface LineInfo {
  /** Texto de la linea sin comentario ni espacios exteriores. */
  text: string;
  /** Desplazamiento absoluto del inicio del texto. */
  offset: number;
  line: number;
}

function resolveLine(record: SourceRecord): LineInfo | null {
  const code = record.code;
  let leading = 0;
  while (leading < code.length && (code[leading] === ' ' || code[leading] === '\t')) {
    leading += 1;
  }
  let trailing = code.length;
  while (
    trailing > leading &&
    (code[trailing - 1] === ' ' || code[trailing - 1] === '\t')
  ) {
    trailing -= 1;
  }
  const text = code.slice(leading, trailing);
  if (!text) {
    return null;
  }
  return {
    text,
    offset: record.offset + record.codeOffset + leading,
    line: record.line,
  };
}

export interface ParseResult {
  unit: ParsedUnit;
  /** Tokens por seccion, indexados igual que `unit.sections`. */
  sectionTokens: Token[][];
}

export function parseUnit(
  source: NormalizedSource,
  sink: DiagnosticSink,
): ParseResult {
  const headers: HeaderDecl[] = [];
  const sections: SectionDecl[] = [];
  const bodies: LineInfo[][] = [];

  let current: SectionDecl | null = null;
  let currentBody: LineInfo[] = [];

  const rangeOf = (start: number, end: number): Range => {
    const from = positionAt(source, start);
    const to = positionAt(source, end);
    return { start: from, end: to };
  };

  for (const record of source.records) {
    if (record.tooLong) {
      sink.add(
        'hpl.record.tooLong',
        rangeOf(record.offset, record.offset + 1),
        'Line exceeds the native 8191 character record limit',
      );
    }
    if (record.afterEof) {
      sink.add(
        'hpl.record.afterEof',
        rangeOf(record.offset, record.offset + 1),
        'Content after Ctrl+Z is ignored by the reference implementation',
        'warning',
      );
    }

    const info = resolveLine(record);
    if (!info) {
      continue;
    }

    if (info.text.startsWith('[')) {
      if (current) {
        current.body = [];
        currentBody = [];
      }
      const parsed = parseSectionHeader(info, sink, rangeOf);
      if (parsed) {
        current = parsed.section;
        sections.push(current);
        bodies.push(currentBody);
        if (parsed.tail) {
          currentBody.push(parsed.tail);
        }
      }
      continue;
    }

    if (!current) {
      headers.push({
        kind: 'header',
        key: headerKey(info.text),
        value: headerValue(info.text),
        text: compactText(info.text),
        line: info.line,
        column: columnAt(source, info.offset),
        offset: info.offset,
        endOffset: info.offset + info.text.length,
      });
      continue;
    }

    currentBody.push(info);
  }

  // Nombres de macro local: los declarados hasta cada seccion y el total.
  const allLocal = new Set<string>();
  for (const section of sections) {
    if (section.local) {
      allLocal.add(section.name);
    }
  }

  const known = new Set<string>();
  const sectionTokens: Token[][] = [];

  for (let index = 0; index < sections.length; index += 1) {
    const section = sections[index];
    if (section.local) {
      known.add(section.name);
    }
    const lines: LexLine[] = bodies[index].map((info) => ({
      text: info.text,
      offset: info.offset,
      line: info.line,
    }));
    const lex = tokenize(
      lines,
      known,
      allLocal,
      (offset) => positionAt(source, offset),
    );
    reportLexErrors(lex.errors, sink, rangeOf);
    sectionTokens.push(lex.tokens);
    section.body = buildNodes(lex.tokens, sink, rangeOf);
  }

  return { unit: { headers, sections }, sectionTokens };
}

function reportLexErrors(
  errors: LexError[],
  sink: DiagnosticSink,
  rangeOf: (start: number, end: number) => Range,
): void {
  for (const error of errors) {
    sink.add(error.code, rangeOf(error.offset, error.offset + error.length), error.message);
  }
}

function headerKey(text: string): string {
  const match = /^([A-Za-z0-9$]+)=/.exec(text);
  return match ? match[1].toUpperCase() : '';
}

function headerValue(text: string): string {
  const index = text.indexOf('=');
  return index >= 0 ? text.slice(index + 1) : '';
}

interface SectionHeaderResult {
  section: SectionDecl;
  tail: LineInfo | null;
}

function parseSectionHeader(
  info: LineInfo,
  sink: DiagnosticSink,
  rangeOf: (start: number, end: number) => Range,
): SectionHeaderResult | null {
  const text = info.text;
  let quoted = false;
  let end = text.length;
  let tail: string | null = null;
  let tailOffset = 0;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      quoted = !quoted;
    } else if (!quoted && ',=()?{}'.includes(char)) {
      if (char !== ',') {
        sink.add(
          'hpl.section.delimiter',
          rangeOf(info.offset + index, info.offset + index + 1),
          `Unexpected section delimiter at line ${info.line + 1}`,
        );
        return null;
      }
      end = index;
      tail = text.slice(index + 1);
      tailOffset = index + 1;
      break;
    }
  }

  let name = compactText(text.slice(1, end)).split(']')[0].replace(/"/g, '');
  const nameOffset = info.offset + 1;

  if (name.length > 20) {
    sink.add(
      'hpl.section.nameTooLong',
      rangeOf(nameOffset, nameOffset + name.length),
      `Invalid section name at line ${info.line + 1}: maximum 20 bytes`,
    );
  }

  let local = name.startsWith('_');
  if (local) {
    name = name.slice(1);
  }

  let flags = 0;
  while (name.length > 0 && SECTION_FLAGS[name[0]] !== undefined) {
    flags |= SECTION_FLAGS[name[0]];
    name = name.slice(1);
  }

  if (local && !name) {
    sink.add(
      'hpl.section.emptyLocalName',
      rangeOf(nameOffset, nameOffset + 1),
      `Empty local function name at line ${info.line + 1}`,
    );
    return null;
  }
  if (local) {
    name = '_' + name;
  }

  const section: SectionDecl = {
    kind: 'section',
    name,
    flags,
    local,
    line: info.line,
    column: columnAtFrom(rangeOf, info.offset),
    offset: info.offset,
    endOffset: info.offset + text.length,
    body: [],
  };

  let tailLine: LineInfo | null = null;
  if (tail !== null) {
    const trimmed = tail.trim();
    if (trimmed) {
      tailLine = {
        text: trimmed,
        offset: info.offset + tailOffset + (tail.length - tail.trimStart().length),
        line: info.line,
      };
    }
  }

  return { section, tail: tailLine };
}

/**
 * Construye el arbol de sentencias y bloques a partir de los tokens.
 *
 * La construccion de nodos de la implementacion de referencia exige que un
 * bloque tenga su llave de apertura en la misma linea que el inicio de la
 * condicion.
 */
function buildNodes(
  tokens: Token[],
  sink: DiagnosticSink,
  rangeOf: (start: number, end: number) => Range,
): StatementNode[] {
  let position = 0;

  const parse = (nested: boolean): StatementNode[] => {
    const result: StatementNode[] = [];
    while (position < tokens.length) {
      const token = tokens[position];
      position += 1;
      if (token.text === '}') {
        if (!nested) {
          sink.add(
            'hpl.block.unexpectedClose',
            rangeOf(token.start, token.end),
            `Unexpected close brace at line ${token.line + 1}`,
          );
          return result;
        }
        return result;
      }
      if (token.text === '{') {
        sink.add(
          'hpl.block.withoutCondition',
          rangeOf(token.start, token.end),
          `Block without condition at line ${token.line + 1}`,
        );
        return result;
      }
      if (position < tokens.length && tokens[position].text === '{') {
        const brace = tokens[position];
        if (brace.line !== token.line) {
          sink.add(
            'hpl.block.braceNotOnConditionLine',
            rangeOf(brace.start, brace.end),
            `Block must begin on the condition line ${token.line + 1}`,
          );
        }
        position += 1;
        result.push({
          kind: 'block',
          condition: compactText(token.text),
          line: token.line,
          column: token.column,
          offset: token.start,
          endOffset: token.end,
          body: parse(true),
        });
        continue;
      }
      if (LOOP_FORM.test(compactText(token.text))) {
        result.push({
          kind: 'block',
          condition: compactText(token.text),
          line: token.line,
          column: token.column,
          offset: token.start,
          endOffset: token.end,
          body: parse(true),
        });
        continue;
      }
      result.push({
        kind: 'statement',
        text: compactText(token.text),
        line: token.line,
        column: token.column,
        offset: token.start,
        endOffset: token.end,
      });
    }
    if (nested) {
      sink.add(
        'hpl.block.unclosed',
        rangeOf(
          tokens.length > 0 ? tokens[tokens.length - 1].start : 0,
          tokens.length > 0 ? tokens[tokens.length - 1].end : 1,
        ),
        'Unclosed block',
      );
    }
    return result;
  };

  return parse(false);
}

function positionAt(source: NormalizedSource, offset: number): { line: number; character: number } {
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

function columnAt(source: NormalizedSource, offset: number): number {
  return positionAt(source, offset).character;
}

function columnAtFrom(
  rangeOf: (start: number, end: number) => Range,
  offset: number,
): number {
  return rangeOf(offset, offset).start.character;
}

export type { Statement, Block, HeaderDecl, SectionDecl };
