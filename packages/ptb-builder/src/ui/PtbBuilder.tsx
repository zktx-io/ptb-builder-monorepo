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
// - theme           : initial theme (managed by provider afterwards)
// - executeTx       : adapter for executing transactions
// - simulateTx      : adapter for simulating transactions
// - createClient    : adapter for read-only SDK Core client creation
// - address         : optional runtime envelope sender
// - gasBudget       : optional runtime envelope gas budget
// - toast           : toast adapter; if absent, provider falls back to console
// - onDocChange     : PTBDoc-level autosave callback
// - children        : optional React children
//
// Public Hook (usePTB)
// - Exposes only the document/theme methods needed by host apps:
//   { exportDoc, exportDocResult, loadFromDoc, loadFromOnChainTx, setTheme }
//
// Internals
// - Wraps <PtbProvider> + <PTBFlow> with <ReactFlowProvider>.
// - PublicBridge maps internal usePtb() → minimal PublicPTBApi.
//
// Note
// - No debouncing is performed at this layer.
// -----------------------------------------------------------------------------

import React, { createContext, useContext, useMemo } from 'react';

import type { Transaction } from '@mysten/sui/transactions';
import { ReactFlowProvider } from '@xyflow/react';

import type { PTBActionResult, PTBExportDocResult } from './actionResult';
import type {
  HostExecutionResult,
  HostSimulationResult,
} from './executionResult';
import { PTBFlow } from './PtbFlow';
import { PtbProvider, usePtb } from './PtbProvider';
import type { PTBDoc } from '../ptb/ptbDoc';
import type { RuntimeEnvelope } from '../ptb/runtimeAdapter';
import type { PtbCoreClient } from '../ptb/suiClient';
import type { Chain, Theme, ToastAdapter } from '../types';

// ---------- Public types ----------

export type PTBBuilderProps = {
  theme?: Theme;
  showExportButton?: boolean;
  showThemeSelector?: boolean;
  executeTx?: (
    chain: Chain,
    tx: Transaction | undefined,
  ) => Promise<HostExecutionResult>;
  simulateTx?: (
    chain: Chain,
    tx: Transaction | undefined,
  ) => Promise<HostSimulationResult>;
  createClient?: (chain: Chain) => PtbCoreClient;
  address?: string;
  gasBudget?: number;
  toast?: ToastAdapter;
  onDocChange?: (doc: PTBDoc) => void;
  children?: React.ReactNode;
};

export type PublicPTBApi = {
  exportDoc: (opts?: { sender?: string }) => PTBDoc | undefined;
  exportDocResult: (opts?: { sender?: string }) => PTBExportDocResult;
  loadFromDoc: (data: PTBDoc | Chain) => PTBActionResult;
  loadFromOnChainTx: (chain: Chain, digest: string) => Promise<PTBActionResult>;
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
  const {
    exportDoc,
    exportDocResult,
    loadFromDoc,
    loadFromOnChainTx,
    setTheme,
  } = usePtb();

  const api = useMemo<PublicPTBApi>(
    () => ({
      exportDoc,
      exportDocResult,
      loadFromDoc,
      loadFromOnChainTx,
      setTheme,
    }),
    [exportDoc, exportDocResult, loadFromDoc, loadFromOnChainTx, setTheme],
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
  simulateTx,
  createClient,
  address,
  gasBudget,
  toast,
  onDocChange,
  children,
  showExportButton,
  showThemeSelector,
}: PTBBuilderProps) {
  const execOpts = useMemo<RuntimeEnvelope>(() => {
    const envelope: RuntimeEnvelope = {};
    if (address) envelope.sender = address;
    if (typeof gasBudget === 'number') envelope.gasBudget = gasBudget;
    return envelope;
  }, [address, gasBudget]);

  return (
    <ReactFlowProvider>
      <PtbProvider
        // UI
        initialTheme={theme ?? 'dark'}
        showThemeSelector={showThemeSelector}
        showExportButton={showExportButton}
        // flattened adapters
        executeTx={executeTx}
        simulateTx={simulateTx}
        createClient={createClient}
        toast={toast}
        // runtime envelope for preview metadata and transaction building
        execOpts={execOpts}
        // public autosave (doc-level callback)
        onDocChange={onDocChange}
      >
        <PublicBridge>
          <PTBFlow />
          {children}
        </PublicBridge>
      </PtbProvider>
    </ReactFlowProvider>
  );
}
