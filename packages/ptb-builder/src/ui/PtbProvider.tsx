// PtbProvider.tsx
// -----------------------------------------------------------------------------
// Provider that owns persistence, chain caches, and RF/PTB synchronization.
// Fixes feedback loops by:
//  1) Applying a stable structural signature (stableGraphSig) and ignoring
//     no-op updates after normalizeGraph.
//  2) Introducing graphEpoch so that "doc/chain load → RF inject" is
//     separated from normal "edit → save (RF→PTB)".
//
// Model
// - RF is authoritative while the editor is open.
// - PTB is a persisted snapshot: loaded once to hydrate RF, then updated
//   by the canvas through `setGraph(ptb)` (debounced).
// - We only push PTB back to RF when the *document identity* changes.
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
import type { Chain, Theme, ToastAdapter } from '../types';

// ===== Context shape ==========================================================

export type PtbContextValue = {
  graph: PTBGraph; // last persisted PTB snapshot (RF → PTB)
  setGraph: (g: PTBGraph) => void; // debounced persist hook

  // Runtime flags
  chain: Chain;
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
  loadFromOnChainTx: (chain: Chain, txDigest: string) => Promise<void>;
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

  /** Presence map of well-known singleton nodes (menu disabling, creation guards). */
  wellKnown: Record<WellKnownId, boolean>;
  isWellKnownAvailable: (k: WellKnownId) => boolean;
  setWellKnownPresent: (k: WellKnownId, present: boolean) => void;

  /** Flow actions registration */
  registerFlowActions: (a: { autoLayoutAndFit?: () => void }) => void;

  /** Epoch for doc/chain injections. RF rehydrates only when this changes. */
  graphEpoch: number;
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
    chain: Chain,
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

/** Build an order-insensitive, structural signature for a PTB graph. */
function stableGraphSig(g: PTBGraph): string {
  // Normalize node payloads to PTB-meaningful fields only (no RF fields!)
  const nodes = [...(g.nodes || [])]
    .map((n) => {
      // ports: keep id/role/direction/dataType only
      const ports = [...(n.ports || [])]
        .map((p) => ({
          id: p.id,
          role: p.role,
          direction: p.direction,
          // stringify to make deep-equal deterministic
          dataType: p.dataType ? JSON.stringify(p.dataType) : undefined,
        }))
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

      // optional fields depending on node kind
      const extra: Record<string, unknown> = {};
      const anyN = n as any;
      if (anyN.command !== undefined) extra.command = anyN.command; // Command node
      if (anyN.params !== undefined) extra.params = anyN.params; // Command node params (ui etc.)
      if (anyN.varType !== undefined) extra.varType = anyN.varType; // Variable node
      if (anyN.value !== undefined) extra.value = anyN.value; // Variable node value

      return {
        id: n.id,
        kind: n.kind,
        ports,
        ...extra,
      };
    })
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  // Normalize edges to PTB fields only
  const edges = [...(g.edges || [])]
    .map((e) => ({
      id: e.id,
      kind: e.kind,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? undefined,
      targetHandle: e.targetHandle ?? undefined,
      // PTBEdge has no .data/.label in the type — exclude RF-only fields
    }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return JSON.stringify({ nodes, edges });
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

  // Chain & client
  const [activeChain, setActiveChain] = useState<Chain>('sui:devnet');
  const clientRef = useRef<SuiClient | undefined>(undefined);
  useLayoutEffect(() => {
    clientRef.current = new SuiClient({
      url: getFullnodeUrl(activeChain.split(':')[1] as any),
    });
  }, [activeChain]);

  // Persisted PTB snapshot (RF → PTB)
  const [graph, setGraphState] = useState<PTBGraph>({ nodes: [], edges: [] });

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
      chain: Chain,
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

  // Keep a stable signature to prevent feedback loops on normalizeGraph
  const lastGraphSigRef = useRef<string>(
    stableGraphSig({ nodes: [], edges: [] }),
  );

  const setGraph = useCallback(
    (g: PTBGraph) => {
      const norm = normalizeGraph(g);
      const nextSig = stableGraphSig(norm);
      if (nextSig === lastGraphSigRef.current) {
        // No structural change → stop the loop early
        return;
      }

      lastGraphSigRef.current = nextSig;
      setGraphState(norm);
      setWellKnown(computeWellKnownPresence(norm));
      scheduleGraphNotify(norm);
      // Advance nonce if external ids introduce larger numeric suffixes
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
    // Reset signature on full replacement
    lastGraphSigRef.current = stableGraphSig(norm);

    setGraphState(norm);
    setWellKnown(computeWellKnownPresence(norm));
    setIdNonce(seedNonceFromGraph(norm));
    setGraphEpoch((e) => e + 1); // bump epoch so RF rehydrates once per load
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
      chain: activeChain,
      graph,
      includeEmbeds: autosaveDocIncludeEmbeds,
      modules: autosaveDocIncludeEmbeds ? modules : undefined,
      objects: autosaveDocIncludeEmbeds ? objectMetas : undefined,
    });
    onDocChangeRef.current?.(doc);
  }, [activeChain, graph, autosaveDocIncludeEmbeds, modules, objectMetas]);

  const scheduleDocNotify = useCallback(() => {
    if (!onDocChangeRef.current) return;
    if (docTimerRef.current !== undefined) clearTimeout(docTimerRef.current);
    docTimerRef.current = setTimeout(() => {
      if (!onDocChangeRef.current) return;
      const doc = buildDoc({
        chain: activeChain,
        graph,
        includeEmbeds: autosaveDocIncludeEmbeds,
        modules: autosaveDocIncludeEmbeds ? modules : undefined,
        objects: autosaveDocIncludeEmbeds ? objectMetas : undefined,
      });
      onDocChangeRef.current?.(doc);
      docTimerRef.current = undefined;
    }, onDocDebounceMs ?? DEFAULT_DOC_DEBOUNCE);
  }, [
    activeChain,
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
  }, [modules, objectMetas, activeChain, scheduleDocNotify]);

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

  const loadFromOnChainTx: PtbContextValue['loadFromOnChainTx'] = useCallback(
    async (chain, txDigest) => {
      const digest = (txDigest || '').trim();
      if (!digest) {
        toastImpl({ message: 'Empty transaction digest.', variant: 'warning' });
        return;
      }

      const localClient = new SuiClient({
        url: getFullnodeUrl(chain.split(':')[1] as any),
      });

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
        const modsEmbedView: Record<string, PTBModuleData> = {};
        for (const pkg of uniquePkgs) {
          try {
            const m = await localClient.getNormalizedMoveModulesByPackage({
              package: pkg,
            });
            modsEmbed[pkg] = m;
            modsEmbedView[pkg] = toPTBModuleData(m);
          } catch {
            // ignore per-package failures
          }
        }

        // Fix chain and prime caches
        setActiveChain(chain);
        setModules(modsEmbed);
        setObjectMetas({});

        // Decode → PTBGraph
        const { graph: decoded } = decodeTx(programmable, modsEmbedView);

        // Replace snapshot (viewer mode) and bump epoch
        replaceGraphImmediate(decoded);
        setReadOnly(true);

        // Schedule doc/graph notify after replacement
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
      setActiveChain(doc.chain);

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
        chain: activeChain,
        graph,
        sender,
        includeEmbeds,
        modules: includeEmbeds ? modules : undefined,
        objects: includeEmbeds ? objectMetas : undefined,
      });
    },
    [activeChain, graph, modules, objectMetas],
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
   * Normalize a graph so that Start/End ids are canonical and edges are
   * rewritten accordingly. Must be idempotent.
   */
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

      chain: activeChain,
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

      createUniqueId: genId,

      execOpts: execOptsProp,

      runTx,
      toast: toastImpl,

      wellKnown,
      isWellKnownAvailable,
      setWellKnownPresent,

      registerFlowActions,

      graphEpoch,
    }),
    [
      graph,
      setGraph,
      activeChain,
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
      graphEpoch,
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
