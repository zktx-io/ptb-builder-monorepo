import React from 'react';

import { BaseEdge, EdgeProps, getBezierPath } from '@xyflow/react';

import { useStateContext } from '../../provider';
import { HandleStyles } from '../nodes/styles';

export const Path = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
}: EdgeProps) => {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const { colorMode, hasPath } = useStateContext();
  const getColor = (): string => {
    return HandleStyles.process.border;
  };

  const glowColor =
    colorMode === 'dark' ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)';

  return (
    <>
      <style>{`
        @keyframes dash {
          to {
            stroke-dashoffset: -50;
          }
        }
      `}</style>
      <BaseEdge
        id={id}
        path={edgePath}
        className={getColor()}
        style={{
          strokeWidth: 4,
          stroke: `${getColor()}`,
          strokeDasharray: '5,5',
          filter: selected ? `drop-shadow(0 0 5px ${glowColor})` : 'none',
          animation: hasPath ? 'dash 2s linear infinite' : 'none',
        }}
      />
    </>
  );
};
