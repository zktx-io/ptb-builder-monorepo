// src/ui/utils/autoLayout.ts
// -----------------------------------------------------------------------------
// PTB-aware auto layout (single-row flow) with rendered node heights.
// Returns positions only. If options.targetCenter is provided, the layout is
// shifted so its visual center aligns with that flow-space point.
// -----------------------------------------------------------------------------

import type { Edge as RFEdge, Node as RFNode } from '@xyflow/react';
import {
  indexedHandleSuffix,
  indexedInputHandleIndex,
  RESULT_HANDLE_ID,
} from '@zktx.io/ptb-model';
import type { ElkNode } from 'elkjs/lib/elk.bundled.js';

import { isFlowEdge } from './flowPath';
import { parseHandleTypeSuffix } from '../../ptb/graph/types';
import { inputIoPorts, outPortsWithPrefix } from '../../ptb/portQueries';
import type { RFEdgeData, RFNodeData } from '../../ptb/ptbAdapter';
import {
  BOTTOM_PADDING,
  NODE_SIZES,
  ROW_SPACING,
  TITLE_TO_IO_GAP,
} from '../nodes/nodeLayout';

export type LayoutPositions = Record<string, { x: number; y: number }>;
export type AutoLayoutOptions = {
  targetCenter?: { x: number; y: number }; // viewport center in flow coords
};

// ---- Node helpers -----------------------------------------------------------

function nodeKind(n: RFNode<RFNodeData>): string | undefined {
  return n.data?.ptbNode?.kind;
}
function ptbNode(n: RFNode<RFNodeData>) {
  return n.data?.ptbNode;
}
function getNodeSize(kind?: string) {
  return (NODE_SIZES as any)[kind ?? ''] ?? { width: 180, height: 100 };
}

function isWellKnownObjectVar(n: RFNode<RFNodeData>): boolean {
  const p = ptbNode(n);
  if (!p || p.kind !== 'Variable') return false;
  const vt = p.varType;
  if (!vt || vt.kind !== 'object') return false;
  return p.semantic?.kind === 'GasCoin';
}

// ---- constants --------------------------------------------------------------

const COL_GAP_X = 140;
const ROW_Y = 0;
const MARGIN_X = 40;

const VAR_PAD_TOP = 60;
const VAR_STACK_GAP_Y = ROW_SPACING;
const TEXT_INPUT_H = 28;

// ---- Height estimation (measured → data → heuristic) ------------------------

function positiveFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function measuredHeight(n: RFNode<RFNodeData>): number | undefined {
  return (
    positiveFiniteNumber(n.measured?.height) ?? positiveFiniteNumber(n.height)
  );
}

function getLength(val: unknown): number {
  if (val === undefined) return 0;
  if (Array.isArray(val)) return val.length;
  if (ArrayBuffer.isView(val) && !(val instanceof DataView)) {
    return (val as unknown as ArrayLike<unknown>).length;
  }
  if (typeof (val as any)?.[Symbol.iterator] === 'function') {
    let count = 0;
    for (const _ of val as Iterable<unknown>) count++;
    return count;
  }
  return 0;
}

/** Estimate effective height purely from ptbNode data (ports only). */
function estimateHeightFromData(n: RFNode<RFNodeData>): number | undefined {
  const kind = nodeKind(n);
  const p = ptbNode(n);
  if (!kind || !p) return undefined;

  // Variables (data-only)
  if (p.kind === 'Variable') {
    const base = getNodeSize('Variable').height ?? 100;
    const vt = p.varType;

    if (vt?.kind === 'object') {
      return isWellKnownObjectVar(n) ? base : base + TEXT_INPUT_H;
    }

    if (vt?.kind === 'vector') {
      return base + getLength(p.value) * TEXT_INPUT_H + 4;
    }

    return base;
  }

  // Commands (ports-only: title + paddings + rows + group gaps)
  if (p.kind === 'Command') {
    const inPorts = inputIoPorts(p);
    const outResult = outPortsWithPrefix(p, RESULT_HANDLE_ID);
    const allOut = (p.ports ?? []).filter(
      (q) => q.role === 'io' && q.direction === 'out',
    );
    const knownOutIds = new Set(outResult.map((q) => String(q.id)));
    const otherOut = allOut.filter((q) => !knownOutIds.has(String(q.id)));
    const outPorts = [...outResult, ...otherOut];

    const inRows = inPorts.length;
    const outRows = outPorts.length;

    // BaseCommand: right offset only for splitCoins
    const rightOffsetRows = p?.command === 'splitCoins' ? 1 : 0;

    const moveCallTypeArgumentCount =
      p?.command === 'moveCall' &&
      Array.isArray(p?.params?.runtime?.typeArguments)
        ? p.params.runtime.typeArguments.length
        : 0;
    const controlsOffset =
      p?.command === 'moveCall'
        ? (4 + moveCallTypeArgumentCount) * ROW_SPACING + 24
        : 0;
    const makeMoveVecOffset = p?.command === 'makeMoveVec' ? 28 : 0;
    const inspectionOffset =
      p?.command === 'publish' || p?.command === 'upgrade' ? 18 : 0;

    const rowCount = Math.max(inRows, outRows + rightOffsetRows);
    const gaps = Math.max(0, rowCount - 1);

    return (
      TITLE_TO_IO_GAP +
      controlsOffset +
      makeMoveVecOffset +
      inspectionOffset +
      gaps * ROW_SPACING +
      BOTTOM_PADDING
    );
  }

  // Start / End
  return getNodeSize(kind).height ?? 120;
}

