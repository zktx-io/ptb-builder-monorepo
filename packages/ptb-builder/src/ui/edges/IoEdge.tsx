import React, { memo, useMemo } from 'react';

import { BaseEdge, type EdgeProps, getBezierPath } from '@xyflow/react';

import { ioCategoryOfSerialized } from '../../ptb/graph/typecheck';
import type { RFEdgeData } from '../../ptb/ptbAdapter';
import { typeOf } from '../utils/handleId';

/**
 * IO edge renderer:
 * - Uses Bezier path for smooth curves
 * - Categorizes edge by serialized type for CSS styling
 * - Memoized to avoid re-render noise
 */
export const IoEdge = memo(function IoEdge(props: EdgeProps) {
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

  const [d] = useMemo(
    () =>
      getBezierPath({
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourcePosition,
        targetPosition,
      }),
    [sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition],
  );

  // v11 (sourceHandle/targetHandle) and v12 (sourceHandleId/targetHandleId)
  const srcH: string | undefined =
    (props as any).sourceHandleId ?? (props as any).sourceHandle;
  const tgtH: string | undefined =
    (props as any).targetHandleId ?? (props as any).targetHandle;

  const edgeData = props.data as RFEdgeData | undefined;

  // Prefer source handle’s type; fallback: target handle → edge.data.dataType
  const serializedType = typeOf(srcH) ?? typeOf(tgtH) ?? edgeData?.dataType;
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
      aria-label="io-edge"
      data-edge-id={id}
    />
  );
});

export default IoEdge;
