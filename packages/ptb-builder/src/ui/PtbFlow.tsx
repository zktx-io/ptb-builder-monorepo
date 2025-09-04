// src/ui/PtbFlow.tsx
// -----------------------------------------------------------------------------
// RF is the *source of truth* while the editor is open.
// We inject PTB → RF only when provider.graphEpoch changes.
// Programmatic rehydrate is muted from onChange handlers to avoid feedback.
// We also avoid redundant setRF by comparing edge signatures.
// -----------------------------------------------------------------------------

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

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
import type { Connection, EdgeChange, NodeChange } from '@xyflow/react';

import '@xyflow/react/dist/style.css';
import './style.css';

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
import { autoLayoutFlow } from './utils/autoLayout';
import { hasStartToEnd } from './utils/flowPath';
import { buildTransactionBlock } from '../codegen/buildTransactionBlock';
import { generateTsSdkCode } from '../codegen/generateTsSdkCode';
import { setIdGenerator } from '../ptb/factories';
import {
  inferCastTarget,
  isTypeCompatible,
  isUnknownType,
} from '../ptb/graph/typecheck';
import type { Port, PTBNode, PTBType, VariableNode } from '../ptb/graph/types';
import { buildCommandPorts } from '../ptb/registry';

const DEBOUNCE_MS = 250;

/**
 * Extracts the base portId (before ":" type suffix) from a handle string.
 * Example: "in_arg_0:number" -> "in_arg_0"
 */
function portIdOf(handle?: string): string | undefined {
  if (!handle) return undefined;
  return handle.split(':')[0];
}

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
    const sId = portIdOf(e.sourceHandle ?? undefined);
    const tId = portIdOf(e.targetHandle ?? undefined);
    return Boolean(sId && tId && srcSet.has(sId) && tgtSet.has(tId));
  });
}

