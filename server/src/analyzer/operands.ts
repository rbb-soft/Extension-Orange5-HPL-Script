/**
 * Clasificacion de operandos de HPL.
 *
 * Reproduce el reconocimiento de registros y la forma canonica de los
 * operandos de la implementacion de referencia.
 */
import { parseInteger } from './literals';
import { SymbolTables } from './symbols';

/** Operandos integrados del lenguaje. */
export const BUILTINS: Record<string, number> = {
  $SIZE: 0x20,
  $BLOCKSIZE: 0x21,
  $VERIFY: 0x22,
  $CDELAY: 0x23,
  $WDELAY: 0x24,
  $AREA: 0x25,
  $VERSION: 0x26,
  CONST: 0x27,
  $CONST: 0x27,
  $MODE: 0x28,
  $MCUCLK: 0x29,
  $BAUD: 0x2a,
};

/**
 * `true` si el texto designa un registro.
 *
 * No comprueba el rango: `R20` es un registro segun el criterio de la
 * implementacion de referencia, pero la conversion a numero de registro si
 * lo rechaza.
 */
export function isRegister(text: string): boolean {
  return (
    text in BUILTINS ||
    text.toUpperCase() === 'CONST' ||
    /^R[0-9A-Fa-f]{1,2}$/.test(text)
  );
}

export type RegisterResult =
  | { ok: true; value: number }
  | { ok: false; message: string };

/** Convierte un texto en el numero de registro que representa. */
export function register(text: string): RegisterResult {
  if (text in BUILTINS) {
    return { ok: true, value: BUILTINS[text] };
  }
  if (text.toUpperCase() === 'CONST') {
    return { ok: true, value: BUILTINS.CONST };
  }
  const match = /^R([0-9A-Fa-f]{1,2})$/.exec(text);
  if (!match) {
    return { ok: false, message: 'Not a register: ' + text };
  }
  const number = Number.parseInt(match[1], 16);
  if (number >= 32) {
    return { ok: false, message: 'Register outside supported ABI range: ' + text };
  }
  return { ok: true, value: number };
}

export interface OperandResult {
  ok: boolean;
  /** Forma canonica del operando. */
  token: string;
  message?: string;
  /** Codigo de diagnostico sugerido cuando la operacion falla. */
  code?: string;
}

/**
 * Forma canonica del operando, como en la implementacion de referencia.
 *
 * @param mode 1 = operandos de entrada, 2 = operandos de salida, 3 = ambos.
 */
export function operandToken(
  tables: SymbolTables,
  text: string,
  mode = 3,
  lookup?: string,
): OperandResult {
  const effectiveLookup = lookup ?? text;
  const upper = text.toUpperCase();

  let base: string | null = null;
  let suffix = '';
  let category: 'register' | 'data' | 'array' | null = null;

  if (upper.startsWith('CONST')) {
    // `CONST` puede ser un alias de pin declarado; en ese caso gana el alias.
    if (
      text.length > 5 &&
      text[5] !== '[' &&
      (((mode & 1) !== 0 &&
          (tables.inputs.has(effectiveLookup) || tables.busInputs.has(effectiveLookup))) ||
        ((mode & 2) !== 0 &&
          (tables.pins.has(effectiveLookup) || tables.buses.has(effectiveLookup))))
    ) {
      return { ok: true, token: effectiveLookup };
    }
    base = 'CONST';
    suffix = text.slice(5);
    category = 'register';
  } else if (upper.startsWith('DATA') && (text.length === 4 || text[4] === '[')) {
    base = 'DATA';
    suffix = text.slice(4);
    category = 'data';
  } else if (upper.startsWith('ADR') && (text.length === 3 || text[3] === '[')) {
    base = 'ADR';
    suffix = text.slice(3);
    category = 'data';
  } else {
    // `[\s\S]` equivale al `.` de una expresion regular: en JavaScript el
    // punto no coincide con el retorno de carro, que la implementacion de
    // referencia si admite dentro de un operando.
    const reg = /^(R[0-9A-Fa-f]{1,2})(\[([\s\S]*))?(?![\s\S])/.exec(text);
    if (reg) {
      const parsed = register(reg[1]);
      if (!parsed.ok) {
        return {
          ok: false,
          token: text,
          message: parsed.message,
          code: 'hpl.reg.indexOutOfRange',
        };
      }
      base = reg[1];
      suffix = reg[2] ?? '';
      category = 'register';
    } else if (text.startsWith('@')) {
      const array = /^@([^\[]+)(\[([\s\S]*))?(?![\s\S])/.exec(text);
      if (array && tables.arrays.has(array[1])) {
        base = '@' + array[1];
        suffix = array[2] ?? '';
        category = 'array';
      }
    }
  }

  if (base === null) {
    return { ok: true, token: text };
  }

  if ((category === 'register' || category === 'array') && base !== 'CONST') {
    let indexed = suffix.startsWith('[R')
      ? suffix.slice(2).replace(/^[ \t\r\n\v\f]+/, '')
      : '';
    const sign = indexed.startsWith('-') ? -1 : 1;
    if (indexed.startsWith('+') || indexed.startsWith('-')) {
      indexed = indexed.slice(1);
    }
    if (indexed.startsWith('0x') || indexed.startsWith('0X')) {
      indexed = indexed.slice(2);
    }
    const digits = /^[0-9A-Fa-f]+/.exec(indexed);
    if (digits) {
      let value = sign * Number.parseInt(digits[0].slice(-4), 16);
      value &= 0xffff;
      if (value > 31) {
        return {
          ok: false,
          token: text,
          message: 'Register index outside 0..31',
          code: 'hpl.reg.indexOutOfRange',
        };
      }
      return { ok: true, token: base + '[R' + value.toString(16).toUpperCase() + ']' };
    }
  }

  if (suffix.startsWith('[') && suffix.endsWith(']')) {
    const index = suffix.slice(1, -1);
    if (index === 'I') {
      return { ok: true, token: base + '[I]' };
    }
    if (index && '0123456789'.includes(index[0])) {
      const parsed = parseInteger(index);
      if (!parsed.ok) {
        return {
          ok: false,
          token: text,
          message: parsed.message,
          code: 'hpl.literal.unsupported',
        };
      }
      const limit = category === 'register' ? 31 : 65535;
      if (parsed.value > limit) {
        return {
          ok: false,
          token: text,
          message: 'Bit or array index outside its native range',
          code: category === 'register' ? 'hpl.reg.bitRange' : 'hpl.array.indexRange',
        };
      }
      return { ok: true, token: base + '[' + index + ']' };
    }
  }

  return { ok: true, token: base };
}
