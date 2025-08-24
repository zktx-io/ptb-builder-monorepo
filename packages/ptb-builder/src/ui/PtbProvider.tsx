// src/PtbProvider.tsx
import React, {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type { Transaction } from '@mysten/sui/transactions';

import { consoleToast, type ToastAdapter } from '../adapters/toast';
import type {
  CommandNode,
  Port,
  PTBEdge,
  PTBGraph,
  PTBNode,
} from '../ptb/graph/types';
import { seedDefaultGraph } from '../ptb/seedGraph';
import type { Network, Theme } from '../types';
import { materializeCommandPorts } from './nodes/cmds/BaseCommand/registry';

export type Adapters = {
  clipboard?: { copy(text: string): Promise<void> };
  executeTx?: (
    tx: Transaction | undefined,
  ) => Promise<{ digest?: string; error?: string }>;
  toast?: ToastAdapter;
};

export type Features = { codegen?: boolean; parse?: boolean; exec?: boolean };

export type PtbContextValue = {
  snapshot: PTBGraph;
  saveSnapshot: (g: PTBGraph) => void;
  loadSnapshot: (g: PTBGraph) => void;

  network: Network;
  readOnly: boolean;
  features?: Features;
  adapters?: Adapters;
  busy: boolean;

  theme: Theme;
  setTheme: (t: Theme) => void;

  /**
   * Patch UI params of a single command node, then re-materialize its ports
   * and prune dangling IO edges referencing removed ports on that node.
   */
  onPatchUI: (nodeId: string, patch: Record<string, unknown>) => void;
};

const PtbContext = createContext<PtbContextValue | undefined>(undefined);

export type PtbProviderProps = {
  children: React.ReactNode;
  initialGraph?: PTBGraph;
  onChange?: (g: PTBGraph) => void;
  onChangeDebounceMs?: number;
  network?: Network;
  lockNetwork?: boolean;
  readOnly?: boolean;
  adapters?: Adapters;
  features?: Features;
  theme?: Theme;
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
}: PtbProviderProps) {
  const [busy] = useState(false);
  const [theme, setTheme] = useState<Theme>(themeProp);

  const [snapshot, setSnapshot] = useState<PTBGraph>(() =>
    initialGraph?.nodes?.length ? initialGraph : seedDefaultGraph(),
  );

  /** Apply theme to the document root */
  useLayoutEffect(() => {
    const root = document.documentElement;
    theme === 'dark'
      ? root.classList.add('dark')
      : root.classList.remove('dark');
  }, [theme]);

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

  // Debounced onChange plumbing
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
      onPatchUI, // expose node-scoped UI patcher
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
