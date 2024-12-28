import React from 'react';

import { Handle, Position } from '@xyflow/react';

import { IconSquare } from '../../../components';
import { HandleStyles } from '../styles';
import { isValidHandleType, NumericTypes, TYPE_ARRAY } from '../types';

export const PtbHandleArray = ({
  typeHandle,
  typeParams,
  name,
  style,
}: {
  typeHandle: 'source' | 'target';
  typeParams: TYPE_ARRAY | 'number[]';
  name: string;
  style?: Record<string, string>;
}) => {
  return (
    <Handle
      type={typeHandle}
      position={typeHandle === 'source' ? Position.Right : Position.Left}
      id={`${name}:${typeParams}`}
      className={`flex items-center justify-center w-3 h-3 ${NumericTypes.has(typeParams.replace('[]', '')) ? HandleStyles.number.background : (HandleStyles as any)[typeParams.replace('[]', '')].background}`}
      style={{ backgroundColor: 'transparent', ...style, padding: 0 }}
      isValidConnection={(connection: any) =>
        isValidHandleType(
          connection,
          typeParams,
          typeHandle === 'source' ? 'targetHandle' : 'sourceHandle',
        )
      }
    >
      <IconSquare
        color={
          NumericTypes.has(typeParams.replace('[]', ''))
            ? HandleStyles.number.background
            : (HandleStyles as any)[typeParams.replace('[]', '')].background
        }
      />
    </Handle>
  );
};
