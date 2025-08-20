// src/ui/handles/PTBHandleIO.tsx
import React from 'react';

import {
  type Connection,
  Handle,
  type HandleProps,
  type IsValidConnection,
  Position,
  useStore,
} from '@xyflow/react';

import {
  cardinalityOf,
  ioCategoryOf,
  isTypeCompatible,
} from '../../ptb/graph/typecheck';
import type { Port, PTBType } from '../../ptb/graph/types';

/** Strip optional ":type" suffix from a handle id. */
const base = (h: string | null | undefined) => String(h ?? '').split(':')[0];

export function PTBHandleIO({
  port,
  position,
  className,
  style,
  ...rest
}: Omit<HandleProps, 'type' | 'position' | 'id'> & {
  port: Port; // role: 'io', direction: 'in' | 'out'
  position: Position;
}) {
  // Pull nodes/edges from store
  const nodes = useStore(
    (s: any) => (s.getNodes ? s.getNodes() : s.nodes) as any[],
  );
  const edges = useStore((s: any) => s.edges as any[]);

  const card = cardinalityOf(port.dataType);
  const cat = ioCategoryOf(port.dataType);

  // Helpers that accept nullable ids from React Flow and normalize them
  const findNode = (id: string | null | undefined) =>
    id ? nodes.find((n) => n.id === id) : undefined;

  const findPortType = (
    nodeId: string | null | undefined,
    handleId: string | null | undefined,
  ): PTBType | undefined => {
    const node = findNode(nodeId);
    const hid = base(handleId);
    const ptbNode = node?.data?.ptbNode;
    if (!ptbNode?.ports) return undefined;
    const p: Port | undefined = ptbNode.ports.find((pp: Port) => pp.id === hid);
    return p?.dataType;
  };

  const isValidConnection: IsValidConnection = (edgeOrConn) => {
    const c = edgeOrConn as Connection;

    // Normalize null → undefined for the basic presence checks
    const src = c.source ?? undefined;
    const tgt = c.target ?? undefined;
    if (!src || !tgt) return false;

    if (port.direction === 'in') {
      // Enforce at most one incoming edge to the target handle
      const targetBusy = edges?.some(
        (e) => e.target === c.target && e.targetHandle === c.targetHandle,
      );
      if (targetBusy) return false;

      // Live type preview when both ends are known
      const srcT = findPortType(c.source, c.sourceHandle);
      const dstT = findPortType(c.target, c.targetHandle);
      if (srcT && dstT) return isTypeCompatible(srcT, dstT);
      return true; // allow preview to continue; final check on edge add
    } else {
      // This handle is a source; fan-out allowed, still preview types if available
      const srcT = findPortType(c.source, c.sourceHandle);
      const dstT = findPortType(c.target, c.targetHandle);
      if (srcT && dstT) return isTypeCompatible(srcT, dstT);
      return true;
    }
  };

  return (
    <Handle
      {...rest}
      id={port.id}
      type={port.direction === 'in' ? 'target' : 'source'}
      position={position}
      className={[
        'ptb-handle',
        'ptb-handle--io',
        `ptb-handle--${port.direction === 'in' ? 'in' : 'out'}`,
        `ptb-handle--${card}`,
        `ptb-handle--${cat}`,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ width: 12, height: 12, ...style }}
      isValidConnection={isValidConnection}
    />
  );
}

export default React.memo(PTBHandleIO);
