/**
 * Validacion de sentencias, condiciones y bloques.
 *
 * Reproduce, sin generar bytecode, las decisiones de sentencias,
 * asignaciones, comparaciones y bloques de la implementacion de referencia.
 *
 * El objetivo es detectar exactamente los mismos archivos que la
 * implementacion de referencia rechaza, pero informarlos todos a la vez y con
 * linea y columna.
 */
import { Block, Statement, StatementNode } from '../ast';
import { DiagnosticSink, Range } from '../diagnostics';
import { parseInteger } from '../literals';
import { isRegister, operandToken, register } from '../operands';
import { partitionUnquoted } from '../source';
import { isDeclaredAlias, SymbolTables } from '../symbols';

export const RESERVED_COMMANDS = ['EXIT', 'BREAK', 'RETURN', 'IENABLE', 'IDISABLE'];

/** Nombres reservados que nunca son identificadores de usuario. */
const RESERVED_OPERANDS = [
  'DATA',
  'ADR',
  'CONST',
  'MARK',
  'LOG',
  'I',
  'VCC',
  'VPP',
  'P',
  'Z',
  'T',
];

/** Orden de los operadores, identico al de la implementacion de referencia. */
const OPERATORS: { symbol: string; rejectsZero: boolean; registerOk: boolean }[] = [
  { symbol: '+', rejectsZero: false, registerOk: true },
  { symbol: '-', rejectsZero: false, registerOk: true },
  { symbol: '*', rejectsZero: false, registerOk: true },
  { symbol: '/', rejectsZero: true, registerOk: true },
  { symbol: '%', rejectsZero: true, registerOk: true },
  { symbol: '|', rejectsZero: false, registerOk: true },
  { symbol: '&', rejectsZero: false, registerOk: true },
  { symbol: '^', rejectsZero: false, registerOk: true },
  { symbol: '<<', rejectsZero: true, registerOk: false },
  { symbol: '>>', rejectsZero: true, registerOk: false },
];

/**
 * Patrones de la gramatica HPL.
 *
 * `[\s\S]` equivale al `.` de una expresion regular, que si admite el retorno
 * de carro.
 * `(?![\s\S])` es el ancla de fin de cadena equivalente a `re.fullmatch`:
 * el `$` de JavaScript tambien coincide antes de un terminador de linea final.
 */
const MACRO_CALL = /^(_#?[^()=,?{} \t\r\n]+)(?:\(([\s\S]*)\))?(?![\s\S])/;
const REGINFO_STATEMENT = /^REGINFO=([^,=]+)[,=]([\s\S]*)(?![\s\S])/;
const PRINT_COMMAND = /^(PRINT|GET)(\([\s\S]*\))(?![\s\S])/;
const PRINT_PAYLOAD = /^([SPEALIT])?\(([\s\S]*)\)(?![\s\S])/i;
const LOOP_FORM = /^LOOP=?\(([^)]*)\)(?![\s\S])/;
const CONDITION_FORM = /^(R[0-9A-Fa-f]{1,2}|\$[A-Z]+|CONST)(?:\[([^\]]+)\])?\?([<>!]?)([\s\S]+)(?![\s\S])/;
const BIT_OPERAND = /^(R[0-9A-Fa-f]{1,2}|CONST)\[([^\]]+)\](?![\s\S])/;
const PIN_BIT_OPERAND = /^(R[0-9A-Fa-f]{1,2}|ADR|DATA|CONST)\[([^\]]+)\](?![\s\S])/;
const ARRAY_OPERAND = /^@([^\[]+)\[([^\]]+)\](?![\s\S])/;
const ARRAY_TRANSFER = /^@([\s\S]+?)(?:\(([^)]+)\))?(?![\s\S])/;

/** Claves de cabecera que solo se admiten antes de la primera seccion. */
const HEADER_KEYS = new Set([
  'HPL',
  'POWER',
  'SOCKET',
  'ALLPINS',
  'CDELAY',
  'OPTIONS',
  'INFO',
  'INFOFILE',
  'TESTMASK',
  'PINO',
  'PINI',
  'PING',
  'PINT',
  'BUSO',
  'BUSI',
  'LOG',
]);

interface LoopFrame {
  breaks: number;
}

/**
 * Marco de la pila de control de la implementacion de referencia.
 *
 * `opcode` reproduce la instruccion que la implementacion de referencia apila
 * en la pila de control: 0x47 para una guarda condicional, 0x0e para un bucle
 * numerico y 0x0f para un bucle de registro.
 */
interface Frame {
  opcode: number;
  first: number;
  last: number;
}

const OPCODE_IF = 0x47;
const OPCODE_LOOP_NUMERIC = 0x0e;
const OPCODE_LOOP_REGISTER = 0x0f;

export interface StatementContext {
  tables: SymbolTables;
  sink: DiagnosticSink;
  rangeOf: (start: number, end: number) => Range;
  /** Pila de control: bloques condicionales y bucles. */
  frames: Frame[];
  /** Pila de bucles, para las sentencias BREAK. */
  loops: LoopFrame[];
}

export function createStatementContext(
  tables: SymbolTables,
  sink: DiagnosticSink,
  rangeOf: (start: number, end: number) => Range,
): StatementContext {
  return { tables, sink, rangeOf, frames: [], loops: [] };
}

export function validateBody(nodes: StatementNode[], ctx: StatementContext): void {
  for (const node of nodes) {
    if (node.kind === 'block') {
      validateBlock(node, ctx);
    } else {
      validateStatement(node, ctx);
    }
  }
}

