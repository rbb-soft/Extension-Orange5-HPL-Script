# Changelog

Todos los cambios notables de este proyecto se documentan aquí.
Formato basado en [Keep a Changelog](https://keepachangelog.com/es/1.0.0/).

---

## [v0.1.0] — 2026-10-26

Primera publicación de la extensión.

### Added

- Extensión de VS Code para editar y validar archivos HPL en texto plano, con
  resaltado de sintaxis y un servidor LSP propio empaquetado dentro de la
  extensión.
- Catálogo de 84 reglas de validación, documentado en
  [`docs/CATALOGO_REGLAS.md`](docs/CATALOGO_REGLAS.md) y generado desde el
  código por `tools/generate-docs.mjs`.
- Especificación del lenguaje HPL en
  [`docs/GRAMATICA_HPL.md`](docs/GRAMATICA_HPL.md).
- Corpus de pruebas con 83 fixtures propios y un test diferencial contra la
  implementación de referencia.
- Oráculo Python (`tools/oracle/reference_verdicts.py`) que emite los veredictos
  de la implementación de referencia sobre un corpus de fuentes.
- Icono de 128×128 (`assets/icon.png`), generado de forma determinista por
  `tools/generate-icon.mjs` sin dependencias externas.
- Scripts `pnpm run docs`, `pnpm run icon`, `pnpm run package` y `pnpm run publish`.

### Changed

- Identificador del publicador: `RichardBarolin.orange5-hpl-script`. El Marketplace
  exige que el campo `publisher` del manifiesto coincida con el publicador real
  al que pertenece el token de publicación.
- Cadena de herramientas actualizada a pnpm 12.15.0, TypeScript 7.0.2,
  esbuild 0.28.2 y `@vscode/vsce` 4.0.0.
- `client/` y `server/` se declaran como proyectos del workspace de pnpm, de
  modo que sus dependencias de LSP se instalan efectivamente.
- Requisito mínimo de VS Code elevado a 1.140.0. El motor de análisis no cambia
  de comportamiento.
- pnpm queda como único gestor de dependencias: se elimina `package-lock.json`
  y el campo `workspaces` de `package.json`.
- Las pruebas que dependían de rutas fijas se activan ahora por variables de
  entorno: `HPL_REFERENCE_PROGRAM` para el programa de referencia y
  `HPL_SOURCES` para el directorio de fuentes válidas.

### Fixed

- `allowBuilds` deja de contener marcadores de posición y autoriza
  explícitamente los scripts de `esbuild` y `@vscode/vsce-sign`, con lo que
  desaparece `ERR_PNPM_IGNORED_BUILDS`.
- Se declara el repositorio de publicación en el manifiesto, requisito de
  `vsce` 4 para resolver los enlaces del README.
- El paquete `.vsix` ya no incluye `pnpm-lock.yaml` ni `pnpm-workspace.yaml`.
- El `.vsix` ya no se empaqueta dentro de sí mismo: `dist/**` excluía el
  contenido de un directorio con ese nombre, pero no un archivo, que era lo que
  producía `--out dist/`.

### Removed

- Dependencias deprecadas `keytar`, `prebuild-install`, `whatwg-encoding` y
  `glob@11`, todas arrastradas por `@vscode/vsce` 3. El árbol pasa de 306 a 134
  paquetes y no conserva ninguna dependencia deprecada.
- Trazas de procedencia de la implementación de referencia: se retiran la
  columna «Origen» del catálogo de reglas, las anclas a líneas del código
  fuente, las rutas absolutas y los nombres propios de sus módulos, tanto en la
  documentación como en el código que se distribuye dentro de la extensión.
