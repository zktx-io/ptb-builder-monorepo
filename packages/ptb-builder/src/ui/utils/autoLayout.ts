// src/ui/utils/autoLayout.ts
// -----------------------------------------------------------------------------
// PTB-aware auto layout (single-row flow) with data-driven node heights.
// Returns positions only. If options.targetCenter is provided, the layout is
// shifted so its visual center aligns with that flow-space point.
// -----------------------------------------------------------------------------

import type { Edge as RFEdge, Node as RFNode } from '@xyflow/react';
import ELK, { ElkNode } from 'elkjs/lib/elk.bundled.js';

import { firstInPorts, outPortsWithPrefix } from '../../ptb/decodeTx/findPorts';
import type { RFEdgeData, RFNodeData } from '../../ptb/ptbAdapter';
import { NODE_SIZES } from '../nodes/nodeLayout';

export type LayoutPositions = Record<string, { x: number; y: number }>;
export type AutoLayoutOptions = {
  targetCenter?: { x: number; y: number }; // viewport center in flow coords
};

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

// Edge-kind detection must honor RFEdge.type primarily
function isFlowEdge(e: RFEdge<RFEdgeData>) {
  if (e.type === 'ptb-flow') return true;
  const k = (e.data as any)?.ptbEdge?.kind;
  return k === 'flow' || String(e.id).startsWith('flow:');
}
function isIoEdge(e: RFEdge<RFEdgeData>) {
  if (e.type === 'ptb-io') return true;
  const k = (e.data as any)?.ptbEdge?.kind;
  return k === 'io' || String(e.id).startsWith('io:');
}

// ---- constants --------------------------------------------------------------

const COL_GAP_X = 140;
const ROW_Y = 0;
const MARGIN_X = 40;

const VAR_GAP_Y = 16;
const VAR_PAD_TOP = 28;

const TEXT_INPUT_H = 28;
const VECTOR_EXTRA_H = 40;
const MOVECALL_EXTRA_H = 60;

const TITLE_H = 28;
const BODY_VPAD = 12;
const PORT_ROW_H = 12;
const GROUP_GAP_V = 6;

// ---- Height estimation (data → measured → heuristic) ------------------------

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

/** Estimate effective height purely from ptbNode data (ports only). */
function estimateHeightFromData(n: RFNode<RFNodeData>): number | undefined {
  const kind = nodeKind(n);
  const p = ptbNode(n);
  if (!kind || !p) return undefined;

  // Variables (data-only)
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

  // Commands (ports-only: title + paddings + rows + group gaps)
  if (kind === 'Command') {
    const { rows, groups } = countPortRowsAndGroups(n);
    const gaps = Math.max(0, groups - 1) * GROUP_GAP_V;
    const rowsH = rows * PORT_ROW_H;
    return TITLE_H + BODY_VPAD + rowsH + gaps + BODY_VPAD;
  }

  // Start / End
  return getNodeSize(kind).height ?? 120;
}

/** Final height: data estimate → measured → heuristic fallback. */
function nodeHeight(n: RFNode<RFNodeData>): number {
  const kind = nodeKind(n);
  const byData = estimateHeightFromData(n);
  if (typeof byData === 'number' && byData > 0) return byData;
  return getNodeSize(kind).height ?? 120;
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

// ---- Single-row layout (positions only) -------------------------------------

function layoutSingleRowPositions(
  nodes: RFNode<RFNodeData>[],
  edges: RFEdge<RFEdgeData>[],
): LayoutPositions | undefined {
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

  const pos: LayoutPositions = {};
  const colAnchorY = new Map<number, number>();

  // Flow row (Start → Commands → End)
  let col = 0;
  pos[start.id] = { x: MARGIN_X + colW * col, y: ROW_Y };
  const startCol = col;
  col++;

  const cmdColIndex = new Map<string, number>();
  for (const c of commands) {
    pos[c.id] = { x: MARGIN_X + colW * col, y: ROW_Y };
    cmdColIndex.set(c.id, col);
    col++;
  }
  pos[end.id] = { x: MARGIN_X + colW * col, y: ROW_Y };
  const endCol = col;

  // Common baseline for variable stacks = tallest flow-row node
  const flowRowMaxH = Math.max(
    nodeHeight(start),
    nodeHeight(end),
    ...commands.map((c) => nodeHeight(c)),
  );
  const commonAnchorY = ROW_Y + flowRowMaxH + VAR_PAD_TOP;
  colAnchorY.set(startCol, commonAnchorY);
  for (const c of commands)
    colAnchorY.set(cmdColIndex.get(c.id)!, commonAnchorY);
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
    pos[v.id] = { x, y };
  }

  return pos;
}

// ---- ELK fallback -----------------------------------------------------------

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

async function layoutElkPositions(
  nodes: RFNode<RFNodeData>[],
  edges: RFEdge<RFEdgeData>[],
): Promise<LayoutPositions> {
  const elkGraph: ElkNode = {
    id: 'root',
    layoutOptions: elkLayoutOptions,
    children: nodes.map((n) => {
      const kind = nodeKind(n);
      const { width } = getNodeSize(kind);
      const height = nodeHeight(n);
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

  const positions: LayoutPositions = {};
  for (const n of nodes) {
    const lgNode = laidOut.children?.find((c) => c.id === n.id);
    positions[n.id] = {
      x: lgNode?.x ?? n.position.x ?? 0,
      y: lgNode?.y ?? n.position.y ?? 0,
    };
  }
  return positions;
}

// ---- center + shift ---------------------------------------------------------

function computeCenterFromBounds(
  nodes: RFNode<RFNodeData>[],
  positions: LayoutPositions,
) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const n of nodes) {
    const p = positions[n.id];
    if (!p) continue;
    const kind = nodeKind(n);
    const w = getNodeSize(kind).width ?? 240;
    const h = nodeHeight(n);
    const l = p.x,
      t = p.y,
      r = p.x + w,
      b = p.y + h;
    if (l < minX) minX = l;
    if (t < minY) minY = t;
    if (r > maxX) maxX = r;
    if (b > maxY) maxY = b;
  }
  if (!isFinite(minX) || !isFinite(minY)) return { cx: 0, cy: 0 };
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

function shiftPositions(
  positions: LayoutPositions,
  dx: number,
  dy: number,
): LayoutPositions {
  const out: LayoutPositions = {};
  for (const id of Object.keys(positions)) {
    const p = positions[id]!;
    out[id] = { x: p.x + dx, y: p.y + dy };
  }
  return out;
}

// ---- public API -------------------------------------------------------------

export async function autoLayoutFlow(
  nodes: RFNode<RFNodeData>[],
  edges: RFEdge<RFEdgeData>[],
  options: AutoLayoutOptions,
): Promise<LayoutPositions> {
  const base =
    layoutSingleRowPositions(nodes, edges) ??
    (await layoutElkPositions(nodes, edges));

  if (options?.targetCenter) {
    const { cx, cy } = computeCenterFromBounds(nodes, base);
    const dx = options.targetCenter.x - cx;
    const dy = options.targetCenter.y - cy;
    return shiftPositions(base, dx, dy);
  }

  return base;
}
