# Catalogo de reglas del linter HPL

Documento generado por `tools/generate-docs.mjs`. No editar a mano.

Cada regla se corresponde con una comprobacion del lenguaje HPL rechazada
por la implementacion de referencia.
La severidad por defecto se puede ajustar por el usuario mediante
`hpl.diagnostics.severityOverrides`.

## Severidades

| Severidad | Significado |
|---|---|
| `error` | La implementacion de referencia rechaza el archivo. |
| `warning` | La implementacion de referencia lo acepta, pero hay riesgo o comportamiento no obvio. |
| `hint` | Informacion de estilo o de limite no alcanzado. |

## Registros y delimitadores lexicos

| Codigo | Severidad | Descripcion | Fixture |
|---|---|---|---|
| `hpl.record.tooLong` | `error` | Linea de mas de 8191 caracteres | `invalid/hpl.record.tooLong/linea_larga.hpl` |
| `hpl.record.afterEof` | `warning` | Contenido posterior a Ctrl+Z, ignorado por la implementacion de referencia | `invalid/hpl.record.afterEof/tras_ctrl_z.hpl` |
| `hpl.string.unclosed` | `error` | Cadena o expresion sin cerrar | `invalid/hpl.string.unclosed/cadena_sin_cerrar.hpl` |
| `hpl.paren.unbalanced` | `error` | Parentesis desbalanceados | `invalid/hpl.paren.unbalanced/parentesis.hpl` |
| `hpl.literal.unsupported` | `error` | Literal entero no soportado | `invalid/hpl.literal.unsupported/literal.hpl` |

## Estructura

| Codigo | Severidad | Descripcion | Fixture |
|---|---|---|---|
| `hpl.block.unclosed` | `error` | Bloque sin cerrar | `invalid/hpl.block.unclosed/sin_cerrar.hpl` |
| `hpl.block.unexpectedClose` | `error` | Cierre de bloque sin bloque abierto | `invalid/hpl.block.unexpectedClose/cierre_solto.hpl` |
| `hpl.block.withoutCondition` | `error` | Bloque sin condicion previa | `invalid/hpl.block.withoutCondition/llave_sola.hpl` |
| `hpl.block.braceNotOnConditionLine` | `error` | La llave de apertura no esta en la linea de la condicion | `invalid/hpl.block.braceNotOnConditionLine/llave_siguiente_linea.hpl` |
| `hpl.block.missingSeparator` | `error` | Falta el separador tras un cierre de bloque | `invalid/hpl.block.missingSeparator/separador_faltante.hpl` |
| `hpl.block.emptyBody` | `error` | Cuerpo de bloque vacio | `invalid/hpl.block.emptyBody/cuerpo_vacio.hpl` |
| `hpl.statement.empty` | `error` | Sentencia vacia entre comas | `invalid/hpl.statement.empty/sentencia_vacia.hpl` |
| `hpl.statement.unsupported` | `error` | Sentencia no reconocida | `invalid/hpl.statement.unsupported/sentencia_sin_igual.hpl` |
| `hpl.nesting.tooDeep` | `error` | Anidamiento de control superior a 32 bloques | `invalid/hpl.nesting.tooDeep/anidamiento.hpl` |

## Secciones y macros

