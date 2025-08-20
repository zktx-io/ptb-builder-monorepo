// src/ui/edges/FlowEdge.tsx
import React from 'react';

import { BaseEdge, type EdgeProps, getBezierPath } from '@xyflow/react';

function FlowEdgeImpl({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
}: EdgeProps) {
  const [d] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

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
    />
  );
}

export const FlowEdge = React.memo(FlowEdgeImpl);
export default FlowEdge;
