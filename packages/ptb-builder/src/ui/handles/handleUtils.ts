// src/ui/nodes/handles/handleUtils.ts
import type { Connection } from '@xyflow/react';

import { Port, PTBType } from '../../ptb/graph/types';

/** Get handle id from either v12 (…HandleId) or v11 (…Handle) field. */
function getSourceHandle(c: Connection): string | null | undefined {
  return (c as any).sourceHandleId ?? (c as any).sourceHandle;
}
function getTargetHandle(c: Connection): string | null | undefined {
  return (c as any).targetHandleId ?? (c as any).targetHandle;
}

/** Strip optional ":type" suffix from a handle id (we only need the port id). */
export const baseHandleId = (h: string | null | undefined) => {
  const s = String(h ?? '').trim();
  const i = s.indexOf(':');
  return i === -1 ? s : s.slice(0, i);
};

/** Quick guards for connections (must have concrete ends & handles). */
export const hasConcreteEnds = (c: Connection) =>
  Boolean(c.source && c.target && getSourceHandle(c) && getTargetHandle(c));

export const isSameNode = (c: Connection) => c.source === c.target;

/** Resolve a PTB port's type from RF store nodes. */
export function findPortTypeFromStore(
  nodes: any[],
  nodeId: string | null | undefined,
  handleIdStr: string | null | undefined,
): PTBType | undefined {
  return findPortFromStore(nodes, nodeId, handleIdStr)?.dataType;
}

/** Resolve a PTB Port object from RF store nodes. */
export function findPortFromStore(
  nodes: any[],
  nodeId: string | null | undefined,
  handleIdStr: string | null | undefined,
): Port | undefined {
  if (!nodeId || !handleIdStr) return undefined;
  const rfNode = nodes.find((n) => n.id === nodeId);
  const ptbNode = rfNode?.data?.ptbNode;
  if (!ptbNode?.ports) return undefined;

  const hid = baseHandleId(handleIdStr);
  return ptbNode.ports.find((pp: Port) => pp.id === hid);
}

/** IO: true if the exact target handle is already occupied by another IO edge. */
export function isIOTargetBusy(edges: any[], c: Connection) {
  const tgt = c.target;
  const tHandle =
    (c as any).targetHandleId ??
    ((c as any).targetHandle as string | null | undefined);
  if (!tHandle) return false;

  return edges?.some((e: any) => {
    const eTargetHandle = (e as any).targetHandleId ?? (e as any).targetHandle;
    return e.type === 'ptb-io' && e.target === tgt && eTargetHandle === tHandle;
  });
}

/** Flow: enforce next -> prev only (by handle ids). */
export function isFlowDirectionOK(c: Connection) {
  const sh = baseHandleId(getSourceHandle(c));
  const th = baseHandleId(getTargetHandle(c));
  return sh === 'next' && th === 'prev';
}

/**
 * IO: enforce out -> in and IO role on both ends.
 * This is direction-agnostic with respect to drag origin: we inspect the ports.
 */
export function isIODirectionOK(nodes: any[], c: Connection): boolean {
  const sp = findPortFromStore(
    nodes,
    // eslint-disable-next-line no-restricted-syntax
    c.source ?? null,
    getSourceHandle(c) as any,
  );
  const tp = findPortFromStore(
    nodes,
    // eslint-disable-next-line no-restricted-syntax
    c.target ?? null,
    getTargetHandle(c) as any,
  );
  if (!sp || !tp) return false;
  if (sp.role !== 'io' || tp.role !== 'io') return false;
  return sp.direction === 'out' && tp.direction === 'in';
}

export const isSelfEdge = (c: Connection) => c.source === c.target;
