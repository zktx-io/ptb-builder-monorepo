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
  labelGap = 8,
  ...rest
}: PTBHandleIOProps) {
  // Store selectors (compatible with RF v11/v12 shapes)
  const nodes = useStore(
    (s) =>
      ('getNodes' in s ? (s as any).getNodes() : (s as any).nodes) as any[],
  );
  const edges = useStore((s) => ((s as any).edges as any[]) || []);

  // Build handle id, optionally suffixed with serialized type (for edge coloring)
  const handleId = useMemo(() => buildHandleId(port), [port]);

  // Prefer explicit typeStr; otherwise serialize structured type
  const serializedHint = useMemo(
    () =>
      (port as any).typeStr ??
      (port.dataType ? serializePTBType(port.dataType) : undefined),
    [port],
  );

  // UI cardinality: 'single' | 'multi'
  const cardinality = useMemo(
    () =>
      uiCardinalityOfSerialized(serializedHint) ||
      uiCardinalityOf(port.dataType),
    [serializedHint, port.dataType],
  );

  // IO category for color grouping
  const category = useMemo(
    () => ioCategoryOfSerialized(serializedHint) || ioCategoryOf(port.dataType),
    [serializedHint, port.dataType],
  );

  const colorVar =
    category && category !== 'unknown'
      ? `--ptb-io-${category}-stroke`
      : undefined;

  // Connection validator (direction-agnostic; checks roles/types via store)
  const isValidConnection: IsValidConnection = (edgeOrConn) => {
    const c = edgeOrConn as Connection;

    // 0) require concrete ends
    if (!hasConcreteEnds(c)) return false;

    // 1) single-target-handle rule for IO edges
    if (isIOTargetBusy(edges, c)) return false;

    // 2) resolve both end types
    const srcT = findPortTypeFromStore(nodes, c.source!, c.sourceHandle as any);
    const dstT = findPortTypeFromStore(nodes, c.target!, c.targetHandle as any);
    if (!srcT || !dstT) return false;

    // 3) final compatibility
    return isTypeCompatible(srcT, dstT);
  };

  const isLeft = position === Position.Left;
  const isMulti = cardinality === 'multi';

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
        `ptb-handle--${cardinality}`, // single | multi
        `ptb-handle--${category}`, // color group
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
              ...(isMulti
                ? {} // multi: diamond glyph paints the fill
                : {
                    background: `var(${colorVar})`,
                    borderColor: `var(${colorVar})`,
                  }),
            }
          : {}),
      }}
      isValidConnection={isValidConnection}
    >
      {isMulti && <span className="ptb-handle-glyph ptb-handle-glyph--multi" />}
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
