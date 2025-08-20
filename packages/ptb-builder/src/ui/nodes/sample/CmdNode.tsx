// CommandNode.tsx
import React from 'react';

import type { Node, NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';

import { PTBHandleFlow } from '../../handles/PTBHandleFlow';

export type CommandData = { label?: string };
export type CommandRFNode = Node<CommandData, 'ptb-cmd'>;

export function CmdNode({ data }: NodeProps<CommandRFNode>) {
  return (
    <div className="ptb-node--command">
      <div
        className="
          ptb-node-shell
          rounded-lg w-[140px] py-2 px-2 border-2 shadow
          border-stone-300 bg-gray-300/60 dark:border-stone-700 dark:bg-gray-800/60
        "
      >
        <p className="text-base text-center text-gray-700 dark:text-gray-300">
          {data?.label ?? 'Command'}
        </p>

        {/* flow handles */}
        <PTBHandleFlow type="source" />
        <PTBHandleFlow type="target" />

        {/* io handles (example) */}
        <Handle type="target" position={Position.Top} id="in_arg0" />
        <Handle type="source" position={Position.Bottom} id="out_result" />
      </div>
    </div>
  );
}
