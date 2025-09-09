// src/ui/handles/handleUtils.ts

import type { Connection } from '@xyflow/react';

import type { Port, PTBType } from '../../ptb/graph/types';
import { parseHandleTypeSuffix } from '../../ptb/graph/types';
import { buildOutPort } from '../nodes/vars/varUtils';

/** Read handle id from v12 (...HandleId) or v11 (...Handle); null-safe. */
export function extractHandles(x: {
  sourceHandleId?: string | null;
  targetHandleId?: string | null;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}): { source?: string; target?: string } {
  const source = (x.sourceHandleId ?? x.sourceHandle ?? undefined) || undefined;
  const target = (x.targetHandleId ?? x.targetHandle ?? undefined) || undefined;
  return { source, target };
}
function getSourceHandle(c: Connection) {
  return extractHandles(c).source;
}
function getTargetHandle(c: Connection) {
  return extractHandles(c).target;
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
  if (!ptbNode) return undefined;

  const { baseId } = parseHandleTypeSuffix(handleIdStr);
  if (!baseId) return undefined;

  // 1) Try declared ports
  const ports: Port[] = Array.isArray(ptbNode.ports) ? ptbNode.ports : [];
  let port = ports.find((pp: Port) => pp.id === baseId);
  if (port?.dataType) return port;

  // 2) Fallback: Variable nodes may not carry a fresh ports array → rebuild.
  if (ptbNode.kind === 'Variable') {
    const rebuilt = buildOutPort(ptbNode as any);
    if (rebuilt.id === baseId) return rebuilt;
  }

  return port;
}

/** IO: true if the exact target handle is already occupied by another IO edge. */
export function isIOTargetBusy(edges: any[], c: Connection) {
  const tgt = c.target;
  const tHandle = getTargetHandle(c);
  if (!tHandle) return false;

  const tBase = parseHandleTypeSuffix(tHandle).baseId;

  return edges?.some((e: any) => {
    if (e.type !== 'ptb-io' || e.target !== tgt) return false;

    const eh =
      ((e as any).targetHandleId as string | null | undefined) ??
      ((e as any).targetHandle as string | null | undefined);
    const eTargetHandle = eh ?? undefined;
    if (!eTargetHandle) return false;

    const eBase = parseHandleTypeSuffix(eTargetHandle).baseId;
    return eBase && tBase && eBase === tBase;
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
