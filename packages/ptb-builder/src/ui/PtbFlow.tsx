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
  ReactFlow,
  type Edge as RFEdge,
  type Node as RFNode,
} from '@xyflow/react';
import type { Connection, EdgeChange, NodeChange } from '@xyflow/react';

import '@xyflow/react/dist/style.css';
import './style.css';

import { EdgeTypes } from './edges';
import { ContextMenu } from './menu/ContextMenu';
import { NodeTypes } from './nodes';
import { usePtb } from './PtbProvider';
import {
  ptbNodeToRF,
  ptbToRF,
  type RFNodeData,
  rfToPTB,
} from '../adapters/ptbAdapter';
import { hasStartToEnd } from './utils/flowPath';
import {
  inferCastTarget,
  isTypeCompatible,
  isUnknownType,
} from '../ptb/graph/typecheck';
import type { PTBNode } from '../ptb/graph/types';

const DEBOUNCE_MS = 250;

/** Normalize RF handle -> PTB port id (drop optional ":type" suffix). */
const portIdOf = (h?: string | null) => String(h ?? '').split(':')[0];

/** DFS to detect whether adding (source -> target) would create a cycle. */
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

/** Remove any ptb-flow edges that use the same source/target handle (flow is 1:1 per handle). */
function filterHandleConflictsForFlow(edges: RFEdge[], conn: Connection) {
  const src = conn.source!;
  const tgt = conn.target!;
  const sHandle = conn.sourceHandle ?? undefined;
  const tHandle = conn.targetHandle ?? undefined;
  if (!sHandle || !tHandle) return undefined; // must bind to concrete handles

  return edges.filter(
    (e) =>
      !(
        e.type === 'ptb-flow' &&
        ((e.source === src && e.sourceHandle === sHandle) ||
          (e.target === tgt && e.targetHandle === tHandle))
      ),
  );
}

/** Ensure IO target handle is single (1 edge), but allow source fan-out (1 -> N). */
function filterHandleConflictsForIO(edges: RFEdge[], conn: Connection) {
  const tgt = conn.target!;
  const tHandle = conn.targetHandle ?? undefined;
  if (!tHandle) return undefined; // IO target must be an actual handle

  // Replace any existing IO edge that already uses this exact target handle.
  return edges.filter(
    (e) =>
      !(e.type === 'ptb-io' && e.target === tgt && e.targetHandle === tHandle),
  );
}

