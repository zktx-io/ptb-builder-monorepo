import { memo, useMemo } from 'react';

import { BaseEdge, type EdgeProps, getBezierPath } from '@xyflow/react';

export const EdgeType = memo(function EdgeType(props: EdgeProps) {
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
      className={['ptb-type-edge', selected ? 'is-selected' : ''].join(' ')}
      interactionWidth={18}
      style={{
        fill: 'none',
        vectorEffect: 'non-scaling-stroke',
        cursor: 'pointer',
      }}
      aria-label="type-edge"
      data-edge-id={id}
    />
  );
});

export default EdgeType;
