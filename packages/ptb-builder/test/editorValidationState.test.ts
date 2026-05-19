import type { GraphDiagnostic } from '@zktx.io/ptb-model';
import { describe, expect, it } from 'vitest';

import {
  buildEditorValidationState,
  editorValidationSummary,
  emptyEditorValidationState,
} from '../src/ui/editorValidationState';

function graphDiagnostic(
  code: GraphDiagnostic['code'],
  path: string,
  blocks: GraphDiagnostic['blocks'],
): GraphDiagnostic {
  return {
    code,
    category: blocks.document ? 'reference' : 'semantic',
    message: `${code} at ${path}`,
    path,
    blocks,
  };
}

describe('editor validation state', () => {
  it('summarizes graph diagnostics for the status surface', () => {
    const validation = buildEditorValidationState([
      graphDiagnostic('graph.node.duplicate', '$.nodes[1].id', {
        document: true,
        execution: true,
      }),
      graphDiagnostic(
        'graph.command.inputPort.invalid',
        '$.nodes[2].ports[0]',
        {
          document: false,
          execution: true,
        },
      ),
      graphDiagnostic('graph.edge.duplicate', '$.edges[0].id', {
        document: true,
        execution: true,
      }),
      graphDiagnostic('graph.flow.disconnected', '$.graph', {
        document: false,
        execution: true,
      }),
    ]);

    expect(validation.totalCount).toBe(4);
    expect(validation.noticeKey).toContain('graph.node.duplicate');
    expect(validation.noticeKey).toContain('reference');
    expect(validation.documentBlockingCount).toBe(2);
    expect(validation.executionBlockingCount).toBe(4);
    expect(editorValidationSummary(validation)).toBe(
      '4 graph diagnostics; blockers: 2 document, 4 execution.',
    );
  });

  it('returns an empty state for empty diagnostics', () => {
    const validation = emptyEditorValidationState();

    expect(validation.totalCount).toBe(0);
    expect(validation.noticeKey).toBe('');
    expect(editorValidationSummary(validation)).toBeUndefined();
  });
});