/** Final height: rendered measurement → data estimate → heuristic fallback. */
function nodeHeight(n: RFNode<RFNodeData>): number {
  const kind = nodeKind(n);
  const byMeasurement = measuredHeight(n);
  if (byMeasurement !== undefined) return byMeasurement;
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

  // --- local helpers --------------------------------------------------------
  const kindOf = (n: RFNode<RFNodeData>) =>
    n.data?.ptbNode?.kind as string | undefined;
  const isIo = (e: RFEdge<RFEdgeData>) => e.type === 'ptb-io';

  /** Strip optional serialized type suffix, keep only the raw handle id. */
  const baseHandle = (h?: string | null) =>
    h ? (parseHandleTypeSuffix(String(h)).baseId ?? '') : '';

  /**
   * Parse input handle into a stable (group, index) key:
   * - group: 'arg' (value args) or 'other'
   * - index: trailing number if present; 'in_*' without index → 0; else +∞
   */
  const parseInKey = (
    h?: string | null,
  ): { group: 'arg' | 'other'; idx: number } => {
    const s = baseHandle(h).toLowerCase();
    if (!s) return { group: 'other', idx: Number.POSITIVE_INFINITY };

    let group: 'arg' | 'other' = 'other';
    const argIndex = indexedInputHandleIndex(s, 'arg');
    if (argIndex !== undefined) return { group: 'arg', idx: argIndex };
    if (s.startsWith('in_')) group = 'other';

    const indexed = indexedHandleSuffix(s);
    if (indexed) return { group, idx: indexed.index };
    // Single, non-indexed input (e.g., "in_coin") → treat as index 0
    if (s.startsWith('in_')) return { group, idx: 0 };

    return { group: 'other', idx: Number.POSITIVE_INFINITY };
  };

  /** Group rank: keep value inputs ahead of other command inputs. */
  const groupRank = (g: 'arg' | 'other') => (g === 'arg' ? 0 : 1);

  const hOf = nodeHeight;

  // --- classify nodes -------------------------------------------------------
  const commands = orderedCmdIds
    .map((id) => nodes.find((n) => n.id === id)!)
    .filter(Boolean);
  const vars = nodes.filter((n) => kindOf(n) === 'Variable');
  const nodeIndex = new Map<string, number>();
  nodes.forEach((n, i) => nodeIndex.set(n.id, i));

  // --- column width / x positions ------------------------------------------
  const wStart = getNodeSize('Start').width ?? 220;
  const wCmd = getNodeSize('Command').width ?? 260;
  const wEnd = getNodeSize('End').width ?? 220;
  const colW = Math.max(wStart, wCmd, wEnd) + COL_GAP_X;

  const pos: LayoutPositions = {};
  const colAnchorY = new Map<number, number>();
  const cmdColIndex = new Map<string, number>();

  // Flow row placement: Start → Commands → End
  let col = 0;
  pos[start.id] = { x: MARGIN_X + colW * col, y: ROW_Y };
  const startCol = col;
  col++;

  for (const c of commands) {
    pos[c.id] = { x: MARGIN_X + colW * col, y: ROW_Y };
    cmdColIndex.set(c.id, col);
    col++;
  }
  pos[end.id] = { x: MARGIN_X + colW * col, y: ROW_Y };
  const endCol = col;

  // --- anchors (per-column) -------------------------------------------------
  const anchorYFor = (n: RFNode<RFNodeData>) => ROW_Y + hOf(n) + VAR_PAD_TOP;

  colAnchorY.set(startCol, anchorYFor(start));
  for (const c of commands) {
    const cCol = cmdColIndex.get(c.id)!;
    const anchor = anchorYFor(c);
    colAnchorY.set(cCol, anchor);
    const varCol = cCol - 1;
    if (!colAnchorY.has(varCol)) {
      colAnchorY.set(varCol, anchor);
    }
  }
  colAnchorY.set(endCol, anchorYFor(end));

  // --- bucket variables by column + compute sort keys -----------------------
  type VItem = {
    node: RFNode<RFNodeData>;
    colIdx: number;
    k0_cmdIdx: number; // earliest command index among 'commands'
    k1_grpRank: number; // group priority: arg < other
    k2_argIdx: number; // port index within that group
    k3_orig: number; // original order tiebreaker
    k4_id: string; // id tiebreaker
  };
  const buckets = new Map<number, VItem[]>();

  for (const v of vars) {
    let firstCmdIdx = Number.POSITIVE_INFINITY;
    let firstGrpRank = Number.POSITIVE_INFINITY;
    let firstArgIdx = Number.POSITIVE_INFINITY;

    // Scan Variable → Command edges for earliest (command, group, index)
    for (const e of edges) {
      if (!isIo(e)) continue;
      if (e.source !== v.id) continue;

      const ci = commands.findIndex((c) => c.id === e.target);
      if (ci < 0) continue;

      const { group, idx } = parseInKey(e.targetHandle ?? undefined);
      const gr = groupRank(group);

      // lexicographic min: cmdIdx → groupRank → argIdx
      if (
        ci < firstCmdIdx ||
        (ci === firstCmdIdx && gr < firstGrpRank) ||
        (ci === firstCmdIdx && gr === firstGrpRank && idx < firstArgIdx)
      ) {
        firstCmdIdx = ci;
        firstGrpRank = gr;
        firstArgIdx = idx;
      }
    }

    // Decide the column: left of the first-used command; if none, keep start column
    const firstCmd = Number.isFinite(firstCmdIdx)
      ? commands[firstCmdIdx]
      : undefined;
    const colIdx = Math.max(
      startCol,
      (firstCmd ? (cmdColIndex.get(firstCmd.id) ?? startCol) : startCol) - 1,
    );

    const list = buckets.get(colIdx) ?? [];
    list.push({
      node: v,
      colIdx,
      k0_cmdIdx: firstCmdIdx,
      k1_grpRank: firstGrpRank,
      k2_argIdx: firstArgIdx,
      k3_orig: nodeIndex.get(v.id) ?? Number.POSITIVE_INFINITY,
      k4_id: v.id,
    });
    buckets.set(colIdx, list);
  }

  // Sort inside each column by:
  //   firstCmdIdx → groupRank(arg < other) → argIdx → original → id
  for (const arr of buckets.values()) {
    arr.sort((a, b) => {
      if (a.k0_cmdIdx !== b.k0_cmdIdx) return a.k0_cmdIdx - b.k0_cmdIdx;
      if (a.k1_grpRank !== b.k1_grpRank) return a.k1_grpRank - b.k1_grpRank;
      if (a.k2_argIdx !== b.k2_argIdx) return a.k2_argIdx - b.k2_argIdx;
      if (a.k3_orig !== b.k3_orig) return a.k3_orig - b.k3_orig;
      return a.k4_id.localeCompare(b.k4_id);
    });
  }

  // --- vertical stacking with heights --------------------------------------
  const stackY = new Map<number, number>();
  const nextY = (colIdx: number, n: RFNode<RFNodeData>) => {
    let top = colAnchorY.get(colIdx);
    if (top === undefined) {
      top = colAnchorY.get(startCol) ?? ROW_Y + VAR_PAD_TOP;
      colAnchorY.set(colIdx, top);
    }
    const cur = stackY.has(colIdx) ? stackY.get(colIdx)! : top;
    const y = cur;
    stackY.set(colIdx, cur + hOf(n) + VAR_STACK_GAP_Y);
    return y;
  };

  for (const [colIdx, arr] of buckets) {
    const x = MARGIN_X + colW * colIdx;
    for (const { node: v } of arr) {
      pos[v.id] = { x, y: nextY(colIdx, v) };
    }
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

type ElkInstance = { layout: (graph: ElkNode) => Promise<ElkNode> };

let elkInstancePromise: Promise<ElkInstance> | undefined;
async function getElkInstance(): Promise<ElkInstance> {
  if (!elkInstancePromise) {
    elkInstancePromise = import('elkjs/lib/elk.bundled.js').then((mod) => {
      const ElkCtor = (mod as any).default ?? mod;
      return new ElkCtor();
    });
  }
  return elkInstancePromise;
}

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

  const elk = await getElkInstance();
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
