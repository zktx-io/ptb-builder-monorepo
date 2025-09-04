// src/ui/edges/FlowEdge.tsx

import React, { memo, useMemo } from 'react';

import { BaseEdge, type EdgeProps, getBezierPath } from '@xyflow/react';

/**
 * Flow edge renderer:
 * - Memoizes path to avoid unnecessary recompute
 * - Wide interactionWidth for easy click/hover
 * - CSS classes control visual states
 */
export const FlowEdge = memo(function FlowEdge(props: EdgeProps) {
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

  return (
    <BaseEdge
      id={id}
      path={d}
      className={`ptb-flow-edge${selected ? ' is-selected' : ''}`}
      interactionWidth={24}
      style={{
        fill: 'none',
        vectorEffect: 'non-scaling-stroke',
        cursor: 'pointer',
      }}
      aria-label="flow-edge"
      data-edge-id={id}
    />
  );
});

export default FlowEdge;