function validateBlock(block: Block, ctx: StatementContext): void {
  const range = ctx.rangeOf(block.offset, block.endOffset);

  if (block.body.length === 0) {
    ctx.sink.add('hpl.block.emptyBody', range, 'Loop/If body empty');
  }
  if (ctx.frames.length >= 32) {
    ctx.sink.add(
      'hpl.nesting.tooDeep',
      range,
      'Control nesting exceeds 32 blocks',
    );
  }

  const loop = LOOP_FORM.exec(block.condition);
  if (loop) {
    const frame = validateLoopForm(loop[1], block, ctx, range);
    ctx.frames.push(frame ?? { opcode: OPCODE_LOOP_NUMERIC, first: 0, last: 0 });
    ctx.loops.push({ breaks: 0 });
    validateBody(block.body, ctx);
    ctx.loops.pop();
    ctx.frames.pop();
    return;
  }

  validateCondition(block.condition, ctx, range);
  ctx.frames.push({ opcode: OPCODE_IF, first: 0, last: 0 });
  validateBody(block.body, ctx);
  ctx.frames.pop();
}

/**
 * Valida la forma de un `LOOP` y devuelve el marco de iteracion.
 *
 * Reproduce el bloque de la implementacion de referencia en su parte de LOOP.
 */
function validateLoopForm(
  rawArgs: string,
  block: Block,
  ctx: StatementContext,
  range: Range,
): Frame | null {
  const parts = rawArgs.split(',');
  const args: string[] = [];
  for (const part of parts) {
    const result = operandToken(ctx.tables, part, 1);
    if (!result.ok) {
      ctx.sink.add(
        result.code ?? 'hpl.loop.form',
        range,
        result.message ?? 'Unsupported LOOP argument',
      );
      return null;
    }
    args.push(result.token);
  }

  const frame: Frame = { opcode: OPCODE_LOOP_NUMERIC, first: 0, last: 0 };

  if (args.length === 2 && args.every((arg) => isRegister(arg))) {
    const first = register(args[0]);
    const last = register(args[1]);
    if (!first.ok) {
      ctx.sink.add('hpl.reg.indexOutOfRange', range, first.message);
      return null;
    }
    if (!last.ok) {
      ctx.sink.add('hpl.reg.indexOutOfRange', range, last.message);
      return null;
    }
    frame.opcode = OPCODE_LOOP_REGISTER;
    frame.first = first.value;
    frame.last = last.value;
  } else if (args.length === 2) {
    const first = parseInteger(args[0]);
    const last = parseInteger(args[1]);
    if (!first.ok) {
      ctx.sink.add('hpl.literal.unsupported', range, first.message);
      return null;
    }
    if (!last.ok) {
      ctx.sink.add('hpl.literal.unsupported', range, last.message);
      return null;
    }
    if (!(first.value >= 0 && first.value <= 65535) || !(last.value >= 0 && last.value <= 0xffffffff)) {
      ctx.sink.add('hpl.loop.valueTooBig', range, 'LOOP value too big');
      return null;
    }
    frame.opcode = OPCODE_LOOP_NUMERIC;
    frame.first = first.value;
    frame.last = last.value;
  } else if (args.length === 1 && isRegister(args[0])) {
    const parsed = register(args[0]);
    if (!parsed.ok) {
      ctx.sink.add('hpl.reg.indexOutOfRange', range, parsed.message);
      return null;
    }
    frame.opcode = OPCODE_LOOP_REGISTER;
    frame.first = parsed.value;
    // La implementacion de referencia emite 0xffff como segundo valor, que excede el rango.
    frame.last = 0xffff;
  } else if (args.length === 1) {
    const arg = args[0];
    let count: number;
    if (arg.startsWith('@') && ctx.tables.arrays.has(arg.slice(1))) {
      count = ctx.tables.arrays.get(arg.slice(1))!;
    } else {
      const parsed = parseInteger(arg);
      if (!parsed.ok) {
        ctx.sink.add('hpl.literal.unsupported', range, parsed.message);
        return null;
      }
      count = parsed.value;
    }
    if (!(count >= 0 && count <= 0xffffffff)) {
      ctx.sink.add('hpl.loop.valueTooBig', range, 'LOOP count outside uint32');
      return null;
    }
    frame.opcode = OPCODE_LOOP_NUMERIC;
    frame.first = 0;
    // El valor se empaqueta como entero de 32 bits sin signo.
    frame.last = count === 0xffffffff ? 0xffffffff : (count - 1) >>> 0;
  } else {
    ctx.sink.add(
      'hpl.loop.form',
      range,
      'LOOP form not yet verified: ' + block.condition,
    );
    return null;
  }

  return frame;
}

