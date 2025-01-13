import React from 'react';

import { Handle, Position } from '@xyflow/react';

import { IconTriangle } from '../../../components';
import { HandleStyles, LabelStyle } from '../styles';
import { isValidHandleType, NumericTypes, TYPE_VECTOR } from '../types';

export const PtbHandleVector = ({
  label,
  tootlip,
  name,
  typeHandle,
  typeParams,
  style,
}: {
  label?: string;
  tootlip?: string;
  name: string;
  typeHandle: 'source' | 'target';
  typeParams: TYPE_VECTOR;
  style?: Record<string, string>;
}) => {
  return (
    <Handle
      type={typeHandle}
      title={tootlip}
      position={typeHandle === 'source' ? Position.Right : Position.Left}
      id={`${name}:${typeParams}`}
      className={`flex items-center w-3 h-3 ${NumericTypes.has(typeParams.match(/(?<=vector<)([^>]+)(?=>)/)![0]) ? HandleStyles.number.background : (HandleStyles as any)[typeParams.match(/(?<=vector<)([^>]+)(?=>)/)![0]].background}`}
      style={{
        ...style,
        backgroundColor: 'transparent',
        padding: 0,
        justifyContent: typeHandle === 'source' ? 'flex-end' : 'flex-start',
      }}
      isValidConnection={(connection: any) =>
        isValidHandleType(
          connection,
          typeParams,
          typeHandle === 'source' ? 'targetHandle' : 'sourceHandle',
        )
      }
    >
      <div
        className="flex items-center gap-2"
        style={{
          flexDirection: typeHandle === 'source' ? 'row' : 'row-reverse',
          pointerEvents: 'none',
          position: 'relative',
          left: typeHandle === 'source' ? '' : '-2px',
          right: typeHandle === 'source' ? '-2px' : '',
        }}
      >
        {label && (
          <label
            title={tootlip}
            className={LabelStyle}
            style={{ fontSize: '0.6rem', pointerEvents: 'auto' }}
          >
            {label}
          </label>
        )}
        <IconTriangle
          color={
            NumericTypes.has(typeParams.match(/(?<=vector<)([^>]+)(?=>)/)![0])
              ? HandleStyles.number.borderB
              : (HandleStyles as any)[
                  typeParams.match(/(?<=vector<)([^>]+)(?=>)/)![0]
                ].borderB
          }
        />
      </div>
    </Handle>
  );
};
