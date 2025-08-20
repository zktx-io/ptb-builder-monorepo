// src/ui/edges/IoEdge.tsx
// IO edge renderer that colors the path by IO category.
// - Handle parsing is done via src/ui/edges/utils.ts
// - Category decision is centralized in ptb/graph/typecheck.ts
//   (ioCategoryOfSerialized), so we don't duplicate logic here.

import React from 'react';

import { BaseEdge, type EdgeProps, getBezierPath } from '@xyflow/react';

import { typeOf } from './utils';
import { ioCategoryOfSerialized } from '../../ptb/graph/typecheck';

function IoEdgeImpl(props: EdgeProps) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    selected,
  } = props;

  const [d] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  // Support both v11 (sourceHandle/targetHandle) and v12 (sourceHandleId/targetHandleId).
  const srcH = (props as any).sourceHandleId ?? (props as any).sourceHandle;
  const tgtH = (props as any).targetHandleId ?? (props as any).targetHandle;

  // Prefer source handle's type; fall back to target.
  const serializedType = typeOf(srcH) ?? typeOf(tgtH);

  // Decide CSS category token: 'number' | 'string' | 'bool' | 'address' | 'object' | 'unknown'
  const cat = ioCategoryOfSerialized(serializedType);

  return (
    <BaseEdge
      id={id}
      path={d}
      className={`ptb-io-edge--${cat}${selected ? ' is-selected' : ''}`}
      interactionWidth={20}
      style={{
        fill: 'none',
        vectorEffect: 'non-scaling-stroke',
        cursor: 'pointer',
      }}
    />
  );
}

export const IoEdge = React.memo(IoEdgeImpl);
export default IoEdge;
