// src/ptb/ptbAdapter.ts

// -----------------------------------------------------------------------------
// PTBGraph ↔ React Flow adapter.
// - Nodes: SSOT lives in node.data.ptbNode. Variable nodes always materialize
//   a single IO out port that mirrors varType.
// - Edges: sourceHandle/targetHandle are passed through 1:1. For RF v11/12,
//   sourceHandleId/targetHandleId aliases are also set for compatibility.
// - Edge badges: serialized types are derived from the port dataType, not from
//   handle suffixes (suffixes are conservative).
// -----------------------------------------------------------------------------

import type { Edge as RFEdge, Node as RFNode } from '@xyflow/react';

import type {
  NumericWidth,
  Port,
  PTBEdge,
  PTBGraph,
  PTBNode,
  VariableNode,
} from './graph/types';
import { parseHandleTypeSuffix, serializePTBType } from './graph/types';
import { PORTS } from './portTemplates';
import { extractHandles } from '../ui/handles/handleUtils';

type RFEdgeCompat = RFEdge<RFEdgeData> & {
  sourceHandleId?: string;
  targetHandleId?: string;
};

/** UI node payload: only label and the SSOT PTB node */
export interface RFNodeData extends Record<string, unknown> {
  label?: string;
  ptbNode?: PTBNode;
}

/** UI edge payload: serialized type & cast metadata for badges/debug */
export interface RFEdgeData extends Record<string, unknown> {
  dataType?: string;
  targetType?: string;
  cast?: { to: NumericWidth };
}

/** Ensure a Variable node carries a concrete IO out port that reflects its varType. */
function materializeVarOutPort(n: PTBNode): PTBNode {
  if ((n as any)?.kind !== 'Variable') return n;
  const v = n as VariableNode;

  const existingOut =
    (v.ports || []).find((p) => p.role === 'io' && p.direction === 'out')?.id ??
    'out';

  const outPort: Port = {
    id: existingOut,
    role: 'io',
    direction: 'out',
    label: v.label ?? 'out',
    dataType: v.varType,
    typeStr: v.varType ? serializePTBType(v.varType) : undefined,
  };

  return {
    ...v,
    ports: [outPort],
  };
}

/**
 * PTBGraph → React Flow
 * - Pass sourceHandle/targetHandle through 1:1 (no rebuild, no parsing).
 * - dataType for badges comes from the materialized port types (more reliable than suffix).
 */
export function ptbToRF(graph: PTBGraph): {
  nodes: RFNode<RFNodeData>[];
  edges: RFEdge<RFEdgeData>[];
} {
  const matNodes = graph.nodes.map((n) => materializeVarOutPort(n));

  const nodes: RFNode<RFNodeData>[] = matNodes.map((n) => ({
    id: n.id,
    type: mapPTBNodeToRFType(n),
    position: n.position ?? { x: 0, y: 0 },
    data: { label: n.label, ptbNode: n },
  }));

  const edges: RFEdge<RFEdgeData>[] = graph.edges.map((e) => {
    const sh = e.sourceHandle;
    const th = e.targetHandle;

    const srcNode = matNodes.find((n) => n.id === e.source);
    const dstNode = matNodes.find((n) => n.id === e.target);

    const sBase = parseHandleTypeSuffix(sh).baseId;
    const tBase = parseHandleTypeSuffix(th).baseId;

    const sPort = srcNode?.ports?.find((p) => p.id === sBase);
    const tPort = dstNode?.ports?.find((p) => p.id === tBase);

    const srcTypeStr = sPort?.dataType
      ? serializePTBType(sPort.dataType)
      : undefined;
    const dstTypeStr = tPort?.dataType
      ? serializePTBType(tPort.dataType)
      : undefined;

    const edge: RFEdgeCompat = {
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: sh,
      targetHandle: th,
      // v11/12 alias
      sourceHandleId: sh,
      targetHandleId: th,
      type: mapPTBEdgeToRFType(e),
      data: {
        dataType: srcTypeStr,
        targetType: dstTypeStr,
        cast: (e as any).cast,
      },
      label: (e as any).label,
    };
    return edge;
  });

  return { nodes, edges };
}

/** Single-node helper */
export function ptbNodeToRF(node: PTBNode): RFNode<RFNodeData> {
  const { nodes } = ptbToRF({ nodes: [node], edges: [] } as PTBGraph);
  return nodes[0];
}

/**
 * React Flow → PTBGraph
 * - Node SSOT prefers node.data.ptbNode; falls back to prev graph; last resorts to template ports.
 * - Edges pass sourceHandle/targetHandle through unchanged.
 * - Variable nodes must never receive fallback flow ports.
 */
export function rfToPTB(
  rfNodes: RFNode<RFNodeData>[],
  rfEdges: RFEdge<RFEdgeData>[],
  prev?: PTBGraph,
): PTBGraph {
  const nodes: PTBNode[] = rfNodes.map((rn) => {
    const base = prev?.nodes.find((n) => n.id === rn.id);
    const dataNode = rn.data?.ptbNode as PTBNode | undefined;

    const kind = mapRFTypeToPTBKind(rn.type as string);
    const chosen = dataNode ?? base;

    const basePortsByKind =
      kind === 'Start'
        ? PORTS.start()
        : kind === 'End'
          ? PORTS.end()
          : kind === 'Variable'
            ? [] // Variable: no flow ports
            : PORTS.commandBase();

    return {
      ...(chosen ?? ({} as PTBNode)),
      id: rn.id,
      kind,
      label:
        (rn.data?.label as string | undefined) ?? chosen?.label ?? base?.label,
      ports: chosen?.ports ?? base?.ports ?? basePortsByKind,
      position: rn.position ?? chosen?.position ?? base?.position,
    } as PTBNode;
  });

  const edges: PTBEdge[] = rfEdges.map((re) => {
    const { source, target } = extractHandles(re);
    const cast = (re.data as RFEdgeData | undefined)?.cast;

    return {
      id: re.id,
      kind: mapRFTypeToPTBEdgeKind(re.type as string),
      source: re.source,
      target: re.target,
      sourceHandle: source ?? '',
      targetHandle: target ?? '',
      ...(cast ? { cast } : {}),
    };
  });

  return { nodes, edges };
}

/* ------------------------- Mapping helpers ------------------------- */

function mapPTBNodeToRFType(n: PTBNode): string {
  switch (n.kind) {
    case 'Start':
      return 'ptb-start';
    case 'End':
      return 'ptb-end';
    case 'Variable':
      return 'ptb-var';
    case 'Command': {
      const cmd = (n as any)?.command;
      return cmd === 'moveCall' ? 'ptb-mvc' : 'ptb-cmd';
    }
  }
  const _exhaustive: never = n;
  return String(_exhaustive);
}

function mapRFTypeToPTBKind(rfType: string): PTBNode['kind'] {
  if (rfType === 'ptb-start') return 'Start';
  if (rfType === 'ptb-end') return 'End';
  if (rfType === 'ptb-var') return 'Variable';
  if (rfType === 'ptb-mvc') return 'Command';
  return 'Command';
}

function mapPTBEdgeToRFType(e: PTBEdge): string {
  return e.kind === 'flow' ? 'ptb-flow' : 'ptb-io';
}

function mapRFTypeToPTBEdgeKind(rfType?: string): PTBEdge['kind'] {
  return rfType === 'ptb-flow' ? 'flow' : 'io';
}