| Codigo | Severidad | Descripcion | Fixture |
|---|---|---|---|
| `hpl.section.delimiter` | `error` | Delimitador inesperado en el nombre de seccion | `invalid/hpl.section.delimiter/delimitador.hpl` |
| `hpl.section.nameTooLong` | `error` | Nombre de seccion de mas de 20 bytes | `invalid/hpl.section.nameTooLong/nombre_largo.hpl` |
| `hpl.section.emptyLocalName` | `error` | Seccion local sin nombre | `invalid/hpl.section.emptyLocalName/macro_sin_nombre.hpl` |
| `hpl.section.duplicate` | `error` | Seccion de usuario duplicada | `invalid/hpl.section.duplicate/duplicada.hpl` |
| `hpl.section.systemAlreadyDefined` | `error` | Seccion del sistema redefinida | `invalid/hpl.section.systemAlreadyDefined/sistema_repetida.hpl` |
| `hpl.section.tooMany` | `error` | Mas de 16 secciones de usuario | `invalid/hpl.section.tooMany/demasiadas.hpl` |
| `hpl.macro.duplicate` | `error` | Macro duplicada | `invalid/hpl.macro.duplicate/macro_duplicada.hpl` |
| `hpl.macro.tooMany` | `error` | Mas de 64 macros | `invalid/hpl.macro.tooMany/demasiadas.hpl` |
| `hpl.macro.undefined` | `error` | Llamada a macro no definida | `invalid/hpl.macro.undefined/no_definida.hpl` |
| `hpl.macro.argCount` | `error` | Numero de argumentos fuera de 1..16, o argumento vacio | `invalid/hpl.macro.argCount/sin_argumentos.hpl` |
| `hpl.macro.argUnsupported` | `error` | Tipo de argumento de macro no soportado | `invalid/hpl.macro.argUnsupported/argumento_invalido.hpl` |

## Cabeceras

| Codigo | Severidad | Descripcion | Fixture |
|---|---|---|---|
| `hpl.header.unsupported` | `error` | Declaracion de cabecera no soportada | `invalid/hpl.header.unsupported/desconocida.hpl` |
| `hpl.header.afterSection` | `error` | Cabecera situada despues de la primera seccion | `invalid/hpl.header.afterSection/despues_de_seccion.hpl` |
| `hpl.header.unclosedString` | `error` | Cadena sin cerrar en una cabecera | `invalid/hpl.header.unclosedString/cadena.hpl` |
| `hpl.header.hplNameTooLong` | `error` | Dependencia HPL de mas de 48 bytes | `invalid/hpl.header.hplNameTooLong/dependencia_larga.hpl` |
| `hpl.header.infoTooLong` | `error` | INFO, INFOFILE o TESTMASK exceden su lector nativo | `invalid/hpl.header.infoTooLong/info_larga.hpl` |
| `hpl.header.optionFlag` | `error` | Bandera de OPTIONS no verificada | `invalid/hpl.header.optionFlag/flag.hpl` |
| `hpl.header.tooManyOptionAreas` | `error` | Mas de 8 areas en OPTIONS | `invalid/hpl.header.tooManyOptionAreas/areas.hpl` |
| `hpl.header.cdelayNotDigit` | `error` | CDELAY exige un literal con digito inicial | `invalid/hpl.header.cdelayNotDigit/cdelay.hpl` |

## Pines y buses

| Codigo | Severidad | Descripcion | Fixture |
|---|---|---|---|
| `hpl.pin.aliasInvalid` | `error` | El alias de pin debe ser un nombre | `invalid/hpl.pin.aliasInvalid/alias.hpl` |
| `hpl.pin.aliasTooLong` | `error` | Alias de pin de mas de 8 caracteres | `invalid/hpl.pin.aliasTooLong/alias.hpl` |
| `hpl.pin.numberNotDigit` | `error` | El numero de pin exige un literal con digito inicial | `invalid/hpl.pin.numberNotDigit/numero.hpl` |
| `hpl.pin.reservedName` | `error` | Alias reservado: registro o DATA | `invalid/hpl.pin.reservedName/reservado.hpl` |
| `hpl.pin.tooMany` | `error` | Mas de 47 pines en el grupo | `invalid/hpl.pin.tooMany/demasiados.hpl` |
| `hpl.pin.undefined` | `error` | Alias de pin no declarado usado como operando | `invalid/hpl.pin.undefined/no_declarado.hpl` |
| `hpl.bus.aliasInvalid` | `error` | El alias de bus debe ser un nombre | `invalid/hpl.bus.aliasInvalid/alias.hpl` |
| `hpl.bus.aliasTooLong` | `error` | Alias de bus de mas de 8 caracteres | `invalid/hpl.bus.aliasTooLong/alias.hpl` |
| `hpl.bus.numberNotDigit` | `error` | El numero de bus exige un literal con digito inicial | `invalid/hpl.bus.numberNotDigit/numero.hpl` |
| `hpl.bus.tooMany` | `error` | Mas de 47 buses en el grupo | `invalid/hpl.bus.tooMany/demasiados.hpl` |
| `hpl.bus.undefined` | `error` | Alias de bus no declarado usado como operando | `invalid/hpl.bus.undefined/no_declarado.hpl` |
| `hpl.pin.valueRange` | `error` | Valor de pin fuera de {0, 1} | `invalid/hpl.pin.valueRange/valor.hpl` |
| `hpl.pin.compareValue` | `error` | Comparacion de pin exige 0 o 1 | `invalid/hpl.pin.compareValue/comparacion.hpl` |