function validateStatement(statement: Statement, ctx: StatementContext): void {
  const range = ctx.rangeOf(statement.offset, statement.endOffset);
  const text = statement.text;

  if (RESERVED_COMMANDS.includes(text)) {
    if (text === 'BREAK') {
      if (ctx.loops.length === 0) {
        ctx.sink.add('hpl.break.outsideLoop', range, 'BREAK outside LOOP');
        return;
      }
      const pending = ctx.loops.reduce((total, loop) => total + loop.breaks, 0);
      if (pending >= 31) {
        ctx.sink.add('hpl.break.tooMany', range, 'Too many pending BREAK statements');
        return;
      }
      ctx.loops[ctx.loops.length - 1].breaks += 1;
    }
    return;
  }

  const macro = MACRO_CALL.exec(text);
  if (macro) {
    validateMacroCall(macro[1], macro[2], ctx, range);
    return;
  }

  const reginfo = REGINFO_STATEMENT.exec(text);
  if (reginfo) {
    validateRegInfo(reginfo[1], reginfo[2], ctx, range);
    return;
  }

  const command = PRINT_COMMAND.exec(text);
  if (command) {
    validatePrintGet(command[1].toUpperCase() === 'PRINT' ? 0x44 : 0x49, command[2], ctx, range);
    return;
  }

  const conditional = partitionUnquoted(text, '?');
  if (conditional) {
    const [lhs, value] = conditional;
    if (lhs === 'VCC' || lhs === 'VPP') {
      validateAssignment(lhs, value, ctx, range);
      return;
    }
    if (RESERVED_COMMANDS.includes(lhs)) {
      ctx.sink.add(
        'hpl.cond.reservedCommand',
        range,
        'Reserved command cannot be used as a condition: ' + lhs,
      );
      return;
    }
    validateCondition(text, ctx, range);
    return;
  }

  const assignment = partitionUnquoted(text, '=');
  if (!assignment) {
    ctx.sink.add('hpl.statement.unsupported', range, 'Unsupported statement: ' + text);
    return;
  }
  const [lhs, rhs] = assignment;
  if (
    HEADER_KEYS.has(lhs.toUpperCase()) &&
    !isDeclaredAlias(ctx.tables, lhs) &&
    !isRegister(lhs)
  ) {
    ctx.sink.add(
      'hpl.header.afterSection',
      range,
      'Header declaration is only valid before the first section: ' + lhs,
    );
    return;
  }
  if ([...RESERVED_COMMANDS, 'LOOP', 'REGINFO'].includes(lhs)) {
    ctx.sink.add('hpl.operand.reservedLhs', range, 'Invalid operand for command: ' + lhs);
    return;
  }
  if (lhs === 'PRINT' || lhs === 'GET') {
    validatePrintGet(lhs === 'PRINT' ? 0x44 : 0x49, rhs, ctx, range);
    return;
  }
  validateAssignment(lhs, rhs, ctx, range);
}

function validateMacroCall(
  rawName: string,
  rawArgs: string | undefined,
  ctx: StatementContext,
  range: Range,
): void {
  const name = rawName.replace('_#', '_');
  if (!ctx.tables.macros.has(name)) {
    ctx.sink.add('hpl.macro.undefined', range, 'Undefined macro: ' + name);
    return;
  }
  if (rawArgs === undefined) {
    return;
  }

  const args: string[] = [];
  let position = 0;
  while (position < rawArgs.length) {
    const comma = rawArgs.indexOf(',', position);
    const end = comma < 0 ? rawArgs.length : comma;
    args.push(rawArgs.slice(position, end));
    position = end + 1;
  }
  if (args.length < 1 || args.length > 16 || args.some((arg) => !arg)) {
    ctx.sink.add('hpl.macro.argCount', range, 'Macro requires 1..16 arguments');
    return;
  }

  for (const raw of args) {
    const result = operandToken(ctx.tables, raw, 1);
    if (!result.ok) {
      ctx.sink.add(
        result.code ?? 'hpl.macro.argUnsupported',
        range,
        result.message ?? 'Unsupported macro argument: ' + raw,
      );
      continue;
    }
    const arg = result.token;
    const arrayIterator = /^@([^\[]+)\[I\](?![\s\S])/.exec(arg);
    if (arrayIterator) {
      if (!ctx.tables.arrays.has(arrayIterator[1])) {
        ctx.sink.add('hpl.array.unknown', range, 'Unknown array: ' + arrayIterator[1]);
      }
      continue;
    }
    if (arg === 'DATA' || arg === 'ADR') {
      continue;
    }
    if (isRegister(arg)) {
      const parsed = register(arg);
      if (!parsed.ok) {
        ctx.sink.add('hpl.reg.indexOutOfRange', range, parsed.message);
      }
      continue;
    }
    if (arg && '0123456789'.includes(arg[0])) {
      const literal = parseInteger(arg);
      if (!literal.ok) {
        ctx.sink.add('hpl.literal.unsupported', range, literal.message);
      }
      continue;
    }
    ctx.sink.add('hpl.macro.argUnsupported', range, 'Unsupported macro argument: ' + arg);
  }
}

function validateRegInfo(
  rawTarget: string,
  rawValue: string,
  ctx: StatementContext,
  range: Range,
): void {
  const target = operandToken(ctx.tables, rawTarget, 1);
  if (!target.ok) {
    ctx.sink.add(
      target.code ?? 'hpl.reg.indexOutOfRange',
      range,
      target.message ?? 'Invalid REGINFO target',
    );
    return;
  }
  if (!isRegister(target.token)) {
    ctx.sink.add('hpl.statement.unsupported', range, 'Unsupported REGINFO target');
    return;
  }
  const value = operandToken(ctx.tables, rawValue, 1);
  if (!value.ok) {
    ctx.sink.add(
      value.code ?? 'hpl.literal.unsupported',
      range,
      value.message ?? 'Invalid REGINFO value',
    );
    return;
  }
  if (value.token.startsWith('"')) {
    return;
  }
  if (value.token.startsWith('@') && ctx.tables.arrays.has(value.token.slice(1))) {
    return;
  }
  if (isRegister(value.token)) {
    return;
  }
  const literal = parseInteger(value.token);
  if (!literal.ok) {
    ctx.sink.add('hpl.literal.unsupported', range, literal.message);
  }
}

function validatePrintGet(
  opcode: number,
  expression: string,
  ctx: StatementContext,
  range: Range,
): void {
  const match = PRINT_PAYLOAD.exec(expression);
  if (!match) {
    ctx.sink.add(
      'hpl.print.payloadRequired',
      range,
      'PRINT/GET requires a parenthesized payload',
    );
    return;
  }
  const prefix = match[1];
  const payload = match[2];
  if (opcode === 0x49 && prefix) {
    ctx.sink.add('hpl.get.formatPrefix', range, 'GET format prefix not supported');
    return;
  }
  if (opcode === 0x44 && payload.startsWith('@')) {
    const key = payload.slice(1);
    if (!ctx.tables.arrays.has(key)) {
      ctx.sink.add('hpl.array.unknown', range, 'Unknown array: ' + key);
    }
    return;
  }
  // La implementacion de referencia tambien rechaza un `;` dentro del payload,
  // pero la comprobacion es inalcanzable: la separacion de comentarios trunca
  // el registro en el primer `;` aunque este este dentro de una cadena.
}

function validateCondition(
  condition: string,
  ctx: StatementContext,
  range: Range,
): void {
  // La implementacion de referencia normaliza la condicion antes de clasificarla:
  // `R0?constX` se convierte en `R0?CONST` cuando `constX` no esta declarado.
  let normalized = condition;
  let parts = partitionUnquoted(condition, '?');
  if (parts) {
    const [lhs, rhs] = parts;
    const operator = '!<>'.includes(rhs[0] ?? '') ? rhs[0] : '';
    const left = operandToken(ctx.tables, lhs);
    const right = operandToken(ctx.tables, rhs.slice(operator.length), 1);
    if (!left.ok) {
      ctx.sink.add(left.code ?? 'hpl.cond.unsupported', range, left.message!);
      return;
    }
    if (!right.ok) {
      ctx.sink.add(right.code ?? 'hpl.cond.unsupported', range, right.message!);
      return;
    }
    normalized = left.token + '?' + operator + right.token;
    parts = partitionUnquoted(normalized, '?');
  }

  if (!parts) {
    ctx.sink.add('hpl.cond.unsupported', range, 'Unsupported condition: ' + condition);
    return;
  }

  const [lhs, value] = parts;
  if (['VCC', 'VPP', ...RESERVED_COMMANDS].includes(lhs)) {
    ctx.sink.add(
      'hpl.cond.reservedCommand',
      range,
      'Reserved command cannot begin a conditional block: ' + lhs,
    );
    return;
  }

  if (ctx.tables.inputs.has(lhs)) {
    const operator = value && '!<>'.includes(value[0]) ? value[0] : '';
    const literal = parseInteger(value.slice(operator.length));
    if (!literal.ok) {
      ctx.sink.add('hpl.literal.unsupported', range, literal.message);
      return;
    }
    if (literal.value !== 0 && literal.value !== 1) {
      ctx.sink.add('hpl.pin.compareValue', range, 'Pin compare requires 0 or 1');
    }
    return;
  }

  const match = CONDITION_FORM.exec(normalized);
  if (!match) {
    ctx.sink.add('hpl.cond.unsupported', range, 'Unsupported condition: ' + condition);
    return;
  }
  const parsed = register(match[1]);
  if (!parsed.ok) {
    ctx.sink.add('hpl.reg.indexOutOfRange', range, parsed.message);
    return;
  }
  if (match[2] !== undefined) {
    const bit = parseInteger(match[2]);
    if (!bit.ok) {
      ctx.sink.add('hpl.literal.unsupported', range, bit.message);
      return;
    }
    if (!(bit.value >= 0 && bit.value <= 31)) {
      ctx.sink.add('hpl.reg.bitRange', range, 'Register bit outside 0..31');
      return;
    }
    const literal = parseInteger(match[4]);
    if (!literal.ok) {
      ctx.sink.add('hpl.literal.unsupported', range, literal.message);
      return;
    }
    if (literal.value !== 0 && literal.value !== 1) {
      ctx.sink.add('hpl.cond.bitValue', range, 'Bit compare requires 0 or 1');
    }
    return;
  }
  if (isRegister(match[4])) {
    const parsedValue = register(match[4]);
    if (!parsedValue.ok) {
      ctx.sink.add('hpl.reg.indexOutOfRange', range, parsedValue.message);
    }
    return;
  }
  const literal = parseInteger(match[4]);
  if (!literal.ok) {
    ctx.sink.add('hpl.literal.unsupported', range, literal.message);
  }
}

function validateAssignment(
  rawLhs: string,
  rawRhs: string,
  ctx: StatementContext,
  range: Range,
): void {
  const lhsResult = operandToken(ctx.tables, rawLhs);
  if (!lhsResult.ok) {
    ctx.sink.add(lhsResult.code ?? 'hpl.operand.unknownAssignment', range, lhsResult.message!);
    return;
  }
  const rhsResult = operandToken(ctx.tables, rawRhs, 1);
  if (!rhsResult.ok) {
    ctx.sink.add(rhsResult.code ?? 'hpl.operand.unknownAssignment', range, rhsResult.message!);
    return;
  }
  const lhs = lhsResult.token;
  const rhs = rhsResult.token;

  const outputBus = ctx.tables.buses.has(lhs) && !ctx.tables.pins.has(lhs);
  const transferTarget = outputBus ? rhs : lhs;
  const transfer = ARRAY_TRANSFER.exec(transferTarget);

  if (transfer && (outputBus || ctx.tables.busInputs.has(rhs))) {
    const name = transfer[1];
    if (!ctx.tables.arrays.has(name)) {
      ctx.sink.add('hpl.array.unknown', range, 'Unknown array: ' + name);
      return;
    }
    validateTransferCount(transfer[2] ?? null, ctx, range);
    return;
  }

  if (lhs === 'VCC' || lhs === 'VPP') {
    validatePowerValue(rhs, ctx, range);
    return;
  }

  if (lhs === 'I' && ctx.tables.inputs.has(rhs)) {
    if (ctx.frames.length === 0) {
      ctx.sink.add('hpl.iter.outsideControl', range, 'Index used outside a control block');
    }
    return;
  }

  if (
    lhs.startsWith('@') &&
    !lhs.includes('[') &&
    rhs.startsWith('@') &&
    !rhs.includes('[') &&
    ctx.tables.arrays.has(rhs.slice(1))
  ) {
    const copy = ARRAY_TRANSFER.exec(lhs);
    if (!copy || !ctx.tables.arrays.has(copy[1])) {
      ctx.sink.add('hpl.array.unknown', range, 'Unknown array copy');
      return;
    }
    validateTransferCount(copy[2] ?? null, ctx, range);
    return;
  }

  if (transfer && !outputBus && ctx.tables.arrays.has(transfer[1])) {
    validateReceiveOperand(rhs, ctx, range);
    validateTransferCount(transfer[2] ?? null, ctx, range);
    return;
  }

  if ((rhs === 'Z' || rhs === 'T') && ctx.tables.pins.has(lhs)) {
    return;
  }

  if (outputBus) {
    if (rhs.startsWith('@') && ctx.tables.arrays.has(rhs.slice(1))) {
      return;
    }
    if (rhs === 'Z' || rhs === 'DATA' || rhs === 'ADR') {
      return;
    }
    if (isRegister(rhs)) {
      const parsed = register(rhs);
      if (!parsed.ok) {
        ctx.sink.add('hpl.reg.indexOutOfRange', range, parsed.message);
      }
      return;
    }
    const literal = parseInteger(rhs);
    if (!literal.ok) {
      reportOperandFailure(rhs, ctx, range, literal.message, 'hpl.bus.undefined');
    }
    return;
  }

  if (
    lhs.startsWith('@') &&
    !lhs.includes('[') &&
    ctx.tables.arrays.has(lhs.slice(1)) &&
    ctx.tables.busInputs.has(rhs)
  ) {
    return;
  }

  const array = ARRAY_OPERAND.exec(lhs);
  if (array) {
    const name = array[1];
    if (!ctx.tables.arrays.has(name)) {
      ctx.sink.add('hpl.array.unknown', range, 'Unknown array: ' + name);
      return;
    }
    const index = array[2];
    if (index === 'I') {
      if (ctx.frames.length === 0) {
        ctx.sink.add('hpl.iter.outsideControl', range, 'Array iterator outside a control block');
        return;
      }
      if (!isRegister(rhs)) {
        ctx.sink.add(
          'hpl.array.writeRequiresRegister',
          range,
          'Iterator array write requires a register',
        );
      }
      return;
    }
    if (isRegister(index)) {
      if (!isRegister(rhs)) {
        ctx.sink.add(
          'hpl.array.writeRequiresRegister',
          range,
          'Register-index array write requires a register value',
        );
      }
      return;
    }
    const offset = parseInteger(index);
    if (!offset.ok) {
      ctx.sink.add('hpl.literal.unsupported', range, offset.message);
      return;
    }
    if (!(offset.value >= 0 && offset.value <= 65535)) {
      ctx.sink.add('hpl.array.indexRange', range, 'Array index outside uint16');
      return;
    }
    if (isRegister(rhs)) {
      return;
    }
    const value = parseInteger(rhs);
    if (!value.ok) {
      reportOperandFailure(rhs, ctx, range, value.message);
      return;
    }
    if (!(value.value >= 0 && value.value <= 0xffffffff)) {
      ctx.sink.add('hpl.array.valueOutOfRange', range, 'Array value outside uint32');
    }
    return;
  }

  if (ctx.tables.pins.has(lhs)) {
    validatePinAssignment(rhs, ctx, range);
    return;
  }

  if (lhs === 'MARK') {
    if (isRegister(rhs)) {
      const parsed = register(rhs);
      if (!parsed.ok) {
        ctx.sink.add('hpl.reg.indexOutOfRange', range, parsed.message);
      }
      return;
    }
    const literal = parseInteger(rhs);
    if (!literal.ok) {
      reportOperandFailure(rhs, ctx, range, literal.message);
    }
    return;
  }

  if (lhs === 'ADR') {
    if (rhs.startsWith('R') || rhs.startsWith('$')) {
      if (isRegister(rhs)) {
        const parsed = register(rhs);
        if (!parsed.ok) {
          ctx.sink.add('hpl.reg.indexOutOfRange', range, parsed.message);
        }
        return;
      }
    }
    if (rhs.startsWith('+') || rhs.startsWith('-')) {
      const literal = parseInteger(rhs.slice(1));
      if (!literal.ok) {
        ctx.sink.add('hpl.literal.unsupported', range, literal.message);
      }
      return;
    }
    const literal = parseInteger(rhs);
    if (!literal.ok) {
      reportOperandFailure(rhs, ctx, range, literal.message);
    }
    return;
  }

  if (lhs === 'P') {
    if (isRegister(rhs)) {
      const parsed = register(rhs);
      if (!parsed.ok) {
        ctx.sink.add('hpl.reg.indexOutOfRange', range, parsed.message);
      }
      return;
    }
    const literal = parseInteger(rhs);
    if (!literal.ok) {
      reportOperandFailure(rhs, ctx, range, literal.message);
      return;
    }
    if (literal.value === 0) {
      ctx.sink.add('hpl.delay.zero', range, 'Delay must be nonzero');
    }
    return;
  }

  if (lhs === 'VCC') {
    validatePowerValue(rhs, ctx, range);
    return;
  }

  if (lhs === 'DATA[I]' && ctx.tables.inputs.has(rhs)) {
    if (ctx.frames.length === 0) {
      ctx.sink.add('hpl.iter.outsideControl', range, 'Index used outside a control block');
    }
    return;
  }

  const copiedIterator = BIT_OPERAND.exec(rhs);
  if (lhs === 'DATA[I]' && copiedIterator && copiedIterator[2] === 'I') {
    checkBitIterator(ctx, range);
    return;
  }

  const dataBit = /^DATA\[([^\]]+)\](?![\s\S])/.exec(lhs);
  if (dataBit) {
    const bit = parseInteger(dataBit[1]);
    if (!bit.ok) {
      ctx.sink.add('hpl.literal.unsupported', range, bit.message);
      return;
    }
    if (ctx.tables.inputs.has(rhs)) {
      return;
    }
    if (copiedIterator) {
      const copiedBit = parseInteger(copiedIterator[2]);
      if (!copiedBit.ok) {
        ctx.sink.add('hpl.literal.unsupported', range, copiedBit.message);
      }
      return;
    }
    const value = parseInteger(rhs);
    if (!value.ok) {
      reportOperandFailure(rhs, ctx, range, value.message);
      return;
    }
    if (value.value !== 0 && value.value !== 1) {
      ctx.sink.add('hpl.pin.valueRange', range, 'Data bit value must be 0 or 1');
    }
    return;
  }

  if (lhs === 'DATA') {
    if (ctx.tables.busInputs.has(rhs)) {
      return;
    }
    if (isRegister(rhs)) {
      const parsed = register(rhs);
      if (!parsed.ok) {
        ctx.sink.add('hpl.reg.indexOutOfRange', range, parsed.message);
      }
      return;
    }
    const literal = parseInteger(rhs);
    if (!literal.ok) {
      reportOperandFailure(rhs, ctx, range, literal.message);
    }
    return;
  }

  const registerBit = BIT_OPERAND.exec(lhs);
  if (registerBit) {
    validateRegisterBitAssignment(registerBit[1], registerBit[2], rhs, ctx, range);
    return;
  }

  if (!isRegister(lhs)) {
    ctx.sink.add(
      'hpl.operand.unknownAssignment',
      range,
      'Unknown assignment: ' + lhs + '=' + rhs,
    );
    return;
  }

  const parsedLhs = register(lhs);
  if (!parsedLhs.ok) {
    ctx.sink.add('hpl.reg.indexOutOfRange', range, parsedLhs.message);
    return;
  }

  if (ctx.tables.busInputs.has(rhs)) {
    return;
  }
  if (rhs.startsWith('@') && ctx.tables.arrays.has(rhs.slice(1))) {
    return;
  }
  const rhsArray = ARRAY_OPERAND.exec(rhs);
  if (rhsArray) {
    const name = rhsArray[1];
    if (!ctx.tables.arrays.has(name)) {
      ctx.sink.add('hpl.array.unknown', range, 'Unknown array: ' + name);
      return;
    }
    const index = rhsArray[2];
    if (index === 'I') {
      return;
    }
    if (isRegister(index)) {
      const parsed = register(index);
      if (!parsed.ok) {
        ctx.sink.add('hpl.reg.indexOutOfRange', range, parsed.message);
      }
      return;
    }
    if (index.startsWith('-')) {
      return;
    }
    const offset = parseInteger(index);
    if (!offset.ok) {
      ctx.sink.add('hpl.literal.unsupported', range, offset.message);
      return;
    }
    if (!(offset.value >= 0 && offset.value <= 65535)) {
      ctx.sink.add('hpl.array.indexRange', range, 'Array index outside uint16');
    }
    return;
  }
  if (rhs === 'DATA' || rhs === 'ADR' || rhs === 'MARK' || rhs === 'LOG') {
    return;
  }
  if (isRegister(rhs)) {
    const parsed = register(rhs);
    if (!parsed.ok) {
      ctx.sink.add('hpl.reg.indexOutOfRange', range, parsed.message);
    }
    return;
  }
  for (const operator of OPERATORS) {
    if (!rhs.startsWith(operator.symbol)) {
      continue;
    }
    const argument = operandToken(ctx.tables, rhs.slice(operator.symbol.length), 1, rhs);
    if (!argument.ok) {
      ctx.sink.add(
        argument.code ?? 'hpl.literal.unsupported',
        range,
        argument.message ?? 'Unsupported operand',
      );
      return;
    }
    if (isRegister(argument.token)) {
      const parsed = register(argument.token);
      if (!parsed.ok) {
        ctx.sink.add('hpl.reg.indexOutOfRange', range, parsed.message);
      }
      return;
    }
    const literal = parseInteger(argument.token);
    if (!literal.ok) {
      reportOperandFailure(argument.token, ctx, range, literal.message);
      return;
    }
    if (operator.rejectsZero && literal.value === 0) {
      ctx.sink.add(
        'hpl.arith.divByZero',
        range,
        'Zero literal is rejected for ' + operator.symbol,
      );
    }
    return;
  }

  const literal = parseInteger(rhs);
  if (!literal.ok) {
    reportOperandFailure(rhs, ctx, range, literal.message);
  }
}

function validateRegisterBitAssignment(
  source: string,
  bit: string,
  rhs: string,
  ctx: StatementContext,
  range: Range,
): void {
  if (bit === 'I') {
    checkBitIterator(ctx, range);
  }
  const copied = BIT_OPERAND.exec(rhs);
  const iteratorCopy = copied && copied[2] === 'I' ? copied : undefined;
  const literalBit = bit !== 'I' && !isRegister(bit);
  let bitNumber = 0;
  if (literalBit) {
    const parsed = parseInteger(bit);
    if (!parsed.ok) {
      ctx.sink.add('hpl.literal.unsupported', range, parsed.message);
      return;
    }
    bitNumber = parsed.value;
    if (!(bitNumber >= 0 && bitNumber <= 31)) {
      ctx.sink.add('hpl.reg.bitRange', range, 'Register bit outside 0..31');
      return;
    }
  }

  if (bit === 'I' && (rhs === 'DATA[I]' || rhs === 'ADR[I]')) {
    return;
  }
  if (literalBit && iteratorCopy) {
    return;
  }
  if (copied && literalBit) {
    const copiedBit = parseInteger(copied[2]);
    if (!copiedBit.ok) {
      ctx.sink.add('hpl.literal.unsupported', range, copiedBit.message);
    }
    return;
  }
  if (ctx.tables.inputs.has(rhs)) {
    if (!literalBit && bit !== 'I') {
      ctx.sink.add(
        'hpl.statement.unsupported',
        range,
        'Register-index bit read not yet probed',
      );
    }
    return;
  }
  if (literalBit) {
    const value = parseInteger(rhs);
    if (!value.ok) {
      reportOperandFailure(rhs, ctx, range, value.message);
      return;
    }
    if (value.value !== 0 && value.value !== 1) {
      ctx.sink.add('hpl.pin.valueRange', range, 'Register bit value must be 0 or 1');
    }
    return;
  }
  if (isRegister(bit)) {
    if (rhs === 'DATA[I]') {
      return;
    }
    const value = parseInteger(rhs);
    if (!value.ok) {
      reportOperandFailure(rhs, ctx, range, value.message);
      return;
    }
    if (value.value !== 0 && value.value !== 1) {
      ctx.sink.add('hpl.pin.valueRange', range, 'Register bit value must be 0 or 1');
    }
    return;
  }
  ctx.sink.add(
    'hpl.statement.unsupported',
    range,
    'Iterator bit write from literal not supported by original probe',
  );
}

