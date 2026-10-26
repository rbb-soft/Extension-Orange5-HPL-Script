/**
 * Prueba de integracion del servidor LSP.
 *
 * Arranca el servidor empaquetado tal como lo hara el extension host,
 * habla el protocolo LSP sobre tuberia de entrada y salida y comprueba que
 * publica los diagnosticos esperados.
 *
 * Esta prueba verifica el cableado real: el mismo binario que viaja dentro
 * del `.vsix`.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process';
import * as path from 'node:path';

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const SERVER = path.join(PROJECT_ROOT, 'server', 'out', 'server.js');

interface PendingMessage {
  resolve: (message: Record<string, unknown>) => void;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

describe('servidor LSP', () => {
  let child: ChildProcessWithoutNullStreams | undefined;
  let buffer = Buffer.alloc(0);
  let nextId = 1;
  const pending = new Map<number, PendingMessage>();
  const notifications: Record<string, unknown>[] = [];

  before(() => {
    child = spawn(process.execPath, [SERVER, '--stdio'], {
      cwd: PROJECT_ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    child.stdout.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      for (;;) {
        const headerEnd = buffer.indexOf('\r\n\r\n');
        if (headerEnd < 0) {
          return;
        }
        const header = buffer.slice(0, headerEnd).toString('ascii');
        const match = /Content-Length: (\d+)/i.exec(header);
        if (!match) {
          return;
        }
        const length = Number.parseInt(match[1], 10);
        const start = headerEnd + 4;
        if (buffer.length < start + length) {
          return;
        }
        const body = buffer.slice(start, start + length).toString('utf8');
        buffer = buffer.slice(start + length);
        let message: Record<string, unknown>;
        try {
          message = JSON.parse(body) as Record<string, unknown>;
        } catch (error) {
          throw new Error('Respuesta LSP invalida: ' + describeError(error));
        }
        if (typeof message.id === 'number') {
          pending.get(message.id)?.resolve(message);
          pending.delete(message.id);
        } else if (typeof message.method === 'string') {
          notifications.push(message);
        }
      }
    });
  });

  after(() => {
    child?.kill();
  });

  function send(message: Record<string, unknown>): void {
    const body = JSON.stringify(message);
    child?.stdin.write(
      'Content-Length: ' + Buffer.byteLength(body, 'utf8') + '\r\n\r\n' + body,
    );
  }

  function request(method: string, params: unknown): Promise<Record<string, unknown>> {
    const id = nextId++;
    return new Promise((resolve) => {
      pending.set(id, { resolve });
      send({ jsonrpc: '2.0', id, method, params });
    });
  }

  function notify(method: string, params: unknown): void {
    send({ jsonrpc: '2.0', method, params });
  }

  async function waitForDiagnostics(
    uri: string,
    timeoutMs = 10000,
  ): Promise<{ diagnostics: { code?: string; severity?: number; message: string }[] }> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const found = notifications.find(
        (message) =>
          message.method === 'textDocument/publishDiagnostics' &&
          (message.params as { uri?: string } | undefined)?.uri === uri,
      );
      if (found) {
        return found.params as { diagnostics: { code?: string; severity?: number; message: string }[] };
      }
      if (Date.now() > deadline) {
        throw new Error('No se recibieron diagnosticos para ' + uri);
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  test('responde a initialize y publica diagnosticos', async () => {
    const response = await request('initialize', {
      processId: process.pid,
      rootUri: null,
      capabilities: {},
    });
    const capabilities = response.result as { capabilities: { textDocumentSync?: unknown } };
    assert.ok(capabilities.capabilities, 'initialize debe declarar capacidades');

    notify('initialized', {});
    notify('textDocument/didOpen', {
      textDocument: {
        uri: 'file:///tmp/prueba.hpl',
        languageId: 'hpl',
        version: 1,
        text: '["Main"]\nINEXISTENTE=1\n',
      },
    });

    const published = await waitForDiagnostics('file:///tmp/prueba.hpl');
    assert.ok(published.diagnostics.length > 0, 'deberia publicar diagnosticos');
    const first = published.diagnostics[0];
    assert.equal(first.code, 'hpl.operand.unknownAssignment');
    assert.equal(first.severity, 1, 'la severidad debe ser error');
  });

  test('un archivo valido no produce diagnosticos', async () => {
    const uri = 'file:///tmp/valido.hpl';
    notify('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId: 'hpl',
        version: 1,
        text: 'PINO=SCK,0\nPINI=SO,1\n["Main"]\nSCK=0\n',
      },
    });
    const published = await waitForDiagnostics(uri);
    assert.deepEqual(published.diagnostics, []);
  });
});
