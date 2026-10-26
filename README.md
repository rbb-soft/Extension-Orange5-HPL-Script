# Orange5 HPL Script

Extensión de VS Code para **editar archivos HPL en texto plano** con resaltado de
sintaxis y validación semántica.

El entorno no genera HPX. No compila, no cifra y no accede a dongles ni a
memorias de activación. Su única función es señalar, en el editor y con
posiciones exactas, los errores que la implementación de referencia rechazaría.

- **Motor del analizador**: TypeScript puro. La extensión instalada no requiere
  Python ni ningún otro componente externo.
- **Base**: servidor LSP propio, empaquetado dentro de la extensión.
- **Alcance de la validación**: espejo del conjunto de reglas verificadas de la
  implementación de referencia del lenguaje HPL.

## Instalación

### Desde la tienda de extensiones

1. Abrir la paleta de extensiones (`Ctrl+Shift+X`).
2. Buscar **Orange5 HPL Script**.
3. Pulsar *Install*.

O desde la línea de órdenes:

```powershell
code --install-extension RichardBarolin.orange5-hpl-script
```

### Desde el archivo `.vsix`

Si prefiere instalarla sin pasar por la tienda, compile el paquete e instale el
`.vsix` generado:

```powershell
pnpm install
pnpm run package
code --install-extension (Get-ChildItem dist\*.vsix).FullName
```

El archivo también puede instalarse con doble clic, o desde la paleta de
comandos de VS Code mediante `Extensions: Install from VSIX…`.

Requisitos: VS Code 1.140 o superior. No se requiere Node.js ni Python.

Tras la instalación, cualquier archivo con extensión `.hpl` se abre con
resaltado de sintaxis y con los diagnósticos publicados en el panel Problemas.

## Uso

1. Abrir un archivo `.hpl`.
2. Los errores aparecen en el panel **Problemas**, con la línea y la columna
   exactas, y subrayados en el editor.
3. El catálogo completo de reglas está en
   [`docs/CATALOGO_REGLAS.md`](docs/CATALOGO_REGLAS.md). Cada diagnóstico
   incluye su código, por ejemplo `hpl.pin.undefined`.
4. Al seleccionar un diagnóstico del panel Problemas, el cursor se sitúa en la
   línea y la columna exactas.

### Ajustes

| Ajuste | Tipo | Por defecto | Efecto |
|---|---|---|---|
| `hpl.diagnostics.enable` | booleano | `true` | Publica o suspende los diagnósticos. |
| `hpl.diagnostics.severityOverrides` | objeto | `{}` | Ajusta la severidad por código de regla. |
| `hpl.trace.server` | enumeración | `off` | Traza la comunicación con el servidor LSP. |

Ejemplo de `hpl.diagnostics.severityOverrides`:

```json
{
  "hpl.adv.logIgnored": "ignore",
  "hpl.reg.nameTruncated": "warning",
  "hpl.codeSlotsExceeded": "warning"
}
```

Valores admitidos: `error`, `warning`, `hint` e `ignore`.

## Arquitectura del proyecto

```
Extension-Orange5-HPL-Script/        # carpeta del repositorio
├─ package.json            manifest de la extensión y scripts de trabajo
├─ pnpm-workspace.yaml     proyectos del workspace: raíz, client/ y server/
├─ pnpm-lock.yaml          resolución exacta de dependencias
├─ build.mjs               empaquetado con esbuild (cliente y servidor)
├─ tsconfig.json           configuración de TypeScript de la raíz
├─ tsconfig.base.json      opciones compartidas por raíz, client/ y server/
├─ LICENSE                 licencia MIT del proyecto
├─ CHANGELOG.md            registro de versiones
├─ assets/                 recursos gráficos de la extensión
│  └─ icon.png             icono de 128x128 para la ficha del Marketplace
├─ client/                 la extensión de VS Code
│  ├─ language-configuration.json
│  ├─ syntaxes/hpl.tmLanguage.json
│  └─ src/extension.ts
├─ server/                 el servidor LSP
│  ├─ src/server.ts
│  ├─ src/analyzer/        motor de análisis, sin dependencias de VS Code
│  └─ test/                pruebas unitarias, de gramática y diferencial
├─ fixtures/               corpus de pruebas: válidos e inválidos
│  ├─ invalid/             casos que deben producir un diagnóstico
│  ├─ manifest.json        índice del corpus de pruebas
│  └─ valid/               casos que deben aceptarse sin diagnóstico
├─ tools/
│  ├─ oracle/              oráculo Python contra la implementación de referencia
│  ├─ generate-fixtures.mjs
│  ├─ generate-docs.mjs
│  ├─ generate-icon.mjs
│  └─ package.mjs
└─ docs/
   ├─ GRAMATICA_HPL.md
   └─ CATALOGO_REGLAS.md
```

El motor de análisis (`server/src/analyzer/`) no importa `vscode-languageserver`.
Es una función pura `analyze(text): HplDiagnostic[]`, lo que permite ejecutarla
en las pruebas y en el oráculo sin levantar un servidor.

### Analizador

El análisis se realiza en cinco fases:

1. **Lectura de registros.** Se emula el lector nativo por registros: CRLF se
   normaliza a LF, el control `Ctrl+Z` termina el archivo, y cada registro se
   limita a 8191 caracteres.