## Registros

| Codigo | Severidad | Descripcion | Fixture |
|---|---|---|---|
| `hpl.reg.indexOutOfRange` | `error` | Registro fuera del rango 0..31 | `invalid/hpl.reg.indexOutOfRange/fuera_de_rango.hpl` |
| `hpl.reg.duplicateName` | `error` | Nombre de registro ya usado por otro registro | `invalid/hpl.reg.duplicateName/nombre.hpl` |
| `hpl.reg.formatUnknown` | `error` | Formato de registro no verificado | `invalid/hpl.reg.formatUnknown/formato.hpl` |
| `hpl.reg.nameTruncated` | `warning` | Nombre de mas de 15 bytes, truncado por la implementacion de referencia | `invalid/hpl.reg.nameTruncated/nombre_largo.hpl` |
| `hpl.reg.bitRange` | `error` | Bit de registro fuera de 0..31 | `invalid/hpl.reg.bitRange/bit.hpl` |

## Arrays

| Codigo | Severidad | Descripcion | Fixture |
|---|---|---|---|
| `hpl.array.duplicate` | `error` | Array duplicada | `invalid/hpl.array.duplicate/duplicada.hpl` |
| `hpl.array.tooMany` | `error` | Mas de 32 arrays | `invalid/hpl.array.tooMany/demasiadas.hpl` |
| `hpl.array.sizeInvalid` | `error` | Tamano de array fuera de 1..32768 | `invalid/hpl.array.sizeInvalid/tamano.hpl` |
| `hpl.array.valueOutOfRange` | `error` | Byte de array fuera de 0..255 | `invalid/hpl.array.valueOutOfRange/byte.hpl` |
| `hpl.array.empty` | `error` | Array de bytes vacia, no verificada | `invalid/hpl.array.empty/vacia.hpl` |
| `hpl.array.unknown` | `error` | Referencia a array no declarada | `invalid/hpl.array.unknown/no_declarada.hpl` |
| `hpl.array.indexRange` | `error` | Indice de array fuera de uint16 | `invalid/hpl.array.indexRange/indice.hpl` |
| `hpl.array.countOperand` | `error` | El contador de transferencia exige registro o literal | `invalid/hpl.array.countOperand/contador.hpl` |
| `hpl.array.writeRequiresRegister` | `error` | La escritura por indice de registro exige un valor de registro | `invalid/hpl.array.writeRequiresRegister/escritura.hpl` |
| `hpl.array.receiveOperand` | `error` | La recepcion de un array exige un operando | `invalid/hpl.array.receiveOperand/receptor.hpl` |

## Condiciones, iteradores y control

