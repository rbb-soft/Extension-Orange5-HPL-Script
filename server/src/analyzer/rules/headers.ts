/**
 * Validacion de cabeceras de HPL.
 *
 * Reproduce el analisis de cabeceras de la implementacion de referencia,
 * con la diferencia de que se acumulan los errores en lugar de abortar en el
 * primero, y de que se construyen las tablas de simbolos para el resto del
 * analisis.
 *
 * Se reproducen fielmente las rarezas del lector nativo:
 *   - las tablas de alias terminan en su primer nombre vacio;
 *   - la comparacion de nombres de registro solo examina el prefijo contiguo;
 *   - los metadatos de array reutilizan la primera ranura libre;
 *   - la cola de una declaracion de pin o bus se procesa como otra cabecera.
 */
import { HeaderDecl } from '../ast';
import { DiagnosticSink, Range } from '../diagnostics';
import { parseInteger } from '../literals';
import { isRegister, operandToken, register } from '../operands';
import { declarationOperand, partitionUnquoted, splitFields, trimChars } from '../source';
import { SymbolTables } from '../symbols';

/** Banderas de `OPTIONS`. */
const OPTION_FLAGS: Record<string, number> = {
  b: 1,
  B: 1,
  w: 2,
  r: 4,
  m: 16,
  f: 32,
  F: 32,
  z: 64,
};

const MAX_PINS_PER_GROUP = 47;
const MAX_BUSES_PER_GROUP = 47;
const MAX_ARRAYS = 32;
const MAX_ARRAY_NAME = 20;
const MAX_REGISTER_NAME = 15;

interface ArraySlot {
  /** Nombre almacenado; una cadena vacia significa ranura libre. */
  name: string;
  /** Tamano del array en bytes. */
  size: number;
}

interface HeaderContext {
  tables: SymbolTables;
  sink: DiagnosticSink;
  rangeOf: (start: number, end: number) => Range;
  /** Aliases declarados por grupo de pines, en orden. */
  pinOrder: [string[], string[]];
  /** Aliases declarados por grupo de buses, en orden. */
  busOrder: [string[], string[]];
  /** Numero de pines declarados por grupo. */
  pinCounts: [number, number];
  /** Numero de buses declarados por grupo. */
  busCounts: [number, number];
  /** Ranuras de metadatos de array. */
  arraySlots: ArraySlot[];
  /** Nombres de registro por numero; `undefined` significa ranura libre. */
  registerSlots: (string | undefined)[];
}

export function processHeaders(
  headers: HeaderDecl[],
  tables: SymbolTables,
  sink: DiagnosticSink,
  rangeOf: (start: number, end: number) => Range,
): void {
  const ctx: HeaderContext = {
    tables,
    sink,
    rangeOf,
    pinOrder: [[], []],
    busOrder: [[], []],
    pinCounts: [0, 0],
    busCounts: [0, 0],
    arraySlots: [],
    registerSlots: [],
  };

  for (const header of headers) {
    processHeader(header, ctx);
  }

  applyAliasTruncation(ctx);
}

/**
 * Las tablas de alias terminan en su primer nombre vacio.
 *
 * Reproduce el recorte de los alias de la implementacion de referencia.
 */
function applyAliasTruncation(ctx: HeaderContext): void {
  truncate(ctx.tables.pins, ctx.pinOrder[0]);
  truncate(ctx.tables.inputs, ctx.pinOrder[1]);
  truncate(ctx.tables.buses, ctx.busOrder[0]);
  truncate(ctx.tables.busInputs, ctx.busOrder[1]);
}

function truncate(table: Map<string, number>, order: string[]): void {
  const keep = new Set<string>();
  for (const alias of order) {
    if (alias === '') {
      break;
    }
    keep.add(alias);
  }
  for (const alias of [...table.keys()]) {
    if (!keep.has(alias)) {
      table.delete(alias);
    }
  }
}

