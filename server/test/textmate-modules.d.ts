/**
 * Declaraciones de los motores de TextMate usados en las pruebas.
 *
 * `vscode-textmate` y `vscode-oniguruma` se distribuyen sin tipos, igual que
 * hace VS Code, que los carga en tiempo de ejecucion.
 */
declare module 'vscode-textmate' {
  export interface IToken {
    startIndex: number;
    endIndex: number;
    scopes: string[];
  }

  export interface IGrammar {
    tokenizeLine(
      line: string,
      ruleStack: string | null,
    ): { tokens: IToken[]; ruleStack: string | null };
  }

  export interface RegistryOptions {
    onigLib: Promise<unknown>;
    loadGrammar(scopeName: string): Promise<unknown>;
  }

  export class Registry {
    constructor(options: RegistryOptions);
    loadGrammar(scopeName: string): Promise<IGrammar | null>;
  }

  export function parseRawGrammar(content: string, filePath?: string): unknown;

  export const INITIAL: string;
}

declare module 'vscode-oniguruma' {
  export function loadWASM(data: ArrayBuffer | Uint8Array): Promise<void>;
  export class OnigScanner {
    constructor(sources: string[]);
  }
  export class OnigString {
    constructor(str: string);
  }
}
