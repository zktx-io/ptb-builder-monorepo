// src/ui/handles/PTBHandleIO.tsx

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
import {
  ioCategoryOf,
  ioCategoryOfSerialized,
  isTypeCompatible,
  isVectorSerialized,
} from '../../ptb/graph/typecheck';
import { buildHandleId, serializePTBType } from '../../ptb/graph/types';
import type { Port, PTBType } from '../../ptb/graph/types';

/** Strict check: true only for PTB vector<T> */
function isVectorType(t?: PTBType): boolean {
  return !!t && t.kind === 'vector';
}

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

  // Stable RF handle id (may include ":type" suffix for IO)
  const handleId = useMemo(() => buildHandleId(port), [port]);

  // Serialized hint is for badges/debug only (never primary truth)
  const serializedHint = useMemo(
    () =>
      port.typeStr ??
      (port.dataType ? serializePTBType(port.dataType) : undefined),
    [port.typeStr, port.dataType],
  );

  // Category coloring: prefer structured type; fallback to serialized
  const category = useMemo(() => {
    const c = ioCategoryOf(port.dataType);
    return c !== 'unknown' ? c : ioCategoryOfSerialized(serializedHint);
  }, [serializedHint, port.dataType]);

  // Vector-only vector glyph: strict vector check, with serialized fallback
  const isVector =
    isVectorType(port.dataType) || isVectorSerialized(serializedHint);

  // Connection validation via structured types from the store
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
        isVector ? 'ptb-handle--vector' : 'ptb-handle--scalar',
        `ptb-handle--${category}`,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        width: 12,
        height: 12,
        overflow: 'visible',
        color: `var(${colorVarName}, var(--ptb-io-unknown-stroke))`,
        ...(isVector
          ? {}
          : {
              background: `var(${colorVarName}, var(--ptb-io-unknown-stroke))`,
              borderColor: `var(${colorVarName}, var(--ptb-io-unknown-stroke))`,
            }),
        ...(style || {}),
      }}
      isValidConnection={isValidConnection}
    >
      {isVector && (
        <span
          className="ptb-handle-glyph ptb-handle-glyph--vector"
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
