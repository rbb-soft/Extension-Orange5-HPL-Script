/**
 * Literales enteros de HPL.
 *
 * Reproduce el analisis de literales enteros de la implementacion de referencia.
 *
 * Formatos aceptados: decimal, `0x...`, sufijo hexadecimal `H/h` y sufijo
 * binario `B/b`. El valor se trunca a 32 bits con saturacion en `0xffffffff`.
 */

export type LiteralResult =
  | { ok: true; value: number }
  | { ok: false; message: string };

const DIGIT_LIMITS: Record<number, number> = { 2: 32, 10: 10, 16: 8 };

function bounded(digits: string, base: number): number {
  const stripped = digits.replace(/^0+/, '') || '0';
  if (stripped.length > DIGIT_LIMITS[base]) {
    return 0x100000000;
  }
  return Number.parseInt(stripped, base);
}

/**
 * Convierte un literal entero de HPL.
 *
 * Devuelve el valor o un error con el mensaje equivalente al de la
 * implementacion de referencia.
 */
export function parseInteger(raw: string): LiteralResult {
  const text = raw.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '');

  let value: number;
  if (/^[01]+[bB]$/.test(text)) {
    value = bounded(text.slice(0, -1), 2);
  } else if (/^[0-9a-fA-F]+[hH]$/.test(text)) {
    value = bounded(text.slice(0, -1), 16);
  } else if (/^0[xX][0-9a-fA-F]+$/.test(text)) {
    value = bounded(text.slice(2), 16);
  } else if (/^[0-9]+$/.test(text)) {
    value = bounded(text, 10);
  } else {
    return { ok: false, message: 'Not a supported integer literal: ' + text };
  }

  // El lector nativo satura en 32 bits; nunca envuelve.
  if (value > 0xffffffff) {
    return { ok: true, value: 0xffffffff };
  }
  // `>>> 0` devuelve el valor sin signo: las operaciones de bit de JavaScript
  // trabajan con enteros de 32 bits con signo.
  return { ok: true, value: value >>> 0 };
}

/** `true` si el texto es un literal entero supported. */
export function isIntegerLiteral(raw: string): boolean {
  return parseInteger(raw).ok;
}
