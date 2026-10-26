/**
 * AST del lenguaje HPL.
 *
 * Refleja las tres construcciones de la implementacion de referencia:
 * cabeceras (antes de la primera seccion), secciones y cuerpo de seccion
 * formado por sentencias y bloques.
 */

export interface HeaderDecl {
  kind: 'header';
  /** Clave en mayusculas, por ejemplo `PINO`. */
  key: string;
  /** Valor tal como lo recibe el analizador de cabeceras, ya compactado. */
  value: string;
  /** Texto completo de la declaracion, compactado. */
  text: string;
  line: number;
  column: number;
  offset: number;
  endOffset: number;
}

export interface SectionDecl {
  kind: 'section';
  /** Nombre de seccion; empieza por `_` cuando es una macro local. */
  name: string;
  /** Banderas: `!`=1, `#`=2, `~`=4. */
  flags: number;
  /** La seccion es una macro local. */
  local: boolean;
  line: number;
  column: number;
  offset: number;
  endOffset: number;
  body: StatementNode[];
}

export interface Statement {
  kind: 'statement';
  /** Texto de la sentencia, compactado. */
  text: string;
  line: number;
  column: number;
  offset: number;
  endOffset: number;
}

export interface Block {
  kind: 'block';
  /** Condicion de entrada, compactada. */
  condition: string;
  line: number;
  column: number;
  offset: number;
  endOffset: number;
  body: StatementNode[];
}

export type StatementNode = Statement | Block;

export interface ParsedUnit {
  headers: HeaderDecl[];
  sections: SectionDecl[];
}

/** Secciones del sistema de la implementacion de referencia. */
export const SYSTEM_SECTIONS = [
  '',
  'INIT',
  'READ',
  'WRITE',
  'WRITEINIT',
  'WRITEEND',
  'WRITEBLOCK',
  'READBLOCK',
  'END',
  'SETUP',
];

/** Asignacion de banderas de seccion. */
export const SECTION_FLAGS: Record<string, number> = {
  '!': 1,
  '#': 2,
  '~': 4,
};
