// ui/utils/autoLayout.ts
// -----------------------------------------------------------------------------
// PTB-aware auto layout (single-row flow) with data-driven node heights.
// Rules:
//   1) Flow nodes (Start, Commands, End) are placed strictly in execution order.
//   2) Columns: [Start][C1][C2]...[Cn][End] with uniform column width.
//   3) Each input Variable is stacked under the LEFT column of its earliest-used
//      command (if earliest is C1, left column is [Start]).
//   4) Variable stacking uses data-driven height (from node data), then
//      measured height if available, else a heuristic fallback.
//   5) All variable stacks start at a common baseline aligned to the tallest
//      flow-row node height to keep a clean horizontal “waterline”.
// Variable height policies:
//   - Vector variables and commands (moveCall/splitCoins/mergeCoins/transferObjects/makeMoveVec)
//     grow by port/value counts.
//   - Object variables are slightly taller than scalar variables by one text input line.
// Fallback: ELK layered layout when Start/End are missing or single-row fails.
// -----------------------------------------------------------------------------

import type { Edge as RFEdge, Node as RFNode } from '@xyflow/react';
import ELK, { ElkNode } from 'elkjs/lib/elk.bundled.js';

import { firstInPorts, outPortsWithPrefix } from '../../ptb/decodeTx/findPorts';
import { RFEdgeData, RFNodeData } from '../../ptb/ptbAdapter';
import { NODE_SIZES } from '../nodes/nodeLayout';

const elk = new ELK();

// ---- Node helpers -----------------------------------------------------------

function nodeKind(n: RFNode<RFNodeData>): string | undefined {
  return (n.data as any)?.ptbNode?.kind;
}
function ptbNode(n: RFNode<RFNodeData>): any | undefined {
  return (n.data as any)?.ptbNode;
}
function getNodeSize(kind?: string) {
  return (NODE_SIZES as any)[kind ?? ''] ?? { width: 200, height: 120 };
}
function isFlowEdge(e: RFEdge<RFEdgeData>) {
  const k = (e.data as any)?.ptbEdge?.kind;
  return k === 'flow' || String(e.id).startsWith('flow:');
}
function isIoEdge(e: RFEdge<RFEdgeData>) {
  const k = (e.data as any)?.ptbEdge?.kind;
  return k === 'io' || String(e.id).startsWith('io:');
}

// ---- Layout constants -------------------------------------------------------

// Flow columns
const COL_GAP_X = 140; // horizontal spacing between columns
const ROW_Y = 0; // Y for Start/Commands/End row
const MARGIN_X = 40; // left margin

// Variable stacking
const VAR_GAP_Y = 16; // vertical gap between stacked variables
const VAR_PAD_TOP = 28; // padding from flow-node bottom to first variable in that column

// Height tuning (fallbacks)
const TEXT_INPUT_H = 28; // object = scalar + one text input height
const VECTOR_EXTRA_H = 40; // extra height for vector variable (fallback)
const MOVECALL_EXTRA_H = 60; // extra height for moveCall (fallback)

// Data-driven row sizing for commands
const TITLE_H = 28;
const BODY_VPAD = 12;
const PORT_ROW_H = 12;
const GROUP_GAP_V = 6;

// ---- Height estimation (data → measured → heuristic) ------------------------

type VarSubkind = 'scalar' | 'object' | 'vector' | 'other';
function variableSubkind(n: RFNode<RFNodeData>): VarSubkind {
  const p = ptbNode(n);
  const t = p?.varType;
  if (!t || t.kind === undefined) return 'other';
  if (t.kind === 'scalar') return 'scalar';
  if (t.kind === 'object') return 'object';
  if (t.kind === 'vector') return 'vector';
  return 'other';
}
function commandKind(n: RFNode<RFNodeData>): string | undefined {
  const p = ptbNode(n);
  return p?.command;
}

/** Extract a semantic group key from a port id. */
function groupKeyFromPortId(id: string, dir: 'in' | 'out'): string {
  const norm = id.toLowerCase();
  const m = norm.match(/^(in|out)_(.+)$/);
  const body = m ? m[2] : norm;
  const g = body.replace(/_(\d+).*$/, '');
  const head = g.split('_')[0];

  if (body.startsWith('ret')) return `${dir}:ret`;
  if (body.startsWith('targ')) return `${dir}:targ`;
  if (body.startsWith('arg')) return `${dir}:arg`;
  return `${dir}:${head}`;
}

