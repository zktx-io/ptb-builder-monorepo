// src/ui/PTBFlow.tsx
// -----------------------------------------------------------------------------
// RF is the *source of truth* while the editor is open.
// We rehydrate PTB → RF only when provider.graphEpoch changes.
// RF mutations persist to PTB *after commit* in a single effect (no debounce).
// Only text inputs inside node UI are debounced (not handled here).
// -----------------------------------------------------------------------------

import React, { useCallback, useEffect, useRef, useState } from 'react';

import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  type Edge as RFEdge,
  type Node as RFNode,
  useReactFlow,
} from '@xyflow/react';
import type {
  Connection,
  EdgeChange,
  NodeChange,
  Viewport,
} from '@xyflow/react';

import { CodePip, EMPTY_CODE } from './CodePip';
import { EdgeTypes } from './edges';
import { ContextMenu } from './menu/ContextMenu';
import { NodeTypes } from './nodes';
import { usePtb } from './PtbProvider';
import {
  ptbNodeToRF,
  ptbToRF,
  type RFEdgeData,
  type RFNodeData,
  rfToPTB,
} from '../ptb/ptbAdapter';
import { autoLayoutFlow, type LayoutPositions } from './utils/autoLayout';
import { hasStartToEnd } from './utils/flowPath';
import { buildTransaction } from '../codegen/buildTransaction';
import { buildTsSdkCode } from '../codegen/buildTsSdkCode';
import { makeObject, setIdGenerator } from '../ptb/factories';
import {
  inferCastTarget,
  isTypeCompatible,
  isUnknownType,
} from '../ptb/graph/typecheck';
import {
  parseHandleTypeSuffix,
  type Port,
  PTBGraph,
  type PTBNode,
  type PTBType,
  type VariableNode,
} from '../ptb/graph/types';
import { buildCommandPorts } from '../ptb/registry';
import { toColorMode } from '../types';
import { StatusBar } from './StatusBar';

// ===== pure helpers (file-scope) =============================================

/** DFS loop check for flow edges (prevents cycles). */
function createsLoop(edges: RFEdge[], source: string, target: string): boolean {
  const seen = new Set<string>();
  const stack = [target];
  while (stack.length) {
    const n = stack.pop()!;
    if (n === source) return true;
    if (seen.has(n)) continue;
    seen.add(n);
    for (const e of edges) if (e.source === n) stack.push(e.target);
  }
  return false;
}

/** Enforce 1:1 flow per handle (both source & target). */
function filterHandleConflictsForFlow(edges: RFEdge[], conn: Connection) {
  const src = conn.source!;
  const tgt = conn.target!;
  const sHandle = conn.sourceHandle ?? undefined;
  const tHandle = conn.targetHandle ?? undefined;
  if (!sHandle || !tHandle) return undefined;
  return edges.filter(
    (e) =>
      !(
        e.type === 'ptb-flow' &&
        ((e.source === src && e.sourceHandle === sHandle) ||
          (e.target === tgt && e.targetHandle === tHandle))
      ),
  );
}

/** IO targets are single; allow fan-out from sources. */
function filterHandleConflictsForIO(edges: RFEdge[], conn: Connection) {
  const tgt = conn.target!;
  const tHandle = conn.targetHandle ?? undefined;
  if (!tHandle) return undefined;
  return edges.filter(
    (e) =>
      !(e.type === 'ptb-io' && e.target === tgt && e.targetHandle === tHandle),
  );
}

/** nodeId -> set(basePortId) index (used to validate handle existence). */
function buildHandleIndex(
  nodes: RFNode<RFNodeData>[],
): Map<string, Set<string>> {
  const idx = new Map<string, Set<string>>();
  for (const n of nodes) {
    const ptbNode: any = (n.data as any)?.ptbNode;
    const ports = Array.isArray(ptbNode?.ports)
      ? (ptbNode.ports as Port[])
      : [];
    const set = new Set<string>();
    for (const p of ports) set.add(p.id);
    idx.set(n.id, set);
  }
  return idx;
}

