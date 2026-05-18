import type { PTBGraph } from './graph/types';
import { KNOWN_IDS, type WellKnownId } from './seedGraph';

/** Idempotent graph normalization that never mutates the input graph. */
export function normalizeGraph(g: PTBGraph): PTBGraph {
  const nodes = (g.nodes || []).map((node) => ({ ...node }));
  const edges = (g.edges || []).map((edge) => ({ ...edge }));

  const coalesce = (
    matchKind: PTBGraph['nodes'][number]['kind'],
    canonicalId: WellKnownId,
    canonicalPrevHandle: string,
    canonicalNextHandle: string,
  ) => {
    const idxs = nodes
      .map((n, i) => ({ n, i }))
      .filter(({ n }) => n.kind === matchKind);
    if (idxs.length === 0) return;

    const { n: keeperNode } = idxs[0]!;

    if (keeperNode.id !== canonicalId) {
      const oldId = keeperNode.id;
      keeperNode.id = canonicalId;
      edges.forEach((edge) => {
        if (edge.source === oldId) edge.source = canonicalId;
        if (edge.target === oldId) edge.target = canonicalId;
        if (edge.kind === 'flow') {
          if (edge.source === canonicalId)
            edge.sourceHandle = canonicalNextHandle;
          if (edge.target === canonicalId)
            edge.targetHandle = canonicalPrevHandle;
        }
      });
    }

    for (let k = 1; k < idxs.length; k++) {
      const { n: dup } = idxs[k]!;
      const oldId = dup.id;
      edges.forEach((edge) => {
        if (edge.source === oldId) {
          edge.source = canonicalId;
          if (edge.kind === 'flow') edge.sourceHandle = canonicalNextHandle;
        }
        if (edge.target === oldId) {
          edge.target = canonicalId;
          if (edge.kind === 'flow') edge.targetHandle = canonicalPrevHandle;
        }
      });
    }
    for (let k = idxs.length - 1; k >= 1; k--) {
      nodes.splice(idxs[k]!.i, 1);
    }
  };

  coalesce('Start', KNOWN_IDS.START, 'in', 'out');
  coalesce('End', KNOWN_IDS.END, 'in', 'out');

  nodes.forEach((node) => {
    if (node.kind === 'Start') {
      node.ports = [{ id: 'out', direction: 'out', role: 'flow' }];
    }
    if (node.kind === 'End') {
      node.ports = [{ id: 'in', direction: 'in', role: 'flow' }];
    }
  });

  return { nodes, edges };
}
