// src/ui/utils/flowPath.ts
// Pure RF-graph reachability (Start -> End) checker.

import type { Edge as RFEdge, Node as RFNode } from '@xyflow/react';

export function hasStartToEnd(nodes: RFNode[], edges: RFEdge[]): boolean {
  const startIds = nodes.filter((n) => n.type === 'ptb-start').map((n) => n.id);
  const endIds = new Set(
    nodes.filter((n) => n.type === 'ptb-end').map((n) => n.id),
  );

  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (e.type !== 'ptb-flow') continue;
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source)!.push(e.target);
  }

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