/** Drop edges whose handles no longer exist. */
function pruneDanglingEdges(
  nodes: RFNode<RFNodeData>[],
  edges: RFEdge<RFEdgeData>[],
): RFEdge<RFEdgeData>[] {
  const idx = buildHandleIndex(nodes);
  return edges.filter((e) => {
    const srcSet = idx.get(e.source);
    const tgtSet = idx.get(e.target);
    if (!srcSet || !tgtSet) return false;
    const sId = parseHandleTypeSuffix(e.sourceHandle ?? undefined).baseId;
    const tId = parseHandleTypeSuffix(e.targetHandle ?? undefined).baseId;
    return Boolean(sId && tId && srcSet.has(sId) && tgtSet.has(tId));
  });
}

/** Resolve PTB type for an RF endpoint (needed to validate IO edges). */
function resolvePortType(
  ptbNodes: PTBNode[],
  nodeId: string,
  handle?: string,
): PTBType | undefined {
  const pid = parseHandleTypeSuffix(handle).baseId;
  if (!pid) return undefined;
  const n = ptbNodes.find((x) => x.id === nodeId);
  if (!n) return undefined;
  const p = (n.ports || []).find((pp) => pp.id === pid);
  return p?.dataType;
}

/** Drop IO edges that became type-incompatible after UI/port changes. */
function pruneIncompatibleIOEdges(
  ptbNodes: PTBNode[],
  edges: RFEdge<RFEdgeData>[],
): RFEdge<RFEdgeData>[] {
  return edges.filter((e) => {
    if (e.type !== 'ptb-io') return true;
    const sT = resolvePortType(ptbNodes, e.source, e.sourceHandle ?? undefined);
    const tT = resolvePortType(ptbNodes, e.target, e.targetHandle ?? undefined);
    if (!sT || !tT) return false;
    if (isUnknownType(sT) || isUnknownType(tT)) return false;
    return isTypeCompatible(sT, tT);
  });
}

/** Build a compact signature for edges to avoid redundant setRF. */
function edgesSig(edges: RFEdge<RFEdgeData>[]): string {
  const arr = [...edges].map((e) => ({
    id: e.id,
    type: e.type,
    s: e.source,
    t: e.target,
    sh: e.sourceHandle ?? undefined,
    th: e.targetHandle ?? undefined,
    l: (e as any).label ?? undefined,
    d: e.data ?? undefined,
  }));
  arr.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return JSON.stringify(arr);
}

/** Defer a state change to a microtask (or macrotask fallback). */
function deferSetState(fn: () => void) {
  if (typeof queueMicrotask === 'function') queueMicrotask(fn);
  else setTimeout(fn, 0);
}

// ===== component =============================================================

