// Adapter between PTBGraph (domain) and React Flow (view).
// This is the ONLY place that imports React Flow types.

import type { Edge as RFEdge, Node as RFNode } from '@xyflow/react';

import { buildHandleId } from '../ptb/graph/helpers';
import {
  type NumericWidth,
  PTBEdge,
  PTBGraph,
  PTBNode,
  serializePTBType,
} from '../ptb/graph/types';
import { PORTS } from '../ptb/portTemplates';

/** Minimal data stored on React Flow node (UI-only). */
export interface RFNodeData extends Record<string, unknown> {
  /** Node label shown in the UI */
  label?: string;
  /** Full PTB node reference carried by the renderer (SSOT) */
  ptbNode?: PTBNode;
}

/** Strongly-typed payload we put on RF edges. */
export interface RFEdgeData extends Record<string, unknown> {
  /** Serialized type hint (e.g., "vector<object<...>>") */
  dataType?: string;
  /** Optional cast metadata for number → move_numeric */
  cast?: { to: NumericWidth };
}

/** Convert PTBGraph → React Flow representation (pure mapping, no recalculation) */
export function ptbToRF(graph: PTBGraph): {
  nodes: RFNode<RFNodeData>[];
  edges: RFEdge<RFEdgeData>[];
} {
  const nodes: RFNode<RFNodeData>[] = graph.nodes.map((n) => ({
    id: n.id,
    type: mapPTBNodeToRFType(n),
    position: n.position ?? { x: 0, y: 0 },
    data: { label: n.label, ptbNode: n },
  }));

  const edges: RFEdge<RFEdgeData>[] = graph.edges.map((e) => {
    const sh = buildHandleIdForRF(graph, e.source, e.sourcePort);
    const th = buildHandleIdForRF(graph, e.target, e.targetPort);

    // Extract serialized type from handle id if available (split on the first ":")
    const typeFromHandle =
      sh && sh.includes(':') ? sh.slice(sh.indexOf(':') + 1) : undefined;

    // Fallback to the PTB edge's structured type if handle didn't carry it
    const serialized =
      typeFromHandle ?? (e.dataType ? serializePTBType(e.dataType) : undefined);

    return {
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: sh,
      targetHandle: th,
      // v11/v12 compatibility
      // @ts-ignore
      sourceHandleId: sh,
      // @ts-ignore
      targetHandleId: th,
      type: mapPTBEdgeToRFType(e),
      data: {
        dataType: serialized,
        // keep passthrough if present on PTB edge (used by codegen/UI badges)
        cast: (e as any).cast,
      },
      // keep optional UI label if present (edge renderer may show it)
      label: (e as any).label,
    };
  });

  return { nodes, edges };
}

/** Convert a single PTB node → React Flow node */
export function ptbNodeToRF(node: PTBNode): RFNode<RFNodeData> {
  const { nodes } = ptbToRF({ nodes: [node], edges: [] } as PTBGraph);
  return nodes[0];
}

/** Convert a single PTB edge → React Flow edge */
export function ptbEdgeToRF(edge: PTBEdge): RFEdge<RFEdgeData> {
  const { edges } = ptbToRF({ nodes: [], edges: [edge] } as PTBGraph);
  return edges[0];
}

/**
 * Convert React Flow → PTBGraph
 * - SSOT: prefer rn.data.ptbNode first, then `prev`, finally minimal fallback.
 * - No re-materialization of ports here. Renderer/Fabricator already computed them.
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

    const fallbackPorts =
      kind === 'Start'
        ? PORTS.start()
        : kind === 'End'
          ? PORTS.end()
          : (chosen?.ports ?? []);

    const {
      id: _cId,
      kind: _cKind,
      label: _cLabel,
      ports: _cPorts,
      position: _cPos,
      ...restChosen
    } = (chosen ?? {}) as PTBNode;

    const node: PTBNode = {
      ...restChosen,
      id: rn.id,
      kind,
      label:
        (rn.data?.label as string | undefined) ?? chosen?.label ?? base?.label,
      ports: chosen?.ports ?? base?.ports ?? fallbackPorts,
      position: rn.position ?? chosen?.position ?? base?.position,
    } as PTBNode;

    return node;
  });

  const edges: PTBEdge[] = rfEdges.map((re) => {
    const s = parseHandleId((re as any).sourceHandleId ?? re.sourceHandle);
    const t = parseHandleId((re as any).targetHandleId ?? re.targetHandle);
    const cast = (re.data as RFEdgeData | undefined)?.cast;

    return {
      id: re.id,
      kind: mapRFTypeToPTBEdgeKind(re.type as string),
      source: re.source,
      sourcePort: s.portId,
      target: re.target,
      targetPort: t.portId,
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

function buildHandleIdForRF(
  graph: PTBGraph,
  nodeId: string,
  portId: string,
): string | undefined {
  const node = graph.nodes.find((n) => n.id === nodeId);
  const port = node?.ports.find((p) => p.id === portId);
  return port ? buildHandleId(port) : undefined;
}

/** Split only on the first ":" to avoid breaking Move type tags that contain "::" */
function parseHandleId(handleId?: string | null): {
  portId: string;
  type?: string;
} {
  if (!handleId) return { portId: '' };
  const s = String(handleId);
  const i = s.indexOf(':');
  if (i === -1) return { portId: s };
  return { portId: s.slice(0, i), type: s.slice(i + 1) };
}
