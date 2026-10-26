# Gramática del lenguaje HPL

Especificación del comportamiento del lenguaje HPL tal como lo impone la
implementación de referencia. Cada apartado describe las reglas, los límites
y las excepciones que esa implementación aplica.

Ante cualquier discrepancia entre esta especificación y el comportamiento
observado, prevalece la implementación de referencia.

---

## 1. Estructura del archivo

| Aspecto | Comportamiento |
|---|---|
| Lectura | Por registros de 8191 caracteres, como `fgets` |
| Fin de línea | CRLF se normaliza a LF |
| Fin de archivo | El control `Ctrl+Z` (0x1A) termina el archivo; el contenido posterior se ignora |
| Nulo | Un registro que empieza en NUL termina la lectura; el NUL trunca el resto del registro |
| Codificación | Latin-1 reversible: un byte, un carácter |
| Comentarios | `;` hasta el final de la línea, **salvo dentro de comillas** |
| Comentario de línea | `//` abre comentario **solo** si es el primer carácter no-espacio del registro |

Dos consecuencias relevantes para el editor:

- Un `;` dentro de una cadena **sí** abre comentario en la implementación de
  referencia, porque el corte de comentarios trunca el registro en el primer
  `;` aunque esté entrecomillado.
- Un `//` a mitad de línea **no** es un comentario: es código, y la
  implementación de referencia lo rechaza. La gramática de resaltado lo marca
  como operador a propósito.

### 1.1. Cabeceras y secciones

Todo lo anterior a la primera sección `[...]` son **cabeceras**. A partir de
la primera sección, toda línea que no sea una sección es **cuerpo**.

---

## 2. Secciones

Sintaxis: `[nombre]`, con banderas iniciales y prefijo de macro.

| Elemento | Valores |
|---|---|
| Banderas | `!` = 1, `#` = 2, `~` = 4 |
| Macro local | prefijo `_` |
| Longitud del nombre | 20 bytes como máximo |
| Secciones de usuario | 16 como máximo |
| Macros | 64 como máximo |

El prefijo `_` se evalúa **antes** que las banderas: `[_#FWD]` produce el
nombre `_FWD` con banderas `2` y con la marca de macro local.

Secciones del sistema: `INIT`, `READ`, `WRITE`, `WRITEINIT`, `WRITEEND`,
`WRITEBLOCK`, `READBLOCK`, `END`, `SETUP`.

Un delimitador `)` no comillado dentro del nombre de sección da error; una
coma cierra la sección y el resto de la línea pasa a ser cuerpo.

---

## 3. Cabeceras

| Clave | Semántica | Límite |
|---|---|---|
| `HPL=` | dependencia | 48 bytes |
| `INFO=` | metadatos | 496 bytes útiles |
| `INFOFILE=` | metadatos | 176 bytes útiles |
| `TESTMASK=` | máscara | 32 bytes útiles |
| `POWER=` | uint32 | — |
| `SOCKET=` | uint32 truncado a 16 bits | — |
| `ALLPINS=` | entero | — |
| `CDELAY=` | literal con dígito inicial | — |
| `OPTIONS=` | hasta 8 áreas | banderas `b/B`, `w`, `r`, `m`, `f/F`, `z` |
| `LOG=` | solo interfaz de usuario; no se serializa | — |
| `PINO` `PINI` `PING` `PINT` | alias de pin, número y pin físico opcional | alias ≤ 8 bytes; ≤ 47 por grupo; número con dígito inicial |
| `BUSO` `BUSI` | alias de bus y número | alias ≤ 8 bytes; ≤ 47 por grupo |
| `R<n>=` | declaración de registro: nombre, formato, etiquetas | nombre ≤ 15 bytes |
| `@nombre=` | array de bytes: `{b,b,…}`, `"texto"` o tamaño | nombre ≤ 20; tamaño 1…32768; bytes 0…255; ≤ 32 arrays |

### 3.1. Rarezas que el linter reproduce

- **El alias de pin y bus conserva el retorno de carro.** La implementación de
  referencia recorta los espacios y el salto de línea, pero no el retorno de
  carro, en las declaraciones de pin y bus.
- **La cola de una declaración se procesa como otra cabecera.** Una declaración
  de pin o bus seguida de texto tras el último operando se reinterpreta como
  una cabecera nueva.
- **Las tablas de alias terminan en su primer nombre vacío.** Un alias vacío
  interrumpe la tabla, de modo que los alias declarados después quedan
  invisibles.
- **La comparación de nombres de registro solo examina el prefijo contiguo**
  de ranuras ocupadas.
