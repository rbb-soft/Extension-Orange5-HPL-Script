/**
 * Generador del corpus de pruebas T2.
 *
 * Crea `fixtures/valid/` y `fixtures/invalid/<codigo-de-regla>/` junto con
 * `fixtures/manifest.json`, que declara para cada fixture los codigos de
 * diagnostico esperados, su severidad y su linea.
 *
 * Uso:  node tools/generate-fixtures.mjs
 */
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = path.join(ROOT, 'fixtures');

/** Cabecera base: pin de salida, pin de entrada, bus de salida y registro. */
const BASE = ['PINO=SCK,0', 'PINI=SO,1', 'BUSO=PB,0', 'R9=STATUS,C8'];

const fixtures = [];
const valid = [];

/** Registra un fixture invalido. */
function invalid(code, name, content, options = {}) {
  fixtures.push({
    file: path.posix.join('invalid', code, name + '.hpl'),
    content,
    expected: options.expected ?? [{ code, severity: 'error', line: options.line }],
  });
}

/** Registra un fixture valido. */
function ok(name, content) {
  valid.push({ file: path.posix.join('valid', name + '.hpl'), content });
}

/* ------------------------------------------------------------------ */
/* Fixtures validos                                                    */
/* ------------------------------------------------------------------ */

ok('minimo', ['PINO=SCK,0', 'PINI=SO,1', '["Main"]', 'SCK=0', 'SO?1{SCK=1}'].join('\n') + '\n');
ok(
  'registro_y_array',
  [
    'PINO=SCK,0',
    'R9=STATUS,C8,SRWD',
    '@buf={1,2,3}',
    '["Main"]',
    'R9=0',
    'SCK=0',
  ].join('\n') + '\n',
);
ok(
  'macro_local',
  [
    'PINO=SCK,0',
    '["Main"]',
    '_MAC',
    '[_MAC]',
    'R0=1',
  ].join('\n') + '\n',
);
ok(
  'bucle_y_comentarios',
  [
    'PINO=SCK,0',
    'PINI=SO,1',
    '["Main"]',
    '; comentario de linea',
    '// comentario completo',
    'LOOP=(7,0){SCK=P}',
    'PRINT=("fin")',
  ].join('\n') + '\n',
);

/* ------------------------------------------------------------------ */
/* 5.1 Registros y delimitadores lexicos                               */
/* ------------------------------------------------------------------ */

invalid('hpl.record.tooLong', 'linea_larga', '[' + 'A'.repeat(8200) + '\n');
invalid(
  'hpl.record.afterEof',
  'tras_ctrl_z',
  ['["Main"]', 'SCK=0', 'R0=1'].join('\n') + '\x1a' + 'R1=2\n',
  { expected: [{ code: 'hpl.record.afterEof', severity: 'warning' }] },
);
invalid('hpl.string.unclosed', 'cadena_sin_cerrar', ['["Main"]', 'PRINT=("abc'].join('\n') + '\n');
invalid(
  'hpl.paren.unbalanced',
  'parentesis',
  ['["Main"]', 'R0?0){R1=1}'].join('\n') + '\n',
);
invalid('hpl.literal.unsupported', 'literal', ['PINO=SCK,0', '["Main"]', 'SCK=12ZZ'].join('\n') + '\n');

/* ------------------------------------------------------------------ */
/* 5.2 Estructura                                                      */
/* ------------------------------------------------------------------ */