export function PTBFlow() {
  const {
    graph,
    setGraph,
    setViewExternal,
    readOnly,
    theme,
    chain,
    execOpts,
    dryRunTx,
    runTx,
    createUniqueId,
    registerFlowActions,
    graphEpoch,
    codePipOpenTick,
    toast,
    loadTxStatus,
  } = usePtb();

  // Keep factories aligned with the provider's monotonic ID policy
  useEffect(() => {
    setIdGenerator(createUniqueId);
  }, [createUniqueId]);

  // Code preview
  const [code, setCode] = useState<string>(EMPTY_CODE(chain));

  // UI toggles
  const [showMiniMap, setShowMiniMap] = useState(true);

  // Flow state flags
  const [flowActive, setFlowActive] = useState(false);
  const [layoutReady, setLayoutReady] = useState(false);

  // Persisted PTB snapshot ref (for RF→PTB diffs)
  const baseGraphRef = useRef(graph);

  // Rehydrate guard
  const rehydratingRef = useRef(false);
  const lastEpochRef = useRef<number>(-1);

  // Patch callback refs (avoid TDZ during initial render)
  const patchUIRef = useRef<
    (id: string, patch: Record<string, unknown>) => void
  >(() => {});
  const patchVarRef = useRef<
    (id: string, patch: Partial<VariableNode>) => void
  >(() => {});
  const loadTypeRef = useRef<(typeTag: string) => void>(() => {});

  /** Optional loader used by nodes (no-op here). */
  const onLoadTypeTag = useCallback((_typeTag: string) => {}, []);

  /** Inject callbacks into every RF node's data payload (via refs). */
  const withCallbacks = useCallback(
    (nodes: RFNode<RFNodeData>[]) =>
      nodes.map((n) => ({
        ...n,
        data: {
          ...(n.data || {}),
          onPatchUI: (id: string, patch: Record<string, unknown>) =>
            patchUIRef.current(id, patch),
          onPatchVar: (id: string, patch: Partial<VariableNode>) =>
            patchVarRef.current(id, patch),
          onLoadTypeTag: (typeTag: string) => loadTypeRef.current(typeTag),
        },
      })),
    [],
  );

  // ----- Node-level patchers (deferred to avoid setState in render) -----------

  /** Patch Command node UI params and keep ports consistent with UI. */
  const onPatchUI = useCallback(
    (nodeId: string, patch: Record<string, unknown>) => {
      deferSetState(() => {
        setRF((prev) => {
          const currentPTB = rfToPTB(
            prev.rfNodes,
            prev.rfEdges,
            baseGraphRef.current,
          );
          const node = currentPTB.nodes.find((n) => n.id === nodeId);
          if (!node || node.kind !== 'Command') return prev;

          const prevUI =
            ((node.params?.ui ?? {}) as Record<string, unknown>) || {};
          const nextUI: Record<string, unknown> = { ...prevUI };
          for (const k of Object.keys(patch)) {
            const v = (patch as any)[k];
            if (typeof v === 'undefined') delete nextUI[k];
            else nextUI[k] = v;
          }
          node.params = { ...(node.params ?? {}), ui: nextUI };
          node.ports = buildCommandPorts((node as any).command, nextUI as any);

          const { nodes: freshRFNodes, edges: freshRFEdges } =
            ptbToRF(currentPTB);
          const injected = withCallbacks(freshRFNodes);
          let pruned = pruneDanglingEdges(injected, freshRFEdges);
          pruned = pruneIncompatibleIOEdges(currentPTB.nodes, pruned);

          setFlowActive(hasStartToEnd(injected, pruned));
          return { rfNodes: injected, rfEdges: pruned };
        });
      });
    },
    [withCallbacks],
  );

  /** Patch a Variable node (value and/or varType). */
  const onPatchVar = useCallback(
    (nodeId: string, patch: Partial<VariableNode>) => {
      deferSetState(() => {
        setRF((prev) => {
          const currentPTB = rfToPTB(
            prev.rfNodes,
            prev.rfEdges,
            baseGraphRef.current,
          );
          const node = currentPTB.nodes.find((n) => n.id === nodeId);
          if (!node || node.kind !== 'Variable') return prev;

          const v = node as VariableNode;
          if ('value' in patch) (v as any).value = (patch as any).value;
          if ('varType' in patch && patch.varType !== undefined)
            v.varType = patch.varType;

          const { nodes: freshRFNodes, edges: freshRFEdges } =
            ptbToRF(currentPTB);
          const injected = withCallbacks(freshRFNodes);
          let pruned = pruneDanglingEdges(injected, freshRFEdges);
          pruned = pruneIncompatibleIOEdges(currentPTB.nodes, pruned);

          setFlowActive(hasStartToEnd(injected, pruned));
          return { rfNodes: injected, rfEdges: pruned };
        });
      });
    },
    [withCallbacks],
  );

  // Keep refs pointing to latest patchers/loaders
  useEffect(() => {
    patchUIRef.current = onPatchUI;
  }, [onPatchUI]);
  useEffect(() => {
    patchVarRef.current = onPatchVar;
  }, [onPatchVar]);
  useEffect(() => {
    loadTypeRef.current = onLoadTypeTag;
  }, [onLoadTypeTag]);

  // ----- RF state (authoritative while editing) -------------------------------

  const [{ rfNodes, rfEdges }, setRF] = useState<{
    rfNodes: RFNode<RFNodeData>[];
    rfEdges: RFEdge<RFEdgeData>[];
  }>(() => {
    const { nodes, edges } = ptbToRF(graph);
    const injected = withCallbacks(nodes);
    const pruned = pruneDanglingEdges(injected, edges);
    return { rfNodes: injected, rfEdges: pruned };
  });

  // ----- Rehydrate from provider on epoch bump --------------------------------

  useEffect(() => {
    if (graphEpoch === lastEpochRef.current) return;
    lastEpochRef.current = graphEpoch;

    rehydratingRef.current = true;
    const { nodes, edges } = ptbToRF(graph);
    const injected = withCallbacks(nodes);
    let pruned = pruneDanglingEdges(injected, edges);
    pruned = pruneIncompatibleIOEdges(graph.nodes, pruned);

    setRF({ rfNodes: injected, rfEdges: pruned });
    setFlowActive(hasStartToEnd(injected, pruned));
    baseGraphRef.current = graph;

    // Disable fit until layout finishes (prevents initial flicker).
    setLayoutReady(false);

    // Unmute next tick to let RF compute dimensions.
    requestAnimationFrame(() => {
      rehydratingRef.current = false;
    });
  }, [graphEpoch, graph, withCallbacks]);

  // ----- Safety net: re-prune edges whenever nodes change --------------------

  useEffect(() => {
    setRF((prev) => {
      let pruned = pruneDanglingEdges(rfNodes, prev.rfEdges);
      pruned = pruneIncompatibleIOEdges(baseGraphRef.current.nodes, pruned);
      if (edgesSig(pruned) === edgesSig(prev.rfEdges)) return prev; // no-op
      setFlowActive(hasStartToEnd(rfNodes, pruned));
      return { ...prev, rfEdges: pruned };
    });
  }, [rfNodes]);

  // ----- Persist RF → PTB after commit (single place) ------------------------

  const isDraggingRef = useRef(false);

  useEffect(() => {
    if (rehydratingRef.current) return;
    if (isDraggingRef.current) return;
    deferSetState(() => {
      const nextPTB = rfToPTB(rfNodes, rfEdges, baseGraphRef.current);
      setGraph(nextPTB);
      baseGraphRef.current = nextPTB;
    });
  }, [rfNodes, rfEdges, setGraph]);

  const onMoveEnd = useCallback(
    (_: any, vp: Viewport) => {
      setViewExternal(vp);
    },
    [setViewExternal],
  );

  // ----- Context menu ---------------------------------------------------------

  const [menu, setMenu] = useState<{
    open: boolean;
    type: 'canvas' | 'node' | 'edge';
    x: number;
    y: number;
    id?: string;
  }>({ open: false, type: 'canvas', x: 0, y: 0 });

  const openMenu = (
    e: React.MouseEvent | MouseEvent,
    type: 'canvas' | 'node' | 'edge',
    id?: string,
  ) => {
    e.preventDefault();
    if (readOnly) return; // no menu in read-only

    // Disallow menu for Start/End nodes.
    if (type === 'node' && id) {
      const rfNode = rfNodes.find((n) => n.id === id);
      const kind =
        getRFKind(rfNode) ??
        baseGraphRef.current.nodes.find((n) => n.id === id)?.kind;
      if (kind === 'Start' || kind === 'End') return;
    }

    const rect = containerRef.current?.getBoundingClientRect();
    const left = (e as MouseEvent).clientX - (rect?.left ?? 0);
    const top = (e as MouseEvent).clientY - (rect?.top ?? 0);

    setMenu({ open: true, type, x: left, y: top, id });
  };

  /** Helper: get RF node kind from node.data. */
  function getRFKind(n?: RFNode<RFNodeData>): PTBNode['kind'] | undefined {
    const data = (n as any)?.data;
    const kind = data?.ptbNode?.kind as PTBNode['kind'] | undefined;
    return kind;
  }

  // ----- Local RF mutations (add/delete) -------------------------------------

  const addNode = useCallback(
    (node: PTBNode) => {
      const rfNode = ptbNodeToRF(node);
      setRF((prev) => {
        const nodes = withCallbacks([...prev.rfNodes, rfNode]);
        const edges = pruneDanglingEdges(nodes, prev.rfEdges);
        return { rfNodes: nodes, rfEdges: edges };
      });
    },
    [withCallbacks],
  );

  const deleteNode = useCallback((id: string) => {
    const n = baseGraphRef.current.nodes.find((nn) => nn.id === id);
    if (n?.kind === 'Start' || n?.kind === 'End') return;
    setRF((prev) => {
      const nextNodes = prev.rfNodes.filter((n) => n.id !== id);
      const nextEdges = prev.rfEdges.filter(
        (e) => e.source !== id && e.target !== id,
      );
      setFlowActive(hasStartToEnd(nextNodes, nextEdges));
      return { rfNodes: nextNodes, rfEdges: nextEdges };
    });
  }, []);

  const deleteEdge = useCallback((id: string) => {
    setRF((prev) => {
      const nextEdges = prev.rfEdges.filter((e) => e.id !== id);
      setFlowActive(hasStartToEnd(prev.rfNodes, nextEdges));
      return { ...prev, rfEdges: nextEdges };
    });
  }, []);

  // ----- RF change handlers ---------------------------------------------------

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // During programmatic rehydrate, ignore RF's callbacks to avoid loop.
      if (rehydratingRef.current) return;

      // During dragging, defer updates until drag ends.
      const hasDragOn = changes.some(
        (c) => c.type === 'position' && (c as any).dragging === true,
      );
      const hasDragOff = changes.some(
        (c) => c.type === 'position' && (c as any).dragging === false,
      );

      if (hasDragOn) {
        isDraggingRef.current = true;
      }
      if (!hasDragOn && hasDragOff) {
        isDraggingRef.current = false;
      }

      const effective = readOnly
        ? changes.filter(
            (ch) =>
              ch.type === 'position' ||
              ch.type === 'select' ||
              ch.type === 'dimensions',
          )
        : changes;

      setRF((prev) => {
        // Prevent deleting Start/End via bulk remove.
        const filtered = effective.filter((ch) => {
          if (ch.type !== 'remove') return true;
          const id = (ch as any).id as string | undefined;
          if (!id) return true;
          return (
            getRFKind(prev.rfNodes.find((n) => n.id === id)) !== 'Start' &&
            getRFKind(prev.rfNodes.find((n) => n.id === id)) !== 'End'
          );
        });

        // Do NOT re-inject callbacks here; prev.rfNodes already have them.
        const nextNodes = applyNodeChanges(filtered, prev.rfNodes);
        let nextEdges = pruneDanglingEdges(nextNodes, prev.rfEdges);
        nextEdges = pruneIncompatibleIOEdges(
          baseGraphRef.current.nodes,
          nextEdges,
        );

        // Avoid redundant updates
        if (
          nextNodes === prev.rfNodes &&
          edgesSig(nextEdges) === edgesSig(prev.rfEdges)
        ) {
          return prev;
        }

        setFlowActive(hasStartToEnd(nextNodes, nextEdges));
        return { rfNodes: nextNodes, rfEdges: nextEdges };
      });
    },
    [readOnly],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      if (rehydratingRef.current) return;

      // In read-only, allow only selection changes.
      const effective = readOnly
        ? changes.filter((ch) => ch.type === 'select')
        : changes;

      setRF((prev) => {
        const nextEdges = applyEdgeChanges(effective, prev.rfEdges);
        const pruned = pruneDanglingEdges(prev.rfNodes, nextEdges);
        if (edgesSig(pruned) === edgesSig(prev.rfEdges)) return prev; // no-op
        setFlowActive(hasStartToEnd(prev.rfNodes, pruned));
        return { ...prev, rfEdges: pruned };
      });
    },
    [readOnly],
  );

  /** Connection rules (flow & IO). */
  const onConnect = useCallback(
    (conn: Connection) => {
      if (readOnly) return; // block new connections in read-only
      if (!conn.source || !conn.target) return;

      const findPort = (nodeId: string, handle?: string) => {
        const pid = parseHandleTypeSuffix(handle).baseId;
        const node = baseGraphRef.current.nodes.find((n) => n.id === nodeId);
        return node?.ports.find((p) => p.id === pid);
      };

      const sp = findPort(conn.source, conn.sourceHandle ?? undefined);
      const tp = findPort(conn.target, conn.targetHandle ?? undefined);
      if (!sp || !tp) return;

      setRF((prev) => {
        // FLOW EDGE
        if (sp.role === 'flow' || tp.role === 'flow') {
          if (!(sp.direction === 'out' && tp.direction === 'in')) return prev;

          const filtered = filterHandleConflictsForFlow(prev.rfEdges, conn);
          if (!filtered) return prev;
          if (conn.source === conn.target) return prev;
          if (createsLoop(filtered, conn.source!, conn.target!)) return prev;

          const newEdge: RFEdge<RFEdgeData> = {
            id: createUniqueId('edge'),
            type: 'ptb-flow',
            source: conn.source!,
            target: conn.target!,
            sourceHandle: conn.sourceHandle ?? undefined,
            targetHandle: conn.targetHandle ?? undefined,
          };

          const nextEdges = pruneDanglingEdges(prev.rfNodes, [
            ...filtered,
            newEdge,
          ]);
          if (edgesSig(nextEdges) === edgesSig(prev.rfEdges)) return prev;
          setFlowActive(hasStartToEnd(prev.rfNodes, nextEdges));
          return { ...prev, rfEdges: nextEdges };
        }

        // IO EDGE
        if (sp.role !== 'io' || tp.role !== 'io') return prev;
        if (!(sp.direction === 'out' && tp.direction === 'in')) return prev;
        if (isUnknownType(sp.dataType) || isUnknownType(tp.dataType))
          return prev;
        if (!isTypeCompatible(sp.dataType, tp.dataType)) return prev;

        const filtered = filterHandleConflictsForIO(prev.rfEdges, conn);
        if (!filtered) return prev;

        const cast = inferCastTarget(sp.dataType, tp.dataType) || undefined;

        const newEdge: RFEdge<RFEdgeData> = {
          id: createUniqueId('edge'),
          type: 'ptb-io',
          source: conn.source!,
          target: conn.target!,
          sourceHandle: conn.sourceHandle ?? undefined,
          targetHandle: conn.targetHandle ?? undefined,
          data: cast ? { cast } : undefined,
          label: cast ? `as ${cast.to}` : undefined,
        };

        const nextEdges = pruneDanglingEdges(prev.rfNodes, [
          ...filtered,
          newEdge,
        ]);
        if (edgesSig(nextEdges) === edgesSig(prev.rfEdges)) return prev;
        return { ...prev, rfEdges: nextEdges };
      });
    },
    [readOnly, createUniqueId],
  );

  // ----- Code preview generation ---------------------------------------------

  useEffect(() => {
    try {
      if (!chain) return;
      const ptb = rfToPTB(rfNodes, rfEdges, baseGraphRef.current);
      const src = buildTsSdkCode(ptb, chain, execOpts);
      setCode(src && src.trim().length > 0 ? src : EMPTY_CODE(chain));
    } catch {
      setCode(EMPTY_CODE(chain));
    }
  }, [rfNodes, rfEdges, chain, execOpts]);

  // ----- Execute --------------------------------------------------------------

  const [isRunning, setIsRunning] = useState(false);

  const onDryRun = useCallback(async () => {
    try {
      if (!chain) return;
      setIsRunning(true);
      const ptb = rfToPTB(rfNodes, rfEdges, baseGraphRef.current);
      const tx = buildTransaction(ptb, chain, execOpts);
      await dryRunTx?.(tx); // toast behavior is controlled in provider
    } catch (e: any) {
      toast?.({ message: e?.message || 'Unexpected error', variant: 'error' });
    } finally {
      setIsRunning(false);
    }
  }, [rfNodes, rfEdges, chain, execOpts, dryRunTx, toast]);

  const onExecute = useCallback(async () => {
    try {
      if (!chain) return;
      setIsRunning(true);
      const ptb = rfToPTB(rfNodes, rfEdges, baseGraphRef.current);
      const tx = buildTransaction(ptb, chain, execOpts);
      await runTx?.(tx); // runTx will show toasts (dry-run + execute)
    } catch (e: any) {
      toast?.({ message: e?.message || 'Unexpected error', variant: 'error' });
    } finally {
      setIsRunning(false);
    }
  }, [rfNodes, rfEdges, chain, execOpts, runTx, toast]);

  // ----- Auto Layout (positions-only merge) ----------------------------------
  const { fitView, screenToFlowPosition, setViewport, getViewport } =
    useReactFlow();
  const retryFlag = useRef(false);
  // eslint-disable-next-line no-restricted-syntax
  const containerRef = useRef<HTMLDivElement | null>(null);

  const getViewportCenterFlow = useCallback(() => {
    const el = containerRef.current;
    if (!el) return { x: 0, y: 0 };
    const w = el.clientWidth || 0;
    const h = el.clientHeight || 0;
    return screenToFlowPosition({ x: w / 2, y: h / 2 });
  }, [screenToFlowPosition]);

  const onAutoLayout = useCallback(async () => {
    // Guard 1: rehydrate in progress → defer
    if (rehydratingRef.current) {
      if (!retryFlag.current) {
        retryFlag.current = true;
        requestAnimationFrame(() => {
          retryFlag.current = false;
          onAutoLayout();
        });
      }
      return;
    }

    // Guard 2: nodes not ready yet → retry a few frames
    if (!rfNodes || rfNodes.length === 0) {
      let tries = 0;
      const retry = () => {
        if (!rehydratingRef.current && rfNodes.length > 0) {
          onAutoLayout();
          return;
        }
        if (tries++ < 3) requestAnimationFrame(retry);
      };
      requestAnimationFrame(retry);
      return;
    }

    const positions: LayoutPositions = await autoLayoutFlow(rfNodes, rfEdges, {
      targetCenter: getViewportCenterFlow(),
    });

    // Fallback: retry next frame if layout returned empty
    if (!positions || Object.keys(positions).length === 0) {
      requestAnimationFrame(async () => {
        const pos2: LayoutPositions = await autoLayoutFlow(rfNodes, rfEdges, {
          targetCenter: getViewportCenterFlow(),
        });
        if (!pos2 || Object.keys(pos2).length === 0) return; // give up silently
        setRF((prev) => {
          const nextNodes = prev.rfNodes.map((n) =>
            pos2[n.id]
              ? {
                  ...n,
                  position: pos2[n.id],
                  positionAbsolute: undefined,
                  dragging: false,
                }
              : n,
          );
          let nextEdges = pruneDanglingEdges(nextNodes, prev.rfEdges);
          nextEdges = pruneIncompatibleIOEdges(
            baseGraphRef.current.nodes,
            nextEdges,
          );
          setFlowActive(hasStartToEnd(nextNodes, nextEdges));
          return { rfNodes: nextNodes, rfEdges: nextEdges };
        });
        requestAnimationFrame(() => {
          try {
            fitView({ padding: 0.2, duration: 300 });
          } catch {
            /* no-op */
          }
          // Mark layout ready so ReactFlow can auto-fit on future mounts if needed.
          setLayoutReady(true);
        });
      });
      return;
    }

    setRF((prev) => {
      const nextNodes = prev.rfNodes.map((n) =>
        positions[n.id]
          ? {
              ...n,
              position: positions[n.id],
              positionAbsolute: undefined,
              dragging: false,
            }
          : n,
      );
      let nextEdges = pruneDanglingEdges(nextNodes, prev.rfEdges);
      nextEdges = pruneIncompatibleIOEdges(
        baseGraphRef.current.nodes,
        nextEdges,
      );
      setFlowActive(hasStartToEnd(nextNodes, nextEdges));
      return { rfNodes: nextNodes, rfEdges: nextEdges };
    });

    requestAnimationFrame(() => {
      try {
        fitView({ padding: 0.2, duration: 300 });
      } catch {
        /* no-op */
      }
      setLayoutReady(true);
    });
  }, [rfNodes, rfEdges, getViewportCenterFlow, fitView]);

  const fitToContent = useCallback(() => {
    onAutoLayout();
  }, [onAutoLayout]);

  const updateViewport = useCallback(
    (v?: { x: number; y: number; zoom: number }) => {
      if (v) {
        setViewport(v);
      } else {
        setViewExternal(getViewport());
      }
    },
    [getViewport, setViewExternal, setViewport],
  );

  useEffect(() => {
    registerFlowActions({ fitToContent, updateViewport });
  }, [registerFlowActions, fitToContent, updateViewport]);

  const onAssetPick = useCallback(
    (obj: { objectId: string; typeTag: string }) => {
      const center = getViewportCenterFlow();
      const placeAndAdd = (node: PTBNode) => {
        node.position = { x: center.x, y: center.y };
        addNode(node);
      };
      placeAndAdd(makeObject(obj.typeTag, { value: obj.objectId }));
    },
    [addNode, getViewportCenterFlow],
  );

  // ----- Render ---------------------------------------------------------------

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        background: 'var(--ptb-canvas-bg)',
      }}
      className={flowActive ? 'ptb-flow-active' : undefined}
    >
      <ReactFlow
        colorMode={toColorMode(theme)}
        nodes={rfNodes}
        edges={rfEdges}
        /** Enable auto fit only after positions are laid out */
        fitView={layoutReady}
        /** allow dragging even in read-only */
        nodesDraggable={true}
        /** block creating/updating edges when read-only */
        nodesConnectable={!readOnly}
        edgesReconnectable={!readOnly}
        deleteKeyCode={[]}
        onPaneContextMenu={(e) => openMenu(e, 'canvas')}
        onNodeContextMenu={(e, node) => openMenu(e, 'node', node.id)}
        onEdgeContextMenu={(e, edge) => openMenu(e, 'edge', edge.id)}
        nodeTypes={NodeTypes}
        edgeTypes={EdgeTypes}
        onConnect={onConnect}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onMoveEnd={onMoveEnd}
      >
        {/* Background grid layers */}
        <Background
          id="grid"
          key={`grid-${theme}`}
          gap={20}
          color={'var(--ptb-grid-fine)'}
          lineWidth={1}
          variant={BackgroundVariant.Lines}
        />
        <Background
          id="accents"
          key={`accents-${theme}`}
          gap={100}
          color={'var(--ptb-grid-accent)'}
          lineWidth={1.5}
          variant={BackgroundVariant.Lines}
          style={{ backgroundColor: 'transparent' }}
        />

        {showMiniMap && (
          <MiniMap
            className="ptb-minimap"
            maskColor="transparent"
            nodeColor={() => 'var(--ptb-minimap-node)'}
            nodeStrokeColor="var(--ptb-minimap-node-stroke)"
          />
        )}
        <Controls className="ptb-controls" />

        {/* Code preview lives inside */}
        <Panel
          /* turn the panel into a full-portal; we’ll place content with the anchor */
          position="top-left"
          className="ptb-codepip-portal"
          style={{ pointerEvents: 'none' }}
        >
          {/* Corner anchor → gutter (margin) → actual content */}
          <div className="ptb-codepip-anchor">
            <div className="ptb-codepip-gutter">
              <div className="ptb-codepip-wrap">
                <CodePip
                  key={`codepip-${readOnly ? 'ro' : 'rw'}-${codePipOpenTick}`}
                  defaultCollapsed={readOnly || codePipOpenTick === 0}
                  code={code}
                  language="typescript"
                  title="ts-sdk preview"
                  emptyText={EMPTY_CODE(chain)}
                  canRunning={!!chain && !readOnly && flowActive}
                  isRunning={isRunning}
                  onDryRun={onDryRun}
                  onExecute={onExecute}
                  onAssetPick={onAssetPick}
                  showMiniMap={showMiniMap}
                  onToggleMiniMap={setShowMiniMap}
                />
              </div>
            </div>
          </div>
        </Panel>

        <Panel position="top-left" style={{ pointerEvents: 'none' }}>
          {loadTxStatus && (
            <div style={{ pointerEvents: 'auto' }}>
              <StatusBar
                status={loadTxStatus.status}
                error={loadTxStatus.error}
              />
            </div>
          )}
        </Panel>
      </ReactFlow>

      {/* Context menu */}
      {menu.open && (
        <ContextMenu
          type={menu.type}
          position={{ top: menu.y, left: menu.x }}
          targetId={menu.id}
          onAddNode={addNode}
          onDeleteNode={deleteNode}
          onDeleteEdge={deleteEdge}
          onAutoLayout={onAutoLayout}
          onClose={() => setMenu((s) => ({ ...s, open: false }))}
        />
      )}
    </div>
  );
}

export default PTBFlow;
