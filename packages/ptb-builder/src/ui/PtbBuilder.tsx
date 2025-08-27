// Public component that consumers will use.
// Wraps PtbProvider and renders PTBFlow.

import React from 'react';

import { ReactFlowProvider } from '@xyflow/react';

import { PTBFlow } from './PtbFlow';
import { PtbProvider, type PtbProviderProps } from './PtbProvider';

export type PTBBuilderProps = PtbProviderProps & {
  // Extend if you need extra UI toggles/options publicly
};

export function PTBBuilder({ children, ...props }: PTBBuilderProps) {
  return (
    <ReactFlowProvider>
      <PtbProvider {...props}>
        <PTBFlow />
        {children}
      </PtbProvider>
    </ReactFlowProvider>
  );
}
