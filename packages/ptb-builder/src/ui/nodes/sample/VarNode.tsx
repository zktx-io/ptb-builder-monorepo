// src/ui/nodes/vars/VarNode.tsx
import React from 'react';

import { type Node, type NodeProps, Position } from '@xyflow/react';

import {
  ioCategoryWithCardinality,
  isVector,
} from '../../../ptb/graph/typecheck';
import type { PTBNode, VariableNode } from '../../../ptb/graph/types';
import { serializePTBType } from '../../../ptb/graph/types';
import { PTBHandleIO } from '../../handles/PTBHandleIO';

export type VarData = {
  label?: string;
  ptbNode?: PTBNode;
};
export type VarRFNode = Node<VarData, 'ptb-var'>;

export function VarNode({ data }: NodeProps<VarRFNode>) {
  const v = data?.ptbNode as VariableNode | undefined;
  const { category } = ioCategoryWithCardinality(v?.varType);

  let typeStrHint: string | undefined;
  if (v?.varType && isVector(v.varType)) {
    const elemStr = serializePTBType(v.varType.elem);
    typeStrHint = (v.label ?? data?.label)?.trim().endsWith('[]')
      ? `${elemStr}[]`
      : `vector<${elemStr}>`;
  } else if (v?.varType) {
    typeStrHint = serializePTBType(v.varType);
  }

  return (
    <div className={`ptb-node--${category}`}>
      <div className="ptb-node-shell rounded-lg w-[200px] py-2 px-2 border-2 shadow">
        <p className="text-sm text-center text-gray-800 dark:text-gray-200">
          {data?.label ?? v?.label ?? 'variable'}
        </p>

        <PTBHandleIO
          port={
            {
              id: 'out_0',
              role: 'io',
              direction: 'out',
              dataType: v?.varType,
              ...(typeStrHint ? { typeStr: typeStrHint } : {}),
            } as any
          }
          position={Position.Right}
        />
      </div>
    </div>
  );
}
