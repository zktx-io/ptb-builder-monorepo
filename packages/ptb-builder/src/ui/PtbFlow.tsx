// src/ui/PTBFlow.tsx
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
  Panel, // in-canvas overlay container
  ReactFlow,
  type Edge as RFEdge,
  type Node as RFNode,
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
} from '../adapters/ptbAdapter';
import { baseHandleId } from './handles/handleUtils';
import { hasStartToEnd } from './utils/flowPath';
import { generateTsSdkCode } from '../codegen/generateTsSdk';
import {
  inferCastTarget,
  isTypeCompatible,
  isUnknownType,
} from '../ptb/graph/typecheck';
import type { Port, PTBNode, PTBType, VariableNode } from '../ptb/graph/types';
import { materializeCommandPorts } from './nodes/cmds/registry';

const DEBOUNCE_MS = 250;

/** Normalize RF handle -> PTB port id (drop optional ":type" suffix). */
const portIdOf = (h?: string | null) => baseHandleId(h);

/** DFS loop check for flow edges. */
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

/** Enforce 1:1 flow per handle (source/target). */
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

/** IO target is single; allow source fan-out. */
function filterHandleConflictsForIO(edges: RFEdge[], conn: Connection) {
  const tgt = conn.target!;
  const tHandle = conn.targetHandle ?? undefined;
  if (!tHandle) return undefined;
  return edges.filter(
    (e) =>
      !(e.type === 'ptb-io' && e.target === tgt && e.targetHandle === tHandle),
  );
}

/** nodeId -> set(basePortId) index. */
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
    const sId = portIdOf(e.sourceHandle);
    const tId = portIdOf(e.targetHandle);
    return Boolean(sId && tId && srcSet.has(sId) && tgtSet.has(tId));
  });
}

/** Resolve PTB type for an RF endpoint. */
function resolvePortType(
  ptbNodes: PTBNode[],
  nodeId: string,
  handle?: string | null,
): PTBType | undefined {
  const pid = portIdOf(handle);
  if (!pid) return undefined;
  const n = ptbNodes.find((x) => x.id === nodeId);
  if (!n) return undefined;
  const p = (n.ports || []).find((pp) => pp.id === pid);
  return p?.dataType;
}

/** Drop IO edges that became type-incompatible. */
function pruneIncompatibleIOEdges(
  ptbNodes: PTBNode[],
  edges: RFEdge<RFEdgeData>[],
): RFEdge<RFEdgeData>[] {
  return edges.filter((e) => {
    if (e.type !== 'ptb-io') return true;
    const sT = resolvePortType(ptbNodes, e.source, e.sourceHandle);
    const tT = resolvePortType(ptbNodes, e.target, e.targetHandle);
    if (!sT || !tT) return false;
    if (isUnknownType(sT) || isUnknownType(tT)) return false;
    return isTypeCompatible(sT, tT);
  });
}

