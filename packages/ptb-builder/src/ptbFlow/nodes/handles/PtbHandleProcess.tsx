import React from 'react';

import { Handle, Position } from '@xyflow/react';

import { HandleStyles } from '../styles';
import { isValidHandleType } from '../types';

export const PtbHandleProcess = ({
  typeHandle,
  style,
}: {
  typeHandle: 'source' | 'target';
  style?: Record<string, string>;
}) => {
  return (
    <Handle
      type={typeHandle}
      position={typeHandle === 'source' ? Position.Right : Position.Left}
      id={typeHandle === 'source' ? 'src:command' : 'tgt:command'}
      className={HandleStyles.command.background}
      style={{
        width: '18px',
        height: '10px',
        borderRadius: '0%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        ...style,
      }}
      isValidConnection={(connection: any) =>
        isValidHandleType(
          connection,
          'command',
          typeHandle === 'source' ? 'targetHandle' : 'sourceHandle',
        )
      }
    >
      <span
        className="text-base text-gray-600 dark:text-gray-400"
        style={{
          content: '',
          position: 'absolute',
          fontSize: '8px',
          pointerEvents: 'none',
        }}
      >
        {typeHandle === 'source' ? 'SRC' : 'TGT'}
      </span>
    </Handle>
  );
};
