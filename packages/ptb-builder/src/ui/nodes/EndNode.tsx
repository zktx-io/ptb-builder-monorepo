// src/ui/nodes/EndNode.tsx
import React, { memo } from 'react';

import type { Node, NodeProps } from '@xyflow/react';

import { PTBHandleFlow } from '../handles/PTBHandleFlow';

export type EndData = { label?: string };
export type EndRFNode = Node<EndData, 'ptb-end'>;

export const EndNode = memo(function EndNode({ data }: NodeProps<EndRFNode>) {
  return (
    <div className="ptb-node--command">
      <div className="ptb-node-shell rounded-full w-[140px] py-2 px-2 border-2 shadow">
        <p className="text-base text-center text-gray-700 dark:text-gray-300">
          {data?.label ?? 'End'}
        </p>
        <PTBHandleFlow type="target" />
      </div>
    </div>
  );
});

export default EndNode;
