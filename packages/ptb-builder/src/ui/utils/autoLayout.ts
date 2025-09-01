// ui/utils/autoLayout.ts
// -----------------------------------------------------------------------------
// Auto layout for React Flow nodes using ELK layered layout.
// - Input/Output: RF nodes/edges (we don't touch handles; only positions).
// -----------------------------------------------------------------------------

import type { Edge as RFEdge, Node as RFNode } from '@xyflow/react';
import ELK, { ElkNode } from 'elkjs/lib/elk.bundled.js';

import { getNodeSize } from './nodeSizes';
import type { RFEdgeData, RFNodeData } from '../../ptb/ptbAdapter';

const elk = new ELK();

const layoutOptions = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.layered.spacing.edgeNodeBetweenLayers': '40',
  'elk.layered.spacing.nodeNodeBetweenLayers': '40',
  'elk.spacing.nodeNode': '40',
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  'elk.layered.nodePlacement.strategy': 'SIMPLE',
  'elk.layered.cycleBreaking.strategy': 'DEPTH_FIRST',
} as const;

export async function autoLayoutFlow(
  nodes: RFNode<RFNodeData>[],
  edges: RFEdge<RFEdgeData>[],
): Promise<{ nodes: RFNode<RFNodeData>[]; edges: RFEdge<RFEdgeData>[] }> {
  // Build ELK graph with rough sizes from measured dims (fallbacks are fine)
  const elkGraph: ElkNode = {
    id: 'root',
    layoutOptions,
    children: nodes.map((n) => {
      const kind = (n.data as any)?.ptbNode?.kind;
      const { width, height } = getNodeSize(kind);
      return {
        id: n.id,
        width,
        height: height ?? n.measured?.height ?? 120,
        properties: { 'org.eclipse.elk.portConstraints': 'FIXED_ORDER' },
      };
    }),
    edges: edges.map((e) => ({
      id: e.id,
      sources: [e.source],
      targets: [e.target],
    })),
  };

  const laidOut = await elk.layout(elkGraph);

  // Map positions back onto RF nodes
  const placedNodes = nodes.map((n) => {
    const lgNode = laidOut.children?.find((c) => c.id === n.id);
    return {
      ...n,
      position: {
        x: lgNode?.x ?? n.position.x ?? 0,
        y: lgNode?.y ?? n.position.y ?? 0,
      },
      // Important: React Flow treats these as absolute positions
      positionAbsolute: undefined,
      dragging: false,
      selected: n.selected, // preserve selection
    };
  });

  return { nodes: placedNodes, edges };
}
