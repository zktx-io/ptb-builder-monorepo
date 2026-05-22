import { autoLayoutFlow } from './autoLayout';
import type { PTBGraph } from '../../ptb/graph/types';
import { ptbToRF, rfToPTB } from '../../ptb/ptbAdapter';

export type AutoLayoutGraphResult =
  | { ok: true; graph: PTBGraph }
  | { ok: false; error: string };

export type AutoLayoutGraphOptions = {
  targetCenter?: { x: number; y: number };
};

export async function autoLayoutPTBGraph(
  graph: PTBGraph,
  options: AutoLayoutGraphOptions = {},
): Promise<AutoLayoutGraphResult> {
  const { nodes, edges } = ptbToRF(graph);
  if (nodes.length === 0) {
    return {
      ok: false,
      error: 'Graph layout requires at least one node.',
    };
  }

  const positions = await autoLayoutFlow(nodes, edges, {
    targetCenter: options.targetCenter,
  });
  if (!positions || Object.keys(positions).length === 0) {
    return {
      ok: false,
      error: 'Graph layout did not produce node positions.',
    };
  }

  const positionedNodes = nodes.map((node) =>
    positions[node.id]
      ? {
          ...node,
          position: positions[node.id],
          positionAbsolute: undefined,
          dragging: false,
        }
      : node,
  );
  return {
    ok: true,
    graph: rfToPTB(positionedNodes, edges, graph),
  };
}
