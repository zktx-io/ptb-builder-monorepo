import React from 'react';

import { BaseEdge, EdgeProps, getBezierPath } from '@xyflow/react';

import { useStateContext } from '../../provider';
import { HandleStyles } from '../nodes/styles';
import { NumericTypes } from '../nodes/types';

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
  const { colorMode } = useStateContext();

  const [edgePath] = getBezierPath({
    sourceX: sourceX - 5,
    sourceY,
    sourcePosition,
    targetX: targetX + 5,
    targetY,
    targetPosition,
  });

  const getColor = (type: string): string => {
    const match = type.match(/^vector<([^>]+)>$|^([^[]+)\[\]$|^([^[]+)$/);
    if (match) {
      const kind = match[1] || match[2] || match[3];
      return (HandleStyles as any)[NumericTypes.has(kind) ? 'number' : kind]
        .border;
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