/** Count grouped rows for IO ports on a command node. */
function countPortRowsAndGroups(n: RFNode<RFNodeData>) {
  const p = ptbNode(n);
  if (!p) return { rows: 0, groups: 0, hasAny: false };

  const inPorts = firstInPorts(p as any);

  const outRet = outPortsWithPrefix(p as any, 'out_ret_');
  const outCoin = outPortsWithPrefix(p as any, 'out_coin_');
  const outVec = outPortsWithPrefix(p as any, 'out_vec'); // makeMoveVec
  const allOut = ((p.ports ?? []) as any[]).filter(
    (q) => q.role === 'io' && q.direction === 'out',
  );
  // Remove the ones we already accounted for
  const knownOutIds = new Set(
    [...outRet, ...outCoin, ...outVec].map((q) => String(q.id)),
  );
  const otherOut = allOut.filter((q) => !knownOutIds.has(String(q.id)));

  const outPorts = [...outRet, ...outCoin, ...outVec, ...otherOut];

  const inGroups = new Set<string>();
  const outGroups = new Set<string>();
  inPorts.forEach((q) => inGroups.add(groupKeyFromPortId(String(q.id), 'in')));
  outPorts.forEach((q) =>
    outGroups.add(groupKeyFromPortId(String(q.id), 'out')),
  );

  const rows = inPorts.length + outPorts.length;
  const groups = inGroups.size + outGroups.size;

  return { rows, groups, hasAny: rows > 0 };
}

/** Estimate effective height purely from ptbNode data (preferred). */
function estimateHeightFromData(n: RFNode<RFNodeData>): number | undefined {
  const kind = nodeKind(n);
  const p = ptbNode(n);
  if (!kind || !p) return undefined;

  // Variables
  if (kind === 'Variable') {
    const base = getNodeSize('Variable').height ?? 100;
    const vt = p.varType;

    if (vt?.kind === 'object') return base + TEXT_INPUT_H;

    if (vt?.kind === 'vector') {
      const value = (p as any).value;
      const len = Array.isArray(value) ? value.length : undefined;
      const visible = typeof len === 'number' ? Math.min(len, 6) : 0;
      const extra =
        visible > 0 ? visible * PORT_ROW_H + GROUP_GAP_V : VECTOR_EXTRA_H;
      return base + extra;
    }

    return base;
  }

  // Commands (generic, works for moveCall/split/merge/transfer/makeMoveVec)
  if (kind === 'Command') {
    const base = getNodeSize('Command').height ?? 120;
    const { rows, groups, hasAny } = countPortRowsAndGroups(n);
    if (hasAny) {
      const gaps = Math.max(0, groups - 1) * GROUP_GAP_V;
      const h = TITLE_H + BODY_VPAD + rows * PORT_ROW_H + BODY_VPAD + gaps;
      return Math.max(h, base);
    }
    return base;
  }

  // Start / End
  return getNodeSize(kind).height ?? 120;
}

/** Final height: data estimate → measured → heuristic fallback. */
function nodeHeight(n: RFNode<RFNodeData>): number {
  const byData = estimateHeightFromData(n);
  if (typeof byData === 'number' && byData > 0) return byData;

  const measured = (n as any)?.measured?.height;
  if (typeof measured === 'number' && measured > 0) return measured;

  const kind = nodeKind(n);
  const base = getNodeSize(kind).height ?? 120;

  if (kind === 'Variable') {
    const sub = variableSubkind(n);
    if (sub === 'object') return base + TEXT_INPUT_H;
    if (sub === 'vector') return base + VECTOR_EXTRA_H;
    return base;
  }
  if (kind === 'Command') {
    if (commandKind(n) === 'moveCall') return base + MOVECALL_EXTRA_H;
    return base;
  }
  return base;
}

// ---- Lightweight flow graph utils ------------------------------------------

type Flow = {
  ids: Set<string>;
  fwd: Map<string, string[]>;
  rev: Map<string, string[]>;
  indexOf: Map<string, number>;
};

