// PtbProvider.tsx
// -----------------------------------------------------------------------------
// Internal provider that owns *persistence* and chain caches.
// During editing, the React Flow (RF) canvas is the *source of truth*.
// This provider mirrors the latest RF → PTB snapshot for autosave/export/reload.
//
// Model
// - RF is authoritative while the editor is open.
// - PTB is a persisted snapshot: loaded once to hydrate RF, then updated
//   by the canvas through `setGraph(ptb)` (debounced).
// - We only push PTB back to RF when the *document identity* changes
//   (open file / load on-chain tx).
//
// Derived flags
// - readOnly by loader:
//     • loadFromOnChainTx → readOnly = true (viewer)
//     • loadFromDoc       → readOnly = false (editor)
//
// Adapters
// - Flattened adapters (executeTx, toast).
// - ctx.toast always available (console fallback).
//
// IDs
// - To avoid timestamp/rand collisions when creating many nodes/edges quickly,
//   we expose `createUniqueId(prefix?: string)` which returns `${prefix}-${++nonce}`.
// - On load (doc/chain), we *seed* the nonce by scanning current IDs and
//   picking the max trailing numeric suffix (e.g., "node-42" → 42).
// -----------------------------------------------------------------------------

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

import type { ExecOptions } from '../codegen/types';
import { decodeTx } from '../ptb/decodeTx';
import type { PTBGraph } from '../ptb/graph/types';
import { toPTBModuleData } from '../ptb/move/normalize';
import { PTBModuleData } from '../ptb/move/types';
import { buildDoc, type PTBDoc } from '../ptb/ptbDoc';
import {
  KNOWN_IDS,
  seedDefaultGraph,
  type WellKnownId,
} from '../ptb/seedGraph';
import type { Network, Theme, ToastAdapter } from '../types';

// ===== Context shape ==========================================================

export type PtbContextValue = {
  graph: PTBGraph; // last persisted PTB snapshot (RF → PTB)
  setGraph: (g: PTBGraph) => void; // debounced persist hook

  // Runtime flags
  network: Network;
  readOnly: boolean;

  // UI theme
  theme: Theme;
  setTheme: (t: Theme) => void;

  // Chain caches & helpers
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

  // Loaders
  loadFromOnChainTx: (
    chain: `${string}:${string}`,
    txDigest: string,
  ) => Promise<void>;
  loadFromDoc: (doc: PTBDoc) => void;

  // Persistence
  exportDoc: (opts?: { includeEmbeds?: boolean; sender?: string }) => PTBDoc;

  // Monotonic, doc-scoped ID generator
  createUniqueId: (prefix?: string) => string;

  // Execution
  execOpts: ExecOptions;
  runTx?: (tx?: Transaction) => Promise<{ digest?: string; error?: string }>;

  // Toast (always available; console fallback if adapter missing)
  toast: ToastAdapter;

  /** Presence map of well-known singleton nodes (for menu disabling, creation guards, etc.) */
  wellKnown: Record<WellKnownId, boolean>;
  isWellKnownAvailable: (k: WellKnownId) => boolean;
  setWellKnownPresent: (k: WellKnownId, present: boolean) => void;

  /** Flow actions registration */
  registerFlowActions: (a: { autoLayoutAndFit?: () => void }) => void;
};

const PtbContext = createContext<PtbContextValue | undefined>(undefined);

// ===== Provider props =========================================================

export type PtbProviderProps = {
  children: React.ReactNode;
  onChange?: (g: PTBGraph) => void;
  onChangeDebounceMs?: number;

  onDocChange?: (doc: PTBDoc) => void;
  onDocDebounceMs?: number;
  autosaveDocIncludeEmbeds?: boolean;

  theme?: Theme;
  execOpts?: ExecOptions;

  executeTx?: (
    chain: `${string}:${string}`,
    tx: Transaction | undefined,
  ) => Promise<{ digest?: string; error?: string }>;
  toast?: ToastAdapter;
};

