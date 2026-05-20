import type { Edge as RFEdge } from '@xyflow/react';

import {
  extractHandles,
  findPortFromStore,
  type PortStoreNode,
} from './handles/handleUtils';
import {
  inferCastTarget,
  isTypeCompatible,
  isUnknownType,
} from '../ptb/graph/typecheck';
import type { NumericWidth, Port } from '../ptb/graph/types';
import { parseHandleTypeSuffix, serializePTBType } from '../ptb/graph/types';

export type RFEdgeWithHandleAliases = RFEdge<RFEdgeData> & {
  sourceHandleId?: string;
  targetHandleId?: string;
};

export type RFEdgeVisualState = 'ok' | 'pending' | 'incompatible';

export type RFEdgeVisualReason =
  | 'type-compatible'
  | 'type-pending'
  | 'type-incompatible';

/** UI edge payload: serialized type & cast metadata for badges/debug */
export interface RFEdgeData extends Record<string, unknown> {
  dataType?: string;
  cast?: { to: NumericWidth };
  visualState?: RFEdgeVisualState;
  reason?: RFEdgeVisualReason;
}

function serializedKnownPortType(port?: Port): string | undefined {
  const type = port?.dataType;
  if (!type || type.kind === 'unknown') return undefined;
  return serializePTBType(type);
}

export function projectRFIOEdgeDataForPorts(
  sourcePort?: Port,
  targetPort?: Port,
): RFEdgeData | undefined {
  const dataType =
    serializedKnownPortType(sourcePort) ?? serializedKnownPortType(targetPort);
  if (
    !sourcePort ||
    !targetPort ||
    sourcePort.role !== 'io' ||
    targetPort.role !== 'io' ||
    sourcePort.direction !== 'out' ||
    targetPort.direction !== 'in'
  ) {
    return undefined;
  }

  const cast = inferCastTarget(sourcePort.dataType, targetPort.dataType);
  const pending =
    isUnknownType(sourcePort.dataType) || isUnknownType(targetPort.dataType);
  const compatible = isTypeCompatible(sourcePort.dataType, targetPort.dataType);
  const visualState: RFEdgeVisualState = pending
    ? 'pending'
    : compatible
      ? 'ok'
      : 'incompatible';
  const reason: RFEdgeVisualReason = pending
    ? 'type-pending'
    : compatible
      ? 'type-compatible'
      : 'type-incompatible';

  return {
    ...(dataType ? { dataType } : {}),
    ...(cast ? { cast } : {}),
    visualState,
    reason,
  };
}

function projectedEdgeData(
  edge: RFEdge<RFEdgeData>,
  sourcePort?: Port,
  targetPort?: Port,
): RFEdgeData | undefined {
  if (edge.type !== 'ptb-io') return undefined;
  return projectRFIOEdgeDataForPorts(sourcePort, targetPort);
}

function sameEdgeData(
  left: RFEdgeData | undefined,
  right: RFEdgeData | undefined,
): boolean {
  return (
    left?.dataType === right?.dataType &&
    left?.cast?.to === right?.cast?.to &&
    left?.visualState === right?.visualState &&
    left?.reason === right?.reason
  );
}

function stableRFHandleId(port: Port | undefined, handle: string | undefined) {
  return port?.id ?? parseHandleTypeSuffix(handle).baseId ?? handle;
}

/**
 * Reproject surviving React Flow edges against the current node ports.
 *
 * This is a display/projection repair only: it keeps RF handle ids stable,
 * updates aliases, edge color data, and numeric casts. It must not infer or
 * mutate node types.
 */
export function projectEdgesForCurrentPorts(
  nodes: readonly PortStoreNode[],
  edges: readonly RFEdge<RFEdgeData>[],
): RFEdge<RFEdgeData>[] {
  return edges.flatMap((edge) => {
    const handles = extractHandles(edge);
    const sourcePort = findPortFromStore(nodes, edge.source, handles.source);
    const targetPort = findPortFromStore(nodes, edge.target, handles.target);
    if (!sourcePort || !targetPort) return [];

    const sourceHandle = stableRFHandleId(sourcePort, handles.source);
    const targetHandle = stableRFHandleId(targetPort, handles.target);
    const data = projectedEdgeData(edge, sourcePort, targetPort);
    const currentData = edge.data as RFEdgeData | undefined;

    if (
      edge.sourceHandle === sourceHandle &&
      edge.targetHandle === targetHandle &&
      (edge as RFEdgeWithHandleAliases).sourceHandleId === sourceHandle &&
      (edge as RFEdgeWithHandleAliases).targetHandleId === targetHandle &&
      sameEdgeData(currentData, data)
    ) {
      return [edge];
    }

    return [
      {
        ...edge,
        sourceHandle,
        targetHandle,
        sourceHandleId: sourceHandle,
        targetHandleId: targetHandle,
        data,
      } as RFEdgeWithHandleAliases,
    ];
  });
}