invalid('hpl.block.unclosed', 'sin_cerrar', ['["Main"]', 'R0?1{', 'SCK=0'].join('\n') + '\n');
invalid('hpl.block.unexpectedClose', 'cierre_solto', ['["Main"]', 'SCK=0', '}'].join('\n') + '\n');
invalid('hpl.block.withoutCondition', 'llave_sola', ['["Main"]', '{'].join('\n') + '\n');
invalid(
  'hpl.block.braceNotOnConditionLine',
  'llave_siguiente_linea',
  ['["Main"]', 'R0?1', '{', 'SCK=0', '}'].join('\n') + '\n',
  { expected: [{ code: 'hpl.block.braceNotOnConditionLine', severity: 'error', line: 3 }] },
);
invalid(
  'hpl.block.missingSeparator',
  'separador_faltante',
  ['["Main"]', 'R0?1{', 'SCK=0', '}X'].join('\n') + '\n',
);
invalid('hpl.block.emptyBody', 'cuerpo_vacio', ['["Main"]', 'R0?1{', '}'].join('\n') + '\n');
invalid('hpl.statement.empty', 'sentencia_vacia', ['["Main"]', 'SCK=0,,SCK=1'].join('\n') + '\n');
invalid('hpl.statement.unsupported', 'sentencia_sin_igual', ['["Main"]', 'SCK'].join('\n') + '\n');

{
  const depth = 33;
  const body = Array.from({ length: depth }, () => 'R0?1{').join('\n');
  const close = '}'.repeat(depth);
  invalid(
    'hpl.nesting.tooDeep',
    'anidamiento',
    ['["Main"]', body, close].join('\n') + '\n',
    { expected: [{ code: 'hpl.nesting.tooDeep', severity: 'error' }] },
  );
}

/* ------------------------------------------------------------------ */
/* 5.3 Secciones y macros                                              */
/* ------------------------------------------------------------------ */

invalid('hpl.section.duplicate', 'duplicada', ['["Main"]', 'SCK=0', '["Main"]', 'SCK=1'].join('\n') + '\n');
invalid('hpl.section.systemAlreadyDefined', 'sistema_repetida', ['[INIT]', 'SCK=0', '[INIT]', 'SCK=1'].join('\n') + '\n');
invalid(
  'hpl.section.tooMany',
  'demasiadas',
  Array.from({ length: 17 }, (_, index) => '["S' + index + '"]').join('\n') + '\n',
  { expected: [{ code: 'hpl.section.tooMany', severity: 'error' }] },
);
invalid('hpl.section.nameTooLong', 'nombre_largo', '["' + 'N'.repeat(21) + '"]\n');
invalid('hpl.section.emptyLocalName', 'macro_sin_nombre', '[_]\n');
invalid('hpl.section.delimiter', 'delimitador', '[Main=X]\n');
invalid('hpl.macro.duplicate', 'macro_duplicada', ['[_MAC]', 'R0=1', '[_MAC]', 'R0=2'].join('\n') + '\n');
invalid(
  'hpl.macro.tooMany',
  'demasiadas',
  Array.from({ length: 65 }, (_, index) => '[_M' + index + ']').join('\n') + '\n',
  { expected: [{ code: 'hpl.macro.tooMany', severity: 'error' }] },
);
invalid('hpl.macro.undefined', 'no_definida', ['["Main"]', '_MISSING'].join('\n') + '\n');
invalid(
  'hpl.macro.argCount',
  'sin_argumentos',
  ['[_MAC]', 'R0=1', '["Main"]', '_MAC()'].join('\n') + '\n',
);
invalid(
  'hpl.macro.argUnsupported',
  'argumento_invalido',
  ['PINO=SCK,0', '[_MAC]', 'R0=1', '["Main"]', '_MAC(SCK)'].join('\n') + '\n',
);

/* ------------------------------------------------------------------ */
/* 5.4 Cabeceras                                                       */
/* ------------------------------------------------------------------ */

