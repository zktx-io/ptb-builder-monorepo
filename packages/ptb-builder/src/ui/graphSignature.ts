import type { PTBGraph } from '../ptb/graph/types';
import { stableStringify } from '../ptb/ptbDoc';

/** Build an order-insensitive, semantic signature for a PTB graph. */
export function stableGraphSig(g: PTBGraph): string {
  const round = (v: unknown) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : v;

  const nodes = [...(g.nodes || [])]
    .map((n) => {
      const ports = [...(n.ports || [])]
        .map((p) => ({
          id: p.id,
          role: p.role,
          direction: p.direction,
          dataType: p.dataType ? stableStringify(p.dataType) : undefined,
        }))
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

      const extra: Record<string, unknown> = {};
      const semanticNode = n as unknown as Record<string, unknown>;
      if (semanticNode.command !== undefined)
        extra.command = semanticNode.command;
      if (semanticNode.params !== undefined) extra.params = semanticNode.params;
      if (semanticNode.semantic !== undefined)
        extra.semantic = semanticNode.semantic;
      if (semanticNode.varType !== undefined)
        extra.varType = semanticNode.varType;
      if (semanticNode.value !== undefined) extra.value = semanticNode.value;
      if (semanticNode.rawInput !== undefined)
        extra.rawInput = semanticNode.rawInput;

      const pos =
        semanticNode.position &&
        typeof semanticNode.position === 'object' &&
        !Array.isArray(semanticNode.position) &&
        typeof (semanticNode.position as { x?: unknown }).x === 'number' &&
        typeof (semanticNode.position as { y?: unknown }).y === 'number'
          ? {
              x: round((semanticNode.position as { x: number }).x),
              y: round((semanticNode.position as { y: number }).y),
            }
          : undefined;

      return { id: n.id, kind: n.kind, ports, pos, ...extra };
    })
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const edges = [...(g.edges || [])]
    .map((e) => ({
      id: e.id,
      kind: e.kind,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? undefined,
      targetHandle: e.targetHandle ?? undefined,
      cast: (e as unknown as { cast?: unknown }).cast ?? undefined,
    }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return stableStringify({ nodes, edges });
}
