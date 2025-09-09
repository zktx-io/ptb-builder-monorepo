// src/ui/PtbBuilder.tsx
// -----------------------------------------------------------------------------
// Public wrapper around internal PtbProvider + PTBFlow.
//
// Goals
// - Keep the *public* surface area tiny for dApp consumers.
// - Expose only a stable hook with a few methods.
// - Hide all rich internal APIs inside the provider/flow layer.
//
// Public Props (PTBBuilderProps)
// - initialTheme   : initial theme (managed by provider afterwards)
// - executeTx      : adapter for executing transactions
// - address        : optional sender for codegen/exec
// - gasBudget      : optional gas budget for tx build
// - toast          : toast adapter; if absent, provider falls back to console
// - onDocChange    : PTBDoc-level autosave callback (heavier than graph diff)
// - docChangeDelay : debounce ms for onDocChange
// - children       : optional React children
//
// Public Hook (usePTB)
// - Exposes ONLY 4 methods: { exportDoc, loadFromDoc, loadFromOnChainTx, setTheme }
//
// Internals
// - Wraps <PtbProvider> + <PTBFlow> with <ReactFlowProvider>.
// - PublicBridge maps internal usePtb() → minimal PublicPTBApi.
// -----------------------------------------------------------------------------

import React, { createContext, useContext, useMemo } from 'react';

import type { Transaction } from '@mysten/sui/transactions';
import { ReactFlowProvider } from '@xyflow/react';

import { PTBFlow } from './PtbFlow';
import { PtbProvider, usePtb } from './PtbProvider';
import type { PTBDoc } from '../ptb/ptbDoc';
import type { Chain, Theme, ToastAdapter } from '../types';

// ---------- Public types ----------

export type PTBBuilderProps = {
  theme?: Theme;
  showExportButton?: boolean;
  executeTx?: (
    chain: Chain,
    tx: Transaction | undefined,
  ) => Promise<{ digest?: string; error?: string }>;
  address?: string;
  gasBudget?: number;
  toast?: ToastAdapter;
  onDocChange?: (doc: PTBDoc) => void;
  docChangeDelay?: number;
  children?: React.ReactNode;
};

export type PublicPTBApi = {
  exportDoc: (opts?: { sender?: string }) => PTBDoc;
  loadFromDoc: (doc: PTBDoc) => void;
  loadFromOnChainTx: (chain: Chain, digest: string) => Promise<void>;
  setTheme: (t: Theme) => void;
};

// ---------- Public context & hook ----------

const PublicPTBContext = createContext<PublicPTBApi | undefined>(undefined);

/** Public hook: minimal, stable API for external consumers. */
export function usePTB(): PublicPTBApi {
  const ctx = useContext(PublicPTBContext);
  if (!ctx) throw new Error('usePTB must be used within PTBBuilder');
  return ctx;
}

// ---------- Internal bridge (maps internal → public) ----------

function PublicBridge({ children }: { children?: React.ReactNode }) {
  const { exportDoc, loadFromDoc, loadFromOnChainTx, setTheme } = usePtb();

  const api = useMemo<PublicPTBApi>(
    () => ({ exportDoc, loadFromDoc, loadFromOnChainTx, setTheme }),
    [exportDoc, loadFromDoc, loadFromOnChainTx, setTheme],
  );

  return (
    <PublicPTBContext.Provider value={api}>
      {children}
    </PublicPTBContext.Provider>
  );
}

// ---------- Entry component ----------

export function PTBBuilder({
  theme,
  executeTx,
  address,
  gasBudget,
  toast,
  onDocChange,
  docChangeDelay,
  children,
  showExportButton,
}: PTBBuilderProps) {
  const execOpts = useMemo(
    () => ({
      myAddress: address,
      gasBudget,
    }),
    [address, gasBudget],
  );

  return (
    <ReactFlowProvider>
      <PtbProvider
        // UI
        initialTheme={theme ?? 'dark'}
        showExportButton={showExportButton}
        // flattened adapters
        executeTx={executeTx}
        toast={toast}
        // execution opts for codegen / tx builder
        execOpts={execOpts}
        // public autosave (doc-level only)
        onDocChange={onDocChange}
        onDocDebounceMs={docChangeDelay ?? 1000}
      >
        <PublicBridge>
          <PTBFlow />
          {children}
        </PublicBridge>
      </PtbProvider>
    </ReactFlowProvider>
  );
}
