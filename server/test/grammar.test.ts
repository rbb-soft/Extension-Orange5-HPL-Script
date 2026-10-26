/**
 * Pruebas de la gramatica TextMate.
 *
 * La gramatica se evalua con los mismos motores que usa VS Code
 * (`vscode-textmate` + `vscode-oniguruma`), de modo que los scopes comprobados
 * son los que el editor aplicara realmente.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import * as oniguruma from 'vscode-oniguruma';
import * as textmate from 'vscode-textmate';

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const GRAMMAR_PATH = path.join(PROJECT_ROOT, 'client', 'syntaxes', 'hpl.tmLanguage.json');
const ONIG_WASM = path.join(
  PROJECT_ROOT,
  'node_modules',
  'vscode-oniguruma',
  'release',
  'onig.wasm',
);

interface ScopedToken {
  text: string;
  scopes: string[];
}

let grammarPromise: Promise<textmate.IGrammar> | undefined;

function loadGrammar(): Promise<textmate.IGrammar> {
  if (!grammarPromise) {
    grammarPromise = (async () => {
      const wasm = readFileSync(ONIG_WASM);
      await oniguruma.loadWASM(
        wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength),
      );
      const onigLib = Promise.resolve({
        createOnigScanner: (sources: string[]) => new oniguruma.OnigScanner(sources),
        createOnigString: (value: string) => new oniguruma.OnigString(value),
      });
      const registry = new textmate.Registry({
        onigLib,
        loadGrammar: (scopeName: string) => {
          if (scopeName !== 'source.hpl') {
            return Promise.resolve(null);
          }
          const raw = readFileSync(GRAMMAR_PATH, 'utf8');
          return Promise.resolve(textmate.parseRawGrammar(raw, GRAMMAR_PATH));
        },
      });
      const grammar = await registry.loadGrammar('source.hpl');
      if (!grammar) {
        throw new Error('No se pudo cargar la gramatica source.hpl');
      }
      return grammar;
    })();
  }
  return grammarPromise;
}

async function tokensOf(line: string): Promise<ScopedToken[]> {
  const grammar = await loadGrammar();
  return grammar
    .tokenizeLine(line, null)
    .tokens.map((token) => ({
      text: line.substring(token.startIndex, token.endIndex),
      scopes: token.scopes,
    }));
}

/**
 * Devuelve los scopes del token que contiene el fragmento buscado.
 *
 * El limite exacto del token depende del motor TextMate: el nombre de seccion
 * puede aparecer con o sin las comillas que lo encierran.
 */
async function scopesFor(line: string, needle: string): Promise<string[]> {
  const tokens = await tokensOf(line);
  const token = tokens.find((item) => item.text.includes(needle));
  assert.ok(
    token,
    'no se encontro el fragmento "' + needle + '" en "' + line + '"',
  );
  return token.scopes;
}

describe('gramatica TextMate de HPL', () => {
  test('reconoce una cabecera de seccion', async () => {
    const scopes = await scopesFor('["Main"]', 'Main');
    assert.ok(scopes.some((scope) => scope.includes('entity.name.section.hpl')));
    const open = await scopesFor('["Main"]', '[');
    assert.ok(
      open.some((scope) => scope.includes('punctuation.section.bracket.begin.hpl')),
    );
  });

  test('reconoce las banderas de seccion', async () => {
    const scopes = await scopesFor('[!#SETUP]', '!#');
    assert.ok(scopes.some((scope) => scope.includes('keyword.other.flags.hpl')));
  });

  test('reconoce un comentario con punto y coma', async () => {
    const scopes = await scopesFor('R0=1 ; comentario', '; comentario');
    assert.ok(scopes.some((scope) => scope.includes('comment.line.semicolon.hpl')));
  });

  test('reconoce un comentario de linea completa', async () => {
    const scopes = await scopesFor('// comentario', '// comentario');
    assert.ok(
      scopes.some((scope) => scope.includes('comment.line.double-slash.hpl')),
    );
  });

  test('una doble barra a mitad de linea no es un comentario', async () => {
    const tokens = await tokensOf('R0=1 // texto');
    assert.ok(
      !tokens.some((item) => item.scopes.some((scope) => scope.includes('comment.line'))),
      'la doble barra a mitad de linea no abre comentario',
    );
    const slashes = tokens.filter((item) => item.text === '/');
    assert.equal(slashes.length, 2, 'las dos barras deben tokenizarse aparte');
    assert.ok(
      slashes.every((item) =>
        item.scopes.some((scope) => scope.includes('keyword.operator.hpl')),
      ),
      'la doble barra a mitad de linea se resalta como operador',
    );
  });

  test('un punto y coma dentro de una cadena no abre comentario', async () => {
    const tokens = await tokensOf('PRINT=("a;b")');
    const semicolon = tokens.find((item) => item.text.includes(';'));
    assert.ok(semicolon, 'deberia existir un token con el punto y coma');
    assert.ok(
      !semicolon.scopes.some((scope) => scope.includes('comment.line')),
      'el punto y coma dentro de la cadena no abre comentario',
    );
    assert.ok(
      semicolon.scopes.some((scope) => scope.includes('string.quoted.double.hpl')),
    );
  });

  test('reconoce un registro', async () => {
    const scopes = await scopesFor('R0=1', 'R0');
    assert.ok(scopes.some((scope) => scope.includes('variable.other.register.hpl')));
  });

  test('reconoce un literal hexadecimal', async () => {
    const scopes = await scopesFor('R0=&FF00H', 'FF00H');
    assert.ok(scopes.some((scope) => scope.includes('constant.numeric.hex.hpl')));
  });

  test('el operador AND no se confunde con un literal', async () => {
    const scopes = await scopesFor('R0=&FF00H', '&');
    assert.ok(scopes.some((scope) => scope.includes('keyword.operator.hpl')));
  });

  test('reconoce un literal binario y decimal', async () => {
    const binary = await scopesFor('R0=1010b', '1010b');
    assert.ok(binary.some((scope) => scope.includes('constant.numeric.binary.hpl')));
    const decimal = await scopesFor('R0=42', '42');
    assert.ok(decimal.some((scope) => scope.includes('constant.numeric.decimal.hpl')));
  });

  test('reconoce una clave de cabecera', async () => {
    const scopes = await scopesFor('PINO=SCK,0', 'PINO');
    assert.ok(scopes.some((scope) => scope.includes('entity.name.tag.hpl')));
  });

  test('reconoce un operando integrado', async () => {
    const scopes = await scopesFor('R0=DATA', 'DATA');
    assert.ok(scopes.some((scope) => scope.includes('support.constant.hpl')));
    const builtin = await scopesFor('R0=$SIZE', '$SIZE');
    assert.ok(builtin.some((scope) => scope.includes('support.constant.builtin.hpl')));
  });

  test('reconoce un array y una macro', async () => {
    const array = await scopesFor('@buf=4', '@buf');
    assert.ok(array.some((scope) => scope.includes('variable.other.array.hpl')));
    const macro = await scopesFor('_MAC', '_MAC');
    assert.ok(macro.some((scope) => scope.includes('entity.name.function.hpl')));
  });

  test('reconoce un comando', async () => {
    const scopes = await scopesFor('PRINT=("x")', 'PRINT');
    assert.ok(scopes.some((scope) => scope.includes('keyword.control.hpl')));
  });
});
