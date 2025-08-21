// src/ui/nodes/handles/handleUtils.ts
import type { Connection } from '@xyflow/react';

import type { Port, PTBType } from '../../ptb/graph/types';

/** Strip optional ":type" suffix from a handle id. */
export const baseHandleId = (h: string | null | undefined) =>
  String(h ?? '').split(':')[0];

/** Quick guards for connections */
export const hasConcreteEnds = (c: Connection) =>
  Boolean(c.source && c.target && c.sourceHandle && c.targetHandle);

export const isSameNode = (c: Connection) => c.source === c.target;

/** Resolve a PTB port's type from RF store nodes */
export function findPortTypeFromStore(
  nodes: any[],
  nodeId: string | null | undefined,
  handleIdStr: string | null | undefined,
): PTBType | undefined {
  if (!nodeId || !handleIdStr) return undefined;
  const rfNode = nodes.find((n) => n.id === nodeId);
  const ptbNode = rfNode?.data?.ptbNode;
  if (!ptbNode?.ports) return undefined;

  const hid = baseHandleId(handleIdStr);
  const p: Port | undefined = ptbNode.ports.find((pp: Port) => pp.id === hid);
  return p?.dataType;
}

/** IO: true if the exact target handle is already occupied by another IO edge */
export function isIOTargetBusy(edges: any[], c: Connection) {
  return edges?.some(
    (e: any) =>
      e.type === 'ptb-io' &&
      e.target === c.target &&
      e.targetHandle === c.targetHandle,
  );
}

/** Flow: enforce next -> prev only */
export function isFlowDirectionOK(c: Connection) {
  const sh = baseHandleId((c as any).sourceHandle);
  const th = baseHandleId((c as any).targetHandle);
  return sh === 'next' && th === 'prev';
}