function buildFlow(
  nodes: RFNode<RFNodeData>[],
  edges: RFEdge<RFEdgeData>[],
): Flow {
  const ids = new Set(nodes.map((n) => n.id));
  const indexOf = new Map<string, number>();
  nodes.forEach((n, i) => indexOf.set(n.id, i));
  const fwd = new Map<string, string[]>();
  const rev = new Map<string, string[]>();
  ids.forEach((id) => {
    fwd.set(id, []);
    rev.set(id, []);
  });
  for (const e of edges) {
    if (!isFlowEdge(e)) continue;
    if (!ids.has(e.source) || !ids.has(e.target)) continue;
    fwd.get(e.source)!.push(e.target);
    rev.get(e.target)!.push(e.source);
  }
  return { ids, fwd, rev, indexOf };
}

function reach(starts: string[], g: Map<string, string[]>) {
  const seen = new Set<string>(),
    q = [...starts];
  while (q.length) {
    const id = q.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const t of g.get(id) ?? []) if (!seen.has(t)) q.push(t);
  }
  return seen;
}

function distFrom(startId: string, fwd: Map<string, string[]>) {
  const dist = new Map<string, number>();
  const q = [startId];
  dist.set(startId, 0);
  while (q.length) {
    const id = q.shift()!;
    const d = dist.get(id)!;
    for (const t of fwd.get(id) ?? [])
      if (!dist.has(t)) {
        dist.set(t, d + 1);
        q.push(t);
      }
  }
  return dist;
}

/** Execution order for flow nodes using Kahn + stable tie-breakers. */
function orderByExecution(
  nodes: RFNode<RFNodeData>[],
  edges: RFEdge<RFEdgeData>[],
): {
  start?: RFNode<RFNodeData>;
  end?: RFNode<RFNodeData>;
  orderedCmdIds: string[];
} {
  const start = nodes.find((n) => nodeKind(n) === 'Start');
  const end = nodes.find((n) => nodeKind(n) === 'End');
  if (!start || !end) return { start, end, orderedCmdIds: [] };

  const { ids, fwd, rev, indexOf } = buildFlow(nodes, edges);
  const fromStart = reach([start.id], fwd);
  const toEnd = reach([end.id], rev);
  const active = new Set<string>();
  for (const id of ids) if (fromStart.has(id) && toEnd.has(id)) active.add(id);

  const indeg = new Map<string, number>();
  for (const id of active) {
    let d = 0;
    for (const p of rev.get(id) ?? []) if (active.has(p)) d++;
    indeg.set(id, d);
  }

  const dist = distFrom(start.id, fwd);
  const q: string[] = [];
  for (const id of active) if ((indeg.get(id) ?? 0) === 0) q.push(id);

  // Priority: Start first → BFS distance → original index → id
  const prio = (a: string, b: string) => {
    const sa = a === start.id ? 0 : 1;
    const sb = b === start.id ? 0 : 1;
    if (sa !== sb) return sa - sb;
    const da = dist.get(a) ?? 1e9;
    const db = dist.get(b) ?? 1e9;
    if (da !== db) return da - db;
    const ia = indexOf.get(a) ?? 0;
    const ib = indexOf.get(b) ?? 0;
    if (ia !== ib) return ia - ib;
    return a.localeCompare(b);
  };
  q.sort(prio);

  const out: string[] = [];
  const seen = new Set<string>();
  while (q.length) {
    const id = q.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    for (const t of fwd.get(id) ?? []) {
      if (!active.has(t)) continue;
      indeg.set(t, (indeg.get(t) ?? 0) - 1);
      if ((indeg.get(t) ?? 0) === 0) {
        q.push(t);
        q.sort(prio);
      }
    }
  }

  const orderedCmdIds = out.filter((id) =>
    nodes.find((n) => n.id === id && nodeKind(n) === 'Command'),
  );
  return { start, end, orderedCmdIds };
}

// ---- Single-row layout (execution-ordered) ----------------------------------

