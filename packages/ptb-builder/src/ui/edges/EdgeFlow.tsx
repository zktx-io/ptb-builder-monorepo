// src/ui/edges/EdgeFlow.tsx

/**
 * Flow edge renderer
 * - Memoizes Bezier path to avoid unnecessary recalculation.
 * - Wide interactionWidth improves hit testing.
 * - Styling driven by CSS classes (selected state appended).
 */

import React, { memo, useMemo } from 'react';

import { BaseEdge, type EdgeProps, getBezierPath } from '@xyflow/react';

export const EdgeFlow = memo(function EdgeFlow(props: EdgeProps) {
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

export default EdgeFlow;
