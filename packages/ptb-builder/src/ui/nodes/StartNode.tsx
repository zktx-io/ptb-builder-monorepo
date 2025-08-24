import React from 'react';

import type { Node, NodeProps } from '@xyflow/react';

import { PTBHandleFlow } from '../handles/PTBHandleFlow';

export type StartData = { label?: string };
export type StartRFNode = Node<StartData, 'ptb-start'>;

export function StartNode({ data }: NodeProps<StartRFNode>) {
  return (
    <div className="ptb-node--command">
      <div className="ptb-node-shell rounded-full w-[140px] py-2 px-2 border-2 shadow">
        <p className="text-base text-center text-gray-700 dark:text-gray-300">
          {data?.label ?? 'Start'}
        </p>
        <PTBHandleFlow type="source" />
      </div>
    </div>
  );
}
