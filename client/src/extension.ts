/**
 * Cliente LSP de la extension Orange5 HPL Script.
 *
 * Arranca el servidor de analisis como proceso hijo y conecta con el mediante
 * transporte IPC. La extension no realiza analisis por su cuenta.
 */
import * as path from 'node:path';
import { LanguageClient, TransportKind } from 'vscode-languageclient/node';
import type { ExtensionContext } from 'vscode';

let client: LanguageClient | undefined;

export async function activate(context: ExtensionContext): Promise<void> {
  const serverModule = context.asAbsolutePath(
    path.join('server', 'out', 'server.js'),
  );

  const serverOptions = {
    run: {
      module: serverModule,
      transport: TransportKind.ipc,
    },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: {
        execArgv: ['--nolazy', '--inspect=6011'],
      },
    },
  };

  const clientOptions = {
    documentSelector: [{ scheme: 'file', language: 'hpl' }],
    synchronize: {
      configurationSection: 'hpl',
    },
  };

  client = new LanguageClient(
    'hplLanguageServer',
    'HPL Language Server',
    serverOptions,
    clientOptions,
  );

  await client.start();
}

export async function deactivate(): Promise<void> {
  await client?.stop();
  client = undefined;
}
