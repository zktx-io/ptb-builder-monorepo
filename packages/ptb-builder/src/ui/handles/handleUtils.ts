// src/ui/handles/handleUtils.ts
import type { Connection } from '@xyflow/react';

import type { Port, PTBType } from '../../ptb/graph/types';
import { portIdOf } from '../utils/handleId';

/** Read handle id from v12 (...HandleId) or v11 (...Handle). */
function getSourceHandle(c: Connection): string | undefined {
  return (c as any).sourceHandleId ?? (c as any).sourceHandle;
}
function getTargetHandle(c: Connection): string | undefined {
  return (c as any).targetHandleId ?? (c as any).targetHandle;
}

/** Quick guards for connections (must have concrete ends & handles). */
export const hasConcreteEnds = (c: Connection) =>
  Boolean(c.source && c.target && getSourceHandle(c) && getTargetHandle(c));

export const isSameNode = (c: Connection) => c.source === c.target;

/** Resolve a PTB port's type from RF store nodes. */
export function findPortTypeFromStore(
  nodes: any[],
  nodeId: string | undefined,
  handleIdStr: string | undefined,
): PTBType | undefined {
  return findPortFromStore(nodes, nodeId, handleIdStr)?.dataType;
}

/** Resolve a PTB Port object from RF store nodes. */
export function findPortFromStore(
  nodes: any[],
  nodeId: string | undefined,
  handleIdStr: string | undefined,
): Port | undefined {
  if (!nodeId || !handleIdStr) return undefined;
  const rfNode = nodes.find((n) => n.id === nodeId);
  const ptbNode = rfNode?.data?.ptbNode;
  if (!ptbNode?.ports) return undefined;

  const hid = portIdOf(handleIdStr);
  return ptbNode.ports.find((pp: Port) => pp.id === hid);
}

/** IO: true if the exact target handle is already occupied by another IO edge. */
export function isIOTargetBusy(edges: any[], c: Connection) {
  const tgt = c.target;
  const tHandle =
    (c as any).targetHandleId ??
    ((c as any).targetHandle as string | undefined);
  if (!tHandle) return false;

  return edges?.some((e: any) => {
    const eTargetHandle = (e as any).targetHandleId ?? (e as any).targetHandle;
    return e.type === 'ptb-io' && e.target === tgt && eTargetHandle === tHandle;
  });
}

/** Flow: allow only next -> prev (by handle ids). */
export function isFlowDirectionOK(c: Connection) {
  const sh = portIdOf(getSourceHandle(c));
  const th = portIdOf(getTargetHandle(c));
  return sh === 'next' && th === 'prev';
}

/**
 * IO: enforce out -> in and IO role on both ends.
 * Direction-agnostic w.r.t. drag origin; we inspect resolved ports.
 */
export function isIODirectionOK(nodes: any[], c: Connection): boolean {
  const sp = findPortFromStore(
    nodes,
    c.source ?? undefined,
    getSourceHandle(c) as any,
  );
  const tp = findPortFromStore(
    nodes,
    c.target ?? undefined,
    getTargetHandle(c) as any,
  );
  if (!sp || !tp) return false;
  if (sp.role !== 'io' || tp.role !== 'io') return false;
  return sp.direction === 'out' && tp.direction === 'in';
}

export const isSelfEdge = (c: Connection) => c.source === c.target;
