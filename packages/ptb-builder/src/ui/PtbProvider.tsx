import React, {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  getFullnodeUrl,
  SuiClient,
  type SuiMoveNormalizedModules,
  type SuiObjectData,
  type SuiObjectResponse,
} from '@mysten/sui/client';
import type { Transaction } from '@mysten/sui/transactions';

import { consoleToast, type ToastAdapter } from '../adapters/toast';
import type { ExecOptions } from '../codegen/types';
import type {
  CommandNode,
  Port,
  PTBEdge,
  PTBGraph,
  PTBNode,
} from '../ptb/graph/types';
import { toPTBModuleData } from '../ptb/move/normalize';
import { PTBModuleData } from '../ptb/move/types';
import { buildDoc, type PTBDoc } from '../ptb/ptbDoc';
import { seedDefaultGraph } from '../ptb/seedGraph';
import type { Network, Theme } from '../types';
import { materializeCommandPorts } from './nodes/cmds/registry';

// ===== Adapters & Features ====================================================

export type Adapters = {
  clipboard?: { copy(text: string): Promise<void> };
  executeTx?: (
    chain: `${string}:${string}`,
    tx: Transaction | undefined,
  ) => Promise<{ digest?: string; error?: string }>;
  toast?: ToastAdapter;
};

export type Features = { codegen?: boolean; parse?: boolean; exec?: boolean };

// ===== Context ===============================================================

export type PtbContextValue = {
  /** Current PTB graph snapshot (canvas source of truth) */
  snapshot: PTBGraph;
  /** Save a new PTB graph snapshot; triggers debounced onChange */
  saveSnapshot: (g: PTBGraph) => void;
  /** Replace current graph immediately (no debounce) */
  loadSnapshot: (g: PTBGraph) => void;

  /** Active network (fixed by last loadFromDoc) */
  network: Network;

  /** Read-only guard */
  readOnly: boolean;
  features?: Features;
  adapters?: Adapters;
  busy: boolean;

  /** Theme */
  theme: Theme;
  setTheme: (t: Theme) => void;

  /** Command UI patcher → re-materialize + prune */
  onPatchUI: (nodeId: string, patch: Record<string, unknown>) => void;

  /** Chain caches (per active network; overwritten on doc load) */
  objectMetas: Record<string, SuiObjectData>;
  getObjectData: (
    objectId: string,
    opts?: { forceRefresh?: boolean },
  ) => Promise<SuiObjectData | undefined>;

  modules: Record<string, SuiMoveNormalizedModules>;
  getPackageModules: (
    packageId: string,
    opts?: { forceRefresh?: boolean },
  ) => Promise<SuiMoveNormalizedModules | undefined>;
  getPackageModulesView: (
    packageId: string,
    opts?: { forceRefresh?: boolean },
  ) => Promise<PTBModuleData | undefined>;

  /** Load a persisted PTB document (fix network, preload embeds, replace graph). */
  loadFromDoc: (doc: PTBDoc) => void;

  /** Build a PTB document from current state (include embeds optional). */
  saveToDoc: (opts?: { includeEmbeds?: boolean; sender?: string }) => PTBDoc;

  /** Execution options (e.g., myAddress, gasBudget) */
  execOpts: ExecOptions;

  /** Build+dry-run+execute pipeline (hides SuiClient from public API) */
  runTx?: (tx?: Transaction) => Promise<{ digest?: string; error?: string }>;
};

const PtbContext = createContext<PtbContextValue | undefined>(undefined);

// ===== Provider Props ========================================================

export type PtbProviderProps = {
  children: React.ReactNode;

  /** Graph-diff autosave callback (lightweight) */
  onChange?: (g: PTBGraph) => void;
  onChangeDebounceMs?: number;

  /**
   * Optional Doc-level autosave callback (heavier than onChange).
   * If provided, provider will emit PTBDoc on a separate debounce.
   */
  onDocChange?: (doc: PTBDoc) => void;
  onDocDebounceMs?: number; // default 1000ms
  /** When emitting onDocChange, include embeds or not (default: false). */
  autosaveDocIncludeEmbeds?: boolean;

  /** UI / permissions / adapters */
  readOnly?: boolean;
  adapters?: Adapters;
  features?: Features;
  theme?: Theme;

  /** Execution options to propagate into codegen / tx builder */
  execOpts?: ExecOptions;
};