function validatePinAssignment(rhs: string, ctx: StatementContext, range: Range): void {
  if (rhs === 'I') {
    checkLoopIndexType(ctx, range);
    return;
  }
  if (
    (rhs.startsWith('P') || rhs.startsWith('N')) &&
    (rhs.slice(1) === '' ||
      /^(?:\d+|0[Xx][0-9A-Fa-f]+|[0-9A-Fa-f]+[Hh]|[01]+[Bb])$/.test(rhs.slice(1)))
  ) {
    return;
  }
  const bit = PIN_BIT_OPERAND.exec(rhs);
  if (bit) {
    const source = bit[1];
    const index = bit[2];
    if (source === 'ADR' || source === 'DATA') {
      if (index === 'I') {
        if (source === 'ADR') {
          checkBitIterator(ctx, range);
        } else if (ctx.frames.length === 0) {
          ctx.sink.add('hpl.iter.outsideControl', range, 'Pin iterator outside a control block');
        }
        return;
      }
      const literal = parseInteger(index);
      if (!literal.ok) {
        ctx.sink.add('hpl.literal.unsupported', range, literal.message);
      }
      return;
    }
    if (index === 'I') {
      checkBitIterator(ctx, range);
      return;
    }
    const literal = parseInteger(index);
    if (!literal.ok) {
      ctx.sink.add('hpl.literal.unsupported', range, literal.message);
      return;
    }
    if (!(literal.value >= 0 && literal.value <= 31)) {
      ctx.sink.add('hpl.reg.bitRange', range, 'Register bit outside 0..31');
    }
    return;
  }
  const literal = parseInteger(rhs);
  if (!literal.ok) {
    reportOperandFailure(rhs, ctx, range, literal.message);
    return;
  }
  if (literal.value !== 0 && literal.value !== 1) {
    ctx.sink.add('hpl.pin.valueRange', range, 'Pin value must be 0 or 1');
  }
}

