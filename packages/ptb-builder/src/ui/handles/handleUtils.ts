// src/ui/handles/handleUtils.ts

import type { Connection } from '@xyflow/react';

import type { Port, PTBNode } from '../../ptb/graph/types';
import { parseHandleTypeSuffix } from '../../ptb/graph/types';
import { buildOutPort } from '../nodes/vars/varUtils';

export type PortStoreNode = {
  id: string;
  data?: {
    ptbNode?: PTBNode;
  };
};

/** Read handle id from either local edge handle field spelling; null-safe. */
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

/** Resolve a PTB Port object from RF store nodes. */
export function findPortFromStore(
  nodes: readonly PortStoreNode[],
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

/** Flow: allow only next -> prev (by handle ids). */
export function isFlowDirectionOK(c: Connection) {
  const sh = getSourceHandle(c);
  const th = getTargetHandle(c);
  const sp = parseHandleTypeSuffix(sh).baseId;
  const tp = parseHandleTypeSuffix(th).baseId;
  return sp === 'next' && tp === 'prev';
}

export const isSelfEdge = (c: Connection) => c.source === c.target;
