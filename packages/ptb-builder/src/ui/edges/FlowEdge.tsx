// src/ui/edges/FlowEdge.tsx
import React, { useMemo } from 'react';

import { BaseEdge, type EdgeProps, getBezierPath } from '@xyflow/react';

/**
 * Flow edge renderer (tuned):
 * - Memoize path to avoid unnecessary recompute on unrelated renders.
 * - Keep interactionWidth large for easy selection.
 * - Use CSS classes for visual states (selected/hover).
 * - Add small a11y/data attrs for debugging and testing.
 */
function FlowEdgeImpl(props: EdgeProps) {
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
        vectorEffect: 'non-scaling-stroke', // keep stroke width consistent on zoom
        cursor: 'pointer',
      }}
      aria-label="flow-edge"
      data-edge-id={id}
    />
  );
}

export const FlowEdge = React.memo(FlowEdgeImpl);
export default FlowEdge;
