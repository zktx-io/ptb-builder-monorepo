import React from 'react';

import { Handle, Position } from '@xyflow/react';

import { LabelStyle } from '../styles';

export const PtbHandleNA = ({
  label,
  tootlip,
  name,
  typeHandle,
  style,
}: {
  label?: string;
  tootlip?: string;
  name: string;
  typeHandle: 'source' | 'target';
  style?: Record<string, string>;
}) => {
  return (
    <Handle
      type={typeHandle}
      title={tootlip}
      position={typeHandle === 'source' ? Position.Right : Position.Left}
      id={`${name}:${label}`}
      className={`flex items-center w-3 h-3`}
      style={{
        ...style,
        backgroundColor: 'transparent',
        padding: 0,
        pointerEvents: 'auto',
        justifyContent: typeHandle === 'source' ? 'flex-end' : 'flex-start',
      }}
      isValidConnection={() => false}
    >
      {label ? (
        <div
          className="flex items-center gap-2"
          style={{
            flexDirection: typeHandle === 'source' ? 'row' : 'row-reverse',
            pointerEvents: 'none',
          }}
        >
          <label
            className={LabelStyle}
            style={{ fontSize: '0.6rem', pointerEvents: 'none' }}
          >
            {label}
          </label>
          <div
            className="inline-block w-4 h-3 bg-stone-200 dark:bg-stone-700"
            style={{
              borderRadius: '0%',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <span
              className="text-base text-gray-600 dark:text-gray-400"
              style={{
                fontSize: '8px',
                pointerEvents: 'none',
              }}
            >
              {'N/A'}
            </span>
          </div>
        </div>
      ) : (
        <div
          className="inline-block w-4 h-3 bg-stone-200 dark:bg-stone-700"
          style={{
            borderRadius: '0%',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <span
            className="text-base text-gray-600 dark:text-gray-400"
            style={{
              fontSize: '8px',
              pointerEvents: 'none',
            }}
          >
            {'N/A'}
          </span>
        </div>
      )}
    </Handle>
  );
};