export function PTBFlow() {
  const { snapshot, saveSnapshot, readOnly, theme, setTheme } = usePtb();

  /** Global flow animation flag: true iff there exists a Start → End path. */
  const [flowActive, setFlowActive] = useState(false);

  /** RF state is the canvas source of truth. */
  const [{ rfNodes, rfEdges }, setRF] = useState<{
    rfNodes: RFNode<RFNodeData>[];
    rfEdges: RFEdge[];
  }>(() => {
    const { nodes, edges } = ptbToRF(snapshot);
    return { rfNodes: nodes, rfEdges: edges };
  });

  /** Keep last PTB snapshot to avoid spurious resync. */
  const baseGraphRef = useRef(snapshot);

  /** Resync RF only when snapshot identity changes (e.g., open another file). */
  useEffect(() => {
    if (snapshot === baseGraphRef.current) return;
    const { nodes, edges } = ptbToRF(snapshot);
    setRF({ rfNodes: nodes, rfEdges: edges });
    setFlowActive(hasStartToEnd(nodes, edges));
    baseGraphRef.current = snapshot;
  }, [snapshot]);

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
      if (kind === 'Start' || kind === 'End') return; // do not open
    }

    setMenu({ open: true, type, x: e.clientX, y: e.clientY, id });
  };

  /** Recompute the global flow-active flag from RF state. */
  const recomputeFlowActive = useCallback(
    (nodes: RFNode[], edges: RFEdge[]) => {
      setFlowActive(hasStartToEnd(nodes, edges));
    },
    [],
  );

  /** Helper: is the given RF node (by id) protected (Start/End)? */
  function getRFKind(n?: RFNode<RFNodeData>): PTBNode['kind'] | undefined {
    // data is often unknown in RF types; narrow via any
    const data = (n as any)?.data;
    const kind = data?.ptbNode?.kind as PTBNode['kind'] | undefined;
    return kind;
  }

  const isProtectedNode = useCallback(
    (id: string, rfList: RFNode<RFNodeData>[]) => {
      const rf = rfList.find((n) => n.id === id);
      const kind = getRFKind(rf);
      return kind === 'Start' || kind === 'End';
    },
    [],
  );

  /** Local RF mutations (add/delete). */
  const addNode = useCallback((node: PTBNode) => {
    const rfNode = ptbNodeToRF(node);
    setRF((prev) => ({ ...prev, rfNodes: [...prev.rfNodes, rfNode] }));
  }, []);

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
        // Drop remove changes for Start/End (keyboard Delete, bulk)
        const filtered = changes.filter((ch) => {
          if (ch.type !== 'remove') return true;
          const id = (ch as any).id as string | undefined;
          if (!id) return true;
          return !isProtectedNode(id, prev.rfNodes);
        });
        return { ...prev, rfNodes: applyNodeChanges(filtered, prev.rfNodes) };
      });
    },
    [isProtectedNode],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setRF((prev) => {
        const nextEdges = applyEdgeChanges(changes, prev.rfEdges);
        recomputeFlowActive(prev.rfNodes, nextEdges);
        return { ...prev, rfEdges: nextEdges };
      });
    },
    [recomputeFlowActive],
  );

  /** Connection rules:
   * Flow:
   *  - 1:1 per handle (both source and target handle).
   *  - No self/graph loops.
   * IO:
   *  - role === 'io' on both ends with out→in direction.
   *  - Source fan-out allowed (1 -> N).
   *  - Target handle single (1 edge).
   *  - Types must be compatible (unified number policy via isTypeCompatible).
   *  - If number → move_numeric, attach cast metadata for codegen.
   */
  const onConnect = useCallback(
    (conn: Connection) => {
      if (!conn.source || !conn.target) return;

      // Find PTB ports for validation
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
          // Enforce flow handle directions if modeled as ports
          if (!(sp.direction === 'out' && tp.direction === 'in')) return prev;

          const filtered = filterHandleConflictsForFlow(prev.rfEdges, conn);
          if (!filtered) return prev; // must have concrete handles

          // Prevent cycle
          if (createsLoop(filtered, conn.source!, conn.target!)) return prev;

          const newEdge: RFEdge = {
            id: `e-${Date.now()}`,
            type: 'ptb-flow',
            source: conn.source!,
            target: conn.target!,
            sourceHandle: conn.sourceHandle ?? undefined,
            targetHandle: conn.targetHandle ?? undefined,
          };

          const nextEdges = [...filtered, newEdge];
          setFlowActive(hasStartToEnd(prev.rfNodes, nextEdges));
          return { ...prev, rfEdges: nextEdges };
        }

        // IO EDGE
        if (sp.role !== 'io' || tp.role !== 'io') return prev;

        // Direction must be out -> in
        if (!(sp.direction === 'out' && tp.direction === 'in')) return prev;

        // Type checks (unknown types are not allowed to connect)
        if (isUnknownType(sp.dataType) || isUnknownType(tp.dataType))
          return prev;
        if (!isTypeCompatible(sp.dataType, tp.dataType)) return prev;

        const filtered = filterHandleConflictsForIO(prev.rfEdges, conn);
        if (!filtered) return prev;

        // Infer cast metadata for number -> move_numeric (and vectors thereof)
        const cast = inferCastTarget(sp.dataType, tp.dataType) || undefined;

        const newEdge: RFEdge = {
          id: `e-${Date.now()}`,
          type: 'ptb-io',
          source: conn.source!,
          target: conn.target!,
          sourceHandle: conn.sourceHandle ?? undefined,
          targetHandle: conn.targetHandle ?? undefined,
          data: cast ? { cast } : undefined, // stored for adapters/codegen
          label: cast ? `as ${cast.to}` : undefined, // optional UX badge
        };

        // Source fan-out allowed
        return { ...prev, rfEdges: [...filtered, newEdge] };
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
      {/* Quick theme switcher */}
      <div style={{ position: 'absolute', right: 12, top: 12, zIndex: 10 }}>
        <select
          value={theme}
          onChange={(e) => setTheme(e.target.value as 'light' | 'dark')}
          style={{ fontSize: 12 }}
        >
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </select>
      </div>

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
