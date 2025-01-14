import React from 'react';

import { Handle, Position } from '@xyflow/react';

import { IconCircle } from '../../../icons';
import { HandleStyles, LabelStyle } from '../styles';
import { isValidHandleType, NumericTypes, TYPE_PARAMS } from '../types';

export const PtbHandle = ({
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
  typeParams: TYPE_PARAMS | 'number';
  style?: Record<string, string>;
}) => {
  return (
    <Handle
      type={typeHandle}
      title={tootlip}
      position={typeHandle === 'source' ? Position.Right : Position.Left}
      id={`${name}:${typeParams}`}
      className={`flex items-center w-3 h-3 ${NumericTypes.has(typeParams) ? HandleStyles.number.background : (HandleStyles as any)[typeParams].background}`}
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
        <IconCircle
          color={
            NumericTypes.has(typeParams)
              ? HandleStyles.number.background
              : (HandleStyles as any)[typeParams].background
          }
        />
      </div>
    </Handle>
  );
};