function processHeader(header: HeaderDecl, ctx: HeaderContext): void {
  const line = header.text;
  const range = ctx.rangeOf(header.offset, header.endOffset);

  if ([',', '=', ')', '(', '?'].includes(line)) {
    return;
  }

  const declaration = partitionUnquoted(line, '=');
  if (declaration && declaration[0].startsWith('@')) {
    processArrayDeclaration(declaration[0], declaration[1], ctx, range);
    return;
  }

  const match = /^([A-Za-z0-9$]+)[ \t]*=[ \t]*([\s\S]*)(?![\s\S])/.exec(line);
  if (!match) {
    ctx.sink.add(
      'hpl.header.unsupported',
      range,
      `Unsupported declaration at line ${header.line + 1}: ${line}`,
    );
    return;
  }
  const key = match[1].toUpperCase();
  // Los nombres de pin y bus conservan el retorno de carro: el lector nativo
  // solo recorta espacios y salto de linea en esas declaraciones.
  const stripChars =
    ['PINO', 'PINI', 'PING', 'PINT', 'BUSO', 'BUSI'].includes(key)
      ? ' \t\n'
      : ' \t\r\n';
  const value = trimChars(match[2], stripChars);

  if (['INFO', 'INFOFILE', 'HPL', 'TESTMASK'].includes(key)) {
    if (!value) {
      return;
    }
    let quoted = false;
    for (let index = 0; index < value.length; index += 1) {
      const char = value[index];
      if (char === '"') {
        quoted = !quoted;
      } else if (char === ')' && !quoted) {
        const tail = value.slice(index + 1);
        processHeader(
          {
            ...header,
            text: key + '=' + value.slice(0, index),
            value: value.slice(0, index),
            key,
          },
          ctx,
        );
        if (tail) {
          processHeader(
            { ...header, text: tail, value: tail, key: headerKey(tail) },
            ctx,
          );
        }
        return;
      }
    }
    if (quoted) {
      ctx.sink.add('hpl.header.unclosedString', range, 'Unclosed header string');
      return;
    }
  }

  const fields = partitionUnquoted(value, ',');
  if (['POWER', 'SOCKET', 'ALLPINS', 'CDELAY', 'LOG'].includes(key) && fields) {
    const first = fields[0];
    const tail = fields[1];
    processHeader({ ...header, text: key + '=' + first, value: first, key }, ctx);
    if (tail.trim() !== '') {
      processHeader(
        { ...header, text: tail.trim(), value: tail.trim(), key: headerKey(tail.trim()) },
        ctx,
      );
    }
    return;
  }

  switch (key) {
    case 'HPL': {
      if (value.length === 0 || value.length > 48) {
        ctx.sink.add(
          'hpl.header.hplNameTooLong',
          range,
          'Dependency declaration exceeds its native reader limit',
        );
      }
      return;
    }
    case 'INFO':
    case 'INFOFILE':
    case 'TESTMASK': {
      const limits: Record<string, number> = { INFO: 512, INFOFILE: 192, TESTMASK: 48 };
      const raw = value.replace(/[ \t]/g, '');
      if (raw.length > limits[key] - 16) {
        ctx.sink.add(
          'hpl.header.infoTooLong',
          range,
          key + ' exceeds its native reader limit',
        );
      }
      return;
    }
    case 'ALLPINS': {
      const literal = parseInteger(value);
      if (!literal.ok) {
        ctx.sink.add('hpl.literal.unsupported', range, literal.message);
      }
      return;
    }
    case 'POWER':
    case 'SOCKET': {
      const literal = parseInteger(value);
      if (!literal.ok) {
        ctx.sink.add('hpl.literal.unsupported', range, literal.message);
        return;
      }
      if (!(literal.value >= 0 && literal.value <= 0xffffffff)) {
        ctx.sink.add('hpl.header.unsupported', range, key + ' outside uint32');
      }
      return;
    }
    case 'OPTIONS': {
      const areas = value.replace(/[ \t]/g, '').split(',');
      if (areas.length > 8) {
        ctx.sink.add('hpl.header.tooManyOptionAreas', range, 'Too many option areas');
        return;
      }
      for (const area of areas) {
        for (const flag of area) {
          if (OPTION_FLAGS[flag] === undefined) {
            ctx.sink.add(
              'hpl.header.optionFlag',
              range,
              'Option flag not verified: ' + flag,
            );
            return;
          }
        }
      }
      return;
    }
    case 'CDELAY': {
      if (!value || !/[0-9]/.test(value[0])) {
        ctx.sink.add(
          'hpl.header.cdelayNotDigit',
          range,
          'CDELAY requires a digit-led literal',
        );
        return;
      }
      if (value.includes('.')) {
        const prefix = /^[0-9]+(?:\.[0-9]*)?(?:[eE][+-]?[0-9]+)?/.exec(value);
        if (!prefix) {
          ctx.sink.add('hpl.header.unsupported', range, 'Unsupported CDELAY literal');
          return;
        }
        const number = Number.parseFloat(prefix[0]);
        if (!Number.isFinite(number) || number < 0) {
          ctx.sink.add('hpl.header.unsupported', range, 'Unsupported CDELAY literal');
        }
        return;
      }
      const literal = parseInteger(value);
      if (!literal.ok) {
        ctx.sink.add('hpl.literal.unsupported', range, literal.message);
      }
      return;
    }
    case 'LOG': {
      ctx.sink.add(
        'hpl.adv.logIgnored',
        range,
        'LOG is recognised but not serialised by the reference implementation',
        'hint',
      );
      return;
    }
    case 'BUSO':
    case 'BUSI': {
      processBusDeclaration(key, value, header, ctx, range);
      return;
    }
    case 'PINO':
    case 'PINI':
    case 'PING':
    case 'PINT': {
      processPinDeclaration(key, value, header, ctx, range);
      return;
    }
    default:
      break;
  }

  const operand = operandToken(ctx.tables, match[1]);
  if (!operand.ok) {
    ctx.sink.add(
      operand.code ?? 'hpl.header.unsupported',
      range,
      operand.message ?? `Unsupported declaration at line ${header.line + 1}`,
    );
    return;
  }
  if (isRegister(operand.token)) {
    processRegisterDeclaration(operand.token, value, ctx, range);
    return;
  }

  ctx.sink.add(
    'hpl.header.unsupported',
    range,
    `Unsupported declaration at line ${header.line + 1}: ${key}`,
  );
}