function validatePowerValue(rhs: string, ctx: StatementContext, range: Range): void {
  if (isRegister(rhs)) {
    const parsed = register(rhs);
    if (!parsed.ok) {
      ctx.sink.add('hpl.reg.indexOutOfRange', range, parsed.message);
    }
    return;
  }
  const literal = parseInteger(rhs);
  if (!literal.ok) {
    reportOperandFailure(rhs, ctx, range, literal.message);
  }
}

/**
 * Valida el operando receptor de una transferencia de array.
 *
 * Reproduce la resolucion del operando receptor de la implementacion de
 * referencia.
 */
function validateReceiveOperand(
  rhs: string,
  ctx: StatementContext,
  range: Range,
): void {
  if (!rhs) {
    ctx.sink.add(
      'hpl.array.receiveOperand',
      range,
      'Array receive requires an operand',
    );
    return;
  }
  if (ctx.tables.busInputs.has(rhs) || ctx.tables.inputs.has(rhs)) {
    return;
  }
  if (rhs.startsWith('@')) {
    const array = /^@([^\[]+)\[([^\]]+)\](?![\s\S])/.exec(rhs);
    if (!array) {
      return;
    }
    const [, name, index] = array;
    if (!ctx.tables.arrays.has(name)) {
      return;
    }
    if (index === 'I') {
      return;
    }
    if (isRegister(index)) {
      const parsed = register(index);
      if (!parsed.ok) {
        ctx.sink.add('hpl.reg.indexOutOfRange', range, parsed.message);
      }
      return;
    }
    if (!'0123456789'.includes(index[0])) {
      return;
    }
    const literal = parseInteger(index);
    if (!literal.ok) {
      ctx.sink.add('hpl.literal.unsupported', range, literal.message);
      return;
    }
    if (literal.value > 65535) {
      ctx.sink.add('hpl.array.indexRange', range, 'Array index outside uint16');
    }
    return;
  }
  const bit = /^(R[0-9A-F]{1,2}|CONST|DATA|ADR)\[([^\]]+)\](?![\s\S])/.exec(rhs);
  if (bit) {
    const [, source, index] = bit;
    if (index === 'I') {
      return;
    }
    if (isRegister(index) && source.startsWith('R')) {
      const parsed = register(index);
      if (!parsed.ok) {
        ctx.sink.add('hpl.reg.indexOutOfRange', range, parsed.message);
      }
      return;
    }
    if (!'0123456789'.includes(index[0])) {
      return;
    }
    const literal = parseInteger(index);
    if (!literal.ok) {
      ctx.sink.add('hpl.literal.unsupported', range, literal.message);
      return;
    }
    const limit = source === 'DATA' || source === 'ADR' ? 65535 : 31;
    if (literal.value > limit) {
      ctx.sink.add(
        'hpl.reg.bitRange',
        range,
        'Bit index outside native operand range',
      );
    }
    return;
  }
  if (isRegister(rhs)) {
    const parsed = register(rhs);
    if (!parsed.ok) {
      ctx.sink.add('hpl.reg.indexOutOfRange', range, parsed.message);
    }
    return;
  }
  if ('0123456789'.includes(rhs[0])) {
    const literal = parseInteger(rhs);
    if (!literal.ok) {
      ctx.sink.add('hpl.literal.unsupported', range, literal.message);
    }
  }
}

