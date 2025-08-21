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

import {
  findPortTypeFromStore,
  hasConcreteEnds,
  isIOTargetBusy,
} from './handleUtils';
import { buildHandleId } from '../../ptb/graph/helpers';
import {
  cardinalityOf,
  cardinalityOfSerialized,
  ioCategoryOf,
  ioCategoryOfSerialized,
  isTypeCompatible,
} from '../../ptb/graph/typecheck';
import { serializePTBType } from '../../ptb/graph/types';
import type { Port } from '../../ptb/graph/types';

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

  const isValidConnection: IsValidConnection = (edgeOrConn) => {
    const c = edgeOrConn as Connection;

    // 0) require concrete ends
    if (!hasConcreteEnds(c)) return false;

    // 1) single-target-handle rule
    if (isIOTargetBusy(edges, c)) return false;

    // 2) both end types must resolve
    const srcT = findPortTypeFromStore(nodes, c.source!, c.sourceHandle as any);
    const dstT = findPortTypeFromStore(nodes, c.target!, c.targetHandle as any);
    if (!srcT || !dstT) return false;

    // 3) final compatibility
    return isTypeCompatible(srcT, dstT);
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
        `ptb-handle--${shape}`,
        `ptb-handle--${category}`,
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
            marginLeft: isLeft ? labelGap : undefined,
            marginRight: !isLeft ? labelGap : undefined,
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