/**
 * Declara un array de bytes.
 *
 * Reproduce la rama de arrays del analisis de cabeceras de la
 * implementacion de referencia.
 */
function processArrayDeclaration(
  rawName: string,
  value: string,
  ctx: HeaderContext,
  range: Range,
): void {
  const name = rawName.slice(1);
  if (name && ctx.tables.arrays.has(name)) {
    ctx.sink.add('hpl.array.duplicate', range, 'Duplicate array: ' + name);
    return;
  }

  // La ranura libre es la primera cuyo nombre esta vacio. Un array sin
  // nombre ocupa siempre la ranura 0, como en la implementacion de referencia.
  let slot: number;
  if (!name) {
    slot = 0;
  } else {
    slot = ctx.arraySlots.findIndex((item) => item.name === '');
    if (slot < 0) {
      slot = ctx.arraySlots.length;
    }
  }
  if (slot >= MAX_ARRAYS) {
    ctx.sink.add('hpl.array.tooMany', range, 'Array metadata limit exceeded');
    return;
  }

  const storedName = name.slice(0, MAX_ARRAY_NAME);
  const payload = value.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '');
  let size = 0;

  if (payload.startsWith('{')) {
    const body = payload.slice(1).split('}')[0];
    const fields = body.split(',');
    if (fields.length > 0 && fields[fields.length - 1] === '') {
      fields.pop();
    }
    const values: number[] = [];
    for (const field of fields) {
      const literal = parseInteger(field);
      if (!literal.ok) {
        ctx.sink.add('hpl.literal.unsupported', range, literal.message);
        return;
      }
      values.push(literal.value);
    }
    if (values.length === 0) {
      ctx.sink.add('hpl.array.empty', range, 'Only nonempty byte arrays are verified');
      return;
    }
    if (values.some((item) => !(item >= 0 && item <= 255))) {
      ctx.sink.add(
        'hpl.array.valueOutOfRange',
        range,
        'Only nonempty byte arrays are verified',
      );
      return;
    }
    size = values.length;
  } else if (payload.startsWith('"')) {
    // Texto literal: la imagen incluye el terminador nulo.
    size = payload.slice(1).split('"')[0].length + 1;
  } else {
    const literal = parseInteger(payload);
    if (!literal.ok) {
      ctx.sink.add('hpl.literal.unsupported', range, literal.message);
      return;
    }
    if (!(literal.value > 0 && literal.value <= 32768)) {
      ctx.sink.add('hpl.array.sizeInvalid', range, 'Invalid byte-array size');
      return;
    }
    size = literal.value;
  }

  ctx.arraySlots[slot] = { name: storedName, size };
  rebuildArrays(ctx);
}

