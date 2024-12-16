import React from 'react';

import { BaseEdge, EdgeProps, getBezierPath } from '@xyflow/react';

import { useStateContext } from '../../_provider';
import { HandleStyles } from '../nodes/styles';

export const Data = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  sourceHandleId,
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
  const { colorMode } = useStateContext();
  const getColor = (type: string): string => {
    const match = type.match(/^vector<([^>]+)>$|^([^[]+)\[\]$|^([^[]+)$/);
    if (match) {
      return (HandleStyles as any)[match[1] || match[2] || match[3]].border;
    }
    return '';
  };

  const glowColor =
    colorMode === 'dark' ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)';

  return (
    <>
      <style>{`
        @keyframes dash2 {
          to {
            stroke-dashoffset: 50;
          }
        }
      `}</style>
      <BaseEdge
        id={id}
        path={edgePath}
        className={getColor(sourceHandleId!.split(':')[1].toLowerCase())}
        style={{
          strokeWidth: 3,
          strokeDasharray: selected ? '5,5' : 'none',
          stroke: 'currentColor',
          filter: selected ? `drop-shadow(0 0 5px ${glowColor})` : 'none',
          animation: selected ? 'dash2 2s linear infinite' : 'none',
        }}
      />
    </>
  );
};
