import React from 'react';

import { Handle, Position } from '@xyflow/react';

import { IconTriangle } from '../../../Components/IconTriangle';
import {
  isSourceType,
  isTargetType,
  NumericTypes,
  TYPE_VECTOR,
} from '../isType';
import { HandleStyles } from '../styles';

export const PtbHandleVector = ({
  typeHandle,
  typeParams,
  name,
  node,
  style,
}: {
  typeHandle: 'source' | 'target';
  typeParams: TYPE_VECTOR;
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
      className={`flex items-center justify-center w-0 h-0 ${NumericTypes.has(typeParams.match(/(?<=vector<)([^>]+)(?=>)/)![0]) ? HandleStyles.number.background : (HandleStyles as any)[typeParams.match(/(?<=vector<)([^>]+)(?=>)/)![0]].background}`}
      style={{ backgroundColor: 'transparent', ...style, padding: 0 }}
      isValidConnection={(connection: any) =>
        typeHandle === 'source'
          ? isTargetType(connection, typeParams)
          : isSourceType(connection, typeParams)
      }
    >
      <IconTriangle
        color={
          NumericTypes.has(typeParams.match(/(?<=vector<)([^>]+)(?=>)/)![0])
            ? HandleStyles.number.borderB
            : (HandleStyles as any)[
                typeParams.match(/(?<=vector<)([^>]+)(?=>)/)![0]
              ].borderB
        }
      />
    </Handle>
  );
};