/** Reconstruye la tabla de arrays a partir de las ranuras de metadatos. */
function rebuildArrays(ctx: HeaderContext): void {
  ctx.tables.arrays.clear();
  for (const item of ctx.arraySlots) {
    if (item && item.name) {
      ctx.tables.arrays.set(item.name, item.size);
    }
  }
}

function processBusDeclaration(
  key: string,
  value: string,
  header: HeaderDecl,
  ctx: HeaderContext,
  range: Range,
): void {
  const [rawAlias, afterAlias] = declarationOperand(value);
  if (!rawAlias || '0123456789['.includes(rawAlias[0])) {
    ctx.sink.add('hpl.bus.aliasInvalid', range, 'Bus alias must be a name');
    return;
  }
  const inverted = rawAlias.startsWith('#');
  const alias = inverted ? rawAlias.slice(1) : rawAlias;
  const [rawNumber, afterNumber] = declarationOperand(value, afterAlias);
  if (!rawNumber || !'0123456789'.includes(rawNumber[0])) {
    ctx.sink.add('hpl.bus.numberNotDigit', range, 'Bus number must be a digit-led literal');
    return;
  }
  const literal = parseInteger(rawNumber);
  if (!literal.ok) {
    ctx.sink.add('hpl.literal.unsupported', range, literal.message);
    return;
  }
  const group = key === 'BUSI' ? 1 : 0;
  if (alias.length > 8) {
    ctx.sink.add('hpl.bus.aliasTooLong', range, 'Invalid bus declaration');
    return;
  }
  if (ctx.busCounts[group] >= MAX_BUSES_PER_GROUP) {
    ctx.sink.add('hpl.bus.tooMany', range, 'Invalid bus declaration');
    return;
  }
  ctx.busCounts[group] += 1;
  ctx.busOrder[group].push(alias);
  if (group === 0) {
    ctx.tables.buses.set(alias, literal.value & 0xffff);
  } else {
    ctx.tables.busInputs.set(alias, literal.value & 0xffff);
  }

  if (afterNumber < value.length) {
    processHeader(
      { ...header, text: value.slice(afterNumber), value: value.slice(afterNumber), key: headerKey(value.slice(afterNumber)) },
      ctx,
    );
  }
}