| Codigo | Severidad | Descripcion | Fixture |
|---|---|---|---|
| `hpl.cond.unsupported` | `error` | Condicion no soportada | `invalid/hpl.cond.unsupported/no_soportada.hpl` |
| `hpl.cond.reservedCommand` | `error` | Comando reservado usado como condicion | `invalid/hpl.cond.reservedCommand/comando_reservado.hpl` |
| `hpl.cond.bitValue` | `error` | Comparacion de bit exige 0 o 1 | `invalid/hpl.cond.bitValue/bit.hpl` |
| `hpl.iter.outsideControl` | `error` | Iterador I utilizado fuera de un bloque de control | `invalid/hpl.iter.outsideControl/fuera_de_control.hpl` |
| `hpl.iter.indexTooLarge` | `error` | Indice de iteracion superior a 31 | `invalid/hpl.iter.indexTooLarge/indice_grande.hpl` |
| `hpl.loop.form` | `error` | Forma de LOOP no verificada | `invalid/hpl.loop.form/forma.hpl` |
| `hpl.loop.valueTooBig` | `error` | Valores de LOOP fuera de rango | `invalid/hpl.loop.valueTooBig/valor.hpl` |
| `hpl.loop.indexTypeUndefined` | `error` | Bucle numerico donde la implementacion de referencia exige un bucle de registro | `invalid/hpl.loop.indexTypeUndefined/tipo_indice.hpl` |
| `hpl.break.outsideLoop` | `error` | BREAK fuera de un LOOP | `invalid/hpl.break.outsideLoop/fuera_de_bucle.hpl` |
| `hpl.break.tooMany` | `error` | Mas de 31 BREAK pendientes | `invalid/hpl.break.tooMany/demasiados.hpl` |
| `hpl.operand.reservedLhs` | `error` | Comando reservado usado como lado izquierdo | `invalid/hpl.operand.reservedLhs/reservado.hpl` |
| `hpl.operand.unknownAssignment` | `error` | Asignacion con lado izquierdo no reconocido | `invalid/hpl.operand.unknownAssignment/desconocida.hpl` |

## Aritmetica y comandos

| Codigo | Severidad | Descripcion | Fixture |
|---|---|---|---|
| `hpl.arith.divByZero` | `error` | Division, modulo o desplazamiento por literal cero | `invalid/hpl.arith.divByZero/division.hpl` |
| `hpl.delay.zero` | `error` | P=0, retardo nulo | `invalid/hpl.delay.zero/retardo.hpl` |
| `hpl.print.payloadRequired` | `error` | PRINT o GET exige payload parentizado | `invalid/hpl.print.payloadRequired/payload.hpl` |
| `hpl.get.formatPrefix` | `error` | Prefijo de formato no soportado en GET | `invalid/hpl.get.formatPrefix/prefijo.hpl` |
| `hpl.codeSlotsExceeded` | `error` | El numero estimado de slots de codigo excede el limite nativo | `invalid/hpl.codeSlotsExceeded/slots.hpl` |

## Avisos

| Codigo | Severidad | Descripcion | Fixture |
|---|---|---|---|
| `hpl.adv.payloadEmpty` | `hint` | Payload de longitud cero: el resto de la linea se ignora | `invalid/hpl.adv.payloadEmpty/payload_vacio.hpl` |
| `hpl.adv.logIgnored` | `hint` | LOG se reconoce pero no se serializa | `invalid/hpl.adv.logIgnored/log.hpl` |
| `hpl.adv.invertedPin` | `hint` | Alias con prefijo #: polaridad invertida | `invalid/hpl.adv.invertedPin/invertido.hpl` |
| `hpl.adv.codeSlotsNearLimit` | `hint` | El numero estimado de slots se acerca al limite nativo | `invalid/hpl.adv.codeSlotsNearLimit/slots.hpl` |
| `hpl.adv.encodingMismatch` | `hint` | El archivo contiene bytes que no son UTF-8 validos | `invalid/hpl.adv.encodingMismatch/codificacion.hpl` |

## Interno

| Codigo | Severidad | Descripcion | Fixture |
|---|---|---|---|
| `hpl.internalError` | `error` | Fallo interno del analizador | - |

## Cobertura

- Reglas en el catalogo: **84**
- Reglas con fixture propio: **83**
- Cobertura: **99%** de las reglas del catalogo
- Reglas sin fixture: `hpl.internalError`
