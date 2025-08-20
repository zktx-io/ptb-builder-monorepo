// src/ui/nodes/vars/VarNode.tsx
import React from 'react';

import { type Node, type NodeProps, Position } from '@xyflow/react';

import { PTBHandleIO } from '../../handles/PTBHandleIo';

export type VarData = {
  label?: string;
  type?: 'number' | 'string' | 'bool' | 'address' | 'object' | 'unknown';
};
export type VarRFNode = Node<VarData, 'ptb-var'>;

export function VarNode({ data }: NodeProps<VarRFNode>) {
  const category = data?.type ?? 'unknown';

  return (
    <div className={`ptb-node--${category}`}>
      <div
        className="ptb-node-shell rounded-lg w-[200px] py-2 px-2 border-2 shadow"
        style={{
          borderColor: `var(--ptb-node-${category}-border)`,
          background: `var(--ptb-node-${category}-bg)`,
        }}
      >
        <p className="text-sm text-center text-gray-800 dark:text-gray-200">
          {data?.label ?? 'variable'}
        </p>
        <PTBHandleIO
          port={{ id: 'out_0', role: 'io', direction: 'out' }}
          position={Position.Right}
        />
      </div>
    </div>
  );
}
