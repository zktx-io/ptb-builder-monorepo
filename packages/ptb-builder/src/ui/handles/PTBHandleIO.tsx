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
  ioCategoryOf,
  ioCategoryOfSerialized,
  isTypeCompatible,
  uiCardinalityOfSerialized,
} from '../../ptb/graph/typecheck';
import { serializePTBType, uiCardinalityOf } from '../../ptb/graph/types';
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
  labelGap = 1,
  ...rest
}: PTBHandleIOProps) {
  const nodes = useStore(
    (s) =>
      ('getNodes' in s ? (s as any).getNodes() : (s as any).nodes) as any[],
  );
  const edges = useStore((s) => ((s as any).edges as any[]) || []);

  const handleId = useMemo(() => buildHandleId(port), [port]);

  const serializedHint = useMemo(
    () =>
      (port as any).typeStr ??
      (port.dataType ? serializePTBType(port.dataType) : undefined),
    [port],
  );

  const cardinality = useMemo(
    () =>
      uiCardinalityOfSerialized(serializedHint) ||
      uiCardinalityOf(port.dataType),
    [serializedHint, port.dataType],
  );

  const category =
    useMemo(
      () =>
        ioCategoryOfSerialized(serializedHint) ||
        ioCategoryOf(port.dataType) ||
        'unknown',
      [serializedHint, port.dataType],
    ) || 'unknown';

  const isValidConnection: IsValidConnection = (edgeOrConn) => {
    const c = edgeOrConn as Connection;
    if (!hasConcreteEnds(c)) return false;
    if (isIOTargetBusy(edges, c)) return false;

    const srcT = findPortTypeFromStore(nodes, c.source!, c.sourceHandle as any);
    const dstT = findPortTypeFromStore(nodes, c.target!, c.targetHandle as any);
    if (!srcT || !dstT) return false;

    return isTypeCompatible(srcT, dstT);
  };

  const isLeft = position === Position.Left;
  const isMulti = cardinality === 'multi';

  const colorVarName = `--ptb-io-${category}-stroke`;

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
        `ptb-handle--${cardinality}`,
        `ptb-handle--${category}`, // helpful for debugging
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        width: 12,
        height: 12,
        overflow: 'visible',
        color: `var(${colorVarName}, var(--ptb-io-unknown-stroke))`,
        ...(isMulti
          ? {}
          : {
              background: `var(${colorVarName}, var(--ptb-io-unknown-stroke))`,
              borderColor: `var(${colorVarName}, var(--ptb-io-unknown-stroke))`,
            }),
        ...(style || {}),
      }}
      isValidConnection={isValidConnection}
    >
      {isMulti && (
        <span
          className="ptb-handle-glyph ptb-handle-glyph--multi"
          style={{
            background: `var(${colorVarName}, var(--ptb-io-unknown-stroke))`,
          }}
        />
      )}
      {label ? (
        <div
          className={`ptb-handle-label absolute ${isLeft ? 'ptb-handle-label--left' : 'ptb-handle-label--right'} text-xxxs`}
          style={{
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
