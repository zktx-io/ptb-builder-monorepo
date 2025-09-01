// src/ptb/ptbAdapter.ts
import type { Edge as RFEdge, Node as RFNode } from '@xyflow/react';

import type { NumericWidth, PTBEdge, PTBGraph, PTBNode } from './graph/types';
import { PORTS } from './portTemplates';

/** UI node payload: only label and the SSOT PTB node */
export interface RFNodeData extends Record<string, unknown> {
  /** Label shown in the UI */
  label?: string;
  /** Full PTB node carried by the renderer (single source of truth) */
  ptbNode?: PTBNode;
}

/** UI edge payload: optional serialized type & cast metadata */
export interface RFEdgeData extends Record<string, unknown> {
  /** Serialized type hint taken from handle suffix "portId:TypeString" */
  dataType?: string;
  /** Optional cast metadata for number → move_numeric */
  cast?: { to: NumericWidth };
}

/**
 * PTBGraph → React Flow
 * - Pass sourceHandle/targetHandle through 1:1 (no rebuild, no parsing).
 * - dataType for badges is derived from the sourceHandle suffix if present.
 */
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
    const sh = e.sourceHandle;
    const th = e.targetHandle;

    // If the handle encodes "id:TypeString", expose TypeString for UI
    const typeFromHandle =
      sh && sh.includes(':') ? sh.slice(sh.indexOf(':') + 1) : undefined;

    return {
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: sh,
      targetHandle: th,

      // XYFlow v11/12 compatibility aliases
      // @ts-ignore
      sourceHandleId: sh,
      // @ts-ignore
      targetHandleId: th,

      type: mapPTBEdgeToRFType(e),
      data: {
        dataType: typeFromHandle,
        cast: (e as any).cast,
      },
      // Optional label passthrough for custom edge renderers
      label: (e as any).label,
    };
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

    // Do not re-materialize ports: use renderer/fabricator outputs when possible.
    const fallbackPorts =
      kind === 'Start'
        ? PORTS.start()
        : kind === 'End'
          ? PORTS.end()
          : (chosen?.ports ?? []);

    // Keep chosen node’s other fields without overriding id/kind/position/label
    const {
      id: _id,
      kind: _kind,
      label: _label,
      ports: _ports,
      position: _pos,
      ...restChosen
    } = (chosen ?? {}) as PTBNode;

    return {
      ...restChosen,
      id: rn.id,
      kind,
      label:
        (rn.data?.label as string | undefined) ?? chosen?.label ?? base?.label,
      ports: chosen?.ports ?? base?.ports ?? fallbackPorts,
      position: rn.position ?? chosen?.position ?? base?.position,
    } as PTBNode;
  });

  const edges: PTBEdge[] = rfEdges.map((re) => {
    // Prefer new props; accept legacy v11 aliases
    const sh =
      ((re as any).sourceHandleId as string | undefined) ??
      re.sourceHandle ??
      '';
    const th =
      ((re as any).targetHandleId as string | undefined) ??
      re.targetHandle ??
      '';

    const cast = (re.data as RFEdgeData | undefined)?.cast;

    return {
      id: re.id,
      kind: mapRFTypeToPTBEdgeKind(re.type as string),
      source: re.source,
      target: re.target,
      sourceHandle: sh,
      targetHandle: th,
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
