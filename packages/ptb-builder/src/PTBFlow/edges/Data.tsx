import React from 'react';

import { BaseEdge, EdgeProps, getBezierPath } from '@xyflow/react';

import { useStateContext } from '../../Provider';
import { HandleStyles } from '../nodes/styles';

const numericTypes = new Set([
  'u8',
  'u16',
  'u32',
  'u64',
  'u128',
  'u256',
  'vector<u8>',
  'vector<u16>',
  'vector<u32>',
  'vector<u64>',
  'vector<u128>',
  'vector<u256>',
]);

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
    if (numericTypes.has(type)) {
      return HandleStyles.number.border;
    }
    return (HandleStyles as any)[type].border;
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
        className={getColor(
          sourceHandleId!.split(':')[1].replace('[]', '').toLowerCase(),
        )}
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
