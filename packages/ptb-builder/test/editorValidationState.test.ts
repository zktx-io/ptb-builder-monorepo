import type { Edge as RFEdge, Node as RFNode } from '@xyflow/react';
import type { GraphDiagnostic } from '@zktx.io/ptb-model';
import { describe, expect, it } from 'vitest';

import type { PTBGraph } from '../src/ptb/graph/types';
import type { RFEdgeData, RFNodeData } from '../src/ptb/ptbAdapter';
import {
  applyEditorValidationToEdges,
  applyEditorValidationToNodes,
  buildEditorValidationState,
  editorValidationSummary,
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

function graphWithIds(nodeIds: readonly string[], edgeIds: readonly string[]) {
  return {
    nodes: nodeIds.map((id, index) => ({
      id,
      kind: index === 0 ? 'Start' : 'Command',
      command: 'unsupported',
      label: id,
      ports: [],
    })),
    edges: edgeIds.map((id) => ({
      id,
      kind: 'flow',
      source: nodeIds[0] ?? 'start',
      sourceHandle: 'out',
      target: nodeIds[1] ?? 'cmd',
      targetHandle: 'in',
    })),
  } as PTBGraph;
}

describe('editor validation state', () => {
  it('routes diagnostics by current graph node and edge indexes', () => {
    const graph = graphWithIds(['start', 'cmd-a', 'cmd-b'], ['edge-a']);
    const diagnostics = [
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
    ];

    const validation = buildEditorValidationState(graph, diagnostics);

    expect(validation.byNodeId.get('cmd-a')?.map((d) => d.code)).toEqual([
      'graph.node.duplicate',
    ]);
    expect(validation.byNodeId.get('cmd-b')?.map((d) => d.code)).toEqual([
      'graph.command.inputPort.invalid',
    ]);
    expect(validation.byEdgeId.get('edge-a')?.map((d) => d.code)).toEqual([
      'graph.edge.duplicate',
    ]);
    expect(validation.global.map((d) => d.code)).toEqual([
      'graph.flow.disconnected',
    ]);
    expect(validation.documentBlockingCount).toBe(2);
    expect(validation.executionBlockingCount).toBe(4);
    expect(editorValidationSummary(validation)).toBe(
      '4 graph diagnostics; blockers: 2 document, 4 execution.',
    );
  });

  it('uses the graph snapshot supplied with the diagnostics', () => {
    const diagnostics = [
      graphDiagnostic('graph.node.duplicate', '$.nodes[1].id', {
        document: true,
        execution: true,
      }),
    ];

    const first = buildEditorValidationState(
      graphWithIds(['start', 'cmd-a'], []),
      diagnostics,
    );
    const second = buildEditorValidationState(
      graphWithIds(['start', 'cmd-b'], []),
      diagnostics,
    );

    expect(first.byNodeId.has('cmd-a')).toBe(true);
    expect(first.byNodeId.has('cmd-b')).toBe(false);
    expect(second.byNodeId.has('cmd-a')).toBe(false);
    expect(second.byNodeId.has('cmd-b')).toBe(true);
  });

  it('projects diagnostics into render-only React Flow data', () => {
    const graph = graphWithIds(['start', 'cmd-a'], ['edge-a']);
    const validation = buildEditorValidationState(graph, [
      graphDiagnostic('graph.node.duplicate', '$.nodes[1].id', {
        document: true,
        execution: true,
      }),
      graphDiagnostic('graph.edge.duplicate', '$.edges[0].id', {
        document: true,
        execution: true,
      }),
    ]);
    const nodes: RFNode<RFNodeData>[] = [
      { id: 'start', position: { x: 0, y: 0 }, data: {} },
      { id: 'cmd-a', position: { x: 0, y: 0 }, data: {} },
    ];
    const edges: RFEdge<RFEdgeData>[] = [
      { id: 'edge-a', source: 'start', target: 'cmd-a', data: {} },
    ];

    const displayedNodes = applyEditorValidationToNodes(nodes, validation);
    const displayedEdges = applyEditorValidationToEdges(edges, validation);

    expect(displayedNodes[0]).toBe(nodes[0]);
    expect(displayedNodes[1]).not.toBe(nodes[1]);
    expect(displayedNodes[1]?.data.editorDiagnostics?.[0]?.code).toBe(
      'graph.node.duplicate',
    );
    expect(displayedEdges[0]).not.toBe(edges[0]);
    expect(displayedEdges[0]?.data?.editorDiagnostics?.[0]?.code).toBe(
      'graph.edge.duplicate',
    );
  });

  it('returns an empty state for empty diagnostics', () => {
    const validation = buildEditorValidationState(
      graphWithIds(['start'], []),
      [],
    );

    expect(validation.totalCount).toBe(0);
    expect(validation.byNodeId.size).toBe(0);
    expect(validation.byEdgeId.size).toBe(0);
    expect(validation.global).toEqual([]);
    expect(editorValidationSummary(validation)).toBeUndefined();
  });
});
