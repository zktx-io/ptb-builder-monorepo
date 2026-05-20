import type { Connection, Edge as RFEdge } from '@xyflow/react';

import { isTypeCompatible, isUnknownType } from '../ptb/graph/typecheck';
import { parseHandleTypeSuffix } from '../ptb/graph/types';
import type { RFEdgeData } from '../ptb/ptbAdapter';
import {
  extractHandles,
  findPortFromStore,
  type PortStoreNode,
} from './handles/handleUtils';

export function filterConflictingIOEdges(
  edges: RFEdge[],
  conn: Connection,
): RFEdge[] | undefined {
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
  edges: RFEdge[],
  conn: Connection,
): RFEdge[] | undefined {
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

export function pruneExistingIOEdges(
  nodes: readonly PortStoreNode[],
  edges: RFEdge<RFEdgeData>[],
): RFEdge<RFEdgeData>[] {
  return edges.filter((edge) => {
    if (edge.type !== 'ptb-io') return true;
    const source = findPortFromStore(
      nodes,
      edge.source,
      extractHandles(edge).source,
    );
    const target = findPortFromStore(
      nodes,
      edge.target,
      extractHandles(edge).target,
    );
    if (!source || !target) return false;
    if (
      source.role !== 'io' ||
      target.role !== 'io' ||
      source.direction !== 'out' ||
      target.direction !== 'in'
    ) {
      return false;
    }
    const sourceType = source.dataType;
    const targetType = target.dataType;
    if (!sourceType || !targetType) return true;
    if (isUnknownType(sourceType) || isUnknownType(targetType)) return true;
    return isTypeCompatible(sourceType, targetType);
  });
}

export function pruneExistingTypeEdges(
  nodes: readonly PortStoreNode[],
  edges: RFEdge<RFEdgeData>[],
): RFEdge<RFEdgeData>[] {
  return edges.filter((edge) => {
    if (edge.type !== 'ptb-type') return true;
    const source = findPortFromStore(
      nodes,
      edge.source,
      extractHandles(edge).source,
    );
    const target = findPortFromStore(
      nodes,
      edge.target,
      extractHandles(edge).target,
    );
    return (
      source?.role === 'type' &&
      source.direction === 'out' &&
      target?.role === 'type' &&
      target.direction === 'in'
    );
  });
}