function validateTransferCount(
  count: string | null,
  ctx: StatementContext,
  range: Range,
): void {
  if (count === null) {
    return;
  }
  const result = operandToken(ctx.tables, count, 1);
  if (!result.ok) {
    ctx.sink.add(
      result.code ?? 'hpl.array.countOperand',
      range,
      result.message ?? 'Array count requires a register or a digit-led literal',
    );
    return;
  }
  if (isRegister(result.token)) {
    const parsed = register(result.token);
    if (!parsed.ok) {
      ctx.sink.add('hpl.reg.indexOutOfRange', range, parsed.message);
    }
    return;
  }
  if (!result.token || !'0123456789'.includes(result.token[0])) {
    ctx.sink.add(
      'hpl.array.countOperand',
      range,
      'Array count requires a register or a digit-led literal',
    );
    return;
  }
  const literal = parseInteger(result.token);
  if (!literal.ok) {
    ctx.sink.add('hpl.literal.unsupported', range, literal.message);
  }
}

/**
 * El iterador `I` exige un bloque de control y un indice de bucle valido.
 *
 * Reproduce el iterador de bits de la implementacion de referencia, que examina
 * la instruccion del marco superior de la pila de control.
 */
function checkBitIterator(ctx: StatementContext, range: Range): void {
  const frame = ctx.frames[ctx.frames.length - 1];
  if (!frame) {
    ctx.sink.add('hpl.iter.outsideControl', range, 'Bit iterator outside a control block');
    return;
  }
  if (frame.first > 31 || frame.last > 31) {
    ctx.sink.add('hpl.iter.indexTooLarge', range, 'Loop index too large for use');
  }
}

/**
 * La asignacion a un pin desde el iterador `I` exige un bucle de registro.
 *
 * Reproduce el criterio de la implementacion de referencia: un bucle numerico
 * no define el tipo de indice.
 */
function checkLoopIndexType(ctx: StatementContext, range: Range): void {
  const frame = ctx.frames[ctx.frames.length - 1];
  if (!frame) {
    ctx.sink.add('hpl.iter.outsideControl', range, 'Index used outside a control block');
    return;
  }
  if (frame.opcode === OPCODE_LOOP_NUMERIC) {
    ctx.sink.add('hpl.loop.indexTypeUndefined', range, 'LOOP index type undefined');
  }
}

/**
 * Traduce el fallo de un literal a un diagnostico mas preciso cuando el
 * operando es un identificador no declarado.
 */
function reportOperandFailure(
  token: string,
  ctx: StatementContext,
  range: Range,
  message: string,
  identifierCode = 'hpl.pin.undefined',
): void {
  if (
    /^[A-Za-z_][A-Za-z0-9_]*$/.test(token) &&
    !RESERVED_OPERANDS.includes(token) &&
    !isRegister(token) &&
    !isDeclaredAlias(ctx.tables, token)
  ) {
    ctx.sink.add(identifierCode, range, 'Unknown identifier: ' + token);
    return;
  }
  ctx.sink.add('hpl.literal.unsupported', range, message);
}
