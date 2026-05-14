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
// - PTBDoc autosave (onDocChange) fires immediately on any change.
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
  parsePTBDocV4,
  rawTransactionToIR,
  transactionIRToGraph,
} from '@zktx.io/ptb-model';
import type { PTBModelError } from '@zktx.io/ptb-model';

import type { ExecOptions } from '../codegen/types';
import type { PTBGraph } from '../ptb/graph/types';
import { toPTBFunctionDataEntry } from '../ptb/move/toPTBModuleData';
import {
  buildDoc,
  type PTBDoc,
  PTBFunctionData,
  PTBModulesEmbed,
  PTBObjectData,
  PTBObjectsEmbed,
} from '../ptb/ptbDoc';
import {
  KNOWN_IDS,
  seedDefaultGraph,
  type WellKnownId,
} from '../ptb/seedGraph';
import {
  coreTransactionResultToRawProgrammableTransactionInput,
  createPtbCoreClient,
  PTB_TRANSACTION_LOAD_INCLUDE,
  type PtbCoreClient,
  selectCoreTransactionResult,
} from '../ptb/suiClient';
import type { Chain, Theme, ToastAdapter } from '../types';
import { toColorMode } from '../types';

const VIEW_CHANGE_DEBOUNCE_MS = 250;

// ===== Context shape ==========================================================

type TxStatus = {
  status: 'success' | 'failure';
  error?: string;
};

type OwnedObjectsParams = {
  owner: string;
  cursor?: string | null;
  limit?: number;
  type?: string;
  options?: {
    showType?: boolean;
    showContent?: boolean;
    showDisplay?: boolean;
  };
  clientOverride?: PtbCoreClient;
};

type OwnedObjectsResponse = {
  data: Array<{
    data: {
      objectId: string;
      type: string;
      content?: { dataType: 'moveObject'; type: string };
      display?: { data?: Record<string, unknown> | null };
    };
  }>;
  hasNextPage: boolean;
  nextCursor?: string | null;
};

type HostTxResult = { digest?: string; error?: string };
type HostSimulationResult = { success?: boolean; error?: string };

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
  getObjectData: (
    objectId: string,
    opts?: { forceRefresh?: boolean; clientOverride?: PtbCoreClient },
  ) => Promise<PTBObjectData | undefined>;

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
  loadTxStatus: TxStatus | undefined;
  loadFromOnChainTx: (chain: Chain, txDigest: string) => Promise<void>;
  loadFromDoc: (data: PTBDoc | Chain) => void;

  // Persistence
  exportDoc: (opts?: { sender?: string }) => PTBDoc | undefined;

  // Monotonic ID generator
  createUniqueId: (prefix?: string) => string;

  // Execution
  execOpts: ExecOptions;
  runTx?: (tx?: Transaction) => Promise<{ digest?: string; error?: string }>;
  dryRunTx?: (tx?: Transaction) => Promise<void>;

  // Toast
  toast: ToastAdapter;
  showExportButton?: boolean;

  wellKnown: Record<WellKnownId, boolean>;
  isWellKnownAvailable: (k: WellKnownId) => boolean;
  setWellKnownPresent: (k: WellKnownId, present: boolean) => void;

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
  execOpts?: ExecOptions;
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

