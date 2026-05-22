// src/ui/PtbProvider.tsx
// -----------------------------------------------------------------------------
// Provider that owns persistence, chain caches, and RF/PTB synchronization.
// Stability tactics:
//  1) Use a structural signature (stableGraphSig) to ignore RF no-ops after
//     normalizeGraph.
//  2) Use graphEpoch so that "doc/chain load → RF inject" is separated from
//     normal "edit → save (RF→PTB)".
//
// Model
// - RF is authoritative while the editor is open.
// - PTB is a persisted snapshot: loaded once to hydrate RF, then updated by
//   the canvas (PTBFlow) immediately on every edit.
// - We only inject PTB back to RF when the *document identity* changes.
// - PTBDoc autosave (onDocChange) is batched briefly for graph edits and
//   debounced for viewport-only changes.
// -----------------------------------------------------------------------------

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type { Transaction } from '@mysten/sui/transactions';
import {
  type IRInput,
  irObjectId,
  materializeGraphInputValues,
  type MovePackageSignatureEvidence,
  parseObjectId,
  rawTransactionToIR,
  type TransactionDiagnostic,
  type TransactionIR,
  transactionIRToGraph,
  validateTransactionIR,
} from '@zktx.io/ptb-model';

import {
  PTB_ACTION_OK,
  ptbActionError,
  type PTBActionResult,
  ptbExportDocError,
  type PTBExportDocResult,
} from './actionResult';
import {
  createDocumentEmissionScheduler,
  type DocumentEmissionScheduler,
} from './documentEmission';
import {
  createEditorSessionHistory,
  createEditorSessionSnapshot,
  type EditorSessionSnapshot,
} from './editorSessionHistory';
import { executionResultToast } from './executionResult';
import type {
  HostExecutionResult,
  HostSimulationResult,
} from './executionResult';
import { stableGraphSig } from './graphSignature';
import { formatModelErrorMessage } from './modelDiagnostics';
import { createProviderLifecycleController } from './providerLifecycle';
import {
  clearProviderClientUnavailableNoticeState,
  clearProviderNoticeState,
  INITIAL_PROVIDER_UI_STATE,
  providerClientUnavailable,
  providerDocumentEmitError,
  providerDocumentLoadError,
  providerExportError,
  providerReadyEditable,
  providerReadyReadonlyTransaction,
  providerTransactionLoadError,
  type ProviderUiState,
  type TxStatus,
} from './providerUiState';
import { autoLayoutPTBGraph } from './utils/ptbGraphAutoLayout';
import type { PTBGraph } from '../ptb/graph/types';
import {
  type CachedMoveFunction,
  type CachedMovePackageIndex,
  createPTBMetadataCache,
  getCachedMoveFunction,
  getCachedMovePackageIndex,
  type MovePackageFunctionIndex,
  moveSignatureEvidenceFromCache,
  replaceCachedChainData,
  upsertCachedMoveFunction,
  upsertCachedMovePackageIndex,
  upsertCachedObjectData,
} from '../ptb/metadataCache';
import { toPTBFunctionDataEntry } from '../ptb/move/toPTBModuleData';
import { normalizeGraph } from '../ptb/normalizeGraph';
import {
  objectMetadataFromCoreObject,
  type ObjectMetadataInfo,
  type ObjectMetadataLookupResult,
} from '../ptb/objectMetadata';
import {
  buildDoc,
  createEmptyPTBDoc,
  DEFAULT_PTB_VIEW,
  hasSameCanonicalPTBView,
  prepareLoadedDoc,
  type PTBDoc,
  PTBModulesEmbed,
  PTBObjectData,
  PTBObjectsEmbed,
  stablePTBDocSignature,
} from '../ptb/ptbDoc';
import type { RuntimeEnvelope } from '../ptb/runtimeEnvelope';
import { KNOWN_IDS, type WellKnownId } from '../ptb/seedGraph';
import {
  coreTransactionResultToRawProgrammableTransactionInput,
  createPtbCoreClient,
  listMovePackageFunctionIndex,
  PTB_TRANSACTION_LOAD_INCLUDE,
  type PtbCoreClient,
  selectCoreTransactionResult,
} from '../ptb/suiClient';
import type { Chain, Theme, ToastAdapter } from '../types';
import { toColorMode } from '../types';

const VIEW_CHANGE_DEBOUNCE_MS = 250;
const DOC_CHANGE_DEBOUNCE_MS = 150;
const DOC_CHANGE_MAX_WAIT_MS = 1000;
const OBJECT_METADATA_FETCH_CONCURRENCY = 8;
const TRANSACTION_LAYOUT_TARGET_CENTER = Object.freeze({ x: 400, y: 325 });
const EMPTY_OBJECTS = Object.freeze({}) as PTBObjectsEmbed;
const EMPTY_MODULES = Object.freeze({}) as PTBModulesEmbed;
const EMPTY_PACKAGE_INDEXES = Object.freeze({}) as Record<
  string,
  MovePackageFunctionIndex
>;

// ===== Context shape ==========================================================

type OwnedObjectsParams = {
  owner: string;
  cursor?: string | null;
  limit?: number;
  type?: string;
  clientOverride?: PtbCoreClient;
};

type OwnedObjectsResponse = {
  data: Array<{
    data: {
      objectId: string;
      type: string;
      version?: string;
      digest?: string;
      owner?: unknown;
      metadata?: ObjectMetadataInfo;
      content?: { dataType: 'moveObject'; type: string };
      display?: { data?: Record<string, unknown> | null };
    };
  }>;
  hasNextPage: boolean;
  nextCursor?: string | null;
};

type HostTxResult = HostExecutionResult;

type MoveCallFunctionRef = {
  packageId: string;
  moduleName: string;
  functionName: string;
};

function objectIdsFromIRInputs(inputs: readonly IRInput[]): string[] {
  const ids = new Set<string>();
  for (const input of inputs) {
    if (input.kind === 'Object') {
      ids.add(irObjectId(input));
    }
  }
  return [...ids];
}

function moveCallPackageIdsFromIRCommands(
  commands: readonly unknown[],
): string[] {
  const ids = new Set<string>();
  for (const command of commands) {
    if (!command || typeof command !== 'object') continue;
    const item = command as Record<string, unknown>;
    if (item.kind !== 'MoveCall') continue;
    if (typeof item.package !== 'string') continue;
    const packageId = parseObjectId(item.package);
    if (packageId !== undefined) ids.add(packageId);
  }
  return [...ids];
}

function moveCallFunctionRefsFromIRCommands(
  commands: readonly unknown[],
): MoveCallFunctionRef[] {
  const refs = new Map<string, MoveCallFunctionRef>();
  for (const command of commands) {
    if (!command || typeof command !== 'object') continue;
    const item = command as Record<string, unknown>;
    if (item.kind !== 'MoveCall') continue;
    if (
      typeof item.package !== 'string' ||
      typeof item.module !== 'string' ||
      typeof item.function !== 'string'
    ) {
      continue;
    }
    const packageId = parseObjectId(item.package);
    if (packageId === undefined) continue;
    const key = `${packageId}::${item.module}::${item.function}`;
    refs.set(key, {
      packageId,
      moduleName: item.module,
      functionName: item.function,
    });
  }
  return [...refs.values()];
}

function formatMoveCallFunctionRef(ref: MoveCallFunctionRef): string {
  return `${ref.packageId}::${ref.moduleName}::${ref.functionName}`;
}

function missingMoveCallSignatureRefs(
  cache: ReturnType<typeof createPTBMetadataCache>,
  chain: Chain,
  refs: readonly MoveCallFunctionRef[],
): MoveCallFunctionRef[] {
  return refs.filter(
    (ref) =>
      getCachedMoveFunction(
        cache,
        chain,
        ref.packageId,
        ref.moduleName,
        ref.functionName,
      ) === undefined,
  );
}

function formatMissingMoveCallSignatureMessage(
  refs: readonly MoveCallFunctionRef[],
  cause?: string,
): string {
  const shown = refs.slice(0, 3).map(formatMoveCallFunctionRef).join(', ');
  const suffix = refs.length > 3 ? ` and ${refs.length - 3} more` : '';
  const reason = cause ? ` ${cause}` : '';
  return `Failed to load transaction because Move function signature evidence is unavailable for ${shown}${suffix}.${reason}`;
}