invalid('hpl.header.unsupported', 'desconocida', ['FOO=1'].join('\n') + '\n');
invalid(
  'hpl.header.afterSection',
  'despues_de_seccion',
  ['["Main"]', 'POWER=1'].join('\n') + '\n',
  { expected: [{ code: 'hpl.header.afterSection', severity: 'error' }] },
);
invalid('hpl.header.unclosedString', 'cadena', ['INFO="sin cerrar'].join('\n') + '\n');
invalid('hpl.header.hplNameTooLong', 'dependencia_larga', ['HPL=' + 'd'.repeat(49)].join('\n') + '\n');
invalid('hpl.header.infoTooLong', 'info_larga', ['INFO=' + 'x'.repeat(500)].join('\n') + '\n');
invalid('hpl.header.optionFlag', 'flag', ['OPTIONS=q'].join('\n') + '\n');
invalid(
  'hpl.header.tooManyOptionAreas',
  'areas',
  ['OPTIONS=a,b,c,d,e,f,g,h,i'].join('\n') + '\n',
);
invalid('hpl.header.cdelayNotDigit', 'cdelay', ['CDELAY=x'].join('\n') + '\n');

/* ------------------------------------------------------------------ */
/* 5.5 Pines y buses                                                   */
/* ------------------------------------------------------------------ */

invalid('hpl.pin.aliasInvalid', 'alias', ['PINO=1SCK,0'].join('\n') + '\n');
invalid('hpl.pin.aliasTooLong', 'alias', ['PINO=ABCDEFGHI,0'].join('\n') + '\n');
invalid('hpl.pin.numberNotDigit', 'numero', ['PINO=SCK,X'].join('\n') + '\n');
invalid('hpl.pin.reservedName', 'reservado', ['PINO=R0,0'].join('\n') + '\n');
invalid(
  'hpl.pin.tooMany',
  'demasiados',
  Array.from({ length: 48 }, (_, index) => 'PINO=P' + index + ',' + index).join('\n') + '\n',
  { expected: [{ code: 'hpl.pin.tooMany', severity: 'error' }] },
);
invalid(
  'hpl.pin.undefined',
  'no_declarado',
  ['PINO=SCK,0', '["Main"]', 'SCK=INEXISTENTE'].join('\n') + '\n',
);
invalid('hpl.bus.aliasInvalid', 'alias', ['BUSO=1PB,0'].join('\n') + '\n');
invalid('hpl.bus.aliasTooLong', 'alias', ['BUSO=ABCDEFGHI,0'].join('\n') + '\n');
invalid('hpl.bus.numberNotDigit', 'numero', ['BUSO=PB,X'].join('\n') + '\n');
invalid(
  'hpl.bus.tooMany',
  'demasiados',
  Array.from({ length: 48 }, (_, index) => 'BUSO=B' + index + ',' + index).join('\n') + '\n',
  { expected: [{ code: 'hpl.bus.tooMany', severity: 'error' }] },
);
invalid(
  'hpl.bus.undefined',
  'no_declarado',
  ['BUSO=PB,0', '@buf=4', '["Main"]', 'PB=INEXISTENTE'].join('\n') + '\n',
  { expected: [{ code: 'hpl.bus.undefined', severity: 'error' }] },
);
invalid('hpl.pin.valueRange', 'valor', ['PINO=SCK,0', '["Main"]', 'SCK=2'].join('\n') + '\n');
invalid(
  'hpl.pin.compareValue',
  'comparacion',
  ['PINI=SO,1', '["Main"]', 'SO?2{SCK=1}'].join('\n') + '\n',
);

/* ------------------------------------------------------------------ */
/* 5.6 Registros                                                       */
/* ------------------------------------------------------------------ */

invalid('hpl.reg.duplicateName', 'nombre', ['R0=Same', 'R1=Same'].join('\n') + '\n');
invalid('hpl.reg.formatUnknown', 'formato', ['R9="A",'].join('\n') + '\n');
invalid(
  'hpl.reg.nameTruncated',
  'nombre_largo',
  ['R9="' + 'N'.repeat(16) + '",C8'].join('\n') + '\n',
  { expected: [{ code: 'hpl.reg.nameTruncated', severity: 'warning' }] },
);
invalid(
  'hpl.reg.indexOutOfRange',
  'fuera_de_rango',
  ['["Main"]', 'R20=1'].join('\n') + '\n',
);
invalid('hpl.reg.bitRange', 'bit', ['["Main"]', 'R0[32]=1'].join('\n') + '\n');

