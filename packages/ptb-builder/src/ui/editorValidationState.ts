import {
  isGraphDiagnostic,
  type TransactionDiagnostic,
} from '@zktx.io/ptb-model';

export type EditorValidationState = {
  noticeKey: string;
  totalCount: number;
  documentBlockingCount: number;
  executionBlockingCount: number;
};

export function emptyEditorValidationState(): EditorValidationState {
  return Object.freeze({
    noticeKey: '',
    totalCount: 0,
    documentBlockingCount: 0,
    executionBlockingCount: 0,
  });
}

export function buildEditorValidationState(
  diagnostics: readonly TransactionDiagnostic[],
): EditorValidationState {
  if (diagnostics.length === 0) return emptyEditorValidationState();

  let documentBlockingCount = 0;
  let executionBlockingCount = 0;

  for (const diagnostic of diagnostics) {
    if (isGraphDiagnostic(diagnostic)) {
      if (diagnostic.blocks.document) documentBlockingCount += 1;
      if (diagnostic.blocks.execution) executionBlockingCount += 1;
    }
  }

  return Object.freeze({
    noticeKey: diagnostics
      .map(
        (diagnostic) =>
          `${diagnostic.code}\u0000${diagnostic.category}\u0000${diagnostic.path ?? ''}\u0000${diagnostic.message}`,
      )
      .join('\u0001'),
    totalCount: diagnostics.length,
    documentBlockingCount,
    executionBlockingCount,
  });
}

export function editorValidationSummary(
  validation: EditorValidationState,
): string | undefined {
  if (validation.totalCount === 0) return undefined;
  const total =
    validation.totalCount === 1
      ? '1 graph diagnostic'
      : `${validation.totalCount} graph diagnostics`;
  const blockers: string[] = [];
  if (validation.documentBlockingCount > 0) {
    blockers.push(`${validation.documentBlockingCount} document`);
  }
  if (validation.executionBlockingCount > 0) {
    blockers.push(`${validation.executionBlockingCount} execution`);
  }
  return blockers.length > 0
    ? `${total}; blockers: ${blockers.join(', ')}.`
    : total;
}
