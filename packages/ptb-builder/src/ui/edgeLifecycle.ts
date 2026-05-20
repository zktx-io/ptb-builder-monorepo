import type { Connection, Edge as RFEdge } from '@xyflow/react';

import {
  extractHandles,
  findPortFromStore,
  type PortStoreNode,
} from './handles/handleUtils';
import {
  projectRFIOEdgeDataForPorts,
  type RFEdgeData,
} from './rfGraphProjection';
import { createsFlowLoop } from './utils/flowPath';
import { parseHandleTypeSuffix } from '../ptb/graph/types';

export type ConnectionDecision =
  | { action: 'reject'; reason: ConnectionRejectReason }
  | {
      action: 'create';
      edgeType: 'ptb-flow' | 'ptb-type' | 'ptb-io';
      filteredEdges: RFEdge<RFEdgeData>[];
      data?: RFEdgeData;
    };

export type ConnectionRejectReason =
  | 'missing-endpoint'
  | 'missing-port'
  | 'self-loop'
  | 'invalid-flow'
  | 'flow-loop'
  | 'invalid-type'
  | 'invalid-io';

export function filterConflictingIOEdges(
  edges: readonly RFEdge<RFEdgeData>[],
  conn: Connection,
): RFEdge<RFEdgeData>[] | undefined {
  const target = conn.target;
  const targetBase = parseHandleTypeSuffix(extractHandles(conn).target).baseId;
  if (!target || !targetBase) return undefined;

  return edges.filter((edge) => {
    if (edge.type !== 'ptb-io' || edge.target !== target) return true;
    const edgeTargetBase = parseHandleTypeSuffix(
      extractHandles(edge).target,
    ).baseId;
    return edgeTargetBase !== targetBase;
  });
}

export function filterConflictingTypeEdges(
  edges: readonly RFEdge<RFEdgeData>[],
  conn: Connection,
): RFEdge<RFEdgeData>[] | undefined {
  const target = conn.target;
  const targetBase = parseHandleTypeSuffix(extractHandles(conn).target).baseId;
  if (!target || !targetBase) return undefined;

  return edges.filter((edge) => {
    if (edge.type !== 'ptb-type' || edge.target !== target) return true;
    const edgeTargetBase = parseHandleTypeSuffix(
      extractHandles(edge).target,
    ).baseId;
    return edgeTargetBase !== targetBase;
  });
}

function filterConflictingFlowEdges(
  edges: readonly RFEdge<RFEdgeData>[],
  conn: Connection,
): RFEdge<RFEdgeData>[] | undefined {
  const source = conn.source;
  const target = conn.target;
  const sourceHandle = conn.sourceHandle ?? undefined;
  const targetHandle = conn.targetHandle ?? undefined;
  if (!source || !target || !sourceHandle || !targetHandle) return undefined;

  return edges.filter(
    (edge) =>
      !(
        edge.type === 'ptb-flow' &&
        ((edge.source === source && edge.sourceHandle === sourceHandle) ||
          (edge.target === target && edge.targetHandle === targetHandle))
      ),
  );
}

export function deleteEdgesForRemovedNodes(
  nodes: readonly PortStoreNode[],
  edges: readonly RFEdge<RFEdgeData>[],
): RFEdge<RFEdgeData>[] {
  const nodeIds = new Set(nodes.map((node) => node.id));
  return edges.filter(
    (edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target),
  );
}

export function deleteEdgeById(
  edges: readonly RFEdge<RFEdgeData>[],
  edgeId: string,
): RFEdge<RFEdgeData>[] {
  return edges.filter((edge) => edge.id !== edgeId);
}

export function decideConnection(
  nodes: readonly PortStoreNode[],
  edges: readonly RFEdge<RFEdgeData>[],
  conn: Connection,
): ConnectionDecision {
  if (
    !conn.source ||
    !conn.target ||
    !conn.sourceHandle ||
    !conn.targetHandle
  ) {
    return { action: 'reject', reason: 'missing-endpoint' };
  }
  if (conn.source === conn.target) {
    return { action: 'reject', reason: 'self-loop' };
  }

  const sourcePort = findPortFromStore(nodes, conn.source, conn.sourceHandle);
  const targetPort = findPortFromStore(nodes, conn.target, conn.targetHandle);
  if (!sourcePort || !targetPort) {
    return { action: 'reject', reason: 'missing-port' };
  }

  if (sourcePort.role === 'flow' || targetPort.role === 'flow') {
    if (
      sourcePort.role !== 'flow' ||
      targetPort.role !== 'flow' ||
      sourcePort.direction !== 'out' ||
      targetPort.direction !== 'in'
    ) {
      return { action: 'reject', reason: 'invalid-flow' };
    }
    const filteredEdges = filterConflictingFlowEdges(edges, conn);
    if (!filteredEdges) return { action: 'reject', reason: 'invalid-flow' };
    if (createsFlowLoop(filteredEdges, conn.source, conn.target)) {
      return { action: 'reject', reason: 'flow-loop' };
    }
    return { action: 'create', edgeType: 'ptb-flow', filteredEdges };
  }

  if (sourcePort.role === 'type' || targetPort.role === 'type') {
    if (
      sourcePort.role !== 'type' ||
      targetPort.role !== 'type' ||
      sourcePort.direction !== 'out' ||
      targetPort.direction !== 'in'
    ) {
      return { action: 'reject', reason: 'invalid-type' };
    }
    const filteredEdges = filterConflictingTypeEdges(edges, conn);
    if (!filteredEdges) return { action: 'reject', reason: 'invalid-type' };
    return { action: 'create', edgeType: 'ptb-type', filteredEdges };
  }

  if (
    sourcePort.role !== 'io' ||
    targetPort.role !== 'io' ||
    sourcePort.direction !== 'out' ||
    targetPort.direction !== 'in'
  ) {
    return { action: 'reject', reason: 'invalid-io' };
  }
  const filteredEdges = filterConflictingIOEdges(edges, conn);
  if (!filteredEdges) return { action: 'reject', reason: 'invalid-io' };
  return {
    action: 'create',
    edgeType: 'ptb-io',
    filteredEdges,
    data: projectRFIOEdgeDataForPorts(sourcePort, targetPort),
  };
}
