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

const base = (h: string | null | undefined) => String(h ?? '').split(':')[0];

type PTBHandleIOProps = Omit<HandleProps, 'type' | 'position' | 'id'> & {
  port: Port;
  position: Position;
  label?: string;
  labelGap?: number; // px
};

export function PTBHandleIO({
  port,
  position,
  className,
  style,
  label,
  labelGap = 8,
  ...rest
}: PTBHandleIOProps) {
  const nodes = useStore(
    (s: any) => (s.getNodes ? s.getNodes() : s.nodes) as any[],
  );
  const edges = useStore((s: any) => s.edges as any[]);

  const handleId = useMemo(() => buildHandleId(port), [port]);

  const serializedHint = useMemo(
    () =>
      (port as any).typeStr ??
      (port.dataType ? serializePTBType(port.dataType) : undefined),
    [port],
  );

  const shape = useMemo(
    () =>
      cardinalityOfSerialized(serializedHint) || cardinalityOf(port.dataType),
    [serializedHint, port],
  );

  const category = useMemo(
    () => ioCategoryOfSerialized(serializedHint) || ioCategoryOf(port.dataType),
    [serializedHint, port],
  );

  const colorVar =
    category && category !== 'unknown'
      ? `--ptb-io-${category}-stroke`
      : undefined;

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

  const isLeft = position === Position.Left;
  const isVector = shape === 'vector';
  const isArray = shape === 'array';

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
        `ptb-handle--${shape}`, // single | array | vector
        `ptb-handle--${category}`, // number | string | object | ...
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        width: 12,
        height: 12,
        overflow: 'visible',
        ...(style || {}),
        ...(colorVar
          ? {
              color: `var(${colorVar})`,
              ...(isVector || isArray
                ? {}
                : {
                    background: `var(${colorVar})`,
                    borderColor: `var(${colorVar})`,
                  }),
            }
          : {}),
      }}
      isValidConnection={isValidConnection}
    >
      {isVector && (
        <span className="ptb-handle-glyph ptb-handle-glyph--vector" />
      )}
      {isArray && <span className="ptb-handle-glyph ptb-handle-glyph--array" />}
      {label ? (
        <div
          className={`ptb-handle-label absolute ${isLeft ? 'ptb-handle-label--left' : 'ptb-handle-label--right'}`}
          style={{
            top: '50%',
            transform: 'translateY(-50%)',
            pointerEvents: 'none',
            fontSize: 11,
            lineHeight: 1,
            whiteSpace: 'nowrap',
          }}
          data-ptb-handle-label={port.id}
        >
          {label}
        </div>
      ) : (
        <></>
      )}
    </Handle>
  );
}

export default React.memo(PTBHandleIO);