/* ------------------------------------------------------------------ */
/* 5.7 Arrays                                                          */
/* ------------------------------------------------------------------ */

invalid('hpl.array.duplicate', 'duplicada', ['@buf=4', '@buf=8'].join('\n') + '\n');
invalid(
  'hpl.array.tooMany',
  'demasiadas',
  Array.from({ length: 33 }, (_, index) => '@a' + index + '=4').join('\n') + '\n',
  { expected: [{ code: 'hpl.array.tooMany', severity: 'error' }] },
);
invalid('hpl.array.sizeInvalid', 'tamano', ['@buf=0'].join('\n') + '\n');
invalid('hpl.array.valueOutOfRange', 'byte', ['@buf={1,300}'].join('\n') + '\n');
invalid('hpl.array.empty', 'vacia', ['@buf={}'].join('\n') + '\n');
invalid(
  'hpl.array.unknown',
  'no_declarada',
  ['["Main"]', '@other[0]=1'].join('\n') + '\n',
);
invalid('hpl.array.indexRange', 'indice', ['@buf=4', '["Main"]', '@buf[70000]=1'].join('\n') + '\n');
invalid(
  'hpl.array.countOperand',
  'contador',
  ['BUSO=PB,0', '@buf=4', '["Main"]', 'PB=@buf(INEXISTENTE)'].join('\n') + '\n',
);
invalid(
  'hpl.array.writeRequiresRegister',
  'escritura',
  ['@buf=4', '["Main"]', '@buf[R0]=1'].join('\n') + '\n',
);
invalid(
  'hpl.array.receiveOperand',
  'receptor',
  ['@buf=4', '["Main"]', '@buf='].join('\n') + '\n',
);

/* ------------------------------------------------------------------ */
/* 5.8 Condiciones, iteradores y control                               */
/* ------------------------------------------------------------------ */

invalid(
  'hpl.cond.unsupported',
  'no_soportada',
  ['["Main"]', 'INEXISTENTE?1{SCK=1}'].join('\n') + '\n',
);
invalid(
  'hpl.cond.reservedCommand',
  'comando_reservado',
  ['["Main"]', 'EXIT?1{SCK=1}'].join('\n') + '\n',
);
invalid('hpl.cond.bitValue', 'bit', ['["Main"]', 'R0[0]?2{SCK=1}'].join('\n') + '\n');
invalid(
  'hpl.iter.outsideControl',
  'fuera_de_control',
  ['["Main"]', 'R0[I]=1'].join('\n') + '\n',
);
invalid(
  'hpl.iter.indexTooLarge',
  'indice_grande',
  ['["Main"]', 'LOOP=(0,5000){', 'R0[I]=1', '}'].join('\n') + '\n',
);
invalid(
  'hpl.loop.form',
  'forma',
  ['["Main"]', 'LOOP=(1,2,3){', 'SCK=0', '}'].join('\n') + '\n',
);
invalid(
  'hpl.loop.valueTooBig',
  'valor',
  ['["Main"]', 'LOOP=(70000,1){', 'SCK=0', '}'].join('\n') + '\n',
);
invalid(
  'hpl.loop.indexTypeUndefined',
  'tipo_indice',
  ['PINO=O,1', '["Main"]', 'LOOP(3){O=I}'].join('\n') + '\n',
);
invalid('hpl.break.outsideLoop', 'fuera_de_bucle', ['["Main"]', 'BREAK'].join('\n') + '\n');
invalid(
  'hpl.break.tooMany',
  'demasiados',
  ['["Main"]', 'LOOP=(7,0){', Array.from({ length: 32 }, () => 'BREAK').join('\n'), '}'].join('\n') +
    '\n',
  { expected: [{ code: 'hpl.break.tooMany', severity: 'error' }] },
);
invalid('hpl.operand.reservedLhs', 'reservado', ['["Main"]', 'LOOP=1'].join('\n') + '\n');
invalid(
  'hpl.operand.unknownAssignment',
  'desconocida',
  ['["Main"]', 'INEXISTENTE=1'].join('\n') + '\n',
);

/* ------------------------------------------------------------------ */
/* 5.9 Aritmetica y comandos                                           */
/* ------------------------------------------------------------------ */

invalid('hpl.arith.divByZero', 'division', ['["Main"]', 'R0=/0'].join('\n') + '\n');
invalid(
  'hpl.codeSlotsExceeded',
  'slots',
  ['["Main"]', Array.from({ length: 4096 }, () => 'R0=1').join('\n')].join('\n') +
    '\n',
  { expected: [{ code: 'hpl.codeSlotsExceeded', severity: 'error' }] },
);
invalid('hpl.delay.zero', 'retardo', ['["Main"]', 'P=0'].join('\n') + '\n');
invalid('hpl.print.payloadRequired', 'payload', ['["Main"]', 'PRINT=abc'].join('\n') + '\n');
invalid('hpl.get.formatPrefix', 'prefijo', ['["Main"]', 'GET=S("x")'].join('\n') + '\n');

/* ------------------------------------------------------------------ */
/* 5.10 Avisos                                                         */
/* ------------------------------------------------------------------ */

invalid(
  'hpl.adv.payloadEmpty',
  'payload_vacio',
  ['["Main"]', 'PRINT=()'].join('\n') + '\n',
  { expected: [{ code: 'hpl.adv.payloadEmpty', severity: 'hint' }] },
);
invalid(
  'hpl.adv.logIgnored',
  'log',
  ['LOG=1'].join('\n') + '\n',
  { expected: [{ code: 'hpl.adv.logIgnored', severity: 'hint' }] },
);
invalid(
  'hpl.adv.invertedPin',
  'invertido',
  ['PINO=#SCK,0'].join('\n') + '\n',
  { expected: [{ code: 'hpl.adv.invertedPin', severity: 'hint' }] },
);
invalid(
  'hpl.adv.encodingMismatch',
  'codificacion',
  ['["Main"]', 'PRINT=("ca�f")'].join('\n') + '\n',
  { expected: [{ code: 'hpl.adv.encodingMismatch', severity: 'hint' }] },
);
invalid(
  'hpl.adv.codeSlotsNearLimit',
  'slots',
  ['["Main"]', Array.from({ length: 3700 }, (_, index) => 'R0=' + (index % 100)).join('\n')].join('\n') +
    '\n',
  { expected: [{ code: 'hpl.adv.codeSlotsNearLimit', severity: 'hint' }] },
);

/* ------------------------------------------------------------------ */
/* Escritura                                                           */
/* ------------------------------------------------------------------ */

rmSync(path.join(FIXTURES, 'invalid'), { recursive: true, force: true });
rmSync(path.join(FIXTURES, 'valid'), { recursive: true, force: true });
mkdirSync(FIXTURES, { recursive: true });

for (const item of valid) {
  const target = path.join(FIXTURES, item.file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, item.content, 'utf8');
}

for (const item of fixtures) {
  const target = path.join(FIXTURES, item.file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, item.content, 'utf8');
}

const manifest = {
  valid: valid.map((item) => item.file),
  invalid: fixtures.map((item) => ({
    file: item.file,
    expected: item.expected,
  })),
};
writeFileSync(
  path.join(FIXTURES, 'manifest.json'),
  JSON.stringify(manifest, null, 2) + '\n',
  'utf8',
);

console.log(
  'Fixtures: ' +
    valid.length +
    ' validos, ' +
    fixtures.length +
    ' invalidos (' +
    new Set(fixtures.map((item) => item.expected[0].code)).size +
    ' codigos de regla distintos)',
);
