import type { GraphDiagnosticCode } from '../diagnostics/metadata.js';
import { GRAPH_DIAGNOSTIC_META } from '../diagnostics/metadata.js';
import type { GraphDiagnostic } from '../ir/diagnostics.js';
import { createDiagnostic } from '../ir/diagnostics.js';

export { GRAPH_DIAGNOSTIC_META };
export type { GraphDiagnosticCode };

export function graphDiagnostic(
  code: GraphDiagnosticCode,
  message: string,
  path?: string,
): GraphDiagnostic {
  const { category, blocks } = GRAPH_DIAGNOSTIC_META[code];
  return Object.freeze({
    ...createDiagnostic(code, category, message, path),
    blocks,
  });
}

export function blocksDocument(diagnostic: GraphDiagnostic): boolean {
  return diagnostic.blocks.document;
}

export function blocksExecution(diagnostic: GraphDiagnostic): boolean {
  return diagnostic.blocks.execution;
}
