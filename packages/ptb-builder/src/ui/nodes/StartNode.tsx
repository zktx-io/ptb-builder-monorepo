// src/ui/nodes/StartNode.tsx
import { memo } from 'react';

import type { Node, NodeProps } from '@xyflow/react';
import type { TransactionDiagnostic } from '@zktx.io/ptb-model';

import { EditorDiagnosticBadge } from '../EditorDiagnosticBadge';
import { NODE_SIZES } from './nodeLayout';
import type { PTBNode } from '../../ptb/graph/types';
import { PTBHandleFlow } from '../handles/PTBHandleFlow';

export type StartData = {
  label?: string;
  ptbNode?: PTBNode;
  editorDiagnostics?: readonly TransactionDiagnostic[];
};
export type StartRFNode = Node<StartData, 'ptb-start'>;

export const StartNode = memo(function StartNode({
  data,
}: NodeProps<StartRFNode>) {
  return (
    <div className="ptb-node--command">
      <div
        className={[
          'ptb-node-shell rounded-full py-2 px-2 border-2 shadow',
          data?.editorDiagnostics?.length ? 'has-editor-diagnostics' : '',
        ].join(' ')}
        style={{ width: NODE_SIZES.Start.width }}
      >
        <div className="flex items-center justify-center gap-1 text-base text-center text-gray-700 dark:text-gray-300">
          <span>{(data?.label ?? '').trim() || 'Start'}</span>
          <EditorDiagnosticBadge diagnostics={data?.editorDiagnostics} />
        </div>
        <PTBHandleFlow type="source" />
      </div>
    </div>
  );
});

export default StartNode;