/** Build an order-insensitive, structural signature for a PTB graph. */
function stableGraphSig(g: PTBGraph): string {
  const round = (v: any) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : v;

  const nodes = [...(g.nodes || [])]
    .map((n) => {
      const ports = [...(n.ports || [])]
        .map((p) => ({
          id: p.id,
          role: p.role,
          direction: p.direction,
          dataType: p.dataType ? JSON.stringify(p.dataType) : undefined,
        }))
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

      const extra: Record<string, unknown> = {};
      const anyN = n as any;
      if (anyN.command !== undefined) extra.command = anyN.command;
      if (anyN.params !== undefined) extra.params = anyN.params;
      if (anyN.varType !== undefined) extra.varType = anyN.varType;
      if (anyN.value !== undefined) extra.value = anyN.value;

      const pos =
        anyN.position &&
        typeof anyN.position.x === 'number' &&
        typeof anyN.position.y === 'number'
          ? { x: round(anyN.position.x), y: round(anyN.position.y) }
          : undefined;

      return { id: n.id, kind: n.kind, ports, pos, ...extra };
    })
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const edges = [...(g.edges || [])]
    .map((e) => ({
      id: e.id,
      kind: e.kind,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? undefined,
      targetHandle: e.targetHandle ?? undefined,
    }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return JSON.stringify({ nodes, edges });
}

function stableDocSig(doc: PTBDoc): string {
  const orderObject = (value: unknown): unknown => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return value;
    }
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = orderObject((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  };
  return JSON.stringify(orderObject(doc));
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
    clientRef.current = createCoreClient(activeChain);
  }, [activeChain, createCoreClient]);
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
  const [idNonce, setIdNonce] = useState<number>(() =>
    seedNonceFromGraph(graph),
  );
  const genId = useCallback((prefix = 'id') => {
    let nextVal!: number;
    setIdNonce((prev) => (nextVal = prev + 1));
    return `${prefix}-${nextVal}`;
  }, []);

  // Epoch to separate "inject → RF" from "edit → save"
  const [graphEpoch, setGraphEpoch] = useState(0);

  // Chain caches
  const [objects, setObjects] = useState<PTBObjectsEmbed>(() => ({}));
  const [modules, setModules] = useState<PTBModulesEmbed>(() => ({}));
  const docSlicesRef = useRef({ graph, modules, objects });
  docSlicesRef.current = { graph, modules, objects };
  const lastDocSigRef = useRef<string | undefined>(undefined);

  // Reset caches on chain change
  const resetBeforeLoad = () => {
    canUpdate.current = false;
    lastDocSigRef.current = undefined;
    setActiveChain(undefined);
    setObjects({});
    setModules({});
    setView(undefined);
    setCodePipOpenTick(0);
  };

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
      if (res?.digest) {
        toastImpl({ message: `Executed: ${res.digest}`, variant: 'success' });
      } else if (res?.error) {
        toastImpl({ message: res.error, variant: 'error' });
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

  // ---- PTBDoc: emit immediately for graph edits, debounce viewport ----------

  const canUpdate = useRef(false);
  const onDocChangeRef = useRef(onDocChange);
  onDocChangeRef.current = onDocChange;
  const viewDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(
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

  const emitDocChange = useCallback(() => {
    try {
      const doc = buildDocFromRefs();
      if (!doc) return;
      if (!canUpdate.current) {
        canUpdate.current = true;
      }
      const nextSig = stableDocSig(doc);
      if (!onDocChangeRef.current) {
        lastDocSigRef.current = undefined;
        return;
      }
      if (lastDocSigRef.current === nextSig) return;
      lastDocSigRef.current = nextSig;
      onDocChangeRef.current(doc);
    } catch {
      // Swallow to avoid breaking the edit loop
    }
  }, [buildDocFromRefs]);

  useEffect(() => {
    emitDocChange();
  }, [graph, modules, objects, activeChain, emitDocChange]);

  useEffect(() => {
    if (viewDebounceRef.current) {
      clearTimeout(viewDebounceRef.current);
      viewDebounceRef.current = undefined;
    }
    if (!view || !onDocChangeRef.current) return;

    viewDebounceRef.current = setTimeout(() => {
      emitDocChange();
      viewDebounceRef.current = undefined;
    }, VIEW_CHANGE_DEBOUNCE_MS);

    return () => {
      if (viewDebounceRef.current) {
        clearTimeout(viewDebounceRef.current);
        viewDebounceRef.current = undefined;
      }
    };
  }, [view, emitDocChange]);

  useEffect(() => {
    if (onDocChange) {
      emitDocChange();
    }
  }, [onDocChange, emitDocChange]);

  const setViewExternal = useCallback(
    (v: { x: number; y: number; zoom: number }) => {
      if (!activeChain) return;
      setView((prev) =>
        prev && prev.x === v.x && prev.y === v.y && prev.zoom === v.zoom
          ? prev
          : v,
      );
    },
    [activeChain],
  );

  // ---- chain helpers ---------------------------------------------------------

  const getObjectData = useCallback<PtbContextValue['getObjectData']>(
    async (objectId, opts) => {
      const id = objectId?.trim();
      if (!id) return undefined;

      if (!opts?.forceRefresh && objects[id]) return objects[id];

      const client = opts?.clientOverride ?? clientRef.current;
      if (!client) return undefined;

      try {
        const resp = await client.core.getObject({
          objectId: id,
          include: { content: true },
        });

        const obj: PTBObjectData = {
          objectId: resp.object.objectId,
          typeTag: resp.object.type ?? '',
        };

        setObjects((prev) => ({ ...prev, [id]: obj }));
        return obj;
      } catch {
        return undefined;
      }
    },
    [objects],
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

      if (!opts?.forceRefresh && modules[id]?.[module]?.[name]) {
        return {
          packageId: id,
          moduleName: module,
          functionName: name,
          signature: modules[id][module][name],
        };
      }

      const client = clientRef.current;
      if (!client) return undefined;

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

        setModules((prev) => ({
          ...prev,
          [resolvedPackageId]: {
            ...(prev[resolvedPackageId] ?? {}),
            [resolvedModuleName]: {
              ...(prev[resolvedPackageId]?.[resolvedModuleName] ?? {}),
              [resolvedFunctionName]: signature,
            },
          },
        }));

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
    [modules, toastImpl],
  );

  const getOwnedObjects = useCallback<PtbContextValue['getOwnedObjects']>(
    async (params) => {
      const { clientOverride, options: _options, ...rest } = params ?? {};
      const client = clientOverride ?? clientRef.current;
      if (!client) return undefined;

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
          data: page.objects.map((object) => ({
            data: {
              objectId: object.objectId,
              type: object.type,
              content: { dataType: 'moveObject', type: object.type },
              display: object.display
                ? { data: object.display.output }
                : undefined,
            },
          })),
          hasNextPage: page.hasNextPage,
          nextCursor: page.cursor,
        };
      } catch {
        return undefined;
      }
    },
    [],
  );

  // ---- on-chain loader (viewer) ---------------------------------------------

  const [codePipOpenTick, setCodePipOpenTick] = useState(0);
  const [loadTxStatus, setLoadTxStatus] = useState<TxStatus | undefined>(
    undefined,
  );

  const loadFromOnChainTx: PtbContextValue['loadFromOnChainTx'] = useCallback(
    async (chain, txDigest) => {
      resetBeforeLoad();
      const digest = (txDigest || '').trim();
      if (!digest) {
        toastImpl({ message: 'Empty transaction digest.', variant: 'warning' });
        return;
      }

      const localClient = createCoreClient(chain);

      try {
        const res = await localClient.core.getTransaction({
          digest,
          include: PTB_TRANSACTION_LOAD_INCLUDE,
        });

        const txResult = selectCoreTransactionResult(res);
        const programmable =
          coreTransactionResultToRawProgrammableTransactionInput(res);
        const status = txResult.status;

        if (status) {
          setLoadTxStatus({
            status: status.success ? 'success' : 'failure',
            error: status.error?.message || status.error?.$kind,
          });
        }

        if (
          !programmable ||
          !Array.isArray(programmable.inputs) ||
          !Array.isArray(programmable.commands)
        ) {
          toastImpl({
            message: 'Only ProgrammableTransaction is supported.',
            variant: 'warning',
          });
          return;
        }

        // 1) Collect candidate object ids (from inputs).
        const candidateIds = new Set<string>();
        const inputs = Array.isArray(programmable?.inputs)
          ? programmable.inputs
          : [];
        for (const inp of inputs) {
          const object = (inp as any)?.object ?? (inp as any)?.Object;
          const objectId = object?.objectId;
          if (typeof objectId === 'string' && objectId.startsWith('0x')) {
            candidateIds.add(objectId);
          }
        }

        // 2) Fetch object metadata (best effort).
        const fetched = await Promise.all(
          [...candidateIds].map((oid) =>
            getObjectData(oid, { clientOverride: localClient }),
          ),
        );
        const objectsEmbed: PTBObjectsEmbed = {};
        for (const o of fetched) {
          if (o) objectsEmbed[o.objectId] = o;
        }

        // 3) Convert through the model boundary.
        const ir = rawTransactionToIR(programmable);
        ir.diagnostics.forEach(({ message }) => {
          toastImpl({ message, variant: 'warning' });
        });
        const decoded = transactionIRToGraph(ir) as unknown as PTBGraph;

        // 4) Fix chain and prime caches (overwrite, no carry-over).
        setActiveChain(chain);
        setModules({});
        setObjects(objectsEmbed);

        // 5) Replace snapshot (viewer mode) and bump epoch.
        replaceGraphImmediate(decoded);
        setReadOnly(true);

        setCodePipOpenTick(0);

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            flowActionsRef.current.fitToContent?.();
            canUpdate.current = true;
          });
        });
      } catch (e: any) {
        toastImpl({
          message: e?.message || 'Failed to load transaction from chain.',
          variant: 'error',
        });
      }
    },
    [toastImpl, replaceGraphImmediate, getObjectData, createCoreClient],
  );

  // ---- document loader (editor) ---------------------------------------------

  const loadFromDoc = useCallback<PtbContextValue['loadFromDoc']>(
    (value) => {
      resetBeforeLoad();
      if (typeof value !== 'string') {
        let doc;
        try {
          doc = parsePTBDocV4(value);
        } catch (e: any) {
          toastImpl({
            message: modelErrorMessage(e, 'Invalid PTB document.'),
            variant: 'error',
          });
          return;
        }

        const normalizeChain = (c: unknown): Chain | undefined => {
          if (typeof c !== 'string') return undefined;
          const s = c.trim();
          if (/^sui:(mainnet|testnet|devnet)$/.test(s)) return s as Chain;
          return undefined;
        };

        const nextChain = normalizeChain(doc?.chain);
        if (!nextChain) {
          toastImpl({
            message: 'Invalid or missing chain in PTB document.',
            variant: 'error',
          });
          return;
        }

        const nextView =
          doc?.view &&
          typeof doc.view?.x === 'number' &&
          typeof doc.view?.y === 'number' &&
          typeof doc.view?.zoom === 'number'
            ? doc.view
            : { x: 0, y: 0, zoom: 1 };

        setView(nextView);
        setActiveChain(nextChain);
        setModules((doc?.modules ?? {}) as any);
        setObjects((doc?.objects ?? {}) as any);
        replaceGraphImmediate(doc.graph as unknown as PTBGraph);
        setReadOnly(false);
        setCodePipOpenTick((t) => t + 1);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            flowActionsRef.current.updateViewport?.(nextView);
            canUpdate.current = true;
          });
        });
      } else {
        setActiveChain(value);
        replaceGraphImmediate(seedDefaultGraph());
        setReadOnly(false);
        setCodePipOpenTick((t) => t + 1);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            flowActionsRef.current.updateViewport?.();
            canUpdate.current = true;
          });
        });
      }
    },
    [replaceGraphImmediate, toastImpl],
  );

  // ---- export doc ------------------------------------------------------------

  const exportDoc = useCallback<PtbContextValue['exportDoc']>(
    (opts) => {
      if (!activeChain || !view) return undefined;
      const sender = opts?.sender;
      return buildDoc({
        chain: activeChain,
        graph,
        view,
        sender,
        modules: modules ?? {},
        objects: objects ?? {},
      });
    },
    [activeChain, graph, modules, objects, view],
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
      [KNOWN_IDS.MY_WALLET]: set.has(KNOWN_IDS.MY_WALLET),
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

  const setWellKnownPresent = useCallback(
    (k: WellKnownId, present: boolean) => {
      setWellKnown((prev) => ({ ...prev, [k]: present }));
    },
    [],
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
      getObjectData,

      modules,
      getMoveFunction,

      getOwnedObjects,

      loadTxStatus,
      loadFromOnChainTx,
      loadFromDoc,
      exportDoc,

      createUniqueId: genId,

      execOpts: execOptsProp,

      runTx,
      dryRunTx,
      toast: toastImpl,

      wellKnown,
      isWellKnownAvailable,
      setWellKnownPresent,

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
      getObjectData,
      modules,
      getMoveFunction,
      getOwnedObjects,
      loadTxStatus,
      loadFromOnChainTx,
      loadFromDoc,
      exportDoc,
      genId,
      execOptsProp,
      runTx,
      dryRunTx,
      toastImpl,
      wellKnown,
      isWellKnownAvailable,
      setWellKnownPresent,
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
