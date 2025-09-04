// ui/utils/autoLayout.ts
// -----------------------------------------------------------------------------
// Auto layout for React Flow nodes.
// Simple PTB-aware layout to reduce crossings and match UX intent:
//   1) Place Start, Commands, End on a single top row with uniform column width.
//   2) Place ALL Variable nodes (including gas / decoded inputs) stacked under Start.
//   3) No per-command stacking for variables (since all Variable nodes are inputs).
// Fallback: ELK layered layout when the graph is not suitable for the simple layout.
// -----------------------------------------------------------------------------

import type { Edge as RFEdge, Node as RFNode } from '@xyflow/react';
import ELK, { ElkNode } from 'elkjs/lib/elk.bundled.js';

import { RFEdgeData, RFNodeData } from '../../ptb/ptbAdapter';
import { NODE_SIZES } from '../nodes/nodeLayout';

const elk = new ELK();

function getNodeSize(kind?: string) {
  return (NODE_SIZES as any)[kind ?? ''] ?? { width: 200, height: 120 };
}

// ---- Helpers ---------------------------------------------------------------

/** Node kind from ptbNode.kind if available. */
function nodeKind(n: RFNode<RFNodeData>): string | undefined {
  return (n.data as any)?.ptbNode?.kind;
}

/** Heuristic: detect flow edge (prefer data.ptbEdge.kind, fallback to id prefix). */
function isFlowEdge(e: RFEdge<RFEdgeData>) {
  const k = (e.data as any)?.ptbEdge?.kind;
  return k === 'flow' || String(e.id).startsWith('flow:');
}

// ---- Grid layout params (uniform column width) ------------------------------

const GAP_X = 320; // horizontal gap between columns on the top row
const TOP_Y = 0; // y for Start/Commands/End row
const VAR_TOP_Y = 160; // first variable row below Start
const VAR_STEP_Y = 100; // vertical step between stacked variables
const MARGIN_X = 40; // minimal left margin

// ---- ELK fallback options ---------------------------------------------------

const elkLayoutOptions = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.layered.spacing.edgeNodeBetweenLayers': '40',
  'elk.layered.spacing.nodeNodeBetweenLayers': '40',
  'elk.spacing.nodeNode': '40',
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  'elk.layered.nodePlacement.strategy': 'SIMPLE',
  'elk.layered.cycleBreaking.strategy': 'DEPTH_FIRST',
} as const;

// ---- Topological order over flow edges (commands only) ----------------------

/** Kahn-like order using only flow edges. Returns ids in left→right order. */
function topoOrderByFlow(
  nodes: RFNode<RFNodeData>[],
  edges: RFEdge<RFEdgeData>[],
): string[] {
  const ids = new Set(nodes.map((n) => n.id));
  const fwd = new Map<string, string[]>();
  const indeg = new Map<string, number>();

  ids.forEach((id) => {
    fwd.set(id, []);
    indeg.set(id, 0);
  });

  for (const e of edges) {
    if (!isFlowEdge(e)) continue;
    if (!ids.has(e.source) || !ids.has(e.target)) continue;
    fwd.get(e.source)!.push(e.target);
    indeg.set(e.target, (indeg.get(e.target)! + 1) | 0);
  }

  const q: string[] = [];
  for (const id of ids) if ((indeg.get(id) ?? 0) === 0) q.push(id);

  const out: string[] = [];
  const seen = new Set<string>();
  while (q.length) {
    const id = q.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    for (const t of fwd.get(id) ?? []) {
      indeg.set(t, (indeg.get(t)! - 1) | 0);
      if ((indeg.get(t) ?? 0) === 0) q.push(t);
    }
  }
  return out.filter((id) => seen.has(id));
}

// ---- Main: simple PTB-aware grid layout ------------------------------------

function layoutGrid(
  nodes: RFNode<RFNodeData>[],
  edges: RFEdge<RFEdgeData>[],
): { nodes: RFNode<RFNodeData>[] } | undefined {
  const start = nodes.find((n) => nodeKind(n) === 'Start');
  const end = nodes.find((n) => nodeKind(n) === 'End');
  const commands = nodes.filter((n) => nodeKind(n) === 'Command');
  const variables = nodes.filter((n) => nodeKind(n) === 'Variable');

  // Need at least Start + End for this layout to be meaningful
  if (!start || !end) return undefined;

  // 1) Order commands along the flow (fallback to preserved order)
  const topo = topoOrderByFlow([start, ...commands, end], edges);
  const cmdIdsOrdered = topo.filter((id) => commands.some((c) => c.id === id));
  const orderedCommands =
    cmdIdsOrdered.length === commands.length
      ? cmdIdsOrdered
      : commands.map((c) => c.id);

  // 2) Place Start, Commands, End on the top row with uniform spacing
  const positions = new Map<string, { x: number; y: number }>();
  let x = MARGIN_X;

  const startSize = getNodeSize(nodeKind(start));
  positions.set(start.id, { x, y: TOP_Y });
  x += Math.max(startSize.width ?? 200, GAP_X);

  for (const cid of orderedCommands) {
    positions.set(cid, { x, y: TOP_Y });
    const cSize = getNodeSize('Command');
    x += Math.max(cSize.width ?? 200, GAP_X);
  }

  // End sits at the next column — same gap so it doesn't drift
  positions.set(end.id, { x, y: TOP_Y });

  // 3) Place ALL Variable nodes stacked under Start (inputs only model)
  {
    const sx = positions.get(start.id)!.x;
    let vy = VAR_TOP_Y;
    for (const v of variables) {
      positions.set(v.id, { x: sx, y: vy });
      vy += VAR_STEP_Y;
    }
  }

  // Produce node list with updated positions
  const outNodes = nodes.map((n) => {
    const p = positions.get(n.id);
    if (!p) return n;
    return {
      ...n,
      position: { x: p.x, y: p.y },
      positionAbsolute: undefined, // RF expects "position" to be authoritative
      dragging: false,
      selected: n.selected,
    };
  });

  return { nodes: outNodes };
}

// ---- ELK layered fallback ---------------------------------------------------

async function layoutElk(
  nodes: RFNode<RFNodeData>[],
  edges: RFEdge<RFEdgeData>[],
) {
  const elkGraph: ElkNode = {
    id: 'root',
    layoutOptions: elkLayoutOptions,
    children: nodes.map((n) => {
      const kind = nodeKind(n);
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

  const placedNodes = nodes.map((n) => {
    const lgNode = laidOut.children?.find((c) => c.id === n.id);
    return {
      ...n,
      position: {
        x: lgNode?.x ?? n.position.x ?? 0,
        y: lgNode?.y ?? n.position.y ?? 0,
      },
      positionAbsolute: undefined,
      dragging: false,
      selected: n.selected,
    };
  });

  return placedNodes;
}

// ---- Public API -------------------------------------------------------------

export async function autoLayoutFlow(
  nodes: RFNode<RFNodeData>[],
  edges: RFEdge<RFEdgeData>[],
): Promise<{ nodes: RFNode<RFNodeData>[]; edges: RFEdge<RFEdgeData>[] }> {
  // Try simple PTB-aware layout first
  const grid = layoutGrid(nodes, edges);
  if (grid) {
    return { nodes: grid.nodes, edges };
  }

  // Fallback to ELK layered
  const elkNodes = await layoutElk(nodes, edges);
  return { nodes: elkNodes, edges };
}
