#!/usr/bin/env python3
"""Oracle de veredictos de la implementacion de referencia.

Importa el programa de referencia en modo de solo lectura y evalua cada fuente
`.hpl` de un corpus, emitiendo el veredicto en JSON:

    [{"path": "...", "accepted": true|false, "error": null|"mensaje"}, ...]

El programa de referencia se usa exclusivamente como oraculo de pruebas. Este
script no modifica el corpus ni el directorio de la referencia.

Uso:

    python tools/oracle/reference_verdicts.py \
        --program "C:\\...\\referencia\\programa.py" \
        --corpus  "C:\\...\\corpus" \
        --output  "out\\verdicts.json"
"""
import argparse
import json
import os
import sys
import time


def find_entry(module, override=None):
    """Localiza la funcion de entrada del programa de referencia.

    Es la primera funcion publica cuyo nombre empieza por `compile`, sin
    distinguir mayusculas. `override` fuerza el nombre a utilizar.
    """
    if override:
        candidate = getattr(module, override, None)
        if not callable(candidate):
            raise RuntimeError('El modulo no expone ' + override)
        return override
    for name, value in vars(module).items():
        if name.startswith('_'):
            continue
        if callable(value) and name.lower().startswith('compile'):
            return name
    raise RuntimeError('El modulo no expone una funcion de entrada publica')


def find_error_type(module, override=None):
    """Localiza la clase de error del programa de referencia.

    Es la primera clase publica de excepcion cuyo nombre termina en `Error`.
    `override` fuerza el nombre a utilizar.
    """
    if override:
        candidate = getattr(module, override, None)
        if not isinstance(candidate, type) or not issubclass(candidate, BaseException):
            raise RuntimeError('El modulo no expone ' + override)
        return override
    for name, value in vars(module).items():
        if name.startswith('_'):
            continue
        if isinstance(value, type) and issubclass(value, BaseException):
            if name.endswith('Error'):
                return name
    raise RuntimeError('El modulo no expone una clase de error publica')


def load_program(program_path, entry_override=None, error_override=None):
    """Importa el programa de referencia como modulo aislado, sin tocar su directorio."""
    directory = os.path.dirname(os.path.abspath(program_path))
    name = os.path.splitext(os.path.basename(program_path))[0]
    if directory not in sys.path:
        sys.path.insert(0, directory)
    module = __import__(name)
    entry = find_entry(module, entry_override)
    error_type = find_error_type(module, error_override)
    return module, entry, error_type


def collect(corpus, limit, extensions):
    """Enumera los archivos del corpus en orden estable."""
    found = []
    for root, directories, files in os.walk(corpus):
        directories.sort()
        for name in sorted(files):
            if os.path.splitext(name)[1].lower() in extensions:
                found.append(os.path.join(root, name))
                if limit and len(found) >= limit:
                    return found
    return found


def evaluate(module, entry, error_type, path):
    """Evalua una fuente. Devuelve (aceptado, error, slots)."""
    try:
        with open(path, 'rb') as handle:
            raw = handle.read()
    except OSError as error:
        return False, 'unreadable: ' + str(error), 0
    # El programa de referencia lee los archivos como bytes Latin-1 reversibles.
    source = raw.decode('latin1')
    try:
        state = getattr(module, entry)(source)
    except getattr(module, error_type) as error:
        return False, str(error), 0
    except (ValueError, OverflowError, UnicodeError, RecursionError) as error:
        return False, type(error).__name__ + ': ' + str(error), 0
    slots = len(state.get('code', b'')) // 8 if isinstance(state, dict) else 0
    return True, None, slots


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--program', dest='program', required=True,
                        help='Ruta al programa de referencia')
    parser.add_argument('--corpus', required=True,
                        help='Raiz del corpus de fuentes .hpl')
    parser.add_argument('--output', required=True,
                        help='Archivo JSON de salida')
    parser.add_argument('--limit', type=int, default=0,
                        help='Maximo de archivos a evaluar (0 = sin limite)')
    parser.add_argument('--extensions', default='.hpl',
                        help='Extensiones separadas por coma')
    parser.add_argument('--entry', default=None,
                        help='Funcion de entrada (por defecto: la primera publica '
                             'que empieza por "compile")')
    parser.add_argument('--error', default=None,
                        help='Clase de error (por defecto: la primera publica de '
                             'excepcion que termina en "Error")')
    parser.add_argument('--quiet', action='store_true',
                        help='No imprime el resumen por archivo')
    args = parser.parse_args()

    module, entry, error_type = load_program(args.program, args.entry, args.error)
    extensions = tuple(
        item.strip().lower() for item in args.extensions.split(',') if item.strip()
    )
    files = collect(args.corpus, args.limit, extensions)

    results = []
    started = time.perf_counter()
    accepted = 0
    for index, path in enumerate(files, 1):
        ok, error, slots = evaluate(module, entry, error_type, path)
        if ok:
            accepted += 1
        results.append({'path': path, 'accepted': ok, 'error': error, 'slots': slots})
        if not args.quiet and index % 500 == 0:
            print('  {}/{} evaluados'.format(index, len(files)), file=sys.stderr)

    elapsed = time.perf_counter() - started
    payload = {
        'corpus': os.path.abspath(args.corpus),
        'program': os.path.abspath(args.program),
        'total': len(results),
        'accepted': accepted,
        'rejected': len(results) - accepted,
        'max_slots': max((item['slots'] for item in results), default=0),
        'seconds': round(elapsed, 3),
        'results': results,
    }

    directory = os.path.dirname(os.path.abspath(args.output))
    if directory:
        os.makedirs(directory, exist_ok=True)
    with open(args.output, 'w', encoding='utf-8') as handle:
        json.dump(payload, handle, indent=1)

    print('Oraculo: {}/{} aceptados, {}/{} rechazados en {:.1f}s'.format(
        accepted, len(results), len(results) - accepted, len(results), elapsed))
    print('Salida: ' + os.path.abspath(args.output))


if __name__ == '__main__':
    main()
