// src/ui/nodes/vars/VarNode.tsx
import React, { useMemo } from 'react';

import { type Node, type NodeProps, Position } from '@xyflow/react';

import { ioCategoryOf, isVector } from '../../../ptb/graph/typecheck';
import type { IOCategory } from '../../../ptb/graph/typecheck';
import type { PTBNode } from '../../../ptb/graph/types';
import { PTBHandleIO } from '../../handles/PTBHandleIo';

export type VarData = {
  label?: string;
  ptbNode?: PTBNode; // full PTB node is stored here
};

export type VarRFNode = Node<VarData, 'ptb-var'>;

export function VarNode({ data }: NodeProps<VarRFNode>) {
  const category = useMemo<IOCategory>(() => {
    const varType = data?.ptbNode && (data.ptbNode as any).varType;
    if (varType) {
      if (isVector(varType)) return ioCategoryOf(varType.elem);
      return ioCategoryOf(varType);
    }
    return 'unknown';
  }, [data?.ptbNode]);

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
