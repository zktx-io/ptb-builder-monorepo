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
import { rawTransactionToIR, transactionIRToGraph } from '@zktx.io/ptb-model';
import type { PTBModelError } from '@zktx.io/ptb-model';

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
import { executionResultToast } from './executionResult';
import type {
  HostExecutionResult,
  HostSimulationResult,
} from './executionResult';
import { stableGraphSig } from './graphSignature';
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
import type { PTBGraph } from '../ptb/graph/types';
import {
  createPTBMetadataCache,
  getCachedMoveFunction,
  replaceCachedChainData,
  upsertCachedMoveFunction,
  upsertCachedObjectData,
} from '../ptb/metadataCache';
import { toPTBFunctionDataEntry } from '../ptb/move/toPTBModuleData';
import {
  type ObjectAuthoringInfo,
  objectAuthoringInfoFromCoreObject,
  type ObjectAuthoringLookupResult,
} from '../ptb/objectAuthoring';
import {
  buildDoc,
  createEmptyPTBDoc,
  DEFAULT_PTB_VIEW,
  hasSameCanonicalPTBView,
  prepareLoadedDoc,
  type PTBDoc,
  PTBFunctionData,
  PTBModulesEmbed,
  PTBObjectData,
  PTBObjectsEmbed,
  stablePTBDocSignature,
} from '../ptb/ptbDoc';
import type { RuntimeEnvelope } from '../ptb/runtimeAdapter';
import { KNOWN_IDS, type WellKnownId } from '../ptb/seedGraph';
import {
  coreTransactionResultToRawProgrammableTransactionInput,
  createPtbCoreClient,
  objectIdsFromRawProgrammableTransactionInput,
  PTB_TRANSACTION_LOAD_INCLUDE,
  type PtbCoreClient,
  selectCoreTransactionResult,
} from '../ptb/suiClient';
import type { Chain, Theme, ToastAdapter } from '../types';
import { toColorMode } from '../types';

const VIEW_CHANGE_DEBOUNCE_MS = 250;
const DOC_CHANGE_DEBOUNCE_MS = 150;
const DOC_CHANGE_MAX_WAIT_MS = 1000;
const DOC_EMIT_ERROR_REPEAT_MS = 30_000;
const DOC_EMIT_ERROR_REPEAT_COUNT = 5;
const EMPTY_OBJECTS = Object.freeze({}) as PTBObjectsEmbed;
const EMPTY_MODULES = Object.freeze({}) as PTBModulesEmbed;

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
      authoring?: ObjectAuthoringInfo;
      content?: { dataType: 'moveObject'; type: string };
      display?: { data?: Record<string, unknown> | null };
    };
  }>;
  hasNextPage: boolean;
  nextCursor?: string | null;
};

type HostTxResult = HostExecutionResult;

type MoveFunctionSignature = {
  packageId: string;
  moduleName: string;
  functionName: string;
  signature: PTBFunctionData[string];
};

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
  lookupObjectForAuthoring: (
    objectId: string,
    opts?: { clientOverride?: PtbCoreClient },
  ) => Promise<ObjectAuthoringLookupResult>;

  modules: PTBModulesEmbed;
  getMoveFunction: (
    packageId: string,
    moduleName: string,
    functionName: string,
    opts?: { forceRefresh?: boolean },
  ) => Promise<MoveFunctionSignature | undefined>;

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
  ) => Promise<PTBActionResult>;
  loadFromDoc: (data: PTBDoc | Chain) => PTBActionResult;

  // Persistence
  exportDoc: (opts?: { sender?: string }) => PTBDoc | undefined;
  exportDocResult: (opts?: { sender?: string }) => PTBExportDocResult;

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

  registerFlowActions: (a: {
    fitToContent?: () => void;
    updateViewport?: (v?: { x: number; y: number; zoom: number }) => void;
  }) => void;

  graphEpoch: number;

  codePipOpenTick: number;
};

const PtbContext = createContext<PtbContextValue | undefined>(undefined);

// ===== Provider props =========================================================

