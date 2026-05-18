// src/ui/utils/flowPath.ts
// Pure RF flow-topology helpers. IO edges are intentionally ignored.

import type { Edge as RFEdge, Node as RFNode } from '@xyflow/react';

type FlowEdgeLike = {
  type?: string | null;
  source: string;
  target: string;
};

export function isFlowEdge(edge: { type?: string | null }): boolean {
  return edge.type === 'ptb-flow';
}

function buildFlowAdjacency(
  edges: readonly FlowEdgeLike[],
): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!isFlowEdge(e)) continue;
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source)!.push(e.target);
  }
  return adj;
}

export function createsFlowLoop(
  edges: readonly FlowEdgeLike[],
  source: string,
  target: string,
): boolean {
  const adj = buildFlowAdjacency(edges);
  const seen = new Set<string>();
  const stack = [target];
  while (stack.length) {
    const n = stack.pop()!;
    if (n === source) return true;
    if (seen.has(n)) continue;
    seen.add(n);
    const next = adj.get(n) ?? [];
    for (const id of next) stack.push(id);
  }
  return false;
}

export function hasStartToEnd(nodes: RFNode[], edges: RFEdge[]): boolean {
  const startIds = nodes.filter((n) => n.type === 'ptb-start').map((n) => n.id);
  const endIds = new Set(
    nodes.filter((n) => n.type === 'ptb-end').map((n) => n.id),
  );

  const adj = buildFlowAdjacency(edges);

  const visited = new Set<string>();
  const queue: string[] = [...startIds];

  while (queue.length) {
    const cur = queue.shift()!;
    if (endIds.has(cur)) return true;
    if (visited.has(cur)) continue;
    visited.add(cur);

    const nexts = adj.get(cur) || [];
    for (const n of nexts) if (!visited.has(n)) queue.push(n);
  }

  return false;
}