const DEFAULT_GRAPH_DEBOUNCE = 400;
const DEFAULT_DOC_DEBOUNCE = 1000;

// ===== Utils: ports & pruning ===============================================

function portIdSet(ports: Port[] | undefined): Set<string> {
  const s = new Set<string>();
  if (Array.isArray(ports)) for (const p of ports) s.add(p.id);
  return s;
}

function pruneDanglingIoEdgesForNode(
  g: PTBGraph,
  nodeId: string,
  keepPorts: Set<string>,
): PTBGraph {
  const edges = g.edges.filter((e) => {
    if (e.kind === 'flow') return true;
    if (e.source === nodeId && !keepPorts.has(e.sourcePort)) return false;
    if (e.target === nodeId && !keepPorts.has(e.targetPort)) return false;
    return true;
  });
  return { ...g, edges };
}

function toSuiObjectData(resp: SuiObjectResponse): SuiObjectData | undefined {
  if ((resp as any)?.error) return undefined;
  const d = resp.data;
  if (!d) return undefined;
  return d;
}

// ===== Provider ==============================================================

export function PtbProvider({
  children,
  onChange,
  onChangeDebounceMs = DEFAULT_GRAPH_DEBOUNCE,
  onDocChange,
  onDocDebounceMs = DEFAULT_DOC_DEBOUNCE,
  autosaveDocIncludeEmbeds = false,

  readOnly = false,
  adapters,
  features,
  theme: themeProp = 'dark',

  /** Execution options are passed in from the app */
  execOpts: execOptsProp = {},
}: PtbProviderProps) {
  /** Busy indicator for async jobs (parse/tx load, etc.) */
  const [busy] = useState(false);

  /** Theme state */
  const [theme, setTheme] = useState<Theme>(themeProp);
  useLayoutEffect(() => {
    const root = document.documentElement;
    theme === 'dark'
      ? root.classList.add('dark')
      : root.classList.remove('dark');
  }, [theme]);

  /** Active network — defaults to 'devnet' until a doc is loaded */
  const [activeNetwork, setActiveNetwork] = useState<Network>('devnet');

  /** SuiClient bound to activeNetwork (INTERNAL ONLY) */
  const clientRef = useRef<SuiClient | undefined>(undefined);
  useLayoutEffect(() => {
    clientRef.current = new SuiClient({ url: getFullnodeUrl(activeNetwork) });
  }, [activeNetwork]);

  /** Graph snapshot (source of truth for canvas) */
  const [snapshot, setSnapshot] = useState<PTBGraph>({ nodes: [], edges: [] });

  /** Chain caches (overwrite on doc load) */
  const [objectMetas, setObjectMetas] = useState<Record<string, SuiObjectData>>(
    () => ({}),
  );
  const [modules, setModules] = useState<
    Record<string, SuiMoveNormalizedModules>
  >(() => ({}));

  /** Toast/Adapters */
  const toastImpl: ToastAdapter = adapters?.toast ?? consoleToast;
  const exec = adapters?.executeTx;

  const executeTx = useCallback(
    async (
      chain: `${string}:${string}`,
      tx?: Transaction,
    ): Promise<{ digest?: string; error?: string }> => {
      if (!exec) {
        // no toast here
        return { error: 'executeTx adapter not provided' };
      }
      try {
        const res = await exec(chain, tx);
        // no toast here either; just return
        return res ?? {};
      } catch (e: any) {
        // no toast here
        const msg = e?.message || 'Unknown execution error';
        return { error: msg };
      }
    },
    [exec],
  );

  /** Build + dry-run + (if ok) execute. Keeps SuiClient private. */
  const runTx = useCallback(
    async (tx?: Transaction) => {
      if (!tx) return { error: 'No transaction to run' };
      const client = clientRef.current;
      if (!client) {
        toastImpl({
          message: 'SuiClient unavailable (provider not ready).',
          variant: 'error',
        });
        return { error: 'SuiClient unavailable' };
      }

      // Dry run
      try {
        const bytes = await tx.build({ client });
        const sim = await client.dryRunTransactionBlock({
          transactionBlock: bytes,
        });
        const status = (sim as any)?.effects?.status?.status;
        const errorMsg =
          (sim as any)?.effects?.status?.error ||
          (sim as any)?.checkpointError ||
          (sim as any)?.error;

        if (status !== 'success') {
          toastImpl({
            message: errorMsg || 'Dry run failed',
            variant: 'error',
          });
          return { error: errorMsg || 'Dry run failed' };
        }
      } catch (e: any) {
        const msg = e?.message || 'Dry run error';
        toastImpl({ message: msg, variant: 'error' });
        return { error: msg };
      }

      // Execute
      const res = await executeTx(`sui:${activeNetwork}`, tx);
      if (res?.digest) {
        toastImpl({ message: `Executed: ${res.digest}`, variant: 'success' });
      } else if (res?.error) {
        // This catches wallet "user rejected" too — toast exactly once here
        toastImpl({ message: res.error, variant: 'error' });
      }
      return res ?? {};
    },
    [activeNetwork, executeTx, toastImpl],
  );

  const adaptersSnapshot = useMemo(
    () => ({ clipboard: adapters?.clipboard, executeTx, toast: toastImpl }),
    [adapters?.clipboard, executeTx, toastImpl],
  );

  // ===== Debounced onChange (graph) ==========================================

  const onChangeRef = useRef(onChange);
  const graphTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const lastGraphRef = useRef<PTBGraph | undefined>(undefined);
  onChangeRef.current = onChange;

  const flushGraphNotify = useCallback(() => {
    if (graphTimerRef.current !== undefined) {
      clearTimeout(graphTimerRef.current);
      graphTimerRef.current = undefined;
    }
    const payload = lastGraphRef.current;
    if (payload && onChangeRef.current) onChangeRef.current(payload);
    lastGraphRef.current = undefined;
  }, []);

  const scheduleGraphNotify = useCallback(
    (g: PTBGraph) => {
      if (!onChangeRef.current) return;
      lastGraphRef.current = g;
      if (graphTimerRef.current !== undefined)
        clearTimeout(graphTimerRef.current);
      graphTimerRef.current = setTimeout(() => {
        const payload = lastGraphRef.current;
        if (payload && onChangeRef.current) onChangeRef.current(payload);
        graphTimerRef.current = undefined;
        lastGraphRef.current = undefined;
      }, onChangeDebounceMs);
    },
    [onChangeDebounceMs],
  );

  const saveSnapshot = useCallback(
    (g: PTBGraph) => {
      setSnapshot(g);
      scheduleGraphNotify(g);
    },
    [scheduleGraphNotify],
  );

  const loadSnapshot = useCallback((g: PTBGraph) => {
    if (graphTimerRef.current !== undefined) {
      clearTimeout(graphTimerRef.current);
      graphTimerRef.current = undefined;
    }
    lastGraphRef.current = undefined;
    setSnapshot(g);
  }, []);

  // ===== Debounced onDocChange (doc) =========================================

  const onDocChangeRef = useRef(onDocChange);
  const docTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  onDocChangeRef.current = onDocChange;

  const flushDocNotify = useCallback(() => {
    if (docTimerRef.current !== undefined) {
      clearTimeout(docTimerRef.current);
      docTimerRef.current = undefined;
    }
    if (!onDocChangeRef.current) return;
    const doc = buildDoc({
      network: activeNetwork,
      graph: snapshot,
      includeEmbeds: autosaveDocIncludeEmbeds,
      modules: autosaveDocIncludeEmbeds ? modules : undefined,
      objects: autosaveDocIncludeEmbeds ? objectMetas : undefined,
    });
    onDocChangeRef.current?.(doc);
  }, [activeNetwork, snapshot, autosaveDocIncludeEmbeds, modules, objectMetas]);

  const scheduleDocNotify = useCallback(() => {
    if (!onDocChangeRef.current) return;
    if (docTimerRef.current !== undefined) clearTimeout(docTimerRef.current);
    docTimerRef.current = setTimeout(() => {
      if (!onDocChangeRef.current) return;
      const doc = buildDoc({
        network: activeNetwork,
        graph: snapshot,
        includeEmbeds: autosaveDocIncludeEmbeds,
        modules: autosaveDocIncludeEmbeds ? modules : undefined,
        objects: autosaveDocIncludeEmbeds ? objectMetas : undefined,
      });
      onDocChangeRef.current?.(doc);
      docTimerRef.current = undefined;
    }, onDocDebounceMs);
  }, [
    activeNetwork,
    snapshot,
    autosaveDocIncludeEmbeds,
    modules,
    objectMetas,
    onDocDebounceMs,
  ]);

  React.useEffect(() => {
    scheduleDocNotify();
  }, [snapshot, scheduleDocNotify]);
  React.useEffect(() => {
    scheduleDocNotify();
  }, [modules, objectMetas, activeNetwork, scheduleDocNotify]);

  // ===== Node-scoped UI patcher ==============================================

  const onPatchUI = useCallback(
    (nodeId: string, patch: Record<string, unknown>) => {
      setSnapshot((prev) => {
        const next: PTBGraph = {
          nodes: prev.nodes.map((n) => ({ ...n }) as PTBNode),
          edges: prev.edges.map((e) => ({ ...e }) as PTBEdge),
        };

        const node = next.nodes.find((n) => n.id === nodeId) as
          | CommandNode
          | undefined;
        if (!node || node.kind !== 'Command') return prev;

        const prevUI = (node.params?.ui ?? {}) as Record<string, unknown>;
        node.params = { ...(node.params ?? {}), ui: { ...prevUI, ...patch } };

        node.ports = materializeCommandPorts(node);
        const keep = portIdSet(node.ports);
        const pruned = pruneDanglingIoEdgesForNode(next, nodeId, keep);

        scheduleGraphNotify(pruned);
        scheduleDocNotify();
        return pruned;
      });
    },
    [scheduleGraphNotify, scheduleDocNotify],
  );

  // ===== Chain data helpers ===================================================

  const getObjectData = useCallback<PtbContextValue['getObjectData']>(
    async (objectId, opts) => {
      const id = objectId?.trim();
      if (!id) return undefined;

      if (!opts?.forceRefresh && objectMetas[id]) {
        return objectMetas[id];
      }

      const client = clientRef.current;
      if (!client) return undefined;

      try {
        const resp = await client.getObject({
          id,
          options: {
            showContent: true,
            showType: true,
            showOwner: true,
            showDisplay: true,
          },
        });

        const meta = toSuiObjectData(resp);
        if (!meta) return undefined;

        setObjectMetas((prev) => {
          const next = { ...prev, [id]: meta };
          return next;
        });
        scheduleDocNotify();
        return meta;
      } catch {
        return undefined;
      }
    },
    [objectMetas, scheduleDocNotify],
  );

  const getPackageModules = useCallback<PtbContextValue['getPackageModules']>(
    async (packageId, opts) => {
      const id = packageId?.trim();
      if (!id || !id.startsWith('0x')) {
        adaptersSnapshot.toast?.({
          message: 'Invalid package id. It should start with 0x…',
          variant: 'warning',
        });
        return undefined;
      }

      if (!opts?.forceRefresh && modules[id]) {
        return modules[id];
      }

      const client = clientRef.current;
      if (!client) return undefined;

      try {
        const res = await client.getNormalizedMoveModulesByPackage({
          package: id,
        });

        setModules((prev) => {
          const next = { ...prev, [id]: res };
          return next;
        });
        scheduleDocNotify();
        return res;
      } catch (e: any) {
        adaptersSnapshot.toast?.({
          message: e?.message || 'Failed to load package modules',
          variant: 'error',
        });
        return undefined;
      }
    },
    [modules, clientRef, adaptersSnapshot, scheduleDocNotify],
  );

  const getPackageModulesView = useCallback<
    PtbContextValue['getPackageModulesView']
  >(
    async (packageId, opts) => {
      const mods =
        (await getPackageModules(packageId, opts)) ??
        modules[packageId?.trim() || ''];
      if (!mods) return undefined;
      return toPTBModuleData(mods);
    },
    [getPackageModules, modules],
  );

  // ===== Document load/save ===================================================

  const loadFromDoc = useCallback<PtbContextValue['loadFromDoc']>(
    (doc) => {
      // 1) Fix active network
      setActiveNetwork(doc.network);

      // 2) Preload embeds (overwrite caches)
      setModules(doc.modulesEmbed ?? {});
      setObjectMetas(doc.objectsEmbed ?? {});

      // 3) Replace graph (seed if empty/invalid)
      const g = doc.graph;
      const valid =
        g && Array.isArray(g.nodes) && Array.isArray(g.edges) && g.nodes.length;
      const base = valid ? g : seedDefaultGraph();

      if (graphTimerRef.current !== undefined) {
        clearTimeout(graphTimerRef.current);
        graphTimerRef.current = undefined;
      }
      if (docTimerRef.current !== undefined) {
        clearTimeout(docTimerRef.current);
        docTimerRef.current = undefined;
      }

      lastGraphRef.current = undefined;
      setSnapshot(base);

      scheduleGraphNotify(base);
      scheduleDocNotify();
    },
    [scheduleGraphNotify, scheduleDocNotify],
  );

  const saveToDoc = useCallback<PtbContextValue['saveToDoc']>(
    (opts) => {
      const includeEmbeds = !!opts?.includeEmbeds;
      const sender = opts?.sender;
      return buildDoc({
        network: activeNetwork,
        graph: snapshot,
        sender,
        includeEmbeds,
        modules: includeEmbeds ? modules : undefined,
        objects: includeEmbeds ? objectMetas : undefined,
      });
    },
    [activeNetwork, snapshot, modules, objectMetas],
  );

  // ===== Context value =======================================================

  const ctx: PtbContextValue = useMemo(
    () => ({
      snapshot,
      saveSnapshot,
      loadSnapshot,

      network: activeNetwork,
      readOnly: !!readOnly,

      features,
      adapters: adaptersSnapshot,
      busy,

      theme,
      setTheme,

      onPatchUI,

      objectMetas,
      getObjectData,

      modules,
      getPackageModules,
      getPackageModulesView,

      loadFromDoc,
      saveToDoc,

      execOpts: execOptsProp,

      // Keep client private; expose pipeline instead
      runTx,
    }),
    [
      snapshot,
      saveSnapshot,
      loadSnapshot,
      activeNetwork,
      readOnly,
      features,
      adaptersSnapshot,
      busy,
      theme,
      onPatchUI,
      objectMetas,
      getObjectData,
      modules,
      getPackageModules,
      getPackageModulesView,
      loadFromDoc,
      saveToDoc,
      execOptsProp,
      runTx,
    ],
  );

  // Flush pending debounced notifies on unmount
  React.useEffect(() => () => flushGraphNotify(), [flushGraphNotify]);
  React.useEffect(() => () => flushDocNotify(), [flushDocNotify]);

  return <PtbContext.Provider value={ctx}>{children}</PtbContext.Provider>;
}

// ===== Hook ==================================================================

export function usePtb() {
  const ctx = useContext(PtbContext);
  if (!ctx) throw new Error('usePtb must be used within PtbProvider');
  return ctx;
}
