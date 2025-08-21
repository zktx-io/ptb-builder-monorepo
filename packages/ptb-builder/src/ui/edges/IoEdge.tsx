// IO edge renderer that colors the path by IO category.
// - Handle parsing is done via src/ui/edges/utils.ts
// - Category decision is centralized in ptb/graph/typecheck.ts (ioCategoryOfSerialized)

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

  // v11 (sourceHandle/targetHandle) and v12 (sourceHandleId/targetHandleId)
  const srcH =
    (props as any).sourceHandleId ??
    ((props as any).sourceHandle as string | null | undefined);
  const tgtH =
    (props as any).targetHandleId ??
    ((props as any).targetHandle as string | null | undefined);

  // Prefer source handle's type; fall back to target; finally edge.data.dataType
  const serializedType =
    typeOf(srcH) ??
    typeOf(tgtH) ??
    ((props.data as any)?.dataType as string | undefined);

  const cat = ioCategoryOfSerialized(serializedType);

  return (
    <BaseEdge
      id={id}
      path={d}
      className={`ptb-io-edge ptb-io-edge--${cat}${selected ? ' is-selected' : ''}`}
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
