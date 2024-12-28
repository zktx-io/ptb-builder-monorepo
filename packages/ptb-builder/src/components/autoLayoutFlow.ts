import ELK, { ElkNode } from 'elkjs/lib/elk.bundled.js';

import { PTB } from './Menu.data';
import { PTBEdge, PTBNode } from '../ptbFlow/nodes';

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
};

export const autoLayoutFlow = async (nodes: PTBNode[], edges: PTBEdge[]) => {
  const getTargetHandles = (n: PTBNode) =>
    edges.filter((e) => e.target === n.id).map((e) => ({ id: e.target }));
  const getSourceHandles = (n: PTBNode) =>
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
      const height: number =
        n.measured && n.measured.height
          ? n.measured.height
          : n.type === PTB.MakeMoveVec.Type
            ? 150
            : 100;
      return {
        id: n.id,
        width: n.measured ? n.measured.width : 200,
        height,
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
