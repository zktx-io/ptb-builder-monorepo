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
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  DryRunTransactionBlockResponse,
  ExecutionStatus,
  getFullnodeUrl,
  type GetOwnedObjectsParams,
  type PaginatedObjectsResponse,
  SuiClient,
} from '@mysten/sui/client';
import type { Transaction } from '@mysten/sui/transactions';

import type { ExecOptions } from '../codegen/types';
import { decodeTx } from '../ptb/decodeTx';
import type { PTBGraph } from '../ptb/graph/types';
import { toPTBModuleData } from '../ptb/move/toPTBModuleData';
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
import type { Chain, Theme, ToastAdapter } from '../types';

// ===== Context shape ==========================================================

type TxStatus = {
  status: 'success' | 'failure';
  error?: string;
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

  // Chain caches & helpers (PTB-only)
  objects: PTBObjectsEmbed;
  getObjectData: (
    objectId: string,
    opts?: { forceRefresh?: boolean; clientOverride?: SuiClient },
  ) => Promise<PTBObjectData | undefined>;

  modules: PTBModulesEmbed;
  getPackageModules: (
    packageId: string,
    opts?: { forceRefresh?: boolean },
  ) => Promise<
    | {
        names: string[];
        modules: {
          [moduleName: string]: { names: string[]; functions: PTBFunctionData };
        };
      }
    | undefined
  >;

  getOwnedObjects: (
    params: Omit<GetOwnedObjectsParams, 'owner'> & {
      owner: string;
      clientOverride?: SuiClient;
    },
  ) => Promise<PaginatedObjectsResponse | undefined>;

  // Loaders
  loadTxStatus: TxStatus | undefined;
  loadFromOnChainTx: (chain: Chain, txDigest: string) => Promise<void>;
  loadFromDoc: (doc: PTBDoc) => void;

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
    fitToContent?: (opt: {
      view?: { x: number; y: number; zoom: number };
      autoLayout?: boolean;
    }) => void;
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

  executeTx?: (
    chain: Chain,
    tx: Transaction | undefined,
  ) => Promise<{ digest?: string; error?: string }>;
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

// ===== Provider ===============================================================

export function PtbProvider({
  children,
  onDocChange,

  initialTheme,
  execOpts: execOptsProp = {},

  executeTx: executeTxProp,
  toast: toastProp,
  showExportButton = false,
}: PtbProviderProps) {
  // Theme
  const [theme, setTheme] = useState<Theme>(initialTheme);

  const applyTheme = React.useCallback((t: Theme) => {
    const root = document.documentElement;
    t === 'dark' ? root.classList.add('dark') : root.classList.remove('dark');
    root.setAttribute('data-ptb-theme', t);
  }, []);

  useLayoutEffect(() => {
    applyTheme(theme);
  }, [theme, applyTheme]);

  // Flow actions
  const flowActionsRef = React.useRef<{
    fitToContent?: (opt: {
      view?: { x: number; y: number; zoom: number };
      autoLayout?: boolean;
    }) => void;
  }>({});

  const registerFlowActions = React.useCallback(
    (a: {
      fitToContent?: (opt: {
        view?: { x: number; y: number; zoom: number };
        autoLayout?: boolean;
      }) => void;
    }) => {
      flowActionsRef.current = { ...flowActionsRef.current, ...a };
    },
    [],
  );

  // Editor mode
  const [readOnly, setReadOnly] = useState<boolean>(false);

  // Chain & client
  const [activeChain, setActiveChain] = useState<Chain | undefined>(undefined);
  const clientRef = useRef<SuiClient | undefined>(undefined);
  useLayoutEffect(() => {
    if (!activeChain) {
      clientRef.current = undefined;
      return;
    }
    clientRef.current = new SuiClient({
      url: getFullnodeUrl(activeChain.split(':')[1] as any),
    });
  }, [activeChain]);

  // Persisted PTB snapshot (RF → PTB)
  const [graph, setGraphState] = useState<PTBGraph>({ nodes: [], edges: [] });
  const [view, setView] = useState<
    { x: number; y: number; zoom: number } | undefined
  >(undefined);

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
      if (!tx || !activeChain) return { error: 'No transaction to run' };
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

  const dryRunTx = useCallback(
    async (tx?: Transaction): Promise<void> => {
      if (!tx) {
        toastImpl({ message: 'No transaction to dry-run', variant: 'error' });
        return;
      }

      const client = clientRef.current;
      if (!client) {
        toastImpl({
          message: 'SuiClient unavailable (not ready).',
          variant: 'error',
        });
        return;
      }

      try {
        const bytes = await tx.build({ client });
        const sim = (await client.dryRunTransactionBlock({
          transactionBlock: bytes,
        })) as DryRunTransactionBlockResponse;

        const status =
          (sim as any)?.effects?.status?.status ??
          (sim as any)?.effects?.status ??
          (sim as any)?.status;

        const errorMsg =
          (sim as any)?.effects?.status?.error ||
          (sim as any)?.checkpointError ||
          (sim as any)?.error;

        if (status !== 'success') {
          toastImpl({
            message: errorMsg || 'Dry run failed',
            variant: 'error',
          });
          return;
        }

        toastImpl({ message: 'Dry run success', variant: 'success' });
      } catch (e: any) {
        const msg = e?.message || 'Dry run error';
        toastImpl({ message: msg, variant: 'error' });
      }
    },
    [toastImpl],
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

  // ---- PTBDoc: immediate emit on any change ---------------------------------

  const onDocChangeRef = useRef(onDocChange);
  onDocChangeRef.current = onDocChange;

  useLayoutEffect(() => {
    if (!onDocChangeRef.current || !activeChain || !view) return;
    try {
      const doc = buildDoc({
        chain: activeChain,
        graph,
        view,
        modules: modules ?? {},
        objects: objects ?? {},
      });
      onDocChangeRef.current({ ...doc, view });
    } catch {
      // Swallow to avoid breaking the edit loop
    }
  }, [graph, modules, objects, activeChain, view]);

  const setViewExternal = useCallback(
    (v: { x: number; y: number; zoom: number }) => {
      if (!onDocChangeRef.current || !activeChain) return;
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
        const resp = await client.getObject({
          id,
          options: { showType: true, showContent: true },
        });

        if (!resp.data) return undefined;

        const moveType =
          resp.data.content?.dataType === 'moveObject'
            ? (resp.data.content as any)?.type
            : undefined;

        const obj: PTBObjectData = {
          objectId: resp.data.objectId,
          typeTag: moveType ?? '',
        };

        setObjects((prev) => ({ ...prev, [id]: obj }));
        return obj;
      } catch {
        return undefined;
      }
    },
    [objects],
  );

  const getPackageModules = useCallback<PtbContextValue['getPackageModules']>(
    async (
      packageId,
      opts,
    ): Promise<
      | {
          names: string[];
          modules: {
            [moduleName: string]: {
              names: string[];
              functions: PTBFunctionData;
            };
          };
        }
      | undefined
    > => {
      const id = packageId?.trim();
      if (!id || !id.startsWith('0x')) {
        toastImpl({ message: 'Invalid package id', variant: 'warning' });
        return undefined;
      }

      if (!opts?.forceRefresh && modules[id]) {
        return {
          names: Object.keys(modules[id]),
          modules: Object.fromEntries(
            Object.keys(modules[id]).map((name) => [
              name,
              {
                names: Object.keys(modules[id][name]),
                functions: modules[id][name],
              },
            ]),
          ),
        };
      }

      const client = clientRef.current;
      if (!client) {
        toastImpl({ message: 'No client available', variant: 'warning' });
        return undefined;
      }

      try {
        const raw = await client.getNormalizedMoveModulesByPackage({
          package: id,
        });
        const normalized = toPTBModuleData(raw);
        setModules((prev) => ({ ...prev, [id]: normalized }));
        return {
          names: Object.keys(normalized),
          modules: Object.fromEntries(
            Object.keys(normalized).map((name) => [
              name,
              {
                names: Object.keys(normalized[name]),
                functions: normalized[name],
              },
            ]),
          ),
        };
      } catch (e: any) {
        toastImpl({
          message: e?.message || 'Failed to load package modules',
          variant: 'error',
        });
        return undefined;
      }
    },
    [modules, clientRef, toastImpl],
  );

  const getOwnedObjects = useCallback<PtbContextValue['getOwnedObjects']>(
    async (params) => {
      const { clientOverride, ...rest } = params ?? {};
      const client = clientOverride ?? clientRef.current;
      if (!client) return undefined;

      try {
        const page = await client.getOwnedObjects(
          rest as GetOwnedObjectsParams,
        );
        return page;
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
        const status: ExecutionStatus | undefined = res.effects?.status;

        if (status) {
          setLoadTxStatus({ status: status.status, error: status.error });
        }

        if (!programmable || programmable.kind !== 'ProgrammableTransaction') {
          toastImpl({
            message: 'Only ProgrammableTransaction is supported.',
            variant: 'warning',
          });
          return;
        }

        // 1) Preload modules referenced by MoveCalls (best effort)
        const pkgIds: string[] = Array.isArray(programmable?.transactions)
          ? programmable.transactions
              .filter((t: any) => t?.MoveCall?.package)
              .map((t: any) => t.MoveCall.package)
          : [];
        const uniquePkgs = Array.from(new Set(pkgIds));

        const modsEmbed: PTBModulesEmbed = {};
        for (const pkg of uniquePkgs) {
          try {
            const m = await localClient.getNormalizedMoveModulesByPackage({
              package: pkg,
            });
            modsEmbed[pkg] = toPTBModuleData(m);
          } catch {
            // ignore per-package failures
          }
        }

        // 2) Collect candidate object ids (from inputs)
        const candidateIds = new Set<string>();
        const inputs = Array.isArray(programmable?.inputs)
          ? programmable.inputs
          : [];
        for (const inp of inputs) {
          if (
            inp?.type === 'object' &&
            typeof inp.objectId === 'string' &&
            inp.objectId.startsWith('0x')
          ) {
            candidateIds.add(inp.objectId);
          }
        }

        // 3) Fetch object metadata (best effort)
        const fetched = await Promise.all(
          [...candidateIds].map((oid) =>
            getObjectData(oid, { clientOverride: localClient }),
          ),
        );
        const objectsEmbed: PTBObjectsEmbed = {};
        for (const o of fetched) {
          if (o) objectsEmbed[o.objectId] = o;
        }

        // 4) Decode once with embed = { modules, objects }
        const { graph: decoded, diags } = decodeTx(programmable, {
          modules: modsEmbed,
          objects: objectsEmbed,
        });

        diags.forEach(({ variant, message }) => {
          toastImpl({ message, variant });
        });

        // 5) Fix chain and prime caches (overwrite → no carry-over)
        setActiveChain(chain);
        setModules(modsEmbed);
        setObjects(objectsEmbed);

        // 6) Replace snapshot (viewer mode) and bump epoch
        replaceGraphImmediate(decoded);
        setReadOnly(true);

        setCodePipOpenTick(0);

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            flowActionsRef.current.fitToContent?.({ autoLayout: true });
          });
        });
      } catch (e: any) {
        toastImpl({
          message: e?.message || 'Failed to load transaction from chain.',
          variant: 'error',
        });
      }
    },
    [toastImpl, replaceGraphImmediate, getObjectData],
  );

  // ---- document loader (editor) ---------------------------------------------

  const loadFromDoc = useCallback<PtbContextValue['loadFromDoc']>(
    (doc) => {
      setActiveChain(doc.chain);
      setModules(doc.modules || {});
      setObjects(doc.objects || {});

      // Replace graph (seed if invalid/empty)
      const g = doc.graph;
      const valid =
        g && Array.isArray(g.nodes) && Array.isArray(g.edges) && g.nodes.length;
      const base = valid ? g : seedDefaultGraph();
      setView(doc.view || { x: 0, y: 0, zoom: 1 });
      replaceGraphImmediate(base);
      setReadOnly(false);

      setCodePipOpenTick((t) => t + 1);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          flowActionsRef.current.fitToContent?.({ view: doc.view });
        });
      });
    },
    [replaceGraphImmediate],
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
      showExportButton,

      objects,
      getObjectData,

      modules,
      getPackageModules,

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
      showExportButton,
      objects,
      getObjectData,
      modules,
      getPackageModules,
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
