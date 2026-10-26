/**
 * Lectura de registros y utilidades lexicas de HPL.
 *
 * Reproduce el lector nativo por registros (`fgets`) de la implementacion de
 * referencia y las funciones puras de separacion de comentarios y limpieza de
 * espacios de la misma.
 */

/** Longitud maxima de un registro nativo. */
export const MAX_RECORD = 8191;

export interface NormalizedSource {
  /** Texto normalizado: CRLF a LF y corte en Ctrl+Z. */
  text: string;
  /** Desplazamiento de inicio de cada linea. */
  lineStarts: number[];
  /** Registros tal como los leeria el nativo. */
  records: SourceRecord[];
}

export interface SourceRecord {
  /** Texto del registro sin el salto de linea final. */
  text: string;
  /** Desplazamiento absoluto del inicio del registro. */
  offset: number;
  /** Indice de linea (base 0) del inicio del registro. */
  line: number;
  /** Codigo legible: el registro hasta el inicio del comentario. */
  code: string;
  /** Desplazamiento del inicio de `code` dentro del registro. */
  codeOffset: number;
  /** Hay contenido despues de Ctrl+Z que la implementacion de referencia ignora. */
  afterEof: boolean;
  /** El registro excede el limite nativo de 8191 caracteres. */
  tooLong: boolean;
}

/**
 * Normaliza el texto y lo divide en registros como el lector nativo.
 *
 * La lectura por registros de la implementacion de referencia reemplaza CRLF
 * por LF, corta en el primer Ctrl+Z y entrega bloques de hasta 8191
 * caracteres terminados en salto de linea. Un registro que empieza en NUL
 * termina la lectura.
 */
export function readSource(source: string): NormalizedSource {
  const normalized = source.replace(/\r\n/g, '\n').split('\x1a', 1)[0];
  const afterEof = source.includes('\x1a');
  const lineStarts = computeLineStarts(normalized);

  const records: SourceRecord[] = [];
  let position = 0;
  while (position < normalized.length) {
    let end = Math.min(position + MAX_RECORD, normalized.length);
    const newline = normalized.indexOf('\n', position);
    if (newline >= 0 && newline < end) {
      end = newline + 1;
    }
    const raw = normalized.slice(position, end);
    const start = position;
    position = end;

    if (raw.startsWith('\0')) {
      break;
    }
    const effectiveLength = raw.split('\0', 1)[0].length;
    const tooLong = effectiveLength >= MAX_RECORD;

    const text = raw.endsWith('\n') ? raw.slice(0, -1) : raw;
    // El comentario siempre esta al final del registro: el codigo comienza
    // en el desplazamiento 0 del registro.
    const { code } = splitComment(text);
    records.push({
      text,
      offset: start,
      line: lineAt(lineStarts, start),
      code,
      codeOffset: 0,
      afterEof: false,
      tooLong,
    });
  }

  // El contenido posterior a Ctrl+Z se reporta una sola vez, en el registro
  // que contiene el corte.
  if (afterEof && records.length > 0) {
    records[records.length - 1].afterEof = true;
  }

  return { text: normalized, lineStarts, records };
}

function computeLineStarts(text: string): number[] {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) {
      starts.push(index + 1);
    }
  }
  return starts;
}

export function lineAt(lineStarts: number[], offset: number): number {
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
  return low;
}

/**
 * Separa codigo y comentario, como hace la implementacion de referencia.
 *
 * Un `;` abre comentario salvo dentro de comillas. `//` abre comentario
 * completo solo cuando es el primer caracter no-espacio del registro; en
 * posicion media forma parte del codigo. Dentro de una cadena, `""` es una
 * comilla escapada.
 *
 * Devuelve el codigo y el desplazamiento del inicio del comentario, o -1 si
 * el registro no tiene comentario.
 */
export function splitComment(line: string): { code: string; commentAt: number } {
  const nul = line.indexOf('\0');
  const effective = nul >= 0 ? line.slice(0, nul) : line;

  if (/^[ \t\r\n]*\/\//.test(effective)) {
    return { code: '', commentAt: 0 };
  }

  let quote = false;
  let index = 0;
  while (index < effective.length) {
    const char = effective[index];
    if (char === '"') {
      if (quote && index + 1 < effective.length && effective[index + 1] === '"') {
        index += 2;
        continue;
      }
      quote = !quote;
    }
    if (char === ';') {
      return { code: effective.slice(0, index), commentAt: index };
    }
    index += 1;
  }
  return { code: effective, commentAt: -1 };
}

/**
 * Elimina espacios y tabuladores fuera de comillas.
 *
 * Como en la implementacion de referencia: el payload entrecomillado conserva su
 * contenido literal.
 */
export function compactText(text: string): string {
  let out = '';
  let quote = false;
  for (const char of text) {
    if (char === '"') {
      quote = !quote;
    }
    if (quote || char === '"' || (char !== ' ' && char !== '\t')) {
      out += char;
    }
  }
  return out;
}

/**
 * Recorta los caracteres indicados de ambos extremos.
 *
 * `String.prototype.trim` no admite argumentos en los tipos de TypeScript, y
 * la implementacion de referencia recorta con conjuntos de caracteres concretos.
 */
export function trimChars(text: string, chars: string): string {
  let start = 0;
  let end = text.length;
  while (start < end && chars.includes(text[start])) {
    start += 1;
  }
  while (end > start && chars.includes(text[end - 1])) {
    end -= 1;
  }
  return text.slice(start, end);
}

/**
 * Divide por un separador que no este dentro de comillas ni de parentesis.
 *
 * Como en la implementacion de referencia: el separador no se considera
 * dentro de comillas ni de parentesis.
 */
export function partitionUnquoted(
  text: string,
  separator: string,
): [string, string] | null {
  let quote = false;
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      quote = !quote;
    } else if (!quote) {
      if (char === '(') {
        depth += 1;
      } else if (char === ')') {
        depth -= 1;
      } else if (char === separator && depth === 0) {
        return [text.slice(0, index), text.slice(index + 1)];
      }
    }
  }
  return null;
}

/**
 * Divide por comas que no esten dentro de comillas.
 *
 * Como en la implementacion de referencia: las comas dentro de comillas no
 * separan campos.
 */
export function splitFields(text: string): string[] {
  const result: string[] = [];
  let start = 0;
  let quote = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      quote = !quote;
    } else if (char === ',' && !quote) {
      result.push(text.slice(start, index));
      start = index + 1;
    }
  }
  result.push(text.slice(start));
  return result;
}

/**
 * Consume un operando y su delimitador.
 *
 * Como en la implementacion de referencia: consume el operando y el
 * delimitador que lo sigue.
 */
export function declarationOperand(
  text: string,
  position = 0,
): [string, number] {
  const start = position;
  let quote = false;
  while (position < text.length) {
    const char = text[position];
    if (char === '"') {
      quote = !quote;
    }
    if (!quote) {
      if (',=()?'.includes(char)) {
        return [text.slice(start, position), position + 1];
      }
      if ('{}'.includes(char) && position > start) {
        return [text.slice(start, position), position];
      }
    }
    position += 1;
  }
  return [text.slice(start, position), position];
}