function layoutSingleRow(
  nodes: RFNode<RFNodeData>[],
  edges: RFEdge<RFEdgeData>[],
): { nodes: RFNode<RFNodeData>[] } | undefined {
  const { start, end, orderedCmdIds } = orderByExecution(nodes, edges);
  if (!start || !end) return undefined;

  const commands = orderedCmdIds
    .map((id) => nodes.find((n) => n.id === id)!)
    .filter(Boolean);
  const vars = nodes.filter((n) => nodeKind(n) === 'Variable');

  // Column width based on largest of Start/Command/End widths
  const wStart = getNodeSize('Start').width ?? 220;
  const wCmd = getNodeSize('Command').width ?? 260;
  const wEnd = getNodeSize('End').width ?? 220;
  const colW = Math.max(wStart, wCmd, wEnd) + COL_GAP_X;

  const pos = new Map<string, { x: number; y: number }>();
  const colAnchorY = new Map<number, number>();

  // Flow row (Start → Commands → End)
  let col = 0;
  pos.set(start.id, { x: MARGIN_X + colW * col, y: ROW_Y });
  const startCol = col;
  col++;

  const cmdColIndex = new Map<string, number>();
  for (const c of commands) {
    pos.set(c.id, { x: MARGIN_X + colW * col, y: ROW_Y });
    cmdColIndex.set(c.id, col);
    col++;
  }
  pos.set(end.id, { x: MARGIN_X + colW * col, y: ROW_Y });
  const endCol = col;

  // Common baseline for variable stacks = tallest flow-row node
  const flowRowMaxH = Math.max(
    nodeHeight(start),
    nodeHeight(end),
    ...commands.map((c) => nodeHeight(c)),
  );
  const commonAnchorY = ROW_Y + flowRowMaxH + VAR_PAD_TOP;
  colAnchorY.set(startCol, commonAnchorY);
  for (const c of commands) {
    const cc = cmdColIndex.get(c.id)!;
    colAnchorY.set(cc, commonAnchorY);
  }
  colAnchorY.set(endCol, commonAnchorY);

  // For each Variable, find earliest-used command and assign to *left* column
  const earliestColForVar = new Map<string, number>();
  const orderedCmdSet = new Set(commands.map((c) => c.id));

  for (const v of vars) {
    let bestCol = startCol;
    let bestIdx = Number.MAX_SAFE_INTEGER;

    for (const e of edges) {
      if (!isIoEdge(e)) continue;
      if (e.source !== v.id) continue;
      if (!orderedCmdSet.has(e.target)) continue;

      const idx = commands.findIndex((c) => c.id === e.target);
      if (idx >= 0 && idx < bestIdx) {
        bestIdx = idx;
        const cmdCol = cmdColIndex.get(commands[idx]!.id)!;
        bestCol = Math.max(startCol, cmdCol - 1);
      }
    }

    earliestColForVar.set(v.id, bestCol);
  }

  // Height-aware stacking per column
  const stackY = new Map<number, number>();
  function nextY(colIdx: number, node: RFNode<RFNodeData>) {
    const top = colAnchorY.get(colIdx) ?? commonAnchorY;
    const current = stackY.has(colIdx) ? stackY.get(colIdx)! : top;
    const next = current + nodeHeight(node) + VAR_GAP_Y;
    stackY.set(colIdx, next);
    return current;
  }

  // Place variables by their computed column, stacking top→bottom
  for (const v of vars) {
    const colIdx = earliestColForVar.get(v.id)!;
    const x = MARGIN_X + colW * colIdx;
    const y = nextY(colIdx, v);
    pos.set(v.id, { x, y });
  }

  // Emit final nodes
  const outNodes = nodes.map((n) => {
    const p = pos.get(n.id);
    if (!p) return n;
    return {
      ...n,
      position: { x: p.x, y: p.y },
      positionAbsolute: undefined,
      dragging: false,
      selected: n.selected,
    };
  });

  return { nodes: outNodes };
}

// ---- ELK layered fallback ---------------------------------------------------

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

async function layoutElk(
  nodes: RFNode<RFNodeData>[],
  edges: RFEdge<RFEdgeData>[],
) {
  const elkGraph: ElkNode = {
    id: 'root',
    layoutOptions: elkLayoutOptions,
    children: nodes.map((n) => {
      const kind = nodeKind(n);
      const { width } = getNodeSize(kind);
      const height = (n as any)?.measured?.height ?? nodeHeight(n);
      return {
        id: n.id,
        width,
        height,
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

  return nodes.map((n) => {
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
}

// ---- Public API -------------------------------------------------------------

export async function autoLayoutFlow(
  nodes: RFNode<RFNodeData>[],
  edges: RFEdge<RFEdgeData>[],
): Promise<{ nodes: RFNode<RFNodeData>[]; edges: RFEdge<RFEdgeData>[] }> {
  const single = layoutSingleRow(nodes, edges);
  if (single) return { nodes: single.nodes, edges };
  const elkNodes = await layoutElk(nodes, edges);
  return { nodes: elkNodes, edges };
}
