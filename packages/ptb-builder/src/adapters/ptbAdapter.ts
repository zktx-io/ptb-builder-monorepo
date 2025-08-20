// src/ui/ptbAdapter.ts
// Adapter between PTBGraph (domain) and React Flow (view).
// This is the ONLY place that imports React Flow types.

import type { Edge as RFEdge, Node as RFNode } from '@xyflow/react';

import { buildHandleId } from '../ptb/graph/helpers';
import { type IOCategory, ioCategoryOf } from '../ptb/graph/typecheck';
import {
  PTBEdge,
  PTBGraph,
  PTBNode,
  serializePTBType,
} from '../ptb/graph/types';
import { PORTS } from '../ptb/portTemplates';

/** Minimal data stored on RF node; keep UI-only hints here. */
export interface RFNodeData extends Record<string, unknown> {
  /** Display label for node */
  label?: string;
  /** Category hint for Variable nodes (used for colors/styles) */
  type?: IOCategory;
  /** Reference to full PTB node (optional, for inspectors/debug) */
  ptbNode?: PTBNode;
}

/** Convert PTBGraph → React Flow representation */
export function ptbToRF(graph: PTBGraph): {
  /** RF nodes for rendering */
  nodes: RFNode<RFNodeData>[];
  /** RF edges for rendering */
  edges: RFEdge[];
} {
  const nodes: RFNode<RFNodeData>[] = graph.nodes.map((n) => ({
    id: n.id,
    type: mapPTBNodeToRFType(n),
    position: n.position ?? { x: 0, y: 0 }, // fallback if not set
    data: {
      label: n.label,
      ptbNode: n,
      ...(n.kind === 'Variable' ? { type: ioCategoryOf(n.varType) } : {}),
    },
  }));

  const edges: RFEdge[] = graph.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: buildHandleIdForRF(graph, e.source, e.sourcePort),
    targetHandle: buildHandleIdForRF(graph, e.target, e.targetPort),
    type: mapPTBEdgeToRFType(e),
    data: {
      // UI-only hint for inspectors (not persisted in PTBGraph)
      dataType: e.dataType ? serializePTBType(e.dataType) : undefined,
    },
  }));

  return { nodes, edges };
}

/** Convert a single PTB node → RF node */
export function ptbNodeToRF(node: PTBNode): RFNode<RFNodeData> {
  const { nodes } = ptbToRF({ nodes: [node], edges: [] } as PTBGraph);
  return nodes[0];
}

/** Convert a single PTB edge → RF edge */
export function ptbEdgeToRF(edge: PTBEdge): RFEdge {
  const { edges } = ptbToRF({ nodes: [], edges: [edge] } as PTBGraph);
  return edges[0];
}

/** Convert RF graph → PTBGraph
 *  - `prev` is optional and allows preserving PTB-only fields
 *    (params, outputs, varType, etc.)
 */
export function rfToPTB(
  rfNodes: RFNode<RFNodeData>[],
  rfEdges: RFEdge[],
  prev?: PTBGraph,
): PTBGraph {
  const nodes: PTBNode[] = rfNodes.map((rn) => {
    const base = prev?.nodes.find((n) => n.id === rn.id);
    const skeleton = mapRFTypeToPTBSkeleton(rn.type as string);

    return {
      id: rn.id,
      kind: skeleton.kind,
      label: rn.data?.label ?? base?.label,
      ports: skeleton.ports,
      position: rn.position ?? base?.position,
      ...(skeleton.extra ?? {}),
      ...(pickPTBSpecificData(base) ?? {}),
    } as PTBNode;
  });

  const edges: PTBEdge[] = rfEdges.map((re) => {
    const s = parseHandleId(re.sourceHandle);
    const t = parseHandleId(re.targetHandle);
    return {
      id: re.id,
      kind: mapRFTypeToPTBEdgeKind(re.type as string),
      source: re.source,
      sourcePort: s.portId,
      target: re.target,
      targetPort: t.portId,
    };
  });

  return { nodes, edges };
}

/* ------------------------- Mapping helpers ------------------------- */

/** Map PTB node kind → RF node type string */
function mapPTBNodeToRFType(n: PTBNode): string {
  switch (n.kind) {
    case 'Start':
      return 'ptb-start';
    case 'End':
      return 'ptb-end';
    case 'Variable':
      return 'ptb-var';
    case 'Command':
      return 'ptb-cmd';
    case 'Utility':
      return 'ptb-util';
  }
}

/** Map PTB edge kind → RF edge type string (style) */
function mapPTBEdgeToRFType(e: PTBEdge): string {
  return e.kind === 'flow' ? 'ptb-flow' : 'ptb-io';
}

/** Map RF node type string → PTB skeleton (ports + kind) */
function mapRFTypeToPTBSkeleton(rfType: string) {
  if (rfType === 'ptb-start') return { kind: 'Start', ports: PORTS.start() };
  if (rfType === 'ptb-end') return { kind: 'End', ports: PORTS.end() };
  if (rfType === 'ptb-var')
    return { kind: 'Variable', ports: PORTS.variableOut(), extra: {} };
  if (rfType === 'ptb-cmd')
    return { kind: 'Command', ports: PORTS.commandBase(), extra: {} };
  return { kind: 'Utility', ports: [], extra: {} };
}

/** Map RF edge type string → PTB edge kind */
function mapRFTypeToPTBEdgeKind(rfType?: string): PTBEdge['kind'] {
  return rfType === 'ptb-flow' ? 'flow' : 'io';
}

/** Build RF handle id from PTB port */
function buildHandleIdForRF(
  graph: PTBGraph,
  nodeId: string,
  portId: string,
): string | undefined {
  const node = graph.nodes.find((n) => n.id === nodeId);
  const port = node?.ports.find((p) => p.id === portId);
  return port ? buildHandleId(port) : undefined;
}

/** Parse a handle id string built by `buildHandleId` */
function parseHandleId(handleId?: string | null): {
  portId: string;
  type?: string;
} {
  if (!handleId) return { portId: '' };
  const [portId, type] = String(handleId).split(':');
  return { portId, type };
}

/** Preserve PTB-specific fields during RF → PTB conversion */
function pickPTBSpecificData(base?: PTBNode): Partial<PTBNode> | undefined {
  if (!base) return;
  switch (base.kind) {
    case 'Command':
      return {
        command: base.command,
        params: base.params,
        outputs: base.outputs,
      };
    case 'Variable':
      return { varType: base.varType, name: base.name, value: base.value };
    case 'Utility':
      return { util: base.util, params: base.params };
    default:
      return {};
  }
}

/* ------------------------------------------------------------------
 * Notes:
 * - This adapter is the single integration point with React Flow.
 * - PTB schema/storage format must remain RF-agnostic.
 * - When RF API changes, only update this adapter.
 * ------------------------------------------------------------------ */
