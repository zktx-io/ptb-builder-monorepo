import type { Edge as RFEdge, Node as RFNode } from '@xyflow/react';
import {
  isGraphDiagnostic,
  type TransactionDiagnostic,
} from '@zktx.io/ptb-model';

import type { PTBGraph } from '../ptb/graph/types';
import type { RFEdgeData, RFNodeData } from '../ptb/ptbAdapter';

export type EditorValidationState = {
  diagnostics: readonly TransactionDiagnostic[];
  byNodeId: ReadonlyMap<string, readonly TransactionDiagnostic[]>;
  byEdgeId: ReadonlyMap<string, readonly TransactionDiagnostic[]>;
  global: readonly TransactionDiagnostic[];
  totalCount: number;
  documentBlockingCount: number;
  executionBlockingCount: number;
};

export function emptyEditorValidationState(): EditorValidationState {
  const emptyDiagnostics = freezeList([]);
  return Object.freeze({
    diagnostics: emptyDiagnostics,
    byNodeId: new Map<string, readonly TransactionDiagnostic[]>(),
    byEdgeId: new Map<string, readonly TransactionDiagnostic[]>(),
    global: emptyDiagnostics,
    totalCount: 0,
    documentBlockingCount: 0,
    executionBlockingCount: 0,
  });
}

function freezeList<T>(values: readonly T[]): readonly T[] {
  return Object.freeze([...values]);
}

function freezeDiagnosticMap(
  values: Map<string, TransactionDiagnostic[]>,
): ReadonlyMap<string, readonly TransactionDiagnostic[]> {
  const frozen = new Map<string, readonly TransactionDiagnostic[]>();
  for (const [key, diagnostics] of values) {
    frozen.set(key, freezeList(diagnostics));
  }
  return frozen;
}

function pushDiagnostic(
  map: Map<string, TransactionDiagnostic[]>,
  key: string,
  diagnostic: TransactionDiagnostic,
): void {
  const current = map.get(key);
  if (current) current.push(diagnostic);
  else map.set(key, [diagnostic]);
}

function nodeIdForDiagnosticPath(
  graph: PTBGraph,
  path: string | undefined,
): string | undefined {
  if (!path) return undefined;
  const match = /^\$\.nodes\[(\d+)\](?:\.|$)/.exec(path);
  if (!match) return undefined;
  const index = Number(match[1]);
  return Number.isSafeInteger(index) ? graph.nodes[index]?.id : undefined;
}

function edgeIdForDiagnosticPath(
  graph: PTBGraph,
  path: string | undefined,
): string | undefined {
  if (!path) return undefined;
  const match = /^\$\.edges\[(\d+)\](?:\.|$)/.exec(path);
  if (!match) return undefined;
  const index = Number(match[1]);
  return Number.isSafeInteger(index) ? graph.edges[index]?.id : undefined;
}

export function buildEditorValidationState(
  graph: PTBGraph,
  diagnostics: readonly TransactionDiagnostic[],
): EditorValidationState {
  if (diagnostics.length === 0) return emptyEditorValidationState();

  const byNodeId = new Map<string, TransactionDiagnostic[]>();
  const byEdgeId = new Map<string, TransactionDiagnostic[]>();
  const global: TransactionDiagnostic[] = [];
  let documentBlockingCount = 0;
  let executionBlockingCount = 0;

  for (const diagnostic of diagnostics) {
    if (isGraphDiagnostic(diagnostic)) {
      if (diagnostic.blocks.document) documentBlockingCount += 1;
      if (diagnostic.blocks.execution) executionBlockingCount += 1;
    }

    const nodeId = nodeIdForDiagnosticPath(graph, diagnostic.path);
    if (nodeId) {
      pushDiagnostic(byNodeId, nodeId, diagnostic);
      continue;
    }

    const edgeId = edgeIdForDiagnosticPath(graph, diagnostic.path);
    if (edgeId) {
      pushDiagnostic(byEdgeId, edgeId, diagnostic);
      continue;
    }

    global.push(diagnostic);
  }

  return Object.freeze({
    diagnostics: freezeList(diagnostics),
    byNodeId: freezeDiagnosticMap(byNodeId),
    byEdgeId: freezeDiagnosticMap(byEdgeId),
    global: freezeList(global),
    totalCount: diagnostics.length,
    documentBlockingCount,
    executionBlockingCount,
  });
}

export function applyEditorValidationToNodes(
  nodes: readonly RFNode<RFNodeData>[],
  validation: EditorValidationState,
): RFNode<RFNodeData>[] {
  return nodes.map((node) => {
    const diagnostics = validation.byNodeId.get(node.id) ?? [];
    if (
      diagnostics.length === 0 &&
      (node.data?.editorDiagnostics?.length ?? 0) === 0
    ) {
      return node;
    }
    return {
      ...node,
      data: {
        ...node.data,
        editorDiagnostics: diagnostics,
      },
    };
  });
}

export function applyEditorValidationToEdges(
  edges: readonly RFEdge<RFEdgeData>[],
  validation: EditorValidationState,
): RFEdge<RFEdgeData>[] {
  return edges.map((edge) => {
    const diagnostics = validation.byEdgeId.get(edge.id) ?? [];
    if (
      diagnostics.length === 0 &&
      (edge.data?.editorDiagnostics?.length ?? 0) === 0
    ) {
      return edge;
    }
    return {
      ...edge,
      data: {
        ...edge.data,
        editorDiagnostics: diagnostics,
      },
    };
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
