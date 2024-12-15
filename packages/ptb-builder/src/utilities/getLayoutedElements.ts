import { Edge, Node } from '@xyflow/react';
import ELK, { ElkNode } from 'elkjs/lib/elk.bundled.js';

const elk = new ELK();

const layoutOptions = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.layered.spacing.edgeNodeBetweenLayers': '40',
  'elk.spacing.nodeNode': '40',
  // 'elk.layered.crossingMinimization.strategy': 'INTERACTIVE',
  'elk.layered.nodePlacement.strategy': 'SIMPLE',
};

export const getLayoutedElements = async (nodes: Node[], edges: Edge[]) => {
  const getTargetHandles = (n: Node) =>
    edges.filter((e) => e.target === n.id).map((e) => ({ id: e.target }));
  const getSourceHandles = (n: Node) =>
    edges.filter((e) => e.source === n.id).map((e) => ({ id: e.source }));
  const graph: ElkNode = {
    id: 'root',
    layoutOptions,
    children: nodes.map((n) => {
      const targetPorts = getTargetHandles(n).map((t) => ({
        id: t.id,
        properties: {
          side: 'WEST',
        },
      }));
      const sourcePorts = getSourceHandles(n).map((s) => ({
        id: s.id,
        properties: {
          side: 'EAST',
        },
      }));
      return {
        id: n.id,
        width: n.measured ? n.measured.width : 200,
        height: n.measured ? n.measured.height : 100,
        properties: {
          'org.eclipse.elk.portConstraints': 'FIXED_ORDER',
        },
        ports: [{ id: n.id }, ...targetPorts, ...sourcePorts],
      };
    }),
    edges: edges.map((e) => ({
      id: e.id,
      sources: [e.source],
      targets: [e.target],
    })),
  };

  const layoutedGraph = await elk.layout(graph);

  const layoutedNodes = nodes.map((node) => {
    const layoutedNode = layoutedGraph.children?.find(
      (lgNode) => lgNode.id === node.id,
    );

    return {
      ...node,
      position: {
        x: layoutedNode?.x ?? 0,
        y: layoutedNode?.y ?? 0,
      },
    };
  });

  return {
    nodes: layoutedNodes,
    edges,
  };
};
