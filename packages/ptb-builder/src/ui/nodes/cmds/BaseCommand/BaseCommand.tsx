// src/ui/nodes/cmds/BaseCommand/BaseCommand.tsx
import React from 'react';

import type { Node, NodeProps, Position } from '@xyflow/react';
import { Position as RFPos } from '@xyflow/react';

import type { PTBNode } from '../../../../ptb/graph/types';
import { PTBHandleFlow } from '../../../handles/PTBHandleFlow';
import { PTBHandleIO } from '../../../handles/PTBHandleIO';

export type BaseCmdData = {
  label?: string;
  ptbNode?: PTBNode;
};
export type BaseCmdRFNode = Node<BaseCmdData, 'ptb-cmd'>;

export function BaseCommand({ data }: NodeProps<BaseCmdRFNode>) {
  const node = data?.ptbNode as PTBNode | undefined;

  // Trust the node's ports (SSOT from factory/registry)
  const ports = Array.isArray((node as any)?.ports) ? (node as any).ports : [];

  const inIO = ports.filter(
    (p: any) => p.role === 'io' && p.direction === 'in',
  );
  const outIO = ports.filter(
    (p: any) => p.role === 'io' && p.direction === 'out',
  );

  return (
    <div className="ptb-node--command">
      <div className="ptb-node-shell rounded-lg w-[200px] py-2 px-2 border-2 shadow">
        <p className="text-sm text-center text-gray-800 dark:text-gray-200">
          {data?.label ?? (node as any)?.label ?? 'Command'}
        </p>
        {/* flow handles */}
        <PTBHandleFlow type="target" /> {/* prev */}
        <PTBHandleFlow type="source" /> {/* next */}
        {/* IO inputs (left) */}
        {inIO.map((port: any, idx: number) => (
          <PTBHandleIO
            key={port.id}
            port={port}
            position={RFPos.Left as Position}
            style={{ top: 40 + idx * 22 }}
          />
        ))}
        {/* IO outputs (right) */}
        {outIO.map((port: any, idx: number) => (
          <PTBHandleIO
            key={port.id}
            port={port}
            position={RFPos.Right as Position}
            style={{ top: 40 + idx * 22 }}
          />
        ))}
      </div>
    </div>
  );
}

export default React.memo(BaseCommand);
