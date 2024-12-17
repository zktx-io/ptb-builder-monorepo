import React from 'react';

import { Handle, Position } from '@xyflow/react';

import { IconTriangle } from '../../../components';
import { isSourceType, isTargetType } from '../isType';
import { HandleStyles } from '../styles';
import { NumericTypes, TYPE_VECTOR } from '../types';

export const PtbHandleVector = ({
  typeHandle,
  typeParams,
  name,
  style,
}: {
  typeHandle: 'source' | 'target';
  typeParams: TYPE_VECTOR;
  name: string;
  style?: { [key: string]: string };
}) => {
  return (
    <Handle
      type={typeHandle}
      position={typeHandle === 'source' ? Position.Right : Position.Left}
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