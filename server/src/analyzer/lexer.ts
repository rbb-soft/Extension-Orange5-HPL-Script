/**
 * Tokenizador de HPL con posiciones absolutas.
 *
 * Reproduce la tokenizacion de la implementacion de referencia. El
 * tokenizador nativo decide el comportamiento de una sentencia a partir de
 * su contenido y de los nombres de macro conocidos, de modo que aqui se
 * replican esas mismas decisiones, anotando cada token con su desplazamiento
 * absoluto para poder emitir diagnosticos con linea y columna.
 */
import { compactText, declarationOperand, partitionUnquoted, trimChars } from './source';

export interface Token {
  text: string;
  /** Desplazamiento absoluto del inicio del token. */
  start: number;
  /** Desplazamiento absoluto del final del token (exclusivo). */
  end: number;
  /** Linea base 0 del inicio del token. */
  line: number;
  /** Columna base 0 del inicio del token. */
  column: number;
}

export interface LexLine {
  /** Linea ya sin comentario ni espacios exteriores. */
  text: string;
  /** Desplazamiento absoluto del primer caracter de `text`. */
  offset: number;
  /** Linea base 0. */
  line: number;
}

export interface LexError {
  code: string;
  message: string;
  offset: number;
  length: number;
}

export interface LexResult {
  tokens: Token[];
  errors: LexError[];
}

export type PositionResolver = (offset: number) => { line: number; character: number };

const MACRO_ARGS_MAX = 16;
const PRINT_EMPTY_PAYLOAD = /^(?:PRINT(?:=[SPEALIT]?)?|GET=?)\(\)(?![\s\S])/;
const LOOP_TAIL = /^LOOP=?\([^)]*\)(?![\s\S])/;
const REGINFO_FULL = /^REGINFO=[^,=]+=[^=]+(?![\s\S])/;
const REGINFO_KEY = /^REGINFO=[^,=]+(?![\s\S])/;

/**
 * Divide el cuerpo de una seccion en tokens.
 *
 * @param lines        lineas ya limpias de comentario
 * @param macroNames   macros declaradas hasta este punto (referencia adelantada
 *                     con `_#` incluida)
 * @param forwardNames todos los nombres de macro local de la unidad
 */
