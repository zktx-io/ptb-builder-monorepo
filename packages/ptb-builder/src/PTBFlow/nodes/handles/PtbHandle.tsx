import React from 'react';

import { Handle, Position } from '@xyflow/react';

import { IconCircle } from '../../../Components/IconCircle';
import { isSourceType, isTargetType } from '../isType';
import { HandleStyles } from '../styles';
import { NumericTypes, TYPE_PARAMS } from '../types';

export const PtbHandle = ({
  typeHandle,
  typeParams,
  name,
  style,
}: {
  typeHandle: 'source' | 'target';
  typeParams: TYPE_PARAMS;
  name: string;
  style?: { [key: string]: string };
}) => {
  return (
    <Handle
      type={typeHandle}
      position={typeHandle === 'source' ? Position.Right : Position.Left}
      id={`${name}:${typeParams}`}
      className={`flex items-center justify-center w-3 h-3 ${NumericTypes.has(typeParams) ? HandleStyles.number.background : (HandleStyles as any)[typeParams].background}`}
      style={{ backgroundColor: 'transparent', ...style, padding: 0 }}
      isValidConnection={(connection: any) =>
        typeHandle === 'source'
          ? isTargetType(connection, typeParams)
          : isSourceType(connection, typeParams)
      }
    >
      <IconCircle
        color={
          NumericTypes.has(typeParams)
            ? HandleStyles.number.background
            : (HandleStyles as any)[typeParams].background
        }
      />
    </Handle>
  );
};
