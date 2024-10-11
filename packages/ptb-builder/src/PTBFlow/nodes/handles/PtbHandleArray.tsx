import React from 'react';

import { Handle, Position } from '@xyflow/react';

import { IconSquare } from '../../../Components/IconSquare';
import {
  isSourceType,
  isTargetType,
  NumericTypes,
  TYPE_ARRAY,
} from '../isType';
import { HandleStyles } from '../styles';

export const PtbHandleArray = ({
  typeHandle,
  typeParams,
  name,
  node,
  style,
}: {
  typeHandle: 'source' | 'target';
  typeParams: TYPE_ARRAY;
  name: string;
  node?: 'inputs' | 'transactions';
  style?: { [key: string]: string };
}) => {
  return (
    <Handle
      type={typeHandle}
      position={
        typeHandle === 'source'
          ? node === 'transactions'
            ? Position.Bottom
            : Position.Right
          : node === 'transactions'
            ? Position.Left
            : Position.Top
      }
      id={`${name}:${typeParams}`}
      className={`flex items-center justify-center w-3 h-3 ${NumericTypes.has(typeParams.replace('[]', '')) ? HandleStyles.number.background : (HandleStyles as any)[typeParams.replace('[]', '')].background}`}
      style={{ backgroundColor: 'transparent', ...style, padding: 0 }}
      isValidConnection={(connection: any) =>
        typeHandle === 'source'
          ? isTargetType(connection, typeParams)
          : isSourceType(connection, typeParams)
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
