import React from 'react';

import { Handle, Position } from '@xyflow/react';

import { isSourceType, isTargetType } from '../isType';
import { HandleStyles } from '../styles';

export const PtbHandleProcess = ({
  typeHandle,
  style,
}: {
  typeHandle: 'source' | 'target';
  style?: { [key: string]: string };
}) => {
  return (
    <Handle
      type={typeHandle}
      position={typeHandle === 'source' ? Position.Right : Position.Left}
      id={typeHandle === 'source' ? 'src:process' : 'tgt:process'}
      className={HandleStyles.process.background}
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
        typeHandle === 'source'
          ? isTargetType(connection, 'process')
          : isSourceType(connection, 'process')
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
