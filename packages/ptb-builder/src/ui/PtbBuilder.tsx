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
// - initialChain    : optional chain for starting with a fresh editable PTB
// - executeTx       : adapter for executing transactions
// - simulateTx      : adapter for simulating transactions
// - createClient    : adapter for read-only SDK Core client creation
// - address         : optional runtime envelope sender; short-form Sui
//                     addresses are normalized through the model parser
// - gasBudget       : optional runtime envelope gas budget
// - toast           : toast adapter; if absent, provider falls back to console
// - onDocChange     : PTBDoc-level autosave callback
// - className/style : optional host-controlled container around the builder
// - children        : optional React children
//
// Public Hook (usePTB)
// - Exposes only the document/theme methods needed by host apps:
//   { captureCurrentDocResult, exportDoc, exportDocResult, loadFromDoc,
//     loadFromOnChainTx, undo, redo, canUndo, canRedo, setTheme }
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
import { parseObjectId } from '@zktx.io/ptb-model';

import type { PTBActionResult, PTBExportDocResult } from './actionResult';
import type {
  HostExecutionResult,
  HostSimulationResult,
} from './executionResult';
import { PTBFlow } from './PtbFlow';
import { PtbProvider, usePtb } from './PtbProvider';
import type { PTBDoc } from '../ptb/ptbDoc';
import type { RuntimeEnvelope, RuntimeGasBudget } from '../ptb/runtimeEnvelope';
import type { PtbCoreClient } from '../ptb/suiClient';
import type { Chain, Theme, ToastAdapter } from '../types';

// ---------- Public types ----------

export type PTBBuilderProps = {
  theme?: Theme;
  initialChain?: Chain;
  className?: string;
  style?: React.CSSProperties;
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
  gasBudget?: RuntimeGasBudget;
  toast?: ToastAdapter;
  onDocChange?: (doc: PTBDoc) => void;
  children?: React.ReactNode;
};

export type PublicPTBApi = {
  captureCurrentDocResult: () => PTBExportDocResult;
  exportDoc: (opts?: { sender?: string }) => PTBDoc | undefined;
  exportDocResult: (opts?: { sender?: string }) => PTBExportDocResult;
  loadFromDoc: (data: PTBDoc | Chain) => PTBActionResult;
  loadFromOnChainTx: (
    chain: Chain,
    digest: string,
    opts?: { mode?: 'readonly' | 'editable' },
  ) => Promise<PTBActionResult>;
  undo: () => PTBActionResult;
  redo: () => PTBActionResult;
  canUndo: boolean;
  canRedo: boolean;
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
    captureCurrentDocResult,
    exportDoc,
    exportDocResult,
    loadFromDoc,
    loadFromOnChainTx,
    undo,
    redo,
    canUndo,
    canRedo,
    setTheme,
  } = usePtb();

  const api = useMemo<PublicPTBApi>(
    () => ({
      captureCurrentDocResult,
      exportDoc,
      exportDocResult,
      loadFromDoc,
      loadFromOnChainTx,
      undo,
      redo,
      canUndo,
      canRedo,
      setTheme,
    }),
    [
      captureCurrentDocResult,
      exportDoc,
      exportDocResult,
      loadFromDoc,
      loadFromOnChainTx,
      undo,
      redo,
      canUndo,
      canRedo,
      setTheme,
    ],
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
  initialChain,
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
  className,
  style,
}: PTBBuilderProps) {
  const execOpts = useMemo<RuntimeEnvelope>(() => {
    const envelope: RuntimeEnvelope = {};
    const sender = typeof address === 'string' ? address.trim() : '';
    if (sender) envelope.sender = parseObjectId(sender) ?? sender;
    if (gasBudget !== undefined) envelope.gasBudget = gasBudget;
    return envelope;
  }, [address, gasBudget]);

  return (
    <div className={className} style={style}>
      <ReactFlowProvider>
        <PtbProvider
          // UI
          initialChain={initialChain}
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
    </div>
  );
}
