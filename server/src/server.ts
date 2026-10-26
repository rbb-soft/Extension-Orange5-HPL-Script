/**
 * Servidor LSP del linter HPL.
 *
 * Publica los diagnosticos del analizador mediante el modelo push. El analisis
 * se ejecuta sobre el documento completo con un retardo de 200 ms para no
 * recalcular en cada pulsacion.
 *
 * El servidor no genera HPX, no invoca la implementacion de referencia y no
 * accede a ningun recurso externo.
 */
import {
  createConnection,
  Diagnostic,
  DiagnosticSeverity,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { analyze, applySeverityOverrides, HplDiagnostic } from './analyzer';

const DEBOUNCE_MS = 200;

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

interface HplConfiguration {
  diagnostics?: {
    enable?: boolean;
    severityOverrides?: Record<string, string>;
  };
}

let enabled = true;
let severityOverrides: Record<string, string> | undefined;
const timers = new Map<string, NodeJS.Timeout>();

connection.onInitialize(() => ({
  capabilities: {
    textDocumentSync: TextDocumentSyncKind.Incremental,
  },
}));

connection.onInitialized(() => {
  void refreshConfiguration();
});

connection.onDidChangeConfiguration(() => {
  void refreshConfiguration();
});

async function refreshConfiguration(): Promise<void> {
  try {
    const configuration = (await connection.workspace.getConfiguration({
      section: 'hpl',
    })) as HplConfiguration | undefined;
    enabled = configuration?.diagnostics?.enable !== false;
    severityOverrides = configuration?.diagnostics?.severityOverrides;
  } catch {
    // Se conservan los valores por defecto si la configuracion no esta disponible.
  }
}

function toLspDiagnostic(diagnostic: HplDiagnostic): Diagnostic {
  return {
    range: diagnostic.range,
    severity:
      diagnostic.severity === 'error'
        ? DiagnosticSeverity.Error
        : diagnostic.severity === 'warning'
          ? DiagnosticSeverity.Warning
          : DiagnosticSeverity.Information,
    code: diagnostic.code,
    source: 'hpl',
    message: diagnostic.message,
  };
}

/**
 * Diagnosticos ya publicados por documento.
 *
 * Se usan para no reenviar un conjunto identico: la apertura de un documento
 * genera tanto `didOpen` como `didChangeContent`, y una pulsacion sin cambios
 * no debe producir trafico innecesario.
 */
const published = new Map<string, string>();

function publish(document: TextDocument): void {
  try {
    const diagnostics = enabled
      ? applySeverityOverrides(analyze(document.getText()), severityOverrides)
      : [];
    const serialized = JSON.stringify(diagnostics);
    if (published.get(document.uri) === serialized) {
      return;
    }
    published.set(document.uri, serialized);
    connection.sendDiagnostics({
      uri: document.uri,
      diagnostics: diagnostics.map(toLspDiagnostic),
    });
  } catch (error) {
    connection.sendDiagnostics({
      uri: document.uri,
      diagnostics: [
        {
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 1 },
          },
          severity: DiagnosticSeverity.Error,
          code: 'hpl.internalError',
          source: 'hpl',
          message:
            'Internal analyser error: ' +
            (error instanceof Error ? error.message : String(error)),
        },
      ],
    });
  }
}

documents.onDidOpen((event) => {
  publish(event.document);
});

documents.onDidChangeContent((change) => {
  const uri = change.document.uri;
  const pending = timers.get(uri);
  if (pending) {
    clearTimeout(pending);
  }
  timers.set(
    uri,
    setTimeout(() => {
      timers.delete(uri);
      publish(change.document);
    }, DEBOUNCE_MS),
  );
});

documents.onDidClose((event) => {
  const pending = timers.get(event.document.uri);
  if (pending) {
    clearTimeout(pending);
    timers.delete(event.document.uri);
  }
  published.delete(event.document.uri);
});

connection.onShutdown(() => {
  for (const pending of timers.values()) {
    clearTimeout(pending);
  }
  timers.clear();
});

documents.listen(connection);
connection.listen();
