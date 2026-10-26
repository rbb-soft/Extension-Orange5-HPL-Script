/**
 * Tablas de simbolos de HPL.
 *
 * Reproduce el estado que la implementacion de referencia mantiene:
 * alias de pines y buses, arrays de bytes, macros y registros declarados.
 */

export interface SymbolTables {
  /** Alias de pines de salida (`PINO`), alias -> numero de pin. */
  pins: Map<string, number>;
  /** Alias de pines de entrada (`PINI`), alias -> numero de pin. */
  inputs: Map<string, number>;
  /** Alias de buses de salida (`BUSO`), alias -> numero de bus. */
  buses: Map<string, number>;
  /** Alias de buses de entrada (`BUSI`), alias -> numero de bus. */
  busInputs: Map<string, number>;
  /** Arrays de bytes, nombre -> tamano en bytes. */
  arrays: Map<string, number>;
  /** Macros (secciones locales), nombre -> linea de declaracion. */
  macros: Map<string, number>;
  /** Registros declarados, numero -> nombre. */
  registerNames: Map<number, string>;
  /** Secciones de usuario visibles, nombre -> linea. */
  sections: Map<string, number>;
}

export function createTables(): SymbolTables {
  return {
    pins: new Map(),
    inputs: new Map(),
    buses: new Map(),
    busInputs: new Map(),
    arrays: new Map(),
    macros: new Map(),
    registerNames: new Map(),
    sections: new Map(),
  };
}

/**
 * Indica si un alias esta declarado como pin o bus.
 */
export function isDeclaredAlias(tables: SymbolTables, alias: string): boolean {
  return (
    tables.pins.has(alias) ||
    tables.inputs.has(alias) ||
    tables.buses.has(alias) ||
    tables.busInputs.has(alias)
  );
}