export function PTBFlow() {
  const { snapshot, saveSnapshot, readOnly, theme, setTheme, network } =
    usePtb();

  /** Generated source (updated on connect / node change). */
  const [code, setCode] = useState<string>(EMPTY_CODE(network));

  /** Global flow animation flag: true iff Start → End path exists. */
  const [flowActive, setFlowActive] = useState(false);

  /** Inject UI patcher into Command nodes and keep ports consistent with UI. */
  const onPatchUI = useCallback(
    (nodeId: string, patch: Record<string, unknown>) => {
      setRF((prev) => {
        // 1) Rebuild PTB from RF.
        const currentPTB = rfToPTB(
          prev.rfNodes,
          prev.rfEdges,
          baseGraphRef.current,
        );

        // 2) Merge UI patch and normalize counts for expanded groups.
        const node = currentPTB.nodes.find((n) => n.id === nodeId);
        if (!node || node.kind !== 'Command') return prev;

        const ui = ((node.params?.ui ?? {}) as Record<string, unknown>) || {};
        const nextUI = { ...ui, ...patch };

        if ('amountsExpanded' in patch) {
          if (patch.amountsExpanded) {
            if (typeof (node.params as any)?.ui?.amountsCount !== 'number') {
              (nextUI as any).amountsCount = 2;
            }
          } else delete (nextUI as any).amountsCount;
        }
        if ('sourcesExpanded' in patch) {
          if (patch.sourcesExpanded) {
            if (typeof (node.params as any)?.ui?.sourcesCount !== 'number') {
              (nextUI as any).sourcesCount = 2;
            }
          } else delete (nextUI as any).sourcesCount;
        }
        if ('objectsExpanded' in patch) {
          if (patch.objectsExpanded) {
            if (typeof (node.params as any)?.ui?.objectsCount !== 'number') {
              (nextUI as any).objectsCount = 2;
            }
          } else delete (nextUI as any).objectsCount;
        }
        if ('elemsExpanded' in patch) {
          if (patch.elemsExpanded) {
            if (typeof (node.params as any)?.ui?.elemsCount !== 'number') {
              (nextUI as any).elemsCount = 2;
            }
          } else delete (nextUI as any).elemsCount;
        }

        node.params = { ...(node.params ?? {}), ui: nextUI };

        // 3) Re-materialize ports and prune edges.
        node.ports = materializeCommandPorts(node as any);
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

  /** Optional type loader for object.typeTag — no-op stub. */
  const onLoadTypeTag = useCallback((_typeTag: string) => {}, []);

  /** Inject callbacks into RF node data. */
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

  /** RF state is the canvas source of truth. */
  const [{ rfNodes, rfEdges }, setRF] = useState<{
    rfNodes: RFNode<RFNodeData>[];
    rfEdges: RFEdge<RFEdgeData>[];
  }>(() => {
    const { nodes, edges } = ptbToRF(snapshot);
    const injected = withCallbacks(nodes, onPatchUI, onPatchVar, onLoadTypeTag);
    const pruned = pruneDanglingEdges(injected, edges);
    return { rfNodes: injected, rfEdges: pruned };
  });

  /** Keep last PTB snapshot to avoid spurious resync. */
  const baseGraphRef = useRef(snapshot);

  /** Resync RF only when snapshot identity changes (e.g., open another file). */
  useEffect(() => {
    if (snapshot === baseGraphRef.current) return;
    const { nodes, edges } = ptbToRF(snapshot);
    const injected = withCallbacks(nodes, onPatchUI, onPatchVar, onLoadTypeTag);
    let pruned = pruneDanglingEdges(injected, edges);
    pruned = pruneIncompatibleIOEdges(snapshot.nodes, pruned);
    setRF({ rfNodes: injected, rfEdges: pruned });
    setFlowActive(hasStartToEnd(injected, pruned));
    baseGraphRef.current = snapshot;
  }, [snapshot, onPatchUI, onPatchVar, onLoadTypeTag, withCallbacks]);

  /** Safety net: whenever rfNodes change, re-prune edges. */
  useEffect(() => {
    setRF((prev) => {
      let pruned = pruneDanglingEdges(rfNodes, prev.rfEdges);
      pruned = pruneIncompatibleIOEdges(baseGraphRef.current.nodes, pruned);
      if (pruned.length === prev.rfEdges.length) return prev;
      setFlowActive(hasStartToEnd(rfNodes, pruned));
      return { ...prev, rfEdges: pruned };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rfNodes]);

  /** Context menu UI state. */
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
    if (readOnly) return;

    // Block menu for Start/End nodes
    if (type === 'node' && id) {
      const rfNode = rfNodes.find((n) => n.id === id);
      const kind =
        getRFKind(rfNode) ?? snapshot.nodes.find((n) => n.id === id)?.kind;
      if (kind === 'Start' || kind === 'End') return;
    }

    setMenu({ open: true, type, x: e.clientX, y: e.clientY, id });
  };

  /** Recompute flow-active flag from RF state. */
  const recomputeFlowActive = useCallback(
    (nodes: RFNode[], edges: RFEdge[]) => {
      setFlowActive(hasStartToEnd(nodes, edges));
    },
    [],
  );

  /** Helper: get RF node kind. */
  function getRFKind(n?: RFNode<RFNodeData>): PTBNode['kind'] | undefined {
    const data = (n as any)?.data;
    const kind = data?.ptbNode?.kind as PTBNode['kind'] | undefined;
    return kind;
  }

  /** Local RF mutations (add/delete). */
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

  const deleteNode = useCallback(
    (id: string) => {
      const n = snapshot.nodes.find((nn) => nn.id === id);
      if (n?.kind === 'Start' || n?.kind === 'End') return;
      setRF((prev) => {
        const nextNodes = prev.rfNodes.filter((n) => n.id !== id);
        const nextEdges = prev.rfEdges.filter(
          (e) => e.source !== id && e.target !== id,
        );
        setFlowActive(hasStartToEnd(nextNodes, nextEdges));
        return { rfNodes: nextNodes, rfEdges: nextEdges };
      });
    },
    [snapshot.nodes],
  );

  const deleteEdge = useCallback((id: string) => {
    setRF((prev) => {
      const nextEdges = prev.rfEdges.filter((e) => e.id !== id);
      setFlowActive(hasStartToEnd(prev.rfNodes, nextEdges));
      return { ...prev, rfEdges: nextEdges };
    });
  }, []);

  /** RF change handlers. */
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setRF((prev) => {
        // Prevent deleting Start/End via bulk/remove
        const filtered = changes.filter((ch) => {
          if (ch.type !== 'remove') return true;
          const id = (ch as any).id as string | undefined;
          if (!id) return true;
          return (
            getRFKind(prev.rfNodes.find((n) => n.id === id)) !== 'Start' &&
            getRFKind(prev.rfNodes.find((n) => n.id === id)) !== 'End'
          );
        });

        const nextNodesRaw = applyNodeChanges(filtered, prev.rfNodes);
        const nextNodes = withCallbacks(
          nextNodesRaw,
          onPatchUI,
          onPatchVar,
          onLoadTypeTag,
        );
        let nextEdges = pruneDanglingEdges(nextNodes, prev.rfEdges);
        nextEdges = pruneIncompatibleIOEdges(
          baseGraphRef.current.nodes,
          nextEdges,
        );
        recomputeFlowActive(nextNodes, nextEdges);
        return { rfNodes: nextNodes, rfEdges: nextEdges };
      });
    },
    [recomputeFlowActive, onPatchUI, onPatchVar, onLoadTypeTag, withCallbacks],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setRF((prev) => {
        const nextEdges = applyEdgeChanges(changes, prev.rfEdges);
        const pruned = pruneDanglingEdges(prev.rfNodes, nextEdges);
        recomputeFlowActive(prev.rfNodes, pruned);
        return { ...prev, rfEdges: pruned };
      });
    },
    [recomputeFlowActive],
  );

  /** Connection rules (flow & IO). */
  const onConnect = useCallback(
    (conn: Connection) => {
      if (!conn.source || !conn.target) return;

      // Lookup PTB ports
      const findPort = (nodeId: string, handle?: string | null) => {
        const pid = portIdOf(handle);
        const node = snapshot.nodes.find((n) => n.id === nodeId);
        return node?.ports.find((p) => p.id === pid);
      };

      const sp = findPort(conn.source, conn.sourceHandle);
      const tp = findPort(conn.target, conn.targetHandle);
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
            id: `e-${Date.now()}`,
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
          id: `e-${Date.now()}`,
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
        return { ...prev, rfEdges: nextEdges };
      });
    },
    [snapshot.nodes],
  );

  /** Debounced persist: RF → PTB snapshot. */
  const saveTimerRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = undefined;
    }
    saveTimerRef.current = window.setTimeout(() => {
      const next = rfToPTB(rfNodes, rfEdges, baseGraphRef.current);
      saveSnapshot(next);
      baseGraphRef.current = next;
      saveTimerRef.current = undefined;
    }, DEBOUNCE_MS);

    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = undefined;
      }
    };
  }, [rfNodes, rfEdges, saveSnapshot]);

  /** Recompute code whenever RF or network changes. */
  useEffect(() => {
    try {
      const ptb = rfToPTB(rfNodes, rfEdges, baseGraphRef.current);
      const src = generateTsSdkCode(ptb, network);
      setCode(src && src.trim().length > 0 ? src : EMPTY_CODE(network));
    } catch {
      setCode(EMPTY_CODE(network));
    }
  }, [rfNodes, rfEdges, network]);

  /** Theme-dependent grid colors. */
  const { fineColor, accentColor } = useMemo(
    () => ({
      fineColor: theme === 'dark' ? '#2d333b' : '#e9e9e9',
      accentColor: theme === 'dark' ? '#3d444d' : '#cfcfcf',
    }),
    [theme],
  );

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
        deleteKeyCode={[]}
        nodesDraggable={!readOnly}
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
          lineWidth={1.25}
          variant={BackgroundVariant.Lines}
          style={{ backgroundColor: 'transparent' }}
        />

        <MiniMap />
        <Controls className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />

        {/* CodePip lives INSIDE ReactFlow via Panel, so grid/handles render correctly */}
        <Panel position="top-right" style={{ pointerEvents: 'none' }}>
          <div style={{ pointerEvents: 'auto' }}>
            <CodePip
              code={code}
              language="typescript"
              title="ts-sdk preview"
              theme={theme}
              onThemeChange={setTheme}
              // defaultCollapsed={false} // optional
              emptyText={EMPTY_CODE(network)}
              // onExecute={...}          // hook later when tx build+run is ready
              // executing={...}
              // canExecute={...}
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
          onClose={() => setMenu((s) => ({ ...s, open: false }))}
        />
      )}
    </div>
  );
}

export default PTBFlow;