async function fetchMoveFunctionSignatureEntry(
  client: PtbCoreClient,
  ref: MoveCallFunctionRef,
): Promise<CachedMoveFunction> {
  const response = await client.core.getMoveFunction({
    packageId: ref.packageId,
    moduleName: ref.moduleName,
    name: ref.functionName,
  });
  return {
    packageId: parseObjectId(response.function.packageId) ?? ref.packageId,
    moduleName: response.function.moduleName || ref.moduleName,
    functionName: response.function.name || ref.functionName,
    signature: toPTBFunctionDataEntry(response.function),
  };
}

export type PtbContextValue = {
  graph: PTBGraph;
  setGraph: (g: PTBGraph) => void;
  setViewExternal: (v: { x: number; y: number; zoom: number }) => void;

  // Runtime flags
  chain?: Chain;
  readOnly: boolean;

  // UI theme
  theme: Theme;
  setTheme: (t: Theme) => void;
  showThemeSelector: boolean;

  // Chain caches & helpers (PTB-only)
  objects: PTBObjectsEmbed;
  lookupObjectMetadata: (
    objectId: string,
    opts?: { clientOverride?: PtbCoreClient },
  ) => Promise<ObjectMetadataLookupResult>;

  modules: PTBModulesEmbed;
  packageIndexes: Record<string, MovePackageFunctionIndex>;
  moveSignatures?: MovePackageSignatureEvidence;
  getMovePackage: (
    packageId: string,
    opts?: { forceRefresh?: boolean },
  ) => Promise<CachedMovePackageIndex | undefined>;
  ensureMoveFunctionSignature: (
    packageId: string,
    moduleName: string,
    functionName: string,
    opts?: { forceRefresh?: boolean },
  ) => Promise<CachedMoveFunction | undefined>;

  getOwnedObjects: (
    params: OwnedObjectsParams,
  ) => Promise<OwnedObjectsResponse | undefined>;

  // Loaders
  providerUiState: ProviderUiState;
  clearProviderNotice: () => void;
  loadTxStatus: TxStatus | undefined;
  loadFromOnChainTx: (
    chain: Chain,
    txDigest: string,
    opts?: { mode?: 'readonly' | 'editable' },
  ) => Promise<PTBActionResult>;
  loadFromDoc: (data: PTBDoc | Chain) => PTBActionResult;
  undo: () => PTBActionResult;
  redo: () => PTBActionResult;
  canUndo: boolean;
  canRedo: boolean;

  // Persistence
  exportDoc: (opts?: { sender?: string }) => PTBDoc | undefined;
  exportDocResult: (opts?: { sender?: string }) => PTBExportDocResult;
  captureCurrentDocResult: () => PTBExportDocResult;

  // Monotonic ID generator
  createUniqueId: (prefix?: string) => string;

  // Execution
  execOpts: RuntimeEnvelope;
  runTx?: (tx?: Transaction) => Promise<{ digest?: string; error?: string }>;
  dryRunTx?: (tx?: Transaction) => Promise<void>;

  // Toast
  toast: ToastAdapter;
  showExportButton?: boolean;

  isWellKnownAvailable: (k: WellKnownId) => boolean;

  registerFlowActions: (a: RegisteredFlowActions) => void;

  graphEpoch: number;
  graphRehydrateViewportPolicy: GraphRehydrateViewportPolicy;
  completeGraphRehydrate: (epoch: number) => void;

  codePipOpenTick: number;
};

type FlowViewportState = { x: number; y: number; zoom: number };
type GraphRehydrateViewportPolicy =
  | { kind: 'fit' }
  | { kind: 'preserve' }
  | { kind: 'set'; viewport: FlowViewportState };
type FlowGraphCaptureResult =
  | { ok: true; graph: PTBGraph }
  | { ok: false; error: string };
type RegisteredFlowActions = {
  applyAutoLayoutToCurrentGraph?: () => Promise<
    { ok: true; graph: PTBGraph } | { ok: false; error: string }
  >;
  captureGraph?: () => FlowGraphCaptureResult;
  getViewportState?: () => FlowViewportState;
};

const PtbContext = createContext<PtbContextValue | undefined>(undefined);

// ===== Provider props =========================================================

export type PtbProviderProps = {
  children: React.ReactNode;
  onDocChange?: (doc: PTBDoc) => void;

  initialChain?: Chain;
  initialTheme: Theme;
  execOpts?: RuntimeEnvelope;
  showThemeSelector?: boolean;

  executeTx?: (
    chain: Chain,
    tx: Transaction | undefined,
  ) => Promise<HostTxResult>;
  simulateTx?: (
    chain: Chain,
    tx: Transaction | undefined,
  ) => Promise<HostSimulationResult>;
  createClient?: (chain: Chain) => PtbCoreClient;
  toast?: ToastAdapter;
  showExportButton?: boolean;
};

// ===== tiny utils =============================================================

