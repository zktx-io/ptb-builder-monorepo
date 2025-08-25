// src/ui/PtbProvider.tsx
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
import type {
  CommandNode,
  Port,
  PTBEdge,
  PTBGraph,
  PTBNode,
} from '../ptb/graph/types';
import { toPTBModuleData } from '../ptb/move/normalize';
import { PTBModuleData } from '../ptb/move/types';
import { seedDefaultGraph } from '../ptb/seedGraph';
import type { Network, Theme } from '../types';
import { materializeCommandPorts } from './nodes/cmds/registry';

export type Adapters = {
  clipboard?: { copy(text: string): Promise<void> };
  executeTx?: (
    tx: Transaction | undefined,
  ) => Promise<{ digest?: string; error?: string }>;
  toast?: ToastAdapter;
};

export type Features = { codegen?: boolean; parse?: boolean; exec?: boolean };

export type PtbContextValue = {
  /** Current PTB graph snapshot (source of truth for the canvas) */
  snapshot: PTBGraph;
  /** Save a new PTB graph snapshot; triggers debounced onChange */
  saveSnapshot: (g: PTBGraph) => void;
  /** Load a PTB graph snapshot (immediate, no debounce) */
  loadSnapshot: (g: PTBGraph) => void;

  /** Selected network and read-only guard */
  network: Network;
  readOnly: boolean;
  features?: Features;
  adapters?: Adapters;
  busy: boolean;

  /** UI theme */
  theme: Theme;
  setTheme: (t: Theme) => void;

  /**
   * Patch a single command node's UI params, then re-materialize its ports
   * and prune dangling IO edges referencing removed ports on that node.
   */
  onPatchUI: (nodeId: string, patch: Record<string, unknown>) => void;

  /**
   * On-chain object meta store (in-memory, persisted by the app if desired).
   * Not included in PTB graph; consumers can serialize alongside the PTB file.
   */
  objectMetas: Record<string, SuiObjectData>;

  /**
   * Fetch and cache on-chain object meta (owner/type/display/version).
   * - Respects { forceRefresh } to bypass cache.
   * - Stores into objectMetas and triggers optional onChangeObjectMetas callback.
   */
  getObjectData: (
    objectId: string,
    opts?: { forceRefresh?: boolean },
  ) => Promise<SuiObjectData | undefined>;

  /**
   * Move package modules cache and loaders (per-network, in-memory).
   * - Raw modules by package id (as returned by Sui).
   * - getPackageModules: fetch + cache (TxContext untouched).
   * - getPackageModulesView: convenience view for UI (TxContext stripped, names flattened).
   */
  modules: Record<string, SuiMoveNormalizedModules>;
  getPackageModules: (
    packageId: string,
    opts?: { forceRefresh?: boolean },
  ) => Promise<SuiMoveNormalizedModules | undefined>;
  getPackageModulesView: (
    packageId: string,
    opts?: { forceRefresh?: boolean },
  ) => Promise<PTBModuleData | undefined>;
};

const PtbContext = createContext<PtbContextValue | undefined>(undefined);

export type PtbProviderProps = {
  children: React.ReactNode;
  initialGraph?: PTBGraph;
  onChange?: (g: PTBGraph) => void;
  onChangeDebounceMs?: number;

  /** Network control */
  network?: Network;
  lockNetwork?: boolean;

  /** UI / permissions / adapters */
  readOnly?: boolean;
  adapters?: Adapters;
  features?: Features;
  theme?: Theme;

  /** Optional initial on-chain metas and change callback (app-level persistence) */
  initialObjectMetas?: Record<string, SuiObjectData>;
  onChangeObjectMetas?: (m: Record<string, SuiObjectData>) => void;

  /** Optional initial package modules and change callback (for persistence to PTB modulesEmbed) */
  initialModules?: Record<string, SuiMoveNormalizedModules>;
  onChangeModules?: (m: Record<string, SuiMoveNormalizedModules>) => void;
};

const DEFAULT_DEBOUNCE = 400;

/** Build a Set of current port ids for quick membership checks */
function portIdSet(ports: Port[] | undefined): Set<string> {
  const s = new Set<string>();
  if (Array.isArray(ports)) for (const p of ports) s.add(p.id);
  return s;
}

