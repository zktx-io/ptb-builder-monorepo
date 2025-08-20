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
  cardinalityOfSerialized,
  ioCategoryOf,
  ioCategoryOfSerialized,
  isTypeCompatible,
} from '../../ptb/graph/typecheck';
import { serializePTBType } from '../../ptb/graph/types';
import type { Port, PTBType } from '../../ptb/graph/types';

/** Drop optional ":type" suffix to recover port id only. */
const base = (h: string | null | undefined) => String(h ?? '').split(':')[0];

export function PTBHandleIO({
  port,
  position,
  className,
  style,
  ...rest
}: Omit<HandleProps, 'type' | 'position' | 'id'> & {
  /** Port must be role: 'io' */
  port: Port;
  position: Position;
}) {
  // Access RF store for live validation preview
  const nodes = useStore(
    (s: any) => (s.getNodes ? s.getNodes() : s.nodes) as any[],
  );
  const edges = useStore((s: any) => s.edges as any[]);

  // Prefer a serialized type hint if provided by the port (e.g., "address[]"),
  // otherwise fall back to the structured PTBType serialization.
  const serializedHint: string | undefined =
    (port as any).typeStr ??
    (port.dataType ? serializePTBType(port.dataType) : undefined);

  // Shape: try serialized-first (can detect [] = array), else structured (vector/single)
  const shape =
    cardinalityOfSerialized(serializedHint) || cardinalityOf(port.dataType);

  // Color category: also prefer serialized (keeps edge/node color logic consistent)
  const category =
    ioCategoryOfSerialized(serializedHint) || ioCategoryOf(port.dataType);

  // Helpers that accept nullable ids from RF and normalize them
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

    const src = c.source ?? undefined;
    const tgt = c.target ?? undefined;
    if (!src || !tgt) return false;

    if (port.direction === 'in') {
      // target handle accepts only 1 incoming edge
      const targetBusy = edges?.some(
        (e) => e.target === c.target && e.targetHandle === c.targetHandle,
      );
      if (targetBusy) return false;

      // live type preview
      const srcT = findPortType(c.source, c.sourceHandle);
      const dstT = findPortType(c.target, c.targetHandle);
      if (srcT && dstT) return isTypeCompatible(srcT, dstT);
      return true;
    }

    // source can fan-out; still preview types if available
    const srcT = findPortType(c.source, c.sourceHandle);
    const dstT = findPortType(c.target, c.targetHandle);
    if (srcT && dstT) return isTypeCompatible(srcT, dstT);
    return true;
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
        // attach exactly one shape class
        `ptb-handle--${shape}`, // 'single' | 'vector' | 'array'
        // attach color category class
        `ptb-handle--${category}`, // 'number' | 'string' | ...
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
