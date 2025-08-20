// Public component that consumers will use.
// Wraps PtbProvider and renders PTBFlow.

import React from 'react';

import { ReactFlowProvider } from '@xyflow/react';

import { PTBFlow } from './PtbFlow';
import { PtbProvider, type PtbProviderProps } from './PtbProvider';

export type PTBBuilderProps = Omit<PtbProviderProps, 'children'> & {
  // Extend if you need extra UI toggles/options publicly
};

export function PTBBuilder(props: PTBBuilderProps) {
  return (
    <ReactFlowProvider>
      <PtbProvider {...props}>
        <PTBFlow />
      </PtbProvider>
    </ReactFlowProvider>
  );
}
