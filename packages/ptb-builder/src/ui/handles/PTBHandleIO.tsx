// src/ui/nodes/handles/PTBHandleIO.tsx
import React, { useMemo } from 'react';

import {
  type Connection,
  Handle,
  type HandleProps,
  type IsValidConnection,
  Position,
  useStore,
} from '@xyflow/react';

import { buildHandleId } from '../../ptb/graph/helpers';
import {
  cardinalityOf,
  cardinalityOfSerialized,
  ioCategoryOf,
  ioCategoryOfSerialized,
  isTypeCompatible,
} from '../../ptb/graph/typecheck';
import { serializePTBType } from '../../ptb/graph/types';
import type { Port, PTBType } from '../../ptb/graph/types';

// Normalize: drop optional ":type" suffix to recover port id only
const base = (h: string | null | undefined) => String(h ?? '').split(':')[0];

export function PTBHandleIO({
  port,
  position,
  className,
  style,
  ...rest
}: Omit<HandleProps, 'type' | 'position' | 'id'> & {
  port: Port;
  position: Position;
}) {
  const nodes = useStore(
    (s: any) => (s.getNodes ? s.getNodes() : s.nodes) as any[],
  );
  const edges = useStore((s: any) => s.edges as any[]);

  // Handle id includes serialized type suffix
  const handleId = useMemo(() => buildHandleId(port), [port]);

  // Serialized type hint: explicit string, else structured PTBType
  const serializedHint = useMemo(
    () =>
      (port as any).typeStr ??
      (port.dataType ? serializePTBType(port.dataType) : undefined),
    [port],
  );

  // Shape: single | vector | array
  const shape = useMemo(
    () =>
      cardinalityOfSerialized(serializedHint) || cardinalityOf(port.dataType),
    [serializedHint, port],
  );

  // Category: number | string | bool | address | object | unknown
  const category = useMemo(
    () => ioCategoryOfSerialized(serializedHint) || ioCategoryOf(port.dataType),
    [serializedHint, port],
  );

  // Force color injection via CSS var
  const colorVar =
    category && category !== 'unknown'
      ? `--ptb-io-${category}-stroke`
      : undefined;

  // ---- Helpers ----
  const findNode = (id: string | null | undefined) =>
    id ? nodes.find((n) => n.id === id) : undefined;

  const findPortType = (
    nodeId: string | null | undefined,
    handleIdStr: string | null | undefined,
  ): PTBType | undefined => {
    const node = findNode(nodeId);
    const hid = base(handleIdStr);
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
      // Target handles accept only one incoming edge
      const targetBusy = edges?.some(
        (e) => e.target === c.target && e.targetHandle === c.targetHandle,
      );
      if (targetBusy) return false;

      const srcT = findPortType(c.source, c.sourceHandle as any);
      const dstT = findPortType(c.target, c.targetHandle as any);
      if (srcT && dstT) return isTypeCompatible(srcT, dstT);
      return true;
    }

    const srcT = findPortType(c.source, c.sourceHandle as any);
    const dstT = findPortType(c.target, c.targetHandle as any);
    if (srcT && dstT) return isTypeCompatible(srcT, dstT);
    return true;
  };

  return (
    <Handle
      {...rest}
      id={handleId}
      type={port.direction === 'in' ? 'target' : 'source'}
      position={position}
      className={[
        'ptb-handle',
        'ptb-handle--io',
        `ptb-handle--${port.direction === 'in' ? 'in' : 'out'}`,
        `ptb-handle--${shape}`,
        `ptb-handle--${category}`,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        width: 12,
        height: 12,
        ...(style || {}),
        ...(colorVar
          ? { background: `var(${colorVar})`, borderColor: `var(${colorVar})` }
          : {}),
      }}
      isValidConnection={isValidConnection}
    />
  );
}

export default React.memo(PTBHandleIO);