/** Extract the maximum trailing numeric suffix from IDs like "n-12" / "edge_7". */
function maxNumericSuffix(ids: Iterable<string>): number {
  let max = 0;
  const re = /(\d+)\s*$/;
  for (const id of ids) {
    const m = re.exec(id);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return max;
}

/** Seed the nonce by scanning node/edge ids in a PTBGraph. */
function seedNonceFromGraph(g: PTBGraph | undefined): number {
  if (!g) return 0;
  const idBag: string[] = [];
  for (const n of g.nodes || []) idBag.push(n.id);
  for (const e of g.edges || []) idBag.push(e.id);
  return maxNumericSuffix(idBag);
}

// ===== Provider ===============================================================

export function PtbProvider({
  children,
  onDocChange,

  initialChain,
  initialTheme,
  execOpts: execOptsProp = {},
  showThemeSelector = true,

  executeTx: executeTxProp,
  simulateTx: simulateTxProp,
  createClient: createClientProp,
  toast: toastProp,
  showExportButton = false,
}: PtbProviderProps) {
  // Theme
  const [theme, setTheme] = useState<Theme>(initialTheme);

  const applyTheme = React.useCallback((t: Theme) => {
    const root = document.documentElement;
    const mode = toColorMode(t);
    mode === 'dark'
      ? root.classList.add('dark')
      : root.classList.remove('dark');
    root.setAttribute('data-ptb-theme', t);
  }, []);

  useLayoutEffect(() => {
    applyTheme(theme);
  }, [theme, applyTheme]);

  // Toast
  const toastImpl: ToastAdapter = useMemo(() => {
    if (toastProp) return toastProp;
    return ({ message, variant }) => {
      const tag =
        variant === 'error'
          ? '[ERROR]'
          : variant === 'success'
            ? '[SUCCESS]'
            : variant === 'warning'
              ? '[WARN]'
              : '[INFO]';
      // eslint-disable-next-line no-console
      console.log(`${tag} ${message}`);
    };
  }, [toastProp]);

  // Flow actions
  const flowActionsRef = React.useRef<RegisteredFlowActions>({});

  const registerFlowActions = React.useCallback((a: RegisteredFlowActions) => {
    flowActionsRef.current = { ...flowActionsRef.current, ...a };
  }, []);

  // Editor mode
  const [readOnly, setReadOnly] = useState<boolean>(false);
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;

  // Chain & client
  const [activeChain, setActiveChain] = useState<Chain | undefined>(undefined);
  const initialChainLoadedRef = useRef(false);
  const initialChainLoadRef = useRef(false);
  const explicitLoadStartedRef = useRef(false);
  const clientRef = useRef<PtbCoreClient | undefined>(undefined);
  const createCoreClient = useCallback(
    (chain: Chain) => createClientProp?.(chain) ?? createPtbCoreClient(chain),
    [createClientProp],
  );
  useEffect(() => {
    if (!activeChain) {
      clientRef.current = undefined;
      return;
    }
    try {
      clientRef.current = createCoreClient(activeChain);
      setProviderUiState(clearProviderClientUnavailableNoticeState);
    } catch (error) {
      clientRef.current = undefined;
      const message = formatModelErrorMessage(
        error,
        'Failed to create Sui client.',
      );
      setProviderUiState((prev) => providerClientUnavailable(prev, message));
      toastImpl({ message, variant: 'error' });
    }
  }, [activeChain, createCoreClient, toastImpl]);
  const activeChainRef = useRef(activeChain);
  activeChainRef.current = activeChain;

  // Persisted PTB snapshot (RF → PTB)
  const [graph, setGraphState] = useState<PTBGraph>({ nodes: [], edges: [] });
  const [view, setView] = useState<
    { x: number; y: number; zoom: number } | undefined
  >(undefined);
  const viewRef = useRef(view);
  viewRef.current = view;
  const [docSender, setDocSender] = useState<string | undefined>(undefined);
  const docSenderRef = useRef(docSender);
  docSenderRef.current = docSender;

  // Well-known presence
  const [wellKnown, setWellKnown] = useState<Record<WellKnownId, boolean>>(() =>
    computeWellKnownPresence({ nodes: [], edges: [] }),
  );

  // Monotonic ID nonce (doc-scoped)
  const idNonceRef = useRef(seedNonceFromGraph(graph));
  const genId = useCallback((prefix = 'id') => {
    idNonceRef.current += 1;
    return `${prefix}-${idNonceRef.current}`;
  }, []);

  // Epoch to separate "inject → RF" from "edit → save"
  const [graphEpoch, setGraphEpoch] = useState(0);
  const graphEpochRef = useRef(0);
  const [graphRehydrateViewportPolicy, setGraphRehydrateViewportPolicy] =
    useState<GraphRehydrateViewportPolicy>({ kind: 'fit' });

  // Chain caches
  const [objects, setObjects] = useState<PTBObjectsEmbed>(() => EMPTY_OBJECTS);
  const [modules, setModules] = useState<PTBModulesEmbed>(() => EMPTY_MODULES);
  const [packageIndexes, setPackageIndexes] = useState<
    Record<string, MovePackageFunctionIndex>
  >(() => EMPTY_PACKAGE_INDEXES);
  const [metadataRevision, setMetadataRevision] = useState(0);
  const metadataCacheRef = useRef(createPTBMetadataCache());
  const moveSignatures = useMemo(() => {
    // metadataRevision invalidates this ref-derived projection when the cache mutates.
    void metadataRevision;
    return activeChain === undefined
      ? undefined
      : moveSignatureEvidenceFromCache(metadataCacheRef.current, activeChain);
  }, [activeChain, metadataRevision]);
  const movePackageInflightRef = useRef<
    Map<string, Promise<CachedMovePackageIndex | undefined>>
  >(new Map());
  const moveFunctionInflightRef = useRef<
    Map<string, Promise<CachedMoveFunction | undefined>>
  >(new Map());
  const docSlicesRef = useRef({ graph, modules, objects });
  docSlicesRef.current = { graph, modules, objects };
  const lastDocSigRef = useRef<string | undefined>(undefined);
  const editorHistoryRef = useRef(createEditorSessionHistory());
  const editorHistoryRestoreInFlightRef = useRef(false);
  const editorHistoryRestoreEpochRef = useRef<number | undefined>(undefined);
  const [editorHistoryAvailability, setEditorHistoryAvailability] = useState(
    () => ({
      canUndo: editorHistoryRef.current.canUndo(),
      canRedo: editorHistoryRef.current.canRedo(),
    }),
  );
  const lifecycleRef = useRef(createProviderLifecycleController());
  const [providerUiState, setProviderUiState] = useState<ProviderUiState>(
    () => INITIAL_PROVIDER_UI_STATE,
  );

  const clearProviderNotice = useCallback(() => {
    setProviderUiState(clearProviderNoticeState);
  }, []);

  // Reset caches on chain change
  const resetBeforeLoad = (opts?: { preserveLastDocSig?: boolean }) => {
    if (!opts?.preserveLastDocSig) {
      lastDocSigRef.current = undefined;
    }
    editorHistoryRestoreInFlightRef.current = false;
    editorHistoryRestoreEpochRef.current = undefined;
    setActiveChain(undefined);
    setDocSender(undefined);
    setObjects(EMPTY_OBJECTS);
    setModules(EMPTY_MODULES);
    setPackageIndexes(EMPTY_PACKAGE_INDEXES);
    setView(undefined);
    setCodePipOpenTick(0);
  };

  const reportClientUnavailable = useCallback(
    (operation: string) => {
      const message = `${operation}: no Sui client is active for the selected chain.`;
      setProviderUiState((prev) => providerClientUnavailable(prev, message));
      toastImpl({
        message,
        variant: 'warning',
      });
    },
    [toastImpl],
  );

  // Host adapters
  const executeTx = useCallback(
    async (chain: Chain, tx?: Transaction): Promise<HostTxResult> => {
      if (!executeTxProp) return { error: 'executeTx adapter not provided' };
      try {
        const res = await executeTxProp(chain, tx);
        return res ?? {};
      } catch (e: any) {
        return { error: e?.message || 'Unknown execution error' };
      }
    },
    [executeTxProp],
  );

  const simulateTx = useCallback(
    async (chain: Chain, tx?: Transaction): Promise<HostSimulationResult> => {
      if (!simulateTxProp) return { error: 'simulateTx adapter not provided' };
      try {
        const res = await simulateTxProp(chain, tx);
        return res ?? {};
      } catch (e: any) {
        return { error: e?.message || 'Unknown simulation error' };
      }
    },
    [simulateTxProp],
  );

  // Build + execute
  const runTx = useCallback(
    async (tx?: Transaction) => {
      if (!tx || !activeChain) return { error: 'No transaction to run' };

      const res = await executeTx(activeChain, tx);
      const toast = executionResultToast(res);
      if (toast) {
        toastImpl(toast);
      }
      return res ?? {};
    },
    [activeChain, executeTx, toastImpl],
  );

  const dryRunTx = useCallback(
    async (tx?: Transaction): Promise<void> => {
      if (!activeChain) {
        toastImpl({ message: 'No active chain to dry-run', variant: 'error' });
        return;
      }
      if (!tx) {
        toastImpl({ message: 'No transaction to dry-run', variant: 'error' });
        return;
      }

      const res = await simulateTx(activeChain, tx);
      if (res.error) {
        toastImpl({
          message: res.error,
          variant: 'error',
        });
        return;
      }
      if (res.success === false) {
        toastImpl({ message: 'Dry run failed', variant: 'error' });
        return;
      }
      toastImpl({ message: 'Dry run success', variant: 'success' });
    },
    [activeChain, simulateTx, toastImpl],
  );

  // Keep a stable signature to prevent feedback loops on normalizeGraph
  const lastGraphSigRef = useRef<string>(
    stableGraphSig({ nodes: [], edges: [] }),
  );

  const refreshEditorHistoryAvailability = useCallback(() => {
    setEditorHistoryAvailability({
      canUndo: editorHistoryRef.current.canUndo(),
      canRedo: editorHistoryRef.current.canRedo(),
    });
  }, []);

  const editorSnapshotFromRefs = useCallback(
    (graphOverride?: PTBGraph): EditorSessionSnapshot | undefined => {
      const chain = activeChainRef.current;
      if (!chain) return undefined;
      const {
        graph: graphSnap,
        modules: modulesSnap,
        objects: objectsSnap,
      } = docSlicesRef.current;
      return createEditorSessionSnapshot({
        chain,
        graph: graphOverride ?? graphSnap,
        sender: docSenderRef.current,
        modules: modulesSnap ?? EMPTY_MODULES,
        objects: objectsSnap ?? EMPTY_OBJECTS,
      });
    },
    [],
  );

  const resetEditorHistory = useCallback(
    (snapshot?: EditorSessionSnapshot) => {
      editorHistoryRef.current.reset(snapshot);
      refreshEditorHistoryAvailability();
    },
    [refreshEditorHistoryAvailability],
  );

  const recordEditorHistory = useCallback(
    (snapshot: EditorSessionSnapshot) => {
      editorHistoryRef.current.record(snapshot);
      refreshEditorHistoryAvailability();
    },
    [refreshEditorHistoryAvailability],
  );

  const setGraph = useCallback(
    (g: PTBGraph) => {
      const norm = normalizeGraph(g);
      const nextSig = stableGraphSig(norm);
      if (nextSig === lastGraphSigRef.current) {
        return;
      }
      lastGraphSigRef.current = nextSig;
      docSlicesRef.current = { ...docSlicesRef.current, graph: norm };
      setGraphState(norm);
      setWellKnown(computeWellKnownPresence(norm));
      idNonceRef.current = Math.max(
        idNonceRef.current,
        seedNonceFromGraph(norm),
      );
      const snapshot = editorSnapshotFromRefs(norm);
      if (snapshot) recordEditorHistory(snapshot);
    },
    [editorSnapshotFromRefs, recordEditorHistory],
  );

  const replaceGraphImmediate = useCallback(
    (
      g: PTBGraph,
      opts: { viewportPolicy?: GraphRehydrateViewportPolicy } = {},
    ): number => {
      const norm = normalizeGraph(g);
      lastGraphSigRef.current = stableGraphSig(norm);
      docSlicesRef.current = { ...docSlicesRef.current, graph: norm };
      const nextEpoch = graphEpochRef.current + 1;
      graphEpochRef.current = nextEpoch;
      setGraphRehydrateViewportPolicy(opts.viewportPolicy ?? { kind: 'fit' });
      setGraphState(norm);
      setWellKnown(computeWellKnownPresence(norm));
      idNonceRef.current = seedNonceFromGraph(norm);
      setGraphEpoch(nextEpoch); // rehydrate RF once per load
      return nextEpoch;
    },
    [],
  );

  const completeGraphRehydrate = useCallback((epoch: number) => {
    if (editorHistoryRestoreEpochRef.current !== epoch) return;
    editorHistoryRestoreEpochRef.current = undefined;
    editorHistoryRestoreInFlightRef.current = false;
  }, []);

  // ---- PTBDoc: batch graph edits, debounce viewport-only changes ------------

  const onDocChangeRef = useRef(onDocChange);
  onDocChangeRef.current = onDocChange;
  const hadOnDocChangeRef = useRef(Boolean(onDocChange));
  const emitDocChangeRef = useRef<() => void>(() => undefined);
  const docEmissionSchedulerRef = useRef<DocumentEmissionScheduler | undefined>(
    undefined,
  );

  const buildDocFromRefs = useCallback(() => {
    const chain = activeChainRef.current;
    const latestView = viewRef.current;
    if (!chain || !latestView) return undefined;
    const {
      graph: graphSnap,
      modules: modulesSnap,
      objects: objectsSnap,
    } = docSlicesRef.current;
    return buildDoc({
      chain,
      graph: graphSnap,
      view: latestView,
      sender: docSenderRef.current,
      modules: modulesSnap ?? {},
      objects: objectsSnap ?? {},
    });
  }, []);

  const deliverDocChange = useCallback((doc: PTBDoc): PTBActionResult => {
    const nextSig = stablePTBDocSignature(doc);
    const onDocChangeCurrent = onDocChangeRef.current;
    if (!onDocChangeCurrent) {
      lastDocSigRef.current = undefined;
      return PTB_ACTION_OK;
    }
    if (lastDocSigRef.current === nextSig) return PTB_ACTION_OK;

    try {
      onDocChangeCurrent(doc);
      lastDocSigRef.current = nextSig;
      return PTB_ACTION_OK;
    } catch (error) {
      const message = formatModelErrorMessage(
        error,
        'PTB document change handler failed.',
      );
      setProviderUiState((prev) => providerDocumentEmitError(prev, message));
      return ptbActionError(message);
    }
  }, []);

  const deliverForcedDocChange = useCallback(
    (doc: PTBDoc): PTBActionResult => {
      const previousSig = lastDocSigRef.current;
      lastDocSigRef.current = undefined;
      const result = deliverDocChange(doc);
      if (!result.ok) {
        lastDocSigRef.current = previousSig;
      }
      return result;
    },
    [deliverDocChange],
  );

  const emitDocChange = useCallback(() => {
    let doc: PTBDoc | undefined;
    try {
      doc = buildDocFromRefs();
    } catch (error) {
      setProviderUiState((prev) =>
        providerDocumentEmitError(
          prev,
          formatModelErrorMessage(error, 'PTB document update failed.'),
        ),
      );
      return;
    }
    if (!doc) return;
    deliverDocChange(doc);
  }, [buildDocFromRefs, deliverDocChange]);
  emitDocChangeRef.current = emitDocChange;

  if (!docEmissionSchedulerRef.current) {
    docEmissionSchedulerRef.current = createDocumentEmissionScheduler({
      contentDelayMs: DOC_CHANGE_DEBOUNCE_MS,
      viewDelayMs: VIEW_CHANGE_DEBOUNCE_MS,
      maxWaitMs: DOC_CHANGE_MAX_WAIT_MS,
      emit: () => emitDocChangeRef.current(),
    });
  }

  const flushPendingDocChange = useCallback(() => {
    docEmissionSchedulerRef.current?.flush();
  }, []);

  const cancelPendingDocChange = useCallback(() => {
    docEmissionSchedulerRef.current?.cancel();
  }, []);

  const scheduleDocChange = useCallback((reason: 'content' | 'view') => {
    docEmissionSchedulerRef.current?.schedule(reason);
  }, []);

  const captureDocResult = useCallback(
    (opts?: { sender?: string }): PTBExportDocResult => {
      const chain = activeChainRef.current;
      if (!chain)
        return ptbExportDocError('Cannot export before a chain is selected.');
      const latestView = viewRef.current;
      if (!latestView) {
        return ptbExportDocError(
          'Cannot export before the viewport is initialized.',
        );
      }
      const graphCapture = flowActionsRef.current.captureGraph?.();
      if (graphCapture && !graphCapture.ok) {
        return ptbExportDocError(graphCapture.error);
      }
      const graphForExport =
        graphCapture?.graph ?? docSlicesRef.current.graph ?? graph;
      const viewForExport =
        flowActionsRef.current.getViewportState?.() ?? latestView;
      const sender =
        opts && Object.prototype.hasOwnProperty.call(opts, 'sender')
          ? opts.sender
          : docSenderRef.current;
      try {
        return {
          ok: true,
          doc: buildDoc({
            chain,
            graph: graphForExport,
            view: viewForExport,
            sender,
            modules: docSlicesRef.current.modules ?? {},
            objects: docSlicesRef.current.objects ?? {},
          }),
        };
      } catch (error) {
        return ptbExportDocError(
          formatModelErrorMessage(error, 'Failed to capture PTB document.'),
        );
      }
    },
    [graph],
  );

  const captureCurrentDocResult = useCallback<
    PtbContextValue['captureCurrentDocResult']
  >(() => captureDocResult(), [captureDocResult]);

  const captureEditorSnapshotResult = useCallback(():
    | { ok: true; snapshot: EditorSessionSnapshot }
    | { ok: false; error: string } => {
    const chain = activeChainRef.current;
    if (!chain) {
      return {
        ok: false,
        error: 'Cannot capture editor history before a chain is selected.',
      };
    }
    const graphCapture = flowActionsRef.current.captureGraph?.();
    if (graphCapture && !graphCapture.ok) {
      return { ok: false, error: graphCapture.error };
    }
    const graphForHistory =
      graphCapture?.graph ?? docSlicesRef.current.graph ?? graph;
    return {
      ok: true,
      snapshot: createEditorSessionSnapshot({
        chain,
        graph: graphForHistory,
        sender: docSenderRef.current,
        modules: docSlicesRef.current.modules ?? EMPTY_MODULES,
        objects: docSlicesRef.current.objects ?? EMPTY_OBJECTS,
      }),
    };
  }, [graph]);

  useEffect(() => {
    if (!activeChainRef.current) return;
    if (readOnly) return;
    scheduleDocChange('content');
  }, [graph, modules, objects, activeChain, readOnly, scheduleDocChange]);

  useEffect(() => {
    if (!activeChainRef.current || !view) return;
    if (readOnly) return;
    scheduleDocChange('view');
  }, [view, readOnly, scheduleDocChange]);

  useEffect(() => {
    if (readOnly) return;
    const snapshot = editorSnapshotFromRefs();
    if (!snapshot) return;
    editorHistoryRef.current.replacePresent(snapshot);
    refreshEditorHistoryAvailability();
  }, [
    activeChain,
    docSender,
    modules,
    objects,
    readOnly,
    editorSnapshotFromRefs,
    refreshEditorHistoryAvailability,
  ]);

  useEffect(() => {
    const hadOnDocChange = hadOnDocChangeRef.current;
    const hasOnDocChange = Boolean(onDocChange);
    hadOnDocChangeRef.current = hasOnDocChange;
    if (!hadOnDocChange && hasOnDocChange && !readOnly) {
      emitDocChange();
    }
  }, [onDocChange, emitDocChange, readOnly]);

  useEffect(
    () => () => {
      lifecycleRef.current.cancel();
      if (readOnlyRef.current) docEmissionSchedulerRef.current?.cancel();
      else flushPendingDocChange();
    },
    [flushPendingDocChange],
  );

  const setViewExternal = useCallback(
    (v: { x: number; y: number; zoom: number }) => {
      if (!activeChain) return;
      setView((prev) => (prev && hasSameCanonicalPTBView(prev, v) ? prev : v));
    },
    [activeChain],
  );

  // ---- chain helpers ---------------------------------------------------------

  const fetchObjectData = useCallback(
    async (client: PtbCoreClient, id: string): Promise<PTBObjectData> => {
      const resp = await client.core.getObject({
        objectId: id,
        include: { content: true },
      });

      return {
        objectId: resp.object.objectId,
        typeTag: resp.object.type ?? '',
      };
    },
    [],
  );

  const lookupObjectMetadata = useCallback<
    PtbContextValue['lookupObjectMetadata']
  >(
    async (objectId, opts) => {
      const rawId = objectId?.trim();
      if (!rawId) return { ok: false, error: 'Object id is required.' };
      const id = parseObjectId(rawId);
      if (!id) return { ok: false, error: 'Invalid object id.' };

      const chain = activeChainRef.current;
      if (!chain) return { ok: false, error: 'No active chain selected.' };

      const client = opts?.clientOverride ?? clientRef.current;
      if (!client) {
        const error =
          'Object metadata lookup unavailable: no Sui client is active for the selected chain.';
        reportClientUnavailable('Object metadata lookup');
        return { ok: false, error };
      }

      try {
        const resp = await client.core.getObject({
          objectId: id,
          include: { content: true },
        });
        const parsed = objectMetadataFromCoreObject(resp.object);
        if (!parsed.ok) return parsed;

        const metadata: PTBObjectData = {
          objectId: parsed.object.objectId,
          typeTag: parsed.object.typeTag,
        };
        const next = upsertCachedObjectData(
          metadataCacheRef.current,
          chain,
          metadata,
        );
        metadataCacheRef.current = next.cache;
        if (activeChainRef.current === chain) {
          setObjects(next.objects);
        }
        return parsed;
      } catch (error) {
        return {
          ok: false,
          error: formatModelErrorMessage(
            error,
            `Failed to fetch object ${id}.`,
          ),
        };
      }
    },
    [reportClientUnavailable],
  );

  const fetchMovePackageIndex = useCallback(
    async (
      client: PtbCoreClient,
      packageId: string,
    ): Promise<CachedMovePackageIndex> => {
      const index = await listMovePackageFunctionIndex(client, packageId);
      const resolvedPackageId = parseObjectId(index.packageId) ?? packageId;

      return {
        packageId: resolvedPackageId,
        modules: index.modules,
      };
    },
    [],
  );

  const getMovePackage = useCallback<PtbContextValue['getMovePackage']>(
    async (packageId, opts) => {
      const rawPackageId = packageId?.trim();
      const id = rawPackageId ? parseObjectId(rawPackageId) : undefined;
      if (!id) {
        toastImpl({ message: 'Invalid package id', variant: 'warning' });
        return undefined;
      }

      const chain = activeChainRef.current;
      if (!chain) return undefined;

      if (!opts?.forceRefresh) {
        const cached = getCachedMovePackageIndex(
          metadataCacheRef.current,
          chain,
          id,
        );
        if (cached) return cached;
      }

      const client = clientRef.current;
      if (!client) {
        reportClientUnavailable('Move package lookup');
        return undefined;
      }

      const inflightKey = `${chain}:${id}`;
      if (!opts?.forceRefresh) {
        const inflight = movePackageInflightRef.current.get(inflightKey);
        if (inflight) return inflight;
      }

      const fetchMovePackage = async (): Promise<CachedMovePackageIndex> => {
        const movePackage = await fetchMovePackageIndex(client, id);
        const next = upsertCachedMovePackageIndex(
          metadataCacheRef.current,
          chain,
          movePackage,
        );
        metadataCacheRef.current = next.cache;
        setMetadataRevision((revision) => revision + 1);
        if (activeChainRef.current === chain) {
          setPackageIndexes(next.packageIndexes);
        }
        return movePackage;
      };

      try {
        if (opts?.forceRefresh) {
          return await fetchMovePackage();
        }
        const promise = fetchMovePackage().finally(() => {
          movePackageInflightRef.current.delete(inflightKey);
        });
        movePackageInflightRef.current.set(inflightKey, promise);
        return await promise;
      } catch (error) {
        toastImpl({
          message: formatModelErrorMessage(
            error,
            `Move package lookup failed for ${id}.`,
          ),
          variant: 'error',
        });
        return undefined;
      }
    },
    [fetchMovePackageIndex, reportClientUnavailable, toastImpl],
  );

  const ensureMoveFunctionSignature = useCallback<
    PtbContextValue['ensureMoveFunctionSignature']
  >(
    async (packageId, moduleName, functionName, opts) => {
      const rawPackageId = packageId?.trim();
      const id = rawPackageId ? parseObjectId(rawPackageId) : undefined;
      if (!id || !moduleName || !functionName) {
        toastImpl({
          message: 'Invalid Move function target',
          variant: 'warning',
        });
        return undefined;
      }

      const chain = activeChainRef.current;
      if (!chain) return undefined;

      if (!opts?.forceRefresh) {
        const cached = getCachedMoveFunction(
          metadataCacheRef.current,
          chain,
          id,
          moduleName,
          functionName,
        );
        if (cached) return cached;
      }

      const client = clientRef.current;
      if (!client) {
        reportClientUnavailable('Move function signature lookup');
        return undefined;
      }

      const inflightKey = `${chain}:${id}:${moduleName}:${functionName}`;
      if (!opts?.forceRefresh) {
        const inflight = moveFunctionInflightRef.current.get(inflightKey);
        if (inflight) return inflight;
      }

      const fetchMoveFunction = async (): Promise<
        CachedMoveFunction | undefined
      > => {
        const entry = await fetchMoveFunctionSignatureEntry(client, {
          packageId: id,
          moduleName,
          functionName,
        });
        const next = upsertCachedMoveFunction(
          metadataCacheRef.current,
          chain,
          entry,
        );
        metadataCacheRef.current = next.cache;
        setMetadataRevision((revision) => revision + 1);
        if (activeChainRef.current === chain) {
          setModules(next.modules);
        }
        return entry;
      };

      try {
        if (opts?.forceRefresh) {
          return await fetchMoveFunction();
        }
        const promise = fetchMoveFunction().finally(() => {
          moveFunctionInflightRef.current.delete(inflightKey);
        });
        moveFunctionInflightRef.current.set(inflightKey, promise);
        return await promise;
      } catch (error) {
        toastImpl({
          message: formatModelErrorMessage(
            error,
            `Move function signature lookup failed for ${id}::${moduleName}::${functionName}.`,
          ),
          variant: 'error',
        });
        return undefined;
      }
    },
    [reportClientUnavailable, toastImpl],
  );

  const getOwnedObjects = useCallback<PtbContextValue['getOwnedObjects']>(
    async (params) => {
      const { clientOverride, ...rest } = params ?? {};
      const client = clientOverride ?? clientRef.current;
      if (!client) {
        reportClientUnavailable('Owned object lookup');
        return undefined;
      }

      try {
        const page = await client.core.listOwnedObjects({
          owner: rest.owner,
          cursor: rest.cursor,
          limit: rest.limit,
          type: rest.type,
          include: {
            content: true,
            display: true,
          },
        });
        return {
          data: page.objects.map((object) => {
            const metadata = objectMetadataFromCoreObject(object);
            return {
              data: {
                objectId: object.objectId,
                type: object.type,
                version: object.version,
                digest: object.digest,
                owner: object.owner,
                metadata: metadata.ok ? metadata.object : undefined,
                content: { dataType: 'moveObject', type: object.type },
                display: object.display
                  ? { data: object.display.output }
                  : undefined,
              },
            };
          }),
          hasNextPage: page.hasNextPage,
          nextCursor: page.cursor,
        };
      } catch (error) {
        toastImpl({
          message: formatModelErrorMessage(
            error,
            'Failed to fetch owned objects.',
          ),
          variant: 'warning',
        });
        return undefined;
      }
    },
    [reportClientUnavailable, toastImpl],
  );

  // ---- on-chain loader (viewer) ---------------------------------------------

  const [codePipOpenTick, setCodePipOpenTick] = useState(0);
  const loadTxStatus = providerUiState.transaction;

  const loadFromOnChainTx: PtbContextValue['loadFromOnChainTx'] = useCallback(
    async (chain, txDigest, opts) => {
      const editable = opts?.mode === 'editable';
      explicitLoadStartedRef.current = true;
      const load = lifecycleRef.current.beginLoad('transaction');
      const digest = (txDigest || '').trim();
      if (!digest) {
        const error = 'Empty transaction digest.';
        lifecycleRef.current.fail(load, error);
        setProviderUiState((prev) => providerTransactionLoadError(prev, error));
        toastImpl({ message: error, variant: 'warning' });
        return ptbActionError(error);
      }

      try {
        const localClient = createCoreClient(chain);
        const res = await localClient.core.getTransaction({
          digest,
          include: PTB_TRANSACTION_LOAD_INCLUDE,
        });
        if (!lifecycleRef.current.isCurrent(load)) {
          return ptbActionError('Transaction load was superseded.');
        }

        const txResult = selectCoreTransactionResult(res);
        const programmable =
          coreTransactionResultToRawProgrammableTransactionInput(res);
        const status = txResult.status;
        const transactionStatus: TxStatus | undefined = status
          ? {
              status: status.success ? 'success' : 'failure',
              error: status.error?.message || status.error?.$kind,
              ...(status.error?.$kind !== undefined
                ? { errorKind: status.error.$kind }
                : {}),
            }
          : undefined;

        if (
          !programmable ||
          !Array.isArray(programmable.inputs) ||
          !Array.isArray(programmable.commands)
        ) {
          const error = 'Only ProgrammableTransaction is supported.';
          lifecycleRef.current.fail(load, error);
          setProviderUiState((prev) =>
            providerTransactionLoadError(prev, error),
          );
          toastImpl({
            message: error,
            variant: 'warning',
          });
          return ptbActionError(error);
        }

        // 1) Convert through the model boundary once, then collect object ids.
        const ir = rawTransactionToIR(programmable);
        const candidateIds = objectIdsFromIRInputs(ir.inputs);

        // 2) Fetch object metadata (best effort).
        const fetched: Array<PTBObjectData | undefined> = [];
        for (
          let start = 0;
          start < candidateIds.length;
          start += OBJECT_METADATA_FETCH_CONCURRENCY
        ) {
          if (!lifecycleRef.current.isCurrent(load)) {
            return ptbActionError('Transaction load was superseded.');
          }
          const batch = candidateIds.slice(
            start,
            start + OBJECT_METADATA_FETCH_CONCURRENCY,
          );
          const batchFetched = await Promise.all(
            batch.map(async (oid) => {
              try {
                return await fetchObjectData(localClient, oid);
              } catch (error) {
                if (lifecycleRef.current.isCurrent(load)) {
                  toastImpl({
                    message: formatModelErrorMessage(
                      error,
                      `Failed to fetch object ${oid}.`,
                    ),
                    variant: 'warning',
                  });
                }
                return undefined;
              }
            }),
          );
          fetched.push(...batchFetched);
        }
        if (!lifecycleRef.current.isCurrent(load)) {
          return ptbActionError('Transaction load was superseded.');
        }
        const objectsEmbed: PTBObjectsEmbed = {};
        for (const o of fetched) {
          if (o) objectsEmbed[o.objectId] = o;
        }

        const moveCallRefs = moveCallFunctionRefsFromIRCommands(ir.commands);

        // 3) Fetch Move signatures before surfacing diagnostics. Raw PTB
        // conversion cannot know MoveCall result arity, so pre-evidence
        // diagnostics can be stale by the time the editable graph is built.
        let loadCache = replaceCachedChainData(
          metadataCacheRef.current,
          chain,
          {
            modules: EMPTY_MODULES,
            objects: objectsEmbed,
          },
        );
        let moveSignatureFetchError: string | undefined;
        for (const ref of moveCallRefs) {
          if (!lifecycleRef.current.isCurrent(load)) {
            return ptbActionError('Transaction load was superseded.');
          }
          try {
            const entry = await fetchMoveFunctionSignatureEntry(
              localClient,
              ref,
            );
            const next = upsertCachedMoveFunction(loadCache, chain, entry);
            loadCache = next.cache;
          } catch (error) {
            // Normal transaction load cannot produce canonical MoveCall output
            // ports without signature evidence. Missing signatures are reported
            // as one load failure after all requested signatures run.
            moveSignatureFetchError ??= formatModelErrorMessage(
              error,
              `Failed to fetch Move function signature ${formatMoveCallFunctionRef(ref)}.`,
            );
          }
        }
        if (!lifecycleRef.current.isCurrent(load)) {
          return ptbActionError('Transaction load was superseded.');
        }
        const moveSignatures = moveSignatureEvidenceFromCache(loadCache, chain);
        const missingSignatures = missingMoveCallSignatureRefs(
          loadCache,
          chain,
          moveCallRefs,
        );
        if (missingSignatures.length > 0) {
          const error = formatMissingMoveCallSignatureMessage(
            missingSignatures,
            moveSignatureFetchError,
          );
          lifecycleRef.current.fail(load, error);
          setProviderUiState((prev) =>
            providerTransactionLoadError(prev, error),
          );
          toastImpl({ message: error, variant: 'error' });
          return ptbActionError(error);
        }
        const loadDiagnostics = validateLoadedTransactionIR(ir, moveSignatures);
        if (loadDiagnostics.length > 0) {
          toastImpl({
            message: formatModelErrorMessage(
              { diagnostics: loadDiagnostics },
              'Transaction loaded with model diagnostics.',
            ),
            variant: 'warning',
          });
        }
        const decoded = materializeGraphInputValues(
          transactionIRToGraph(ir, moveSignatures ? { moveSignatures } : {}),
          moveSignatures ? { moveSignatures } : {},
        ).graph;

        const nextView = { ...DEFAULT_PTB_VIEW };

        if (editable) {
          const layout = await autoLayoutPTBGraph(decoded, {
            targetCenter: TRANSACTION_LAYOUT_TARGET_CENTER,
          });
          if (!lifecycleRef.current.isCurrent(load)) {
            return ptbActionError('Transaction load was superseded.');
          }
          const graphForBaseline = layout.ok ? layout.graph : decoded;
          const baselineSnapshot = createEditorSessionSnapshot({
            chain,
            graph: graphForBaseline,
            modules: loadCache.modulesByChain[chain] ?? EMPTY_MODULES,
            objects: objectsEmbed,
          });
          const baselineDoc = buildDoc({
            chain,
            graph: graphForBaseline,
            view: nextView,
            modules: loadCache.modulesByChain[chain] ?? EMPTY_MODULES,
            objects: objectsEmbed,
          });
          const delivery = deliverForcedDocChange(baselineDoc);
          if (!delivery.ok) {
            lifecycleRef.current.fail(load, delivery.error);
            return delivery;
          }
          cancelPendingDocChange();
          resetBeforeLoad({ preserveLastDocSig: true });
          metadataCacheRef.current = loadCache;
          setMetadataRevision((revision) => revision + 1);
          setActiveChain(chain);
          setDocSender(undefined);
          setModules(loadCache.modulesByChain[chain] ?? EMPTY_MODULES);
          setPackageIndexes(
            metadataCacheRef.current.packageIndexesByChain[chain] ??
              EMPTY_PACKAGE_INDEXES,
          );
          setObjects(objectsEmbed);
          setView(nextView);
          replaceGraphImmediate(graphForBaseline, {
            viewportPolicy: { kind: 'set', viewport: nextView },
          });
          resetEditorHistory(baselineSnapshot);
          setReadOnly(false);
          setProviderUiState(providerReadyEditable());
          setCodePipOpenTick((tick) => tick + 1);
          lifecycleRef.current.complete(load, 'ready-editable');
        } else {
          // Read-only inspection has no document baseline; compute display
          // layout before rehydrating so it cannot race RF measurement timing.
          const layout = await autoLayoutPTBGraph(decoded, {
            targetCenter: TRANSACTION_LAYOUT_TARGET_CENTER,
          });
          if (!lifecycleRef.current.isCurrent(load)) {
            return ptbActionError('Transaction load was superseded.');
          }
          if (!layout.ok) {
            toastImpl({
              message: `Transaction loaded, but auto layout failed: ${layout.error}`,
              variant: 'warning',
            });
          }
          const graphForReadonly = layout.ok ? layout.graph : decoded;

          cancelPendingDocChange();
          resetBeforeLoad();
          metadataCacheRef.current = loadCache;
          setMetadataRevision((revision) => revision + 1);
          setActiveChain(chain);
          setDocSender(undefined);
          setModules(loadCache.modulesByChain[chain] ?? EMPTY_MODULES);
          setPackageIndexes(
            metadataCacheRef.current.packageIndexesByChain[chain] ??
              EMPTY_PACKAGE_INDEXES,
          );
          setObjects(objectsEmbed);
          setView(nextView);
          replaceGraphImmediate(graphForReadonly, {
            viewportPolicy: { kind: 'fit' },
          });
          resetEditorHistory();
          setReadOnly(true);
          setProviderUiState(
            providerReadyReadonlyTransaction(transactionStatus),
          );
          setCodePipOpenTick(0);
          lifecycleRef.current.complete(load, 'ready-readonly-transaction');
        }

        void (async () => {
          const packageIds = moveCallPackageIdsFromIRCommands(ir.commands);
          for (const packageId of packageIds) {
            if (!lifecycleRef.current.isCurrent(load)) return;
            try {
              const movePackage = await fetchMovePackageIndex(
                localClient,
                packageId,
              );
              const next = upsertCachedMovePackageIndex(
                metadataCacheRef.current,
                chain,
                movePackage,
              );
              metadataCacheRef.current = next.cache;
              if (activeChainRef.current === chain) {
                setPackageIndexes(next.packageIndexes);
              }
            } catch (error) {
              if (lifecycleRef.current.isCurrent(load)) {
                toastImpl({
                  message: formatModelErrorMessage(
                    error,
                    `Failed to fetch Move package index for ${packageId}.`,
                  ),
                  variant: 'warning',
                });
              }
            }
          }

          for (const ref of moveCallRefs) {
            if (!lifecycleRef.current.isCurrent(load)) return;
            const cached = getCachedMoveFunction(
              metadataCacheRef.current,
              chain,
              ref.packageId,
              ref.moduleName,
              ref.functionName,
            );
            if (cached) continue;
            try {
              const entry = await fetchMoveFunctionSignatureEntry(
                localClient,
                ref,
              );
              const next = upsertCachedMoveFunction(
                metadataCacheRef.current,
                chain,
                entry,
              );
              metadataCacheRef.current = next.cache;
              setMetadataRevision((revision) => revision + 1);
              if (activeChainRef.current === chain) {
                setModules(next.modules);
              }
            } catch (error) {
              if (lifecycleRef.current.isCurrent(load)) {
                toastImpl({
                  message: formatModelErrorMessage(
                    error,
                    `Failed to fetch Move function signature for ${ref.packageId}::${ref.moduleName}::${ref.functionName}.`,
                  ),
                  variant: 'warning',
                });
              }
            }
          }
        })();

        return PTB_ACTION_OK;
      } catch (e: any) {
        if (!lifecycleRef.current.isCurrent(load)) {
          return ptbActionError('Transaction load was superseded.');
        }
        const error = e?.message || 'Failed to load transaction from chain.';
        lifecycleRef.current.fail(load, error);
        setProviderUiState((prev) => providerTransactionLoadError(prev, error));
        toastImpl({
          message: error,
          variant: 'error',
        });
        return ptbActionError(error);
      }
    },
    [
      toastImpl,
      replaceGraphImmediate,
      fetchObjectData,
      fetchMovePackageIndex,
      createCoreClient,
      cancelPendingDocChange,
      deliverForcedDocChange,
      resetEditorHistory,
    ],
  );

  // ---- document loader (editor) ---------------------------------------------

  const loadFromDoc = useCallback<PtbContextValue['loadFromDoc']>(
    (value) => {
      if (!initialChainLoadRef.current) {
        explicitLoadStartedRef.current = true;
      }
      const load = lifecycleRef.current.beginLoad('document');

      if (typeof value !== 'string') {
        let doc;
        try {
          doc = prepareLoadedDoc(value);
        } catch (e: any) {
          const error = formatModelErrorMessage(e, 'Invalid PTB document.');
          lifecycleRef.current.fail(load, error);
          setProviderUiState((prev) => providerDocumentLoadError(prev, error));
          toastImpl({
            message: error,
            variant: 'error',
          });
          return ptbActionError(error);
        }

        const nextView = doc.view;
        const nextCache = replaceCachedChainData(
          metadataCacheRef.current,
          doc.chain,
          { modules: doc.modules, objects: doc.objects },
        );
        const graphForEditing = materializeGraphInputValues(doc.graph, {
          moveSignatures: moveSignatureEvidenceFromCache(nextCache, doc.chain),
        }).graph;
        const loadedDoc =
          graphForEditing === doc.graph
            ? doc.doc
            : buildDoc({
                chain: doc.chain,
                graph: graphForEditing,
                view: doc.view,
                sender: doc.doc.sender,
                modules: doc.modules,
                objects: doc.objects,
              });
        const baselineSnapshot = createEditorSessionSnapshot({
          chain: doc.chain,
          graph: graphForEditing,
          sender: loadedDoc.sender,
          modules: doc.modules,
          objects: doc.objects,
        });
        const delivery = deliverForcedDocChange(loadedDoc);
        if (!delivery.ok) {
          lifecycleRef.current.fail(load, delivery.error);
          return delivery;
        }
        cancelPendingDocChange();
        resetBeforeLoad({ preserveLastDocSig: true });
        metadataCacheRef.current = nextCache;
        setMetadataRevision((revision) => revision + 1);

        setView(nextView);
        setActiveChain(doc.chain);
        setDocSender(loadedDoc.sender);
        setModules(doc.modules);
        setPackageIndexes(
          metadataCacheRef.current.packageIndexesByChain[doc.chain] ??
            EMPTY_PACKAGE_INDEXES,
        );
        setObjects(doc.objects);
        replaceGraphImmediate(graphForEditing, {
          viewportPolicy: { kind: 'set', viewport: nextView },
        });
        resetEditorHistory(baselineSnapshot);
        setReadOnly(false);
        setProviderUiState(providerReadyEditable());
        setCodePipOpenTick((t) => t + 1);
        lifecycleRef.current.complete(load, 'ready-editable');
        return PTB_ACTION_OK;
      } else {
        const chain = value;
        let doc;
        try {
          doc = createEmptyPTBDoc(chain);
        } catch (error) {
          const message = formatModelErrorMessage(
            error,
            'Failed to create an empty PTB document.',
          );
          lifecycleRef.current.fail(load, message);
          setProviderUiState((prev) =>
            providerDocumentLoadError(prev, message),
          );
          toastImpl({ message, variant: 'error' });
          return ptbActionError(message);
        }
        const nextView = doc.view;
        const nextGraph = doc.graph;
        const baselineSnapshot = createEditorSessionSnapshot({
          chain,
          graph: nextGraph,
          modules: EMPTY_MODULES,
          objects: EMPTY_OBJECTS,
        });
        const nextCache = replaceCachedChainData(
          metadataCacheRef.current,
          chain,
          { modules: EMPTY_MODULES, objects: EMPTY_OBJECTS },
        );
        const delivery = deliverForcedDocChange(doc);
        if (!delivery.ok) {
          lifecycleRef.current.fail(load, delivery.error);
          return delivery;
        }
        cancelPendingDocChange();
        resetBeforeLoad({ preserveLastDocSig: true });
        metadataCacheRef.current = nextCache;
        setMetadataRevision((revision) => revision + 1);
        setView(nextView);
        setActiveChain(chain);
        setDocSender(undefined);
        setModules(EMPTY_MODULES);
        setPackageIndexes(
          metadataCacheRef.current.packageIndexesByChain[chain] ??
            EMPTY_PACKAGE_INDEXES,
        );
        setObjects(EMPTY_OBJECTS);
        replaceGraphImmediate(nextGraph, {
          viewportPolicy: { kind: 'set', viewport: nextView },
        });
        resetEditorHistory(baselineSnapshot);
        setReadOnly(false);
        setProviderUiState(providerReadyEditable());
        setCodePipOpenTick((t) => t + 1);
        lifecycleRef.current.complete(load, 'ready-editable');
        return PTB_ACTION_OK;
      }
    },
    [
      cancelPendingDocChange,
      deliverForcedDocChange,
      replaceGraphImmediate,
      resetEditorHistory,
      toastImpl,
    ],
  );

  const applyEditorSessionSnapshot = useCallback(
    (snapshot: EditorSessionSnapshot): PTBActionResult => {
      const load = lifecycleRef.current.beginLoad('document');
      try {
        const restoreView =
          flowActionsRef.current.getViewportState?.() ??
          viewRef.current ??
          DEFAULT_PTB_VIEW;
        const nextCache = replaceCachedChainData(
          metadataCacheRef.current,
          snapshot.chain,
          { modules: snapshot.modules, objects: snapshot.objects },
        );
        let restoredDoc: PTBDoc;
        try {
          restoredDoc = buildDoc({
            chain: snapshot.chain,
            graph: snapshot.graph,
            view: restoreView,
            sender: snapshot.sender,
            modules: snapshot.modules,
            objects: snapshot.objects,
          });
        } catch (error) {
          const restoredDocError = formatModelErrorMessage(
            error,
            'PTB document change failed after restoring editor history.',
          );
          lifecycleRef.current.fail(load, restoredDocError);
          setProviderUiState((prev) =>
            providerDocumentEmitError(prev, restoredDocError),
          );
          return ptbActionError(restoredDocError);
        }
        const delivery = deliverForcedDocChange(restoredDoc);
        if (!delivery.ok) {
          lifecycleRef.current.fail(load, delivery.error);
          return delivery;
        }

        cancelPendingDocChange();
        resetBeforeLoad({ preserveLastDocSig: true });
        metadataCacheRef.current = nextCache;
        setMetadataRevision((revision) => revision + 1);
        setView(restoreView);
        setActiveChain(snapshot.chain);
        setDocSender(snapshot.sender);
        setModules(snapshot.modules);
        setPackageIndexes(
          metadataCacheRef.current.packageIndexesByChain[snapshot.chain] ??
            EMPTY_PACKAGE_INDEXES,
        );
        setObjects(snapshot.objects);
        editorHistoryRestoreInFlightRef.current = true;
        const rehydrateEpoch = replaceGraphImmediate(snapshot.graph, {
          viewportPolicy: { kind: 'set', viewport: restoreView },
        });
        editorHistoryRestoreEpochRef.current = rehydrateEpoch;
        setReadOnly(false);
        setProviderUiState(providerReadyEditable());
        lifecycleRef.current.complete(load, 'ready-editable');
        return PTB_ACTION_OK;
      } catch (error) {
        editorHistoryRestoreInFlightRef.current = false;
        editorHistoryRestoreEpochRef.current = undefined;
        const message = formatModelErrorMessage(
          error,
          'Failed to restore editor history.',
        );
        lifecycleRef.current.fail(load, message);
        setProviderUiState((prev) => providerDocumentLoadError(prev, message));
        toastImpl({ message, variant: 'error' });
        return ptbActionError(message);
      }
    },
    [
      cancelPendingDocChange,
      deliverForcedDocChange,
      replaceGraphImmediate,
      toastImpl,
    ],
  );

  const undo = useCallback<PtbContextValue['undo']>(() => {
    if (readOnlyRef.current) {
      return ptbActionError('Undo is unavailable in read-only mode.');
    }
    const current = editorHistoryRestoreInFlightRef.current
      ? undefined
      : captureEditorSnapshotResult();
    const transaction = editorHistoryRef.current.beginUndo(
      current?.ok ? current.snapshot : undefined,
    );
    refreshEditorHistoryAvailability();
    if (!transaction) return PTB_ACTION_OK;
    const result = applyEditorSessionSnapshot(transaction.snapshot);
    if (result.ok) transaction.commit();
    else transaction.cancel();
    refreshEditorHistoryAvailability();
    return result;
  }, [
    applyEditorSessionSnapshot,
    captureEditorSnapshotResult,
    refreshEditorHistoryAvailability,
  ]);

  const redo = useCallback<PtbContextValue['redo']>(() => {
    if (readOnlyRef.current) {
      return ptbActionError('Redo is unavailable in read-only mode.');
    }
    const current = editorHistoryRestoreInFlightRef.current
      ? undefined
      : captureEditorSnapshotResult();
    const transaction = editorHistoryRef.current.beginRedo(
      current?.ok ? current.snapshot : undefined,
    );
    refreshEditorHistoryAvailability();
    if (!transaction) return PTB_ACTION_OK;
    const result = applyEditorSessionSnapshot(transaction.snapshot);
    if (result.ok) transaction.commit();
    else transaction.cancel();
    refreshEditorHistoryAvailability();
    return result;
  }, [
    applyEditorSessionSnapshot,
    captureEditorSnapshotResult,
    refreshEditorHistoryAvailability,
  ]);

  const loadFromDocRef = useRef(loadFromDoc);
  useEffect(() => {
    loadFromDocRef.current = loadFromDoc;
  }, [loadFromDoc]);

  useEffect(() => {
    if (
      !initialChain ||
      initialChainLoadedRef.current ||
      explicitLoadStartedRef.current ||
      activeChainRef.current
    ) {
      return;
    }
    initialChainLoadedRef.current = true;
    initialChainLoadRef.current = true;
    try {
      loadFromDocRef.current(initialChain);
    } finally {
      initialChainLoadRef.current = false;
    }
  }, [initialChain]);

  // ---- export doc ------------------------------------------------------------

  const exportDocResult = useCallback<PtbContextValue['exportDocResult']>(
    (opts) => {
      const result = captureDocResult(opts);
      if (!result.ok) {
        setProviderUiState((prev) => providerExportError(prev, result.error));
        toastImpl({
          message: result.error,
          variant: 'error',
        });
        return result;
      }
      setProviderUiState(clearProviderNoticeState);
      return result;
    },
    [captureDocResult, toastImpl],
  );

  const exportDoc = useCallback<PtbContextValue['exportDoc']>(
    (opts) => {
      const result = exportDocResult(opts);
      return result.ok ? result.doc : undefined;
    },
    [exportDocResult],
  );

  // ---- well-known helpers ----------------------------------------------------

  function computeWellKnownPresence(g: PTBGraph): Record<WellKnownId, boolean> {
    const set = new Set((g.nodes || []).map((n) => n.id));
    const hasGas = (g.nodes || []).some(
      (node) =>
        node.id === KNOWN_IDS.GAS ||
        (node.kind === 'Variable' && node.semantic?.kind === 'GasCoin'),
    );
    return {
      [KNOWN_IDS.START]: set.has(KNOWN_IDS.START),
      [KNOWN_IDS.END]: set.has(KNOWN_IDS.END),
      [KNOWN_IDS.GAS]: hasGas,
    };
  }

  const isWellKnownAvailable = useCallback(
    (k: WellKnownId) => !wellKnown[k],
    [wellKnown],
  );

  // ---- context value ---------------------------------------------------------

  const ctx: PtbContextValue = useMemo(
    () => ({
      graph,
      setGraph,
      setViewExternal,

      chain: activeChain,
      readOnly: !!readOnly,

      theme,
      setTheme,
      showThemeSelector,
      showExportButton,

      objects,
      lookupObjectMetadata,

      modules,
      packageIndexes,
      moveSignatures,
      getMovePackage,
      ensureMoveFunctionSignature,

      getOwnedObjects,

      providerUiState,
      clearProviderNotice,
      loadTxStatus,
      loadFromOnChainTx,
      loadFromDoc,
      undo,
      redo,
      canUndo: editorHistoryAvailability.canUndo,
      canRedo: editorHistoryAvailability.canRedo,
      exportDoc,
      exportDocResult,
      captureCurrentDocResult,

      createUniqueId: genId,

      execOpts: execOptsProp,

      runTx: executeTxProp ? runTx : undefined,
      dryRunTx: simulateTxProp ? dryRunTx : undefined,
      toast: toastImpl,

      isWellKnownAvailable,

      registerFlowActions,

      graphEpoch,
      graphRehydrateViewportPolicy,
      completeGraphRehydrate,
      codePipOpenTick,
    }),
    [
      graph,
      setGraph,
      setViewExternal,
      activeChain,
      readOnly,
      theme,
      showThemeSelector,
      showExportButton,
      objects,
      lookupObjectMetadata,
      modules,
      packageIndexes,
      moveSignatures,
      getMovePackage,
      ensureMoveFunctionSignature,
      getOwnedObjects,
      providerUiState,
      clearProviderNotice,
      loadTxStatus,
      loadFromOnChainTx,
      loadFromDoc,
      undo,
      redo,
      editorHistoryAvailability.canUndo,
      editorHistoryAvailability.canRedo,
      exportDoc,
      exportDocResult,
      captureCurrentDocResult,
      genId,
      execOptsProp,
      executeTxProp,
      runTx,
      simulateTxProp,
      dryRunTx,
      toastImpl,
      isWellKnownAvailable,
      registerFlowActions,
      graphEpoch,
      graphRehydrateViewportPolicy,
      completeGraphRehydrate,
      codePipOpenTick,
    ],
  );

  return <PtbContext.Provider value={ctx}>{children}</PtbContext.Provider>;
}

// ===== Hook ==================================================================

export function usePtb() {
  const ctx = useContext(PtbContext);
  if (!ctx) throw new Error('usePtb must be used within PtbProvider');
  return ctx;
}

function validateLoadedTransactionIR(
  ir: TransactionIR,
  moveSignatures: MovePackageSignatureEvidence | undefined,
): readonly TransactionDiagnostic[] {
  return validateTransactionIR(ir, {
    includeExistingDiagnostics: true,
    moveSignatures,
  });
}