/** Prune IO edges that reference removed ports on a specific node (flow edges are untouched) */
function pruneDanglingIoEdgesForNode(
  g: PTBGraph,
  nodeId: string,
  keepPorts: Set<string>,
): PTBGraph {
  const edges = g.edges.filter((e) => {
    if (e.kind === 'flow') return true; // flow edges unaffected by IO port changes
    if (e.source === nodeId && !keepPorts.has(e.sourcePort)) return false;
    if (e.target === nodeId && !keepPorts.has(e.targetPort)) return false;
    return true;
  });
  return { ...g, edges };
}

/** Convert SuiObjectResponse -> SuiObjectData (null on error) */
function toSuiObjectData(resp: SuiObjectResponse): SuiObjectData | undefined {
  if ((resp as any)?.error) return undefined;
  const d = resp.data;
  if (!d) return undefined;
  return d;
}

export function PtbProvider({
  children,
  initialGraph,
  onChange,
  onChangeDebounceMs = DEFAULT_DEBOUNCE,
  network = 'devnet',
  lockNetwork,
  readOnly = false,
  adapters,
  features,
  theme: themeProp = 'dark',
  initialObjectMetas,
  onChangeObjectMetas,
  initialModules,
  onChangeModules,
}: PtbProviderProps) {
  /** Busy toggle (reserved for async jobs like run/parse/etc.) */
  const [busy] = useState(false);
  /** Theme state + apply to <html> */
  const [theme, setTheme] = useState<Theme>(themeProp);
  useLayoutEffect(() => {
    const root = document.documentElement;
    theme === 'dark'
      ? root.classList.add('dark')
      : root.classList.remove('dark');
  }, [theme]);

  /** Graph snapshot (source of truth for canvas) */
  const [snapshot, setSnapshot] = useState<PTBGraph>(() =>
    initialGraph?.nodes?.length ? initialGraph : seedDefaultGraph(),
  );

  /** On-chain object meta store (in-memory). Persist by using onChangeObjectMetas */
  const [objectMetas, setObjectMetas] = useState<Record<string, SuiObjectData>>(
    () => initialObjectMetas ?? {},
  );

  /** Move package modules cache (in-memory). Persistable via onChangeModules */
  const [modules, setModules] = useState<
    Record<string, SuiMoveNormalizedModules>
  >(() => initialModules ?? {});

  /** SuiClient lifecycle (per-network single instance) */
  const clientRef = useRef<SuiClient | undefined>(undefined);
  useLayoutEffect(() => {
    clientRef.current = new SuiClient({ url: getFullnodeUrl(network) });
  }, [network]);

  /** Adapters wiring */
  const toastImpl: ToastAdapter = adapters?.toast ?? consoleToast;
  const exec = adapters?.executeTx;

  /** Execute transaction via injected adapter (if any) */
  const executeTx = useCallback(
    async (tx?: Transaction) => {
      if (!exec) {
        toastImpl({
          message: 'executeTx adapter not provided',
          variant: 'warning',
        });
        return { error: 'executeTx adapter not provided' };
      }
      try {
        const res = await exec(tx);
        if (res?.digest)
          toastImpl({ message: `Executed: ${res.digest}`, variant: 'success' });
        else if (res?.error)
          toastImpl({ message: res.error, variant: 'error' });
        return res ?? {};
      } catch (e: any) {
        const msg = e?.message || 'Unknown execution error';
        toastImpl({ message: msg, variant: 'error' });
        return { error: msg };
      }
    },
    [exec, toastImpl],
  );

  const adaptersSnapshot = useMemo(
    () => ({ clipboard: adapters?.clipboard, executeTx, toast: toastImpl }),
    [adapters?.clipboard, executeTx, toastImpl],
  );

  // Debounced onChange plumbing for the graph
  const onChangeRef = useRef(onChange);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastGraphRef = useRef<PTBGraph | undefined>(undefined);
  onChangeRef.current = onChange;

  const flushNotify = useCallback(() => {
    if (timerRef.current !== undefined) {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
    const payload = lastGraphRef.current;
    if (payload && onChangeRef.current) onChangeRef.current(payload);
    lastGraphRef.current = undefined;
  }, []);

  const scheduleNotify = useCallback(
    (g: PTBGraph) => {
      if (!onChangeRef.current) return;
      lastGraphRef.current = g;
      if (timerRef.current !== undefined) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const payload = lastGraphRef.current;
        if (payload && onChangeRef.current) onChangeRef.current(payload);
        timerRef.current = undefined;
        lastGraphRef.current = undefined;
      }, onChangeDebounceMs);
    },
    [onChangeDebounceMs],
  );

  const saveSnapshot = useCallback(
    (g: PTBGraph) => {
      setSnapshot(g);
      scheduleNotify(g);
    },
    [scheduleNotify],
  );

  const loadSnapshot = useCallback((g: PTBGraph) => {
    if (timerRef.current !== undefined) {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
    lastGraphRef.current = undefined;
    setSnapshot(g);
  }, []);

  /** Node-scoped UI patcher: merge UI, re-materialize ports, prune dangling edges */
  const onPatchUI = useCallback(
    (nodeId: string, patch: Record<string, unknown>) => {
      setSnapshot((prev) => {
        // Shallow clone the graph and entries to keep immutability
        const next: PTBGraph = {
          nodes: prev.nodes.map((n) => ({ ...n }) as PTBNode),
          edges: prev.edges.map((e) => ({ ...e }) as PTBEdge),
        };

        const node = next.nodes.find((n) => n.id === nodeId) as
          | CommandNode
          | undefined;
        if (!node || node.kind !== 'Command') return prev;

        // Merge UI params into node.params.ui
        const prevUI = (node.params?.ui ?? {}) as Record<string, unknown>;
        node.params = { ...(node.params ?? {}), ui: { ...prevUI, ...patch } };

        // Re-materialize this node's ports based on registry's SSOT
        node.ports = materializeCommandPorts(node);

        // Prune dangling IO edges for this node only
        const keep = portIdSet(node.ports);
        const pruned = pruneDanglingIoEdgesForNode(next, nodeId, keep);

        // Debounced external notify and return new graph
        scheduleNotify(pruned);
        return pruned;
      });
    },
    [scheduleNotify],
  );

  /** Fetch and cache on-chain object meta (simple API, small surface) */
  const getObjectData = useCallback<PtbContextValue['getObjectData']>(
    async (objectId, opts) => {
      const id = objectId?.trim();
      if (!id) return undefined;

      // Serve from cache unless forced
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
          onChangeObjectMetas?.(next);
          return next;
        });
        return meta;
      } catch {
        return undefined;
      }
    },
    [objectMetas, onChangeObjectMetas],
  );

  /** Fetch and cache Move package modules by package id (per-network). */
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
          onChangeModules?.(next);
          return next;
        });

        return res;
      } catch (e: any) {
        adaptersSnapshot.toast?.({
          message: e?.message || 'Failed to load package modules',
          variant: 'error',
        });
        return undefined;
      }
    },
    [modules, clientRef, adaptersSnapshot, onChangeModules],
  );

  /** Convenience: return a PTB-friendly view (TxContext stripped + name lists). */
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

  const ctx: PtbContextValue = useMemo(
    () => ({
      snapshot,
      saveSnapshot,
      loadSnapshot,
      network,
      readOnly: !!readOnly || !!lockNetwork,
      features,
      adapters: adaptersSnapshot,
      busy,
      theme,
      setTheme,
      onPatchUI, // node-scoped UI patcher

      objectMetas,
      getObjectData,

      modules,
      getPackageModules,
      getPackageModulesView,
    }),
    [
      snapshot,
      saveSnapshot,
      loadSnapshot,
      network,
      readOnly,
      lockNetwork,
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
    ],
  );

  // Ensure pending debounced onChange is flushed on unmount
  React.useEffect(() => () => flushNotify(), [flushNotify]);

  return <PtbContext.Provider value={ctx}>{children}</PtbContext.Provider>;
}

export function usePtb() {
  const ctx = useContext(PtbContext);
  if (!ctx) throw new Error('usePtb must be used within PtbProvider');
  return ctx;
}