function processPinDeclaration(
  key: string,
  value: string,
  header: HeaderDecl,
  ctx: HeaderContext,
  range: Range,
): void {
  const [rawAlias, afterAlias] = declarationOperand(value);
  if (!rawAlias || '0123456789['.includes(rawAlias[0])) {
    ctx.sink.add('hpl.pin.aliasInvalid', range, 'Pin alias must be a name');
    return;
  }

  const groups: number[] =
    key === 'PING' || key === 'PINT' ? [0, 1] : [key === 'PINI' ? 1 : 0];

  for (const group of groups) {
    const classified = operandToken(ctx.tables, rawAlias, group === 1 ? 1 : 2);
    if (!classified.ok) {
      ctx.sink.add(
        classified.code ?? 'hpl.pin.reservedName',
        range,
        classified.message ?? 'Reserved pin name: ' + rawAlias,
      );
      return;
    }
    if (isRegister(classified.token) || classified.token === 'DATA') {
      ctx.sink.add('hpl.pin.reservedName', range, 'Reserved pin name: ' + rawAlias);
      return;
    }
  }

  const inverted = rawAlias.startsWith('#');
  if (inverted) {
    ctx.sink.add(
      'hpl.adv.invertedPin',
      range,
      'Pin alias with a leading # has inverted polarity',
      'hint',
    );
  }
  const alias = inverted ? rawAlias.slice(1) : rawAlias;

  const [rawNumber, afterNumber] = declarationOperand(value, afterAlias);
  if (!rawNumber || !'0123456789'.includes(rawNumber[0])) {
    ctx.sink.add('hpl.pin.numberNotDigit', range, 'Pin number must be a digit-led literal');
    return;
  }
  const literal = parseInteger(rawNumber);
  if (!literal.ok) {
    ctx.sink.add('hpl.literal.unsupported', range, literal.message);
    return;
  }
  const pin = literal.value & 0xffff;

  // El pin fisico es opcional; su posicion determina el inicio de la cola.
  let tailPosition = afterNumber;
  if (afterNumber < value.length) {
    const [rawDevice, afterDevice] = declarationOperand(value, afterNumber);
    if (!rawDevice || !'0123456789'.includes(rawDevice[0])) {
      ctx.sink.add(
        'hpl.pin.numberNotDigit',
        range,
        'Device pin must be a digit-led literal',
      );
      return;
    }
    const device = parseInteger(rawDevice);
    if (!device.ok) {
      ctx.sink.add('hpl.literal.unsupported', range, device.message);
      return;
    }
    tailPosition = afterDevice;
  }

  if (alias.length > 8) {
    ctx.sink.add('hpl.pin.aliasTooLong', range, 'Invalid pin declaration');
    return;
  }
  for (const group of groups) {
    if (ctx.pinCounts[group] >= MAX_PINS_PER_GROUP) {
      ctx.sink.add('hpl.pin.tooMany', range, 'Invalid pin declaration');
      return;
    }
    ctx.pinCounts[group] += 1;
    ctx.pinOrder[group].push(alias);
    if (group === 0) {
      ctx.tables.pins.set(alias, pin);
    } else {
      ctx.tables.inputs.set(alias, pin);
    }
  }

  if (tailPosition < value.length) {
    const tail = value.slice(tailPosition);
    processHeader(
      { ...header, text: tail, value: tail, key: headerKey(tail) },
      ctx,
    );
  }
}

/**
 * Declara un registro.
 *
 * Reproduce la declaracion de registros de la implementacion de referencia.
 * La comparacion de nombres solo examina el prefijo contiguo de ranuras
 * ocupadas y contrasta el nombre almacenado (truncado a 15 bytes) con el
 * nombre completo entrante.
 */
function processRegisterDeclaration(
  registerToken: string,
  value: string,
  ctx: HeaderContext,
  range: Range,
): void {
  const parsed = register(registerToken);
  if (!parsed.ok) {
    ctx.sink.add('hpl.reg.indexOutOfRange', range, parsed.message);
    return;
  }
  const number = parsed.value;

  const parts = splitFields(value);
  const name = parts[0].replace(/^[ \t\r]+|[ \t\r]+$/g, '').replace(/"/g, '');

  for (let slot = 0; slot < 32; slot += 1) {
    const previous = ctx.registerSlots[slot];
    if (previous === undefined) {
      break;
    }
    if (previous === name) {
      ctx.sink.add('hpl.reg.duplicateName', range, 'Register use defined name: ' + name);
      return;
    }
  }

  if (name.length > MAX_REGISTER_NAME) {
    ctx.sink.add(
      'hpl.reg.nameTruncated',
      range,
      'Register name exceeds 15 bytes and is truncated by the reference implementation',
      'warning',
    );
  }

  const format =
    parts.length > 1
      ? parts[1].replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '')
      : 'H' + parts[0].replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '').slice(1);
  if (!/^(.)([+-]?[0-9]*)/.test(format)) {
    ctx.sink.add('hpl.reg.formatUnknown', range, 'Register format not verified: ' + format);
    return;
  }

  ctx.registerSlots[number] = name.slice(0, MAX_REGISTER_NAME);
  ctx.tables.registerNames.set(number, name);
}

function headerKey(text: string): string {
  const match = /^([A-Za-z0-9$]+)=/.exec(text);
  return match ? match[1].toUpperCase() : '';
}