export function tokenize(
  lines: LexLine[],
  macroNames: Set<string>,
  forwardNames: Set<string>,
  resolve: PositionResolver,
): LexResult {
  const tokens: Token[] = [];
  const errors: LexError[] = [];

  let buf: string[] = [];
  let bufStart = 0;
  let quote = false;
  let depth = 0;
  let startLine = 0;
  let afterClose = false;
  let loopTail = false;
  let reginfoText = false;

  const push = (text: string, start: number, end: number): void => {
    const position = resolve(start);
    tokens.push({
      text,
      start,
      end,
      line: position.line,
      column: position.character,
    });
  };

  const flush = (): void => {
    buf = [];
  };

  for (const line of lines) {
    let macroSkipUntil = 0;
    const text = line.text;
    const base = line.offset;

    for (let offset = 0; offset <= text.length; offset += 1) {
      const char = offset < text.length ? text[offset] : '\n';
      const absolute = base + offset;
      const rest = offset + 1 <= text.length ? text.slice(offset + 1) : '';

      if (offset < macroSkipUntil) {
        continue;
      }

      if (reginfoText) {
        if (char === '"') {
          quote = !quote;
        }
        if (char === '\n' || (char === ')' && !quote)) {
          if (quote) {
            errors.push({
              code: 'hpl.string.unclosed',
              message: `Unclosed REGINFO string at line ${line.line + 1}`,
              offset: absolute,
              length: 1,
            });
            quote = false;
          }
          push(buf.join('').replace(/^[ \t\n]+|[ \t\n]+$/g, ''), bufStart, absolute);
          flush();
          reginfoText = false;
        } else {
          buf.push(char);
        }
        continue;
      }

      if (loopTail) {
        if (char !== '{' && char !== '\n') {
          continue;
        }
        loopTail = false;
      }

      if (!quote && depth === 0) {
        const isDelimiter = '=()?'.includes(char);
        const compacted = isDelimiter ? compactText(buf.join('')) : '';

        if (isDelimiter && !compacted && !trimChars(rest, ' \t')) {
          // El token vacio del lector nativo avanza al siguiente registro.
          flush();
          continue;
        }

        const macroName = isDelimiter ? compactText(buf.join('')).replace('_#', '_') : '';
        const isMacro = isDelimiter
          ? (char === '(' ? forwardNames.has(macroName) : macroNames.has(macroName))
          : false;

        if (char === '(' && isMacro) {
          const args: string[] = [];
          let position = offset + 1;
          let failed = false;
          for (let index = 0; index < MACRO_ARGS_MAX; index += 1) {
            const [arg, next] = declarationOperand(text, position);
            if (!arg) {
              errors.push({
                code: 'hpl.macro.argCount',
                message: 'Macro requires nonempty arguments',
                offset: absolute,
                length: 1,
              });
              failed = true;
              break;
            }
            args.push(arg);
            const closed = next > position && text[next - 1] === ')';
            position = next;
            if (closed) {
              break;
            }
          }
          if (failed) {
            flush();
            continue;
          }
          const joined = compactText(buf.join('')) + '(' + args.join(',') + ')';
          push(joined, bufStart, base + position);
          while (position < text.length && (text[position] === ' ' || text[position] === '\t')) {
            position += 1;
          }
          if (position < text.length && text[position] === ',') {
            position += 1;
          }
          macroSkipUntil = position;
          flush();
          continue;
        }

        if ('=?)'.includes(char) && isMacro) {
          push(trimChars(buf.join(''), ' \t\n'), bufStart, absolute);
          flush();
          continue;
        }

        const assignment = compacted ? partitionUnquoted(compacted, '=') : null;
        const scalar =
          !!assignment &&
          !['PRINT', 'GET', 'LOOP', 'REGINFO'].includes(assignment[0]) &&
          !!assignment[1];
        const previous = tokens.length > 0 ? tokens[tokens.length - 1] : undefined;
        const infoValue =
          !!compacted &&
          (REGINFO_FULL.test(compacted) ||
            (!!previous &&
              previous.line === line.line &&
              REGINFO_KEY.test(compactText(previous.text))));

        if (
          (scalar || infoValue) &&
          !(char === '(' && scalar && assignment![1].startsWith('@'))
        ) {
          push(trimChars(buf.join(''), ' \t\n'), bufStart, absolute);
          flush();
          continue;
        }
      }

      if (char === '\n' && (quote || depth)) {
        errors.push({
          code: 'hpl.string.unclosed',
          message: `Unclosed expression at line ${line.line + 1}`,
          offset: absolute,
          length: 1,
        });
        quote = false;
        depth = 0;
      }

      const blockSeparator = afterClose && char === ',';
      if (afterClose && !' \t\r'.includes(char)) {
        if (!',=()?}\n'.includes(char)) {
          errors.push({
            code: 'hpl.block.missingSeparator',
            message: `Missing separator after block at line ${line.line + 1}`,
            offset: absolute,
            length: 1,
          });
        }
        if (char !== '}') {
          afterClose = false;
        }
        if (',=()?'.includes(char)) {
          continue;
        }
      }

      if (buf.length === 0 && !' \t\r\n'.includes(char)) {
        startLine = line.line;
        bufStart = absolute;
      }

      if (
        (char === ',' || char === '=') &&
        REGINFO_KEY.test(compactText(buf.join(''))) &&
        rest.replace(/^[ \t]+/, '').startsWith('"')
      ) {
        buf.push(char);
        reginfoText = true;
        continue;
      }

      if (char === '"') {
        quote = !quote;
      }
      if (!quote) {
        if (char === '(') {
          depth += 1;
        }
        if (char === ')') {
          depth -= 1;
          if (depth < 0) {
            errors.push({
              code: 'hpl.paren.unbalanced',
              message: `Unbalanced parentheses at line ${line.line + 1}`,
              offset: absolute,
              length: 1,
            });
            depth = 0;
          }
        }
        if (depth === 0 && ',{}\n'.includes(char)) {
          const statement = trimChars(buf.join(''), ' \t\n');
          if (
            char === ',' &&
            !statement &&
            !blockSeparator &&
            trimChars(rest, ' \t\r') !== ''
          ) {
            errors.push({
              code: 'hpl.statement.empty',
              message: `Empty statement at line ${line.line + 1}`,
              offset: absolute,
              length: 1,
            });
          }
          if (statement) {
            push(statement, bufStart, absolute);
          }
          flush();
          if (char === '{' || char === '}') {
            push(char, absolute, absolute + 1);
          }
          if (char === '}') {
            afterClose = true;
          }
          continue;
        }
      }

      buf.push(char);

      if (char === ')' && !quote && depth === 0 && PRINT_EMPTY_PAYLOAD.test(compactText(buf.join('')))) {
        // El payload de longitud cero salta al siguiente registro: el resto
        // de la linea, incluidas las llaves posteriores, se ignora.
        errors.push({
          code: 'hpl.adv.payloadEmpty',
          message:
            'The zero-length PRINT/GET payload makes the reference implementation ignore the rest of the line',
          offset: bufStart,
          length: absolute - bufStart,
        });
        flush();
        afterClose = false;
        break;
      }
      if (char === ')' && !quote && depth === 0 && LOOP_TAIL.test(compactText(buf.join('')))) {
        loopTail = true;
      }
    }
  }

  void startLine;

  // El tokenizador nativo fusiona un REGINFO de un solo operando con el
  // token siguiente: `REGINFO=CONST` y `3` pasan a ser `REGINFO=CONST,3`.
  const merged: Token[] = [];
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index];
    let text = token.text;
    let end = token.end;
    if (
      text.startsWith('REGINFO=') &&
      countEquals(text) === 1 &&
      partitionUnquoted(text, ',') === null
    ) {
      const next = tokens[index + 1];
      if (!next || next.text === '{' || next.text === '}') {
        errors.push({
          code: 'hpl.statement.unsupported',
          message: 'REGINFO requires a value',
          offset: token.start,
          length: token.end - token.start,
        });
      } else {
        text += ',' + next.text;
        end = next.end;
        index += 1;
      }
    }
    merged.push({ ...token, text, end });
    index += 1;
  }

  if (depth > 0 || quote) {
    errors.push({
      code: 'hpl.string.unclosed',
      message: 'Unclosed parentheses or string',
      offset: merged.length > 0 ? merged[merged.length - 1].end : 0,
      length: 1,
    });
  }

  const tail = trimChars(buf.join(''), ' \t\r\n');
  if (tail) {
    const position = resolve(bufStart);
    merged.push({
      text: tail,
      start: bufStart,
      end: bufStart + tail.length,
      line: position.line,
      column: position.character,
    });
  }

  return { tokens: merged, errors };
}

/** Cuenta las apariciones de un caracter. */
function countEquals(text: string): number {
  let count = 0;
  for (const char of text) {
    if (char === '=') {
      count += 1;
    }
  }
  return count;
}