- **Los metadatos de array reutilizan la primera ranura libre**, y un array sin
  nombre ocupa siempre la ranura 0.

---

## 4. Sentencias

- Separador de sentencias: la **coma** a nivel superior.
- Comandos: `PRINT=`, `GET=`, `EXIT`, `BREAK`, `RETURN`, `IENABLE`, `IDISABLE`.
- `PRINT` acepta un prefijo de formato de entre `S`, `P`, `E`, `A`, `L`, `I` o
  `T`; `GET` **no** lo acepta.
- `PRINT` y `GET` exigen payload parentizado.
- Un payload de longitud cero hace que la implementación de referencia ignore
  el resto de la línea, incluidas las llaves posteriores.
- Macros: `_nombre` o `_nombre(arg1,…,arg16)`, con 1 a 16 argumentos no vacíos.
- La forma `_#nombre` declara una referencia adelantada.

### 4.1. Condiciones y bloques

| Forma | Descripción |
|---|---|
| `operando?valor{ … }` | Bloque condicional |
| `LOOP=(a,b)` | Bucle numérico |
| `LOOP=(reg)` | Bucle de registro |
| `LOOP=($BUILTIN)` | Bucle de un operando integrado |

La llave de apertura debe estar **en la misma línea** que el inicio de la
condición. Tras un `}` sólo se admite `,`, `=`, `(`, `)`, `?`, `}` o el fin de
línea.

### 4.2. Iterador universal

`I` es el iterador universal. Su uso exige un bloque de control, y el bloque
superior debe ser un bucle cuyo índice no exceda 31.

### 4.3. Condiciones y operandos

- Comparación de pin de entrada: el valor debe ser 0 o 1.
- Comparación de bit: el valor debe ser 0 o 1.
- Valor de pin: 0 o 1.
- División, módulo y desplazamiento por literal cero: error.
- `P=0`: retardo nulo.

---

## 5. Operandos

| Clase | Formato |
|---|---|
| Registros | `R0` … `R1F` |
| Integrados | `$SIZE`, `$BLOCKSIZE`, `$VERIFY`, `$CDELAY`, `$WDELAY`, `$AREA`, `$VERSION`, `CONST`, `$CONST`, `$MODE`, `$MCUCLK`, `$BAUD` |
| Datos | `DATA`, `DATA[n]` |
| Dirección | `ADR`, `ADR[n]` |
| Marca | `MARK` |
| Registro lógico | `LOG` (reconocido y descartado) |
| Iterador | `I` |
| Alimentación | `VCC`, `VPP` |
| Retardo | `P` |
| Alias de pin y bus | los declarados en las cabeceras |
| Arrays | `@nombre`, `@nombre[índice]` |
| Literales | decimal, `0x…`, sufijo `H/h` hexadecimal, sufijo `B/b` binario |

### 5.1. Forma canónica del operando

Todo operando se reduce a una forma canónica:

- `R0[7]` se convierte en `R0[R7]`: un índice de registro literal se
  reescribe como registro.
- `CONST` con índice y `DATA`/`ADR` conservan su sufijo.
- Un alias de pin declarado que empieza por `CONST` conserva su identidad de
  alias: `constX` no se confunde con el registro `CONST`.

### 5.2. Limpieza final de alias

Tras procesar las cabeceras, la implementación de referencia elimina de las
tablas de pines y buses todo alias que colisione con un registro, con `DATA`,
`ADR`, `MARK`, `LOG` o `I`, y todo alias que se resuelva como otra clase de
operando.

---

## 6. Límites de recursos

| Límite | Valor |
|---|---|
| Anidamiento de control | 32 bloques |
| Slots de código | 4096 |
| Registros `R` válidos | 0 a 31 |
| Macros | 64 |
| Secciones de usuario | 16 |
| Pines por grupo | 47 |
| Buses por grupo | 47 |
| Arrays | 32 |
| `BREAK` pendientes | 31 |
| Longitud de registro | 8191 |
| Profundidad de argumentos de macro | 16 |

---

## 7. Comprobaciones que nunca se alcanzan

El linter no implementa dos comprobaciones presentes en la implementación de
referencia porque resultan inalcanzables y solo producirían falsos positivos:

- **`Register shift not supported`**: la condición exige que la operación de
  registro no tenga valor asignado, pero todos los operadores de la lista lo
  tienen. La comprobación nunca se cumple.
- **`Comment markers inside PRINT/GET payload are not supported`**: el payload
  proviene del registro ya truncado por el corte de comentarios, que corta en
  el primer `;` aunque esté dentro de una cadena. El `;` nunca llega a la
  comprobación.