const DEFAULT_GRAPH_DEBOUNCE = 400;
const DEFAULT_DOC_DEBOUNCE = 1000;

// ===== tiny utils =============================================================

function toSuiObjectData(resp: SuiObjectResponse): SuiObjectData | undefined {
  if ((resp as any)?.error) return undefined;
  return resp.data ?? undefined;
}

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
  onChange,
  onChangeDebounceMs = DEFAULT_GRAPH_DEBOUNCE,
  onDocChange,
  onDocDebounceMs = DEFAULT_DOC_DEBOUNCE,
  autosaveDocIncludeEmbeds = false,

  theme: themeProp = 'dark',
  execOpts: execOptsProp = {},

  executeTx: executeTxProp,
  toast: toastProp,
}: PtbProviderProps) {
  // Theme
  const [theme, setTheme] = useState<Theme>(themeProp);
  useLayoutEffect(() => {
    const root = document.documentElement;
    theme === 'dark'
      ? root.classList.add('dark')
      : root.classList.remove('dark');
  }, [theme]);

  // Flow actions
  const flowActionsRef = React.useRef<{ autoLayoutAndFit?: () => void }>({});

  const registerFlowActions = React.useCallback(
    (a: { autoLayoutAndFit?: () => void }) => {
      flowActionsRef.current = { ...flowActionsRef.current, ...a };
    },
    [],
  );

  // Editor mode (derived)
  const [readOnly, setReadOnly] = useState<boolean>(false);

  // Network & client
  const [activeNetwork, setActiveNetwork] = useState<Network>('devnet');
  const clientRef = useRef<SuiClient | undefined>(undefined);
  useLayoutEffect(() => {
    clientRef.current = new SuiClient({ url: getFullnodeUrl(activeNetwork) });
  }, [activeNetwork]);

  // Persisted PTB snapshot (RF → PTB)
  const [graph, setGraphState] = useState<PTBGraph>({ nodes: [], edges: [] });

  // Track well-known presence for creation guards / menu disabling
  const [wellKnown, setWellKnown] = useState<Record<WellKnownId, boolean>>(() =>
    computeWellKnownPresence({ nodes: [], edges: [] }),
  );

  // Monotonic ID nonce (doc-scoped, seeded from current graph)
  const [idNonce, setIdNonce] = useState<number>(() =>
    seedNonceFromGraph(graph),
  );
  const genId = useCallback((prefix = 'id') => {
    let nextVal!: number;
    setIdNonce((prev) => (nextVal = prev + 1));
    return `${prefix}-${nextVal}`;
  }, []);

  // Chain caches
  const [objectMetas, setObjectMetas] = useState<Record<string, SuiObjectData>>(
    () => ({}),
  );
  const [modules, setModules] = useState<
    Record<string, SuiMoveNormalizedModules>
  >(() => ({}));

  // Toast (no-op / console fallback)
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

  // Execute adapter
  const executeTx = useCallback(
    async (
      chain: `${string}:${string}`,
      tx?: Transaction,
    ): Promise<{ digest?: string; error?: string }> => {
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

  // Build + dry-run + execute
  const runTx = useCallback(
    async (tx?: Transaction) => {
      if (!tx) return { error: 'No transaction to run' };
      const client = clientRef.current;
      if (!client) {
        toastImpl({
          message: 'SuiClient unavailable (not ready).',
          variant: 'error',
        });
        return { error: 'SuiClient unavailable' };
      }

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

      const res = await executeTx(`sui:${activeNetwork}`, tx);
      if (res?.digest) {
        toastImpl({ message: `Executed: ${res.digest}`, variant: 'success' });
      } else if (res?.error) {
        toastImpl({ message: res.error, variant: 'error' });
      }
      return res ?? {};
    },
    [activeNetwork, executeTx, toastImpl],
  );

  // ---- debounced graph autosave ---------------------------------------------

  const onChangeRef = useRef(onChange);
  const graphTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>();
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

  const setGraph = useCallback(
    (g: PTBGraph) => {
      const norm = normalizeGraph(g);
      setGraphState(norm);
      setWellKnown(computeWellKnownPresence(norm));
      scheduleGraphNotify(norm);
      // advance nonce in case external changes introduced larger numeric suffixes
      setIdNonce((prev) => Math.max(prev, seedNonceFromGraph(norm)));
    },
    [scheduleGraphNotify],
  );

  const replaceGraphImmediate = useCallback((g: PTBGraph) => {
    if (graphTimerRef.current !== undefined) {
      clearTimeout(graphTimerRef.current);
      graphTimerRef.current = undefined;
    }
    lastGraphRef.current = undefined;
    const norm = normalizeGraph(g);
    setGraphState(norm);
    setWellKnown(computeWellKnownPresence(norm));
    // reset nonce to the max found in the new snapshot
    setIdNonce(seedNonceFromGraph(norm));
  }, []);

  // ---- debounced PTBDoc autosave --------------------------------------------

  const onDocChangeRef = useRef(onDocChange);
  const docTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>();
  onDocChangeRef.current = onDocChange;

  const flushDocNotify = useCallback(() => {
    if (docTimerRef.current !== undefined) {
      clearTimeout(docTimerRef.current);
      docTimerRef.current = undefined;
    }
    if (!onDocChangeRef.current) return;
    const doc = buildDoc({
      network: activeNetwork,
      graph,
      includeEmbeds: autosaveDocIncludeEmbeds,
      modules: autosaveDocIncludeEmbeds ? modules : undefined,
      objects: autosaveDocIncludeEmbeds ? objectMetas : undefined,
    });
    onDocChangeRef.current?.(doc);
  }, [activeNetwork, graph, autosaveDocIncludeEmbeds, modules, objectMetas]);

  const scheduleDocNotify = useCallback(() => {
    if (!onDocChangeRef.current) return;
    if (docTimerRef.current !== undefined) clearTimeout(docTimerRef.current);
    docTimerRef.current = setTimeout(() => {
      if (!onDocChangeRef.current) return;
      const doc = buildDoc({
        network: activeNetwork,
        graph,
        includeEmbeds: autosaveDocIncludeEmbeds,
        modules: autosaveDocIncludeEmbeds ? modules : undefined,
        objects: autosaveDocIncludeEmbeds ? objectMetas : undefined,
      });
      onDocChangeRef.current?.(doc);
      docTimerRef.current = undefined;
    }, onDocDebounceMs ?? DEFAULT_DOC_DEBOUNCE);
  }, [
    activeNetwork,
    graph,
    autosaveDocIncludeEmbeds,
    modules,
    objectMetas,
    onDocDebounceMs,
  ]);

  React.useEffect(() => {
    scheduleDocNotify();
  }, [graph, scheduleDocNotify]);

  React.useEffect(() => {
    scheduleDocNotify();
  }, [modules, objectMetas, activeNetwork, scheduleDocNotify]);

  // ---- chain helpers ---------------------------------------------------------

  const getObjectData = useCallback<PtbContextValue['getObjectData']>(
    async (objectId, opts) => {
      const id = objectId?.trim();
      if (!id) return undefined;

      if (!opts?.forceRefresh && objectMetas[id]) return objectMetas[id];

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

        setObjectMetas((prev) => ({ ...prev, [id]: meta }));
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
        toastImpl({
          message: 'Invalid package id. It should start with 0x…',
          variant: 'warning',
        });
        return undefined;
      }

      if (!opts?.forceRefresh && modules[id]) return modules[id];

      const client = clientRef.current;
      if (!client) return undefined;

      try {
        const res = await client.getNormalizedMoveModulesByPackage({
          package: id,
        });
        setModules((prev) => ({ ...prev, [id]: res }));
        scheduleDocNotify();
        return res;
      } catch (e: any) {
        toastImpl({
          message: e?.message || 'Failed to load package modules',
          variant: 'error',
        });
        return undefined;
      }
    },
    [modules, clientRef, toastImpl, scheduleDocNotify],
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

  // ---- on-chain loader (viewer) ---------------------------------------------

  function networkFromChain(chain: `${string}:${string}`): Network | undefined {
    const [, netRaw] = String(chain).split(':');
    const net = (netRaw || '').toLowerCase();
    const allowed: Network[] = ['devnet', 'testnet', 'mainnet'];
    return allowed.includes(net as Network) ? (net as Network) : undefined;
  }

  const loadFromOnChainTx: PtbContextValue['loadFromOnChainTx'] = useCallback(
    async (chain, txDigest) => {
      const digest = (txDigest || '').trim();
      if (!digest) {
        toastImpl({ message: 'Empty transaction digest.', variant: 'warning' });
        return;
      }

      const net = networkFromChain(chain);
      if (!net) {
        toastImpl({
          message: `Unsupported chain "${chain}". Use "sui:devnet|testnet|mainnet".`,
          variant: 'error',
        });
        return;
      }

      const localClient = new SuiClient({ url: getFullnodeUrl(net) });

      try {
        const res = await localClient.getTransactionBlock({
          digest,
          options: {
            showInput: true,
            showEffects: true,
            showObjectChanges: false,
            showEvents: false,
          },
        });

        const txData: any = res?.transaction?.data;
        const programmable = txData?.transaction;

        if (!programmable || programmable.kind !== 'ProgrammableTransaction') {
          toastImpl({
            message: 'Only ProgrammableTransaction is supported.',
            variant: 'warning',
          });
          return;
        }

        // Preload modules referenced by MoveCalls (best-effort)
        const pkgIds: string[] = Array.isArray(programmable?.transactions)
          ? programmable.transactions
              .filter((t: any) => t?.MoveCall?.package)
              .map((t: any) => t.MoveCall.package)
          : [];
        const uniquePkgs = Array.from(new Set(pkgIds));

        const modsEmbed: Record<string, SuiMoveNormalizedModules> = {};
        for (const pkg of uniquePkgs) {
          try {
            const m = await localClient.getNormalizedMoveModulesByPackage({
              package: pkg,
            });
            modsEmbed[pkg] = m;
          } catch {
            // ignore per-package failures
          }
        }

        // Fix network and prime caches
        setActiveNetwork(net);
        setModules(modsEmbed);
        setObjectMetas({});

        // Decode → PTBGraph
        const { graph: decoded } = decodeTx(programmable);

        // Replace snapshot (viewer mode)
        replaceGraphImmediate(decoded);
        setReadOnly(true);
        scheduleGraphNotify(decoded);
        scheduleDocNotify();

        // Auto-layout after a tick (if registered)
        requestAnimationFrame(() => {
          flowActionsRef.current.autoLayoutAndFit?.();
        });
      } catch (e: any) {
        toastImpl({
          message: e?.message || 'Failed to load transaction from chain.',
          variant: 'error',
        });
      }
    },
    [toastImpl, replaceGraphImmediate, scheduleGraphNotify, scheduleDocNotify],
  );

  // ---- document loader (editor) ---------------------------------------------

  const loadFromDoc = useCallback<PtbContextValue['loadFromDoc']>(
    (doc) => {
      // Fix network
      setActiveNetwork(doc.network);

      // Overwrite caches from embeds
      setModules(doc.modulesEmbed ?? {});
      setObjectMetas(doc.objectsEmbed ?? {});

      // Replace graph (seed if invalid/empty)
      const g = doc.graph;
      const valid =
        g && Array.isArray(g.nodes) && Array.isArray(g.edges) && g.nodes.length;
      const base = valid ? g : seedDefaultGraph();

      replaceGraphImmediate(base);
      setReadOnly(false);

      scheduleGraphNotify(base);
      scheduleDocNotify();
    },
    [replaceGraphImmediate, scheduleGraphNotify, scheduleDocNotify],
  );

  // ---- export doc ------------------------------------------------------------

  const exportDoc = useCallback<PtbContextValue['exportDoc']>(
    (opts) => {
      const includeEmbeds = !!opts?.includeEmbeds;
      const sender = opts?.sender;
      return buildDoc({
        network: activeNetwork,
        graph,
        sender,
        includeEmbeds,
        modules: includeEmbeds ? modules : undefined,
        objects: includeEmbeds ? objectMetas : undefined,
      });
    },
    [activeNetwork, graph, modules, objectMetas],
  );

  // ---- well-known helpers ----------------------------------------------------

  /** Build a presence map for well-known IDs on a graph. */
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

  /**
   * Normalize a graph so that:
   * - Start/End node IDs are canonical (KNOWN_IDS.START / KNOWN_IDS.END).
   * - If a Start/End exists with a non-canonical id, rename it and rewrite edges.
   * - If multiple Start/End appear, keep the first one (stable) and drop others, then rewrite edges to the keeper.
   * - Do NOT auto-create missing constants here (decoder/seedGraph should create them).
   *
   * Note: Other constants (gas/system/clock/random/my_wallet) are created with fixed IDs
   * by the factories/editor; duplicates would already violate ID uniqueness.
   */
  function normalizeGraph(g: PTBGraph): PTBGraph {
    const nodes = [...(g.nodes || [])];
    const edges = [...(g.edges || [])];

    // Helper to coalesce a kind into a canonical id and rewrite edges.
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

      // Pick the first one as the keeper
      const { n: keeperNode } = idxs[0];

      // If keeper has non-canonical id, rename + rewrite all edges
      if (keeperNode.id !== canonicalId) {
        const oldId = keeperNode.id;
        keeperNode.id = canonicalId;
        // Rewrite edges that reference oldId
        edges.forEach((e) => {
          if (e.source === oldId) e.source = canonicalId;
          if (e.target === oldId) e.target = canonicalId;
          if (e.kind === 'flow') {
            // Keep handle names aligned when we retarget Start/End
            if (e.source === canonicalId) e.sourceHandle = canonicalNextHandle;
            if (e.target === canonicalId) e.targetHandle = canonicalPrevHandle;
          }
        });
      }

      // Drop extra nodes and rewrite edges pointing to them into keeper
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
      // Actually remove duplicates after rewiring
      for (let k = idxs.length - 1; k >= 1; k--) {
        nodes.splice(idxs[k].i, 1);
      }
    };

    coalesce('Start', KNOWN_IDS.START, 'prev', 'next');
    coalesce('End', KNOWN_IDS.END, 'prev', 'next');

    return { nodes, edges };
    // (Other well-known variable nodes already use canonical ids; no-op here.)
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

      network: activeNetwork,
      readOnly: !!readOnly,

      theme,
      setTheme,

      objectMetas,
      getObjectData,

      modules,
      getPackageModules,
      getPackageModulesView,

      loadFromOnChainTx,
      loadFromDoc,
      exportDoc,

      createUniqueId: genId, // monotonic ID generator

      execOpts: execOptsProp,

      runTx,
      toast: toastImpl,

      wellKnown,
      isWellKnownAvailable,
      setWellKnownPresent,

      registerFlowActions,
    }),
    [
      graph,
      setGraph,
      activeNetwork,
      readOnly,
      theme,
      objectMetas,
      getObjectData,
      modules,
      getPackageModules,
      getPackageModulesView,
      loadFromOnChainTx,
      loadFromDoc,
      exportDoc,
      genId,
      execOptsProp,
      runTx,
      toastImpl,
      wellKnown,
      isWellKnownAvailable,
      setWellKnownPresent,
      registerFlowActions,
    ],
  );

  // Ensure pending debounced notifies flush on unmount
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