/** Resolve PTB type for an RF endpoint (needed to validate IO edges). */
function resolvePortType(
  ptbNodes: PTBNode[],
  nodeId: string,
  handle?: string,
): PTBType | undefined {
  const pid = portIdOf(handle);
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

export function PTBFlow() {
  const {
    graph,
    setGraph,
    readOnly,
    theme,
    setTheme,
    chain,
    execOpts,
    runTx,
    createUniqueId,
    registerFlowActions,
    graphEpoch, // ← only rehydrate when this changes
  } = usePtb();

  // Keep factories aligned with the provider's monotonic ID policy
  useEffect(() => {
    setIdGenerator(createUniqueId);
  }, [createUniqueId]);

  /** Generated source (updated on connect / node change). */
  const [code, setCode] = useState<string>(EMPTY_CODE(chain));

  /** Flow animation flag: true iff a Start → End path exists. */
  const [flowActive, setFlowActive] = useState(false);

  // ----- Node-level patchers injected into RF nodes --------------------------

  /** Patch Command node UI params and keep ports consistent with UI. */
  const onPatchUI = useCallback(
    (nodeId: string, patch: Record<string, unknown>) => {
      setRF((prev) => {
        // 1) Build a fresh PTB snapshot from current RF
        const currentPTB = rfToPTB(
          prev.rfNodes,
          prev.rfEdges,
          baseGraphRef.current,
        );

        // 2) Locate the target Command node
        const node = currentPTB.nodes.find((n) => n.id === nodeId);
        if (!node || node.kind !== 'Command') return prev;

        // 3) Shallow-merge UI (delete keys when value is `undefined`)
        const prevUI =
          ((node.params?.ui ?? {}) as Record<string, unknown>) || {};
        const nextUI: Record<string, unknown> = { ...prevUI };
        for (const k of Object.keys(patch)) {
          const v = (patch as any)[k];
          if (typeof v === 'undefined') delete nextUI[k];
          else nextUI[k] = v;
        }
        node.params = { ...(node.params ?? {}), ui: nextUI };

        // 4) Re-materialize ports based on the updated UI
        node.ports = buildCommandPorts((node as any).command, nextUI as any);

        // 5) Convert back to RF, inject callbacks, and prune invalid edges
        const { nodes: freshRFNodes, edges: freshRFEdges } =
          ptbToRF(currentPTB);
        const injected = withCallbacks(
          freshRFNodes,
          onPatchUI,
          onPatchVar,
          onLoadTypeTag,
        );
        let pruned = pruneDanglingEdges(injected, freshRFEdges);
        pruned = pruneIncompatibleIOEdges(currentPTB.nodes, pruned);

        // 6) Update flow-active flag and commit state
        setFlowActive(hasStartToEnd(injected, pruned));
        return { rfNodes: injected, rfEdges: pruned };
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  /** Patch a Variable node (value and/or varType). */
  const onPatchVar = useCallback(
    (nodeId: string, patch: Partial<VariableNode>) => {
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
        if ('varType' in patch && patch.varType !== undefined) {
          v.varType = patch.varType;
        }

        const { nodes: freshRFNodes, edges: freshRFEdges } =
          ptbToRF(currentPTB);
        const injected = withCallbacks(
          freshRFNodes,
          onPatchUI,
          onPatchVar,
          onLoadTypeTag,
        );
        let pruned = pruneDanglingEdges(injected, freshRFEdges);
        pruned = pruneIncompatibleIOEdges(currentPTB.nodes, pruned);

        setFlowActive(hasStartToEnd(injected, pruned));
        return { rfNodes: injected, rfEdges: pruned };
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  /** Optional type loader for object.typeTag — kept as a no-op here. */
  const onLoadTypeTag = useCallback((_typeTag: string) => {}, []);

  /** Inject callbacks into every RF node's data payload. */
  const withCallbacks = useCallback(
    (
      nodes: RFNode<RFNodeData>[],
      patchUI: typeof onPatchUI,
      patchVar: typeof onPatchVar,
      loadType: (typeTag: string) => void,
    ) =>
      nodes.map((n) => ({
        ...n,
        data: {
          ...(n.data || {}),
          onPatchUI: patchUI,
          onPatchVar: patchVar,
          onLoadTypeTag: loadType,
        },
      })),
    [],
  );

  // ----- RF state (authoritative while editing) -------------------------------

  const [{ rfNodes, rfEdges }, setRF] = useState<{
    rfNodes: RFNode<RFNodeData>[];
    rfEdges: RFEdge<RFEdgeData>[];
  }>(() => {
    const { nodes, edges } = ptbToRF(graph);
    const injected = withCallbacks(nodes, onPatchUI, onPatchVar, onLoadTypeTag);
    const pruned = pruneDanglingEdges(injected, edges);
    return { rfNodes: injected, rfEdges: pruned };
  });

  /** Keep the last *persisted* PTB snapshot to help RF → PTB diffs. */
  const baseGraphRef = useRef(graph);

  /** Mute onChange handlers while rehydrating from provider. */
  const rehydratingRef = useRef(false);

  /** Rehydrate RF only when the persisted PTB identity (epoch) changes. */
  const lastEpochRef = useRef<number>(-1);
  useEffect(() => {
    if (graphEpoch === lastEpochRef.current) return;
    lastEpochRef.current = graphEpoch;

    rehydratingRef.current = true;
    const { nodes, edges } = ptbToRF(graph);
    const injected = withCallbacks(nodes, onPatchUI, onPatchVar, onLoadTypeTag);
    let pruned = pruneDanglingEdges(injected, edges);
    pruned = pruneIncompatibleIOEdges(graph.nodes, pruned);

    setRF({ rfNodes: injected, rfEdges: pruned });
    setFlowActive(hasStartToEnd(injected, pruned));
    baseGraphRef.current = graph;

    // Unmute next tick to let RF compute dimensions
    requestAnimationFrame(() => {
      rehydratingRef.current = false;
    });
  }, [graphEpoch, graph, onPatchUI, onPatchVar, onLoadTypeTag, withCallbacks]);

  /** Safety net: whenever rfNodes change, re-prune edges (ports may change). */
  useEffect(() => {
    setRF((prev) => {
      let pruned = pruneDanglingEdges(rfNodes, prev.rfEdges);
      pruned = pruneIncompatibleIOEdges(baseGraphRef.current.nodes, pruned);
      if (edgesSig(pruned) === edgesSig(prev.rfEdges)) return prev; // no-op
      setFlowActive(hasStartToEnd(rfNodes, pruned));
      return { ...prev, rfEdges: pruned };
    });
  }, [rfNodes]);

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

    setMenu({ open: true, type, x: e.clientX, y: e.clientY, id });
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
        const nodes = withCallbacks(
          [...prev.rfNodes, rfNode],
          onPatchUI,
          onPatchVar,
          onLoadTypeTag,
        );
        const edges = pruneDanglingEdges(nodes, prev.rfEdges);
        return { rfNodes: nodes, rfEdges: edges };
      });
    },
    [onPatchUI, onPatchVar, onLoadTypeTag, withCallbacks],
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

  const recomputeFlowActive = useCallback(
    (nodes: RFNode[], edges: RFEdge[]) => {
      setFlowActive(hasStartToEnd(nodes, edges));
    },
    [],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // During programmatic rehydrate, ignore RF's callbacks to avoid loop.
      if (rehydratingRef.current) return;

      // In read-only, allow only position/selection/dimensions updates.
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

        recomputeFlowActive(nextNodes, nextEdges);
        return { rfNodes: nextNodes, rfEdges: nextEdges };
      });
    },
    [readOnly, recomputeFlowActive],
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
        recomputeFlowActive(prev.rfNodes, pruned);
        return { ...prev, rfEdges: pruned };
      });
    },
    [readOnly, recomputeFlowActive],
  );

  /** Connection rules (flow & IO). */
  const onConnect = useCallback(
    (conn: Connection) => {
      if (readOnly) return; // block new connections in read-only
      if (!conn.source || !conn.target) return;

      const findPort = (nodeId: string, handle?: string) => {
        const pid = portIdOf(handle);
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

  // ----- Debounced persist: RF → PTB -----------------------------------------

  useEffect(() => {
    let t = window.setTimeout(() => {
      const next = rfToPTB(rfNodes, rfEdges, baseGraphRef.current);
      setGraph(next); // persist snapshot
      baseGraphRef.current = next; // advance baseline (prevents false rehydrate)
      t = undefined as any;
    }, DEBOUNCE_MS);

    return () => {
      if (t) window.clearTimeout(t);
    };
  }, [rfNodes, rfEdges, setGraph]);

  // ----- Code preview generation ---------------------------------------------

  useEffect(() => {
    try {
      const ptb = rfToPTB(rfNodes, rfEdges, baseGraphRef.current);
      const src = generateTsSdkCode(ptb, chain, execOpts);
      setCode(src && src.trim().length > 0 ? src : EMPTY_CODE(chain));
    } catch {
      setCode(EMPTY_CODE(chain));
    }
  }, [rfNodes, rfEdges, chain, execOpts]);

  // ----- Theme-dependent grid colors -----------------------------------------

  const { fineColor, accentColor } = useMemo(
    () => ({
      fineColor: theme === 'dark' ? '#2d333b' : '#e9e9e9',
      accentColor: theme === 'dark' ? '#3d444d' : '#cfcfcf',
    }),
    [theme],
  );

  // ----- Execute --------------------------------------------------------------

  const [executing, setExecuting] = useState(false);

  const onExecute = useCallback(async () => {
    try {
      setExecuting(true);
      const ptb = rfToPTB(rfNodes, rfEdges, baseGraphRef.current);
      const tx = buildTransactionBlock(ptb, chain, execOpts);
      await runTx?.(tx); // runTx will show toasts (dry-run + execute)
    } finally {
      setExecuting(false);
    }
  }, [rfNodes, rfEdges, chain, execOpts, runTx]);

  // ----- Auto Layout ----------------------------------------------------------
  const { fitView } = useReactFlow();

  const onAutoLayout = useCallback(async () => {
    const { nodes, edges } = await autoLayoutFlow(rfNodes, rfEdges);
    setRF({ rfNodes: nodes, rfEdges: edges });
    requestAnimationFrame(() => {
      try {
        fitView({ padding: 0.2, duration: 300 });
      } catch {
        /* no-op */
      }
    });
  }, [rfNodes, rfEdges, setRF, fitView]);

  useEffect(() => {
    registerFlowActions({ autoLayoutAndFit: onAutoLayout });
  }, [registerFlowActions, onAutoLayout]);

  // ----- Render ---------------------------------------------------------------

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        background: theme === 'dark' ? '#0b0e12' : '#ffffff',
      }}
      className={flowActive ? 'ptb-flow-active' : undefined}
    >
      <ReactFlow
        colorMode={theme}
        nodes={rfNodes}
        edges={rfEdges}
        fitView
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
      >
        {/* Background grid layers */}
        <Background
          id="grid"
          key={`grid-${theme}`}
          gap={20}
          color={fineColor}
          lineWidth={1}
          variant={BackgroundVariant.Lines}
        />
        <Background
          id="accents"
          key={`accents-${theme}`}
          gap={100}
          color={accentColor}
          lineWidth={1.5}
          variant={BackgroundVariant.Lines}
          style={{ backgroundColor: 'transparent' }}
        />

        <MiniMap />
        <Controls className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />

        {/* Code preview lives inside */}
        <Panel position="top-right" style={{ pointerEvents: 'none' }}>
          <div style={{ pointerEvents: 'auto' }}>
            <CodePip
              /* Re-mount when switching viewer/editor so defaultCollapsed is reapplied */
              key={`codepip-${readOnly ? 'ro' : 'rw'}`}
              /* Close the code pane in viewer mode (on-chain load sets readOnly=true) */
              defaultCollapsed={readOnly}
              code={code}
              language="typescript"
              title="ts-sdk preview"
              theme={theme}
              onThemeChange={setTheme}
              emptyText={EMPTY_CODE(chain)}
              onExecute={onExecute}
              executing={executing}
              /** require editor mode + valid flow */
              canExecute={!readOnly && flowActive}
            />
          </div>
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
