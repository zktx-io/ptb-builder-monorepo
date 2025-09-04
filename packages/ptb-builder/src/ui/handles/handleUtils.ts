// src/ui/handles/handleUtils.ts

import type { Connection } from '@xyflow/react';

import type { Port, PTBType } from '../../ptb/graph/types';
import { parseHandleTypeSuffix } from '../../ptb/graph/types';

/** Read handle id from v12 (...HandleId) or v11 (...Handle); null-safe. */
function getSourceHandle(c: Connection): string | undefined {
  const v =
    ((c as any).sourceHandleId as string | null | undefined) ??
    ((c as any).sourceHandle as string | null | undefined);
  return v ?? undefined;
}
function getTargetHandle(c: Connection): string | undefined {
  const v =
    ((c as any).targetHandleId as string | null | undefined) ??
    ((c as any).targetHandle as string | null | undefined);
  return v ?? undefined;
}

/** Quick guards for connections (must have concrete ends & handles). */
export const hasConcreteEnds = (c: Connection) =>
  Boolean(c.source && c.target && getSourceHandle(c) && getTargetHandle(c));

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

  const { baseId } = parseHandleTypeSuffix(handleIdStr);
  if (!baseId) return undefined;
  return ptbNode.ports.find((pp: Port) => pp.id === baseId);
}

/** IO: true if the exact target handle is already occupied by another IO edge. */
export function isIOTargetBusy(edges: any[], c: Connection) {
  const tgt = c.target;
  const tHandle = getTargetHandle(c);
  if (!tHandle) return false;

  return edges?.some((e: any) => {
    const eh =
      ((e as any).targetHandleId as string | null | undefined) ??
      ((e as any).targetHandle as string | null | undefined);
    const eTargetHandle = eh ?? undefined;
    return e.type === 'ptb-io' && e.target === tgt && eTargetHandle === tHandle;
  });
}

/** Flow: allow only next -> prev (by handle ids). */
export function isFlowDirectionOK(c: Connection) {
  const sh = getSourceHandle(c);
  const th = getTargetHandle(c);
  const sp = parseHandleTypeSuffix(sh).baseId;
  const tp = parseHandleTypeSuffix(th).baseId;
  return sp === 'next' && tp === 'prev';
}

export const isSelfEdge = (c: Connection) => c.source === c.target;

export { getSourceHandle, getTargetHandle };
