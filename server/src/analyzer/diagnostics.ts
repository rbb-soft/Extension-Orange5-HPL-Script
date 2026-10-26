/**
 * Catalogo de reglas del linter HPL.
 *
 * Cada regla lleva un codigo estable, una severidad por defecto y una
 * descripcion breve de la condicion que detecta.
 *
 * Severidad:
 *   `error`   -> la implementacion de referencia rechaza el archivo.
 *   `warning` -> la implementacion de referencia lo acepta, pero hay riesgo o
 *                comportamiento no obvio.
 *   `hint`    -> informacion de estilo o de limite no alcanzado.
 */

export type Severity = 'error' | 'warning' | 'hint';

export interface Position {
  /** Linea, base 0 (convención LSP). */
  line: number;
  /** Columna en unidades de codigo UTF-16, base 0. */
  character: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export interface HplDiagnostic {
  range: Range;
  severity: Severity;
  code: string;
  message: string;
}

export interface RuleDefinition {
  code: string;
  severity: Severity;
  /** Descripcion breve de la condicion detectada. */
  description: string;
}

/**
 * Catalogo completo de reglas.
 *
 * El orden sigue las familias del lenguaje: registros lexicos, estructura,
 * secciones y macros, cabeceras, pines y buses, registros, arrays, control,
 * aritmetica y avisos.
 */
export const RULE_CATALOG: RuleDefinition[] = [
  // Registros y delimitadores lexicos
  { code: 'hpl.record.tooLong', severity: 'error', description: 'Linea de mas de 8191 caracteres' },
  { code: 'hpl.record.afterEof', severity: 'warning', description: 'Contenido posterior a Ctrl+Z, ignorado por la implementacion de referencia' },
  { code: 'hpl.string.unclosed', severity: 'error', description: 'Cadena o expresion sin cerrar' },
  { code: 'hpl.paren.unbalanced', severity: 'error', description: 'Parentesis desbalanceados' },
  { code: 'hpl.literal.unsupported', severity: 'error', description: 'Literal entero no soportado' },

  // Estructura
  { code: 'hpl.block.unclosed', severity: 'error', description: 'Bloque sin cerrar' },
  { code: 'hpl.block.unexpectedClose', severity: 'error', description: 'Cierre de bloque sin bloque abierto' },
  { code: 'hpl.block.withoutCondition', severity: 'error', description: 'Bloque sin condicion previa' },
  { code: 'hpl.block.braceNotOnConditionLine', severity: 'error', description: 'La llave de apertura no esta en la linea de la condicion' },
  { code: 'hpl.block.missingSeparator', severity: 'error', description: 'Falta el separador tras un cierre de bloque' },
  { code: 'hpl.block.emptyBody', severity: 'error', description: 'Cuerpo de bloque vacio' },
  { code: 'hpl.statement.empty', severity: 'error', description: 'Sentencia vacia entre comas' },
  { code: 'hpl.statement.unsupported', severity: 'error', description: 'Sentencia no reconocida' },
  { code: 'hpl.nesting.tooDeep', severity: 'error', description: 'Anidamiento de control superior a 32 bloques' },

  // Secciones y macros
  { code: 'hpl.section.delimiter', severity: 'error', description: 'Delimitador inesperado en el nombre de seccion' },
  { code: 'hpl.section.nameTooLong', severity: 'error', description: 'Nombre de seccion de mas de 20 bytes' },
  { code: 'hpl.section.emptyLocalName', severity: 'error', description: 'Seccion local sin nombre' },
  { code: 'hpl.section.duplicate', severity: 'error', description: 'Seccion de usuario duplicada' },
  { code: 'hpl.section.systemAlreadyDefined', severity: 'error', description: 'Seccion del sistema redefinida' },
  { code: 'hpl.section.tooMany', severity: 'error', description: 'Mas de 16 secciones de usuario' },
  { code: 'hpl.macro.duplicate', severity: 'error', description: 'Macro duplicada' },
  { code: 'hpl.macro.tooMany', severity: 'error', description: 'Mas de 64 macros' },
  { code: 'hpl.macro.undefined', severity: 'error', description: 'Llamada a macro no definida' },
  { code: 'hpl.macro.argCount', severity: 'error', description: 'Numero de argumentos fuera de 1..16, o argumento vacio' },
  { code: 'hpl.macro.argUnsupported', severity: 'error', description: 'Tipo de argumento de macro no soportado' },

  // Cabeceras
  { code: 'hpl.header.unsupported', severity: 'error', description: 'Declaracion de cabecera no soportada' },
  { code: 'hpl.header.afterSection', severity: 'error', description: 'Cabecera situada despues de la primera seccion' },
  { code: 'hpl.header.unclosedString', severity: 'error', description: 'Cadena sin cerrar en una cabecera' },
  { code: 'hpl.header.hplNameTooLong', severity: 'error', description: 'Dependencia HPL de mas de 48 bytes' },
  { code: 'hpl.header.infoTooLong', severity: 'error', description: 'INFO, INFOFILE o TESTMASK exceden su lector nativo' },
  { code: 'hpl.header.optionFlag', severity: 'error', description: 'Bandera de OPTIONS no verificada' },
  { code: 'hpl.header.tooManyOptionAreas', severity: 'error', description: 'Mas de 8 areas en OPTIONS' },
  { code: 'hpl.header.cdelayNotDigit', severity: 'error', description: 'CDELAY exige un literal con digito inicial' },

  // Pines y buses
  { code: 'hpl.pin.aliasInvalid', severity: 'error', description: 'El alias de pin debe ser un nombre' },
  { code: 'hpl.pin.aliasTooLong', severity: 'error', description: 'Alias de pin de mas de 8 caracteres' },
  { code: 'hpl.pin.numberNotDigit', severity: 'error', description: 'El numero de pin exige un literal con digito inicial' },
  { code: 'hpl.pin.reservedName', severity: 'error', description: 'Alias reservado: registro o DATA' },
  { code: 'hpl.pin.tooMany', severity: 'error', description: 'Mas de 47 pines en el grupo' },
  { code: 'hpl.pin.undefined', severity: 'error', description: 'Alias de pin no declarado usado como operando' },
  { code: 'hpl.bus.aliasInvalid', severity: 'error', description: 'El alias de bus debe ser un nombre' },
  { code: 'hpl.bus.aliasTooLong', severity: 'error', description: 'Alias de bus de mas de 8 caracteres' },
  { code: 'hpl.bus.numberNotDigit', severity: 'error', description: 'El numero de bus exige un literal con digito inicial' },
  { code: 'hpl.bus.tooMany', severity: 'error', description: 'Mas de 47 buses en el grupo' },
  { code: 'hpl.bus.undefined', severity: 'error', description: 'Alias de bus no declarado usado como operando' },
  { code: 'hpl.pin.valueRange', severity: 'error', description: 'Valor de pin fuera de {0, 1}' },
  { code: 'hpl.pin.compareValue', severity: 'error', description: 'Comparacion de pin exige 0 o 1' },

  // Registros
  { code: 'hpl.reg.indexOutOfRange', severity: 'error', description: 'Registro fuera del rango 0..31' },
  { code: 'hpl.reg.duplicateName', severity: 'error', description: 'Nombre de registro ya usado por otro registro' },
  { code: 'hpl.reg.formatUnknown', severity: 'error', description: 'Formato de registro no verificado' },
  { code: 'hpl.reg.nameTruncated', severity: 'warning', description: 'Nombre de mas de 15 bytes, truncado por la implementacion de referencia' },
  { code: 'hpl.reg.bitRange', severity: 'error', description: 'Bit de registro fuera de 0..31' },

  // Arrays
  { code: 'hpl.array.duplicate', severity: 'error', description: 'Array duplicada' },
  { code: 'hpl.array.tooMany', severity: 'error', description: 'Mas de 32 arrays' },
  { code: 'hpl.array.sizeInvalid', severity: 'error', description: 'Tamano de array fuera de 1..32768' },
  { code: 'hpl.array.valueOutOfRange', severity: 'error', description: 'Byte de array fuera de 0..255' },
  { code: 'hpl.array.empty', severity: 'error', description: 'Array de bytes vacia, no verificada' },
  { code: 'hpl.array.unknown', severity: 'error', description: 'Referencia a array no declarada' },
  { code: 'hpl.array.indexRange', severity: 'error', description: 'Indice de array fuera de uint16' },
  { code: 'hpl.array.countOperand', severity: 'error', description: 'El contador de transferencia exige registro o literal' },
  { code: 'hpl.array.writeRequiresRegister', severity: 'error', description: 'La escritura por indice de registro exige un valor de registro' },
  { code: 'hpl.array.receiveOperand', severity: 'error', description: 'La recepcion de un array exige un operando' },

  // Condiciones, iteradores y control
  { code: 'hpl.cond.unsupported', severity: 'error', description: 'Condicion no soportada' },
  { code: 'hpl.cond.reservedCommand', severity: 'error', description: 'Comando reservado usado como condicion' },
  { code: 'hpl.cond.bitValue', severity: 'error', description: 'Comparacion de bit exige 0 o 1' },
  { code: 'hpl.iter.outsideControl', severity: 'error', description: 'Iterador I utilizado fuera de un bloque de control' },
  { code: 'hpl.iter.indexTooLarge', severity: 'error', description: 'Indice de iteracion superior a 31' },
  { code: 'hpl.loop.form', severity: 'error', description: 'Forma de LOOP no verificada' },
  { code: 'hpl.loop.valueTooBig', severity: 'error', description: 'Valores de LOOP fuera de rango' },
  { code: 'hpl.loop.indexTypeUndefined', severity: 'error', description: 'Bucle numerico donde la implementacion de referencia exige un bucle de registro' },
  { code: 'hpl.break.outsideLoop', severity: 'error', description: 'BREAK fuera de un LOOP' },
  { code: 'hpl.break.tooMany', severity: 'error', description: 'Mas de 31 BREAK pendientes' },
  { code: 'hpl.operand.reservedLhs', severity: 'error', description: 'Comando reservado usado como lado izquierdo' },
  { code: 'hpl.operand.unknownAssignment', severity: 'error', description: 'Asignacion con lado izquierdo no reconocido' },

  // Aritmetica y comandos
  { code: 'hpl.arith.divByZero', severity: 'error', description: 'Division, modulo o desplazamiento por literal cero' },
  { code: 'hpl.delay.zero', severity: 'error', description: 'P=0, retardo nulo' },
  { code: 'hpl.print.payloadRequired', severity: 'error', description: 'PRINT o GET exige payload parentizado' },
  { code: 'hpl.get.formatPrefix', severity: 'error', description: 'Prefijo de formato no soportado en GET' },
  { code: 'hpl.codeSlotsExceeded', severity: 'error', description: 'El numero estimado de slots de codigo excede el limite nativo' },

  // Avisos
  { code: 'hpl.adv.payloadEmpty', severity: 'hint', description: 'Payload de longitud cero: el resto de la linea se ignora' },
  { code: 'hpl.adv.logIgnored', severity: 'hint', description: 'LOG se reconoce pero no se serializa' },
  { code: 'hpl.adv.invertedPin', severity: 'hint', description: 'Alias con prefijo #: polaridad invertida' },
  { code: 'hpl.adv.codeSlotsNearLimit', severity: 'hint', description: 'El numero estimado de slots se acerca al limite nativo' },
  { code: 'hpl.adv.encodingMismatch', severity: 'hint', description: 'El archivo contiene bytes que no son UTF-8 validos' },

  // Interno
  { code: 'hpl.internalError', severity: 'error', description: 'Fallo interno del analizador' },
];

export const RULE_SEVERITIES: Record<string, Severity> = Object.fromEntries(
  RULE_CATALOG.map((rule) => [rule.code, rule.severity]),
);

export const ALL_RULE_CODES = RULE_CATALOG.map((rule) => rule.code);

export function defaultSeverity(code: string): Severity {
  return RULE_SEVERITIES[code] ?? 'warning';
}

/** Acumula diagnosticos durante el analisis. */
export class DiagnosticSink {
  private readonly items: HplDiagnostic[] = [];

  add(
    code: string,
    range: Range,
    message: string,
    severity?: Severity,
  ): void {
    this.items.push({
      range,
      severity: severity ?? defaultSeverity(code),
      code,
      message,
    });
  }

  get list(): HplDiagnostic[] {
    return this.items;
  }

  /** Ordena por posicion y elimina duplicados exactos. */
  finish(): HplDiagnostic[] {
    const sorted = this.items.slice().sort((a, b) => {
      const byLine = a.range.start.line - b.range.start.line;
      if (byLine !== 0) return byLine;
      const byChar = a.range.start.character - b.range.start.character;
      if (byChar !== 0) return byChar;
      return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
    });
    const unique: HplDiagnostic[] = [];
    let previous: HplDiagnostic | undefined;
    for (const item of sorted) {
      if (
        previous &&
        previous.code === item.code &&
        previous.message === item.message &&
        previous.range.start.line === item.range.start.line &&
        previous.range.start.character === item.range.start.character
      ) {
        continue;
      }
      unique.push(item);
      previous = item;
    }
    return unique;
  }
}