2. **Lexado.** Cada registro se separa en código y comentario con la misma
   lógica de comillas que la implementación de referencia, y se produce una
   lista de tokens con posición absoluta.
3. **Parseo.** Se construye un árbol de cabeceras, secciones, sentencias y
   bloques, con las mismas peculiaridades del tokenizador nativo.
4. **Tablas de símbolos.** Dos pasadas: primero las declaraciones (pines,
   buses, arrays, macros, registros), después la resolución de referencias.
5. **Motor de reglas.** Cada regla del catálogo produce cero o más
   diagnósticos con posición exacta.

## Desarrollo

Requiere Node.js 22 o superior y pnpm 12 (`corepack enable` lo deja disponible).

```powershell
pnpm install
pnpm run build        # empaqueta cliente y servidor con esbuild
pnpm run typecheck    # TypeScript en modo estricto
pnpm test             # compila y ejecuta la suite completa
pnpm run fixtures     # regenera fixtures/ y su manifiesto
pnpm run docs         # regenera docs/CATALOGO_REGLAS.md desde el código
pnpm run icon         # regenera assets/icon.png
pnpm run package      # genera el .vsix en dist/
pnpm run publish      # publica el .vsix en la tienda de extensiones
```

La suite completa incluye el **test diferencial**, que compara el veredicto
del analizador con el de la implementación de referencia sobre un corpus
completo. El test se omite si no se definen las variables de entorno:

```powershell
$env:HPL_CORPUS = "C:\ruta\al\corpus\de\fuentes"
$env:HPL_REFERENCE_PROGRAM = "C:\ruta\al\programa\de\referencia.py"
pnpm test
```

El oráculo puede invocarse por separado:

```powershell
python -B tools/oracle/reference_verdicts.py `
  --program "C:\ruta\al\programa\de\referencia.py" `
  --corpus $env:HPL_CORPUS `
  --output out\verdicts.json
```

### Invariante central

> El linter jamás debe aceptar un archivo que la implementación de referencia
> rechaza.

Es la dirección peligrosa del fallo: un falso negativo oculta un error que
impedirá generar el HPX. Los falsos positivos —señalar algo que la
implementación de referencia acepta— se admiten únicamente en reglas de
severidad `warning` o `hint`.

## Publicación en la tienda de extensiones

El publicador es `RichardBarolin`, por lo que la extensión queda publicada
como `RichardBarolin.orange5-hpl-script`. El Marketplace exige que el campo
`publisher` del manifiesto coincida exactamente con el publicador al que
pertenece el token con el que se publica.

### Token de acceso personal

En Azure DevOps, *User settings* → *Personal Access Tokens* → *New token*:

- Organizaciones: *All accessible organizations*
- Ámbito: `Marketplace` → `Manage*

### Publicar

```powershell
$env:VSCE_PAT = "<token>"
pnpm run publish
```

El script recompila la extensión y sube el `.vsix`. Equivale a
`vsce publish --no-dependencies`: la flag es necesaria porque todo el código
se empaqueta con esbuild y `node_modules` no debe viajar en la extensión.

Para publicar sin pasar por la variable de entorno:

```powershell
npx vsce login RichardBarolin
pnpm run publish
```

`vsce login` abre el navegador y guarda el token en el almacén de credenciales
del sistema. Es interactivo, por lo que en integración continua se prefiere
`VSCE_PAT` como secreto.

### Verificar

La ficha aparece en
<https://marketplace.visualstudio.com/items?itemName=RichardBarolin.orange5-hpl-script>
una vez indexada, que puede tardar entre unos minutos y algunas horas. A
partir de ahí la instalación es la de la sección *Instalación*.

Para publicar una versión de prueba, `vsce publish --pre-release` deja la
extensión en la sección de pre-lanzamiento, separada de las versiones estables.

## Estado verificado

| Comprobación | Resultado |
|---|---|
| Fuentes del corpus de referencia (12.676 archivos `.hpl`) | 0 falsas negativas, 0 falsas positivas |
| Archivos aceptados por la implementación de referencia | 10.842 |
| Archivos rechazados por la implementación de referencia | 1.834 |
| Reglas del catálogo | 84 |
| Reglas con fixture propio | 83 (99 %) |
| Pruebas automatizadas | 111, todas en verde |
| Análisis de 1.000 líneas | inferior a 50 ms |
| Paquete `.vsix` | 11 ficheros, 231 KB, sin código TypeScript ni Python |
| Icono de la ficha | `assets/icon.png`, 128×128 |
| Extensión publicada | `RichardBarolin.orange5-hpl-script@0.1.0` |
| Cadena de herramientas | pnpm 12.15.0, TypeScript 7.0.2, esbuild 0.28.2, `@vscode/vsce` 4.0.0 |
| Dependencias deprecadas en el árbol | 0 |

## Documentación

- [`docs/GRAMATICA_HPL.md`](docs/GRAMATICA_HPL.md): especificación del lenguaje
  derivada de la implementación de referencia.
- [`docs/CATALOGO_REGLAS.md`](docs/CATALOGO_REGLAS.md): catálogo de reglas con
  severidad, descripción y fixture asociado.
- [`CHANGELOG.md`](CHANGELOG.md): registro de versiones del proyecto.

## Licencia

MIT.