export type PtbProviderProps = {
  children: React.ReactNode;
  onDocChange?: (doc: PTBDoc) => void;

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

function modelErrorMessage(error: unknown, fallback: string): string {
  const diagnostics = (error as Partial<PTBModelError> | undefined)
    ?.diagnostics;
  if (Array.isArray(diagnostics) && diagnostics.length > 0) {
    return diagnostics.map((diagnostic) => diagnostic.message).join(' ');
  }
  return (error as { message?: string } | undefined)?.message || fallback;
}

// ===== Provider ===============================================================

export function PtbProvider({
  children,
  onDocChange,

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
  const flowActionsRef = React.useRef<{
    fitToContent?: () => void;
    updateViewport?: (v?: { x: number; y: number; zoom: number }) => void;
  }>({});

  const registerFlowActions = React.useCallback(
    (a: {
      fitToContent?: () => void;
      updateViewport?: (v?: { x: number; y: number; zoom: number }) => void;
    }) => {
      flowActionsRef.current = { ...flowActionsRef.current, ...a };
    },
    [],
  );

  // Editor mode
  const [readOnly, setReadOnly] = useState<boolean>(false);

  // Chain & client
  const [activeChain, setActiveChain] = useState<Chain | undefined>(undefined);
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
      const message = modelErrorMessage(error, 'Failed to create Sui client.');
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

  // Well-known presence
  const [wellKnown, setWellKnown] = useState<Record<WellKnownId, boolean>>(() =>
    computeWellKnownPresence({ nodes: [], edges: [] }),
  );

  // Monotonic ID nonce (doc-scoped)
  const [, setIdNonce] = useState<number>(() => seedNonceFromGraph(graph));
  const genId = useCallback((prefix = 'id') => {
    let nextVal!: number;
    setIdNonce((prev) => (nextVal = prev + 1));
    return `${prefix}-${nextVal}`;
  }, []);

  // Epoch to separate "inject → RF" from "edit → save"
  const [graphEpoch, setGraphEpoch] = useState(0);

  // Chain caches
  const [objects, setObjects] = useState<PTBObjectsEmbed>(() => EMPTY_OBJECTS);
  const [modules, setModules] = useState<PTBModulesEmbed>(() => EMPTY_MODULES);
  const metadataCacheRef = useRef(createPTBMetadataCache());
  const docSlicesRef = useRef({ graph, modules, objects });
  docSlicesRef.current = { graph, modules, objects };
  const lastDocSigRef = useRef<string | undefined>(undefined);
  const lifecycleRef = useRef(createProviderLifecycleController());
  const [providerUiState, setProviderUiState] = useState<ProviderUiState>(
    () => INITIAL_PROVIDER_UI_STATE,
  );

  const clearProviderNotice = useCallback(() => {
    setProviderUiState(clearProviderNoticeState);
  }, []);

  // Reset caches on chain change
  const resetBeforeLoad = () => {
    lastDocSigRef.current = undefined;
    lastDocEmitErrorRef.current = undefined;
    setActiveChain(undefined);
    setObjects(EMPTY_OBJECTS);
    setModules(EMPTY_MODULES);
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

  const setGraph = useCallback((g: PTBGraph) => {
    const norm = normalizeGraph(g);
    const nextSig = stableGraphSig(norm);
    if (nextSig === lastGraphSigRef.current) {
      return;
    }
    lastGraphSigRef.current = nextSig;
    setGraphState(norm);
    setWellKnown(computeWellKnownPresence(norm));
    setIdNonce((prev) => Math.max(prev, seedNonceFromGraph(norm)));
  }, []);

  const replaceGraphImmediate = useCallback((g: PTBGraph) => {
    const norm = normalizeGraph(g);
    lastGraphSigRef.current = stableGraphSig(norm);
    setGraphState(norm);
    setWellKnown(computeWellKnownPresence(norm));
    setIdNonce(seedNonceFromGraph(norm));
    setGraphEpoch((e) => e + 1); // rehydrate RF once per load
  }, []);

  // ---- PTBDoc: batch graph edits, debounce viewport-only changes ------------

  const onDocChangeRef = useRef(onDocChange);
  onDocChangeRef.current = onDocChange;
  const hadOnDocChangeRef = useRef(Boolean(onDocChange));
  const lastDocEmitErrorRef = useRef<
    | {
        message: string;
        count: number;
        reportedAt: number;
      }
    | undefined
  >(undefined);
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
      modules: modulesSnap ?? {},
      objects: objectsSnap ?? {},
    });
  }, []);

  const reportDocEmitError = useCallback(
    (error: unknown, fallback: string) => {
      const message = modelErrorMessage(error, fallback);
      const previous = lastDocEmitErrorRef.current;
      const now = Date.now();
      const count = previous?.message === message ? previous.count + 1 : 1;
      const shouldReport =
        !previous ||
        previous.message !== message ||
        count % DOC_EMIT_ERROR_REPEAT_COUNT === 0 ||
        now - previous.reportedAt >= DOC_EMIT_ERROR_REPEAT_MS;

      if (shouldReport) {
        toastImpl({
          message: count > 1 ? `${message} (repeated ${count} times)` : message,
          variant: 'error',
        });
      }
      setProviderUiState((prev) =>
        providerDocumentEmitError(
          prev,
          count > 1 ? `${message} (repeated ${count} times)` : message,
        ),
      );

      lastDocEmitErrorRef.current = {
        message,
        count,
        reportedAt: shouldReport ? now : (previous?.reportedAt ?? now),
      };
    },
    [toastImpl],
  );

  const deliverDocChange = useCallback(
    (doc: PTBDoc) => {
      const nextSig = stablePTBDocSignature(doc);
      const onDocChangeCurrent = onDocChangeRef.current;
      if (!onDocChangeCurrent) {
        lastDocSigRef.current = undefined;
        return;
      }
      if (lastDocSigRef.current === nextSig) return;

      try {
        onDocChangeCurrent(doc);
        lastDocSigRef.current = nextSig;
        lastDocEmitErrorRef.current = undefined;
      } catch (error) {
        reportDocEmitError(error, 'PTB document change handler failed.');
      }
    },
    [reportDocEmitError],
  );

  const emitDocChange = useCallback(() => {
    let doc: PTBDoc | undefined;
    try {
      doc = buildDocFromRefs();
    } catch (error) {
      reportDocEmitError(error, 'PTB document update failed.');
      return;
    }
    if (!doc) return;
    deliverDocChange(doc);
  }, [buildDocFromRefs, deliverDocChange, reportDocEmitError]);
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

  const scheduleDocChange = useCallback((reason: 'content' | 'view') => {
    docEmissionSchedulerRef.current?.schedule(reason);
  }, []);

  useEffect(() => {
    if (!activeChainRef.current) return;
    scheduleDocChange('content');
  }, [graph, modules, objects, activeChain, scheduleDocChange]);

  useEffect(() => {
    if (!activeChainRef.current || !view) return;
    scheduleDocChange('view');
  }, [view, scheduleDocChange]);

  useEffect(() => {
    const hadOnDocChange = hadOnDocChangeRef.current;
    const hasOnDocChange = Boolean(onDocChange);
    hadOnDocChangeRef.current = hasOnDocChange;
    if (!hadOnDocChange && hasOnDocChange) {
      emitDocChange();
    }
  }, [onDocChange, emitDocChange]);

  useEffect(
    () => () => {
      lifecycleRef.current.cancel();
      flushPendingDocChange();
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

  const lookupObjectForAuthoring = useCallback<
    PtbContextValue['lookupObjectForAuthoring']
  >(
    async (objectId, opts) => {
      const id = objectId?.trim();
      if (!id) return { ok: false, error: 'Object id is required.' };

      const chain = activeChainRef.current;
      if (!chain) return { ok: false, error: 'No active chain selected.' };

      const client = opts?.clientOverride ?? clientRef.current;
      if (!client) {
        const error =
          'Object authoring lookup unavailable: no Sui client is active for the selected chain.';
        reportClientUnavailable('Object authoring lookup');
        return { ok: false, error };
      }

      try {
        const resp = await client.core.getObject({
          objectId: id,
          include: { content: true },
        });
        const parsed = objectAuthoringInfoFromCoreObject(resp.object);
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
          error: modelErrorMessage(error, `Failed to fetch object ${id}.`),
        };
      }
    },
    [reportClientUnavailable],
  );

  const getMoveFunction = useCallback<PtbContextValue['getMoveFunction']>(
    async (packageId, moduleName, functionName, opts) => {
      const id = packageId?.trim();
      const module = moduleName?.trim();
      const name = functionName?.trim();
      if (!id || !id.startsWith('0x')) {
        toastImpl({ message: 'Invalid package id', variant: 'warning' });
        return undefined;
      }
      if (!module || !name) {
        toastImpl({
          message: 'Enter package, module, and function',
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
          module,
          name,
        );
        if (cached) return cached;
      }

      const client = clientRef.current;
      if (!client) {
        reportClientUnavailable('Move function lookup');
        return undefined;
      }

      try {
        const response = await client.core.getMoveFunction({
          packageId: id,
          moduleName: module,
          name,
        });
        const signature = toPTBFunctionDataEntry(response.function);
        const resolvedPackageId = response.function.packageId || id;
        const resolvedModuleName = response.function.moduleName || module;
        const resolvedFunctionName = response.function.name || name;

        const next = upsertCachedMoveFunction(metadataCacheRef.current, chain, {
          packageId: resolvedPackageId,
          moduleName: resolvedModuleName,
          functionName: resolvedFunctionName,
          signature,
        });
        metadataCacheRef.current = next.cache;
        if (activeChainRef.current === chain) {
          setModules(next.modules);
        }

        return {
          packageId: resolvedPackageId,
          moduleName: resolvedModuleName,
          functionName: resolvedFunctionName,
          signature,
        };
      } catch (error: any) {
        toastImpl({
          message: error?.message || 'Move function lookup failed',
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
            const authoring = objectAuthoringInfoFromCoreObject(object);
            return {
              data: {
                objectId: object.objectId,
                type: object.type,
                version: object.version,
                digest: object.digest,
                owner: object.owner,
                authoring: authoring.ok ? authoring.object : undefined,
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
          message: modelErrorMessage(error, 'Failed to fetch owned objects.'),
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
    async (chain, txDigest) => {
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

        // 1) Collect candidate object ids (from SDK/model raw CallArg inputs).
        const candidateIds =
          objectIdsFromRawProgrammableTransactionInput(programmable);

        // 2) Fetch object metadata (best effort).
        const fetched = await Promise.all(
          candidateIds.map(async (oid) => {
            try {
              return await fetchObjectData(localClient, oid);
            } catch (error) {
              if (lifecycleRef.current.isCurrent(load)) {
                toastImpl({
                  message: modelErrorMessage(
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
        if (!lifecycleRef.current.isCurrent(load)) {
          return ptbActionError('Transaction load was superseded.');
        }
        const objectsEmbed: PTBObjectsEmbed = {};
        for (const o of fetched) {
          if (o) objectsEmbed[o.objectId] = o;
        }

        // 3) Convert through the model boundary.
        const ir = rawTransactionToIR(programmable);
        ir.diagnostics.forEach(({ message }) => {
          toastImpl({ message, variant: 'warning' });
        });
        const decoded = transactionIRToGraph(ir);

        // 4) Fix chain and prime caches (overwrite, no carry-over).
        resetBeforeLoad();
        metadataCacheRef.current = replaceCachedChainData(
          metadataCacheRef.current,
          chain,
          { modules: EMPTY_MODULES, objects: objectsEmbed },
        );
        setActiveChain(chain);
        setModules(EMPTY_MODULES);
        setObjects(objectsEmbed);
        const nextView = { ...DEFAULT_PTB_VIEW };
        setView(nextView);

        // 5) Replace snapshot (viewer mode) and bump epoch.
        replaceGraphImmediate(decoded);
        setReadOnly(true);
        setProviderUiState(providerReadyReadonlyTransaction(transactionStatus));

        setCodePipOpenTick(0);
        lifecycleRef.current.complete(load, 'ready-readonly-transaction');

        lifecycleRef.current.afterAnimationFrames(load, () => {
          flowActionsRef.current.fitToContent?.();
        });
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
    [toastImpl, replaceGraphImmediate, fetchObjectData, createCoreClient],
  );

  // ---- document loader (editor) ---------------------------------------------

  const loadFromDoc = useCallback<PtbContextValue['loadFromDoc']>(
    (value) => {
      const load = lifecycleRef.current.beginLoad('document');

      if (typeof value !== 'string') {
        let doc;
        try {
          doc = prepareLoadedDoc(value);
        } catch (e: any) {
          const error = modelErrorMessage(e, 'Invalid PTB document.');
          lifecycleRef.current.fail(load, error);
          setProviderUiState((prev) => providerDocumentLoadError(prev, error));
          toastImpl({
            message: error,
            variant: 'error',
          });
          return ptbActionError(error);
        }

        resetBeforeLoad();
        const nextView = doc.view;
        metadataCacheRef.current = replaceCachedChainData(
          metadataCacheRef.current,
          doc.chain,
          { modules: doc.modules, objects: doc.objects },
        );

        setView(nextView);
        setActiveChain(doc.chain);
        setModules(doc.modules);
        setObjects(doc.objects);
        replaceGraphImmediate(doc.graph);
        setReadOnly(false);
        setProviderUiState(providerReadyEditable());
        setCodePipOpenTick((t) => t + 1);
        deliverDocChange(doc.doc);
        lifecycleRef.current.complete(load, 'ready-editable');
        lifecycleRef.current.afterAnimationFrames(load, () => {
          flowActionsRef.current.updateViewport?.(nextView);
        });
        return PTB_ACTION_OK;
      } else {
        const chain = value;
        let doc;
        try {
          doc = createEmptyPTBDoc(chain);
        } catch (error) {
          const message = modelErrorMessage(
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
        resetBeforeLoad();
        const nextView = doc.view;
        const nextGraph = doc.graph;
        metadataCacheRef.current = replaceCachedChainData(
          metadataCacheRef.current,
          chain,
          { modules: EMPTY_MODULES, objects: EMPTY_OBJECTS },
        );
        setView(nextView);
        setActiveChain(chain);
        replaceGraphImmediate(nextGraph);
        setReadOnly(false);
        setProviderUiState(providerReadyEditable());
        setCodePipOpenTick((t) => t + 1);
        try {
          deliverDocChange(doc);
          lifecycleRef.current.complete(load, 'ready-editable');
        } catch (error) {
          lifecycleRef.current.fail(load, 'PTB document update failed.');
          reportDocEmitError(error, 'PTB document update failed.');
          return ptbActionError(
            modelErrorMessage(error, 'PTB document update failed.'),
          );
        }
        lifecycleRef.current.afterAnimationFrames(load, () => {
          flowActionsRef.current.updateViewport?.(nextView);
        });
        return PTB_ACTION_OK;
      }
    },
    [deliverDocChange, replaceGraphImmediate, reportDocEmitError, toastImpl],
  );

  // ---- export doc ------------------------------------------------------------

  const exportDocResult = useCallback<PtbContextValue['exportDocResult']>(
    (opts) => {
      if (!activeChain) {
        const error = 'Cannot export before a chain is selected.';
        setProviderUiState((prev) => providerExportError(prev, error));
        toastImpl({
          message: error,
          variant: 'warning',
        });
        return ptbExportDocError(error);
      }
      if (!view) {
        const error = 'Cannot export before the viewport is initialized.';
        setProviderUiState((prev) => providerExportError(prev, error));
        toastImpl({
          message: error,
          variant: 'warning',
        });
        return ptbExportDocError(error);
      }
      const sender = opts?.sender;
      try {
        setProviderUiState(clearProviderNoticeState);
        return {
          ok: true,
          doc: buildDoc({
            chain: activeChain,
            graph,
            view,
            sender,
            modules: modules ?? {},
            objects: objects ?? {},
          }),
        };
      } catch (error) {
        const message = modelErrorMessage(
          error,
          'Failed to export PTB document.',
        );
        setProviderUiState((prev) => providerExportError(prev, message));
        toastImpl({
          message,
          variant: 'error',
        });
        return ptbExportDocError(message);
      }
    },
    [activeChain, graph, modules, objects, toastImpl, view],
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
    return {
      [KNOWN_IDS.START]: set.has(KNOWN_IDS.START),
      [KNOWN_IDS.END]: set.has(KNOWN_IDS.END),
      [KNOWN_IDS.GAS]: set.has(KNOWN_IDS.GAS),
      [KNOWN_IDS.SYSTEM]: set.has(KNOWN_IDS.SYSTEM),
      [KNOWN_IDS.CLOCK]: set.has(KNOWN_IDS.CLOCK),
      [KNOWN_IDS.RANDOM]: set.has(KNOWN_IDS.RANDOM),
    };
  }

  /** Idempotent graph normalization (coalesce Start/End ids & rewrite edges). */
  function normalizeGraph(g: PTBGraph): PTBGraph {
    const nodes = [...(g.nodes || [])];
    const edges = [...(g.edges || [])];

    const coalesce = (
      matchKind: PTBGraph['nodes'][number]['kind'],
      canonicalId: WellKnownId,
      canonicalPrevHandle: string,
      canonicalNextHandle: string,
    ) => {
      const idxs = nodes
        .map((n, i) => ({ n, i }))
        .filter(({ n }) => n.kind === matchKind);
      if (idxs.length === 0) return;

      const { n: keeperNode } = idxs[0];

      if (keeperNode.id !== canonicalId) {
        const oldId = keeperNode.id;
        keeperNode.id = canonicalId;
        edges.forEach((e) => {
          if (e.source === oldId) e.source = canonicalId;
          if (e.target === oldId) e.target = canonicalId;
          if (e.kind === 'flow') {
            if (e.source === canonicalId) e.sourceHandle = canonicalNextHandle;
            if (e.target === canonicalId) e.targetHandle = canonicalPrevHandle;
          }
        });
      }

      for (let k = 1; k < idxs.length; k++) {
        const { n: dup } = idxs[k];
        const oldId = dup.id;
        edges.forEach((e) => {
          if (e.source === oldId) {
            e.source = canonicalId;
            if (e.kind === 'flow') e.sourceHandle = canonicalNextHandle;
          }
          if (e.target === oldId) {
            e.target = canonicalId;
            if (e.kind === 'flow') e.targetHandle = canonicalPrevHandle;
          }
        });
      }
      for (let k = idxs.length - 1; k >= 1; k--) {
        nodes.splice(idxs[k].i, 1);
      }
    };

    coalesce('Start', KNOWN_IDS.START, 'prev', 'next');
    coalesce('End', KNOWN_IDS.END, 'prev', 'next');

    return { nodes, edges };
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
      lookupObjectForAuthoring,

      modules,
      getMoveFunction,

      getOwnedObjects,

      providerUiState,
      clearProviderNotice,
      loadTxStatus,
      loadFromOnChainTx,
      loadFromDoc,
      exportDoc,
      exportDocResult,

      createUniqueId: genId,

      execOpts: execOptsProp,

      runTx: executeTxProp ? runTx : undefined,
      dryRunTx: simulateTxProp ? dryRunTx : undefined,
      toast: toastImpl,

      isWellKnownAvailable,

      registerFlowActions,

      graphEpoch,
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
      lookupObjectForAuthoring,
      modules,
      getMoveFunction,
      getOwnedObjects,
      providerUiState,
      clearProviderNotice,
      loadTxStatus,
      loadFromOnChainTx,
      loadFromDoc,
      exportDoc,
      exportDocResult,
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
