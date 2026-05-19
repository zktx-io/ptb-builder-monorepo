// src/ui/nodes/EndNode.tsx
import { memo } from 'react';

import type { Node, NodeProps } from '@xyflow/react';
import type { TransactionDiagnostic } from '@zktx.io/ptb-model';

import { EditorDiagnosticBadge } from '../EditorDiagnosticBadge';
import { NODE_SIZES } from './nodeLayout';
import type { PTBNode } from '../../ptb/graph/types';
import { PTBHandleFlow } from '../handles/PTBHandleFlow';

export type EndData = {
  label?: string;
  ptbNode?: PTBNode;
  editorDiagnostics?: readonly TransactionDiagnostic[];
};
export type EndRFNode = Node<EndData, 'ptb-end'>;

export const EndNode = memo(function EndNode({ data }: NodeProps<EndRFNode>) {
  return (
    <div className="ptb-node--command">
      <div
        className={[
          'ptb-node-shell rounded-full py-2 px-2 border-2 shadow',
          data?.editorDiagnostics?.length ? 'has-editor-diagnostics' : '',
        ].join(' ')}
        style={{ width: NODE_SIZES.End.width }}
      >
        <div className="flex items-center justify-center gap-1 text-base text-center text-gray-700 dark:text-gray-300">
          <span>{(data?.label ?? '').trim() || 'End'}</span>
          <EditorDiagnosticBadge diagnostics={data?.editorDiagnostics} />
        </div>
        <PTBHandleFlow type="target" />
      </div>
    </div>
  );
});

export default EndNode;
