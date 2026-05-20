// src/ui/PTBFlow.tsx
// -----------------------------------------------------------------------------
// RF is the *source of truth* while the editor is open.
// We rehydrate PTB → RF only when provider.graphEpoch changes.
// RF mutations persist to PTB *after commit* in a single effect (no debounce).
// Only text inputs inside node UI are debounced (not handled here).
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
import type {
  Connection,
  EdgeChange,
  NodeChange,
  Viewport,
} from '@xyflow/react';
import {
  analyzePTBGraph,
  graphToTransactionIR,
  parseExecutableGraph,
} from '@zktx.io/ptb-model';

import { CodePip } from './CodePip';
import { renderCodePreview } from './codePreview';
import {
  filterConflictingIOEdges,
  filterConflictingTypeEdges,
  pruneExistingIOEdges,
  pruneExistingTypeEdges,
} from './edgePruning';
import { EdgeTypes } from './edges';
import {
  buildEditorValidationState,
  emptyEditorValidationState,
} from './editorValidationState';
import { EMPTY_CODE } from './emptyCode';
import { findPortFromStore } from './handles/handleUtils';
import { ContextMenu } from './menu/ContextMenu';
import { formatModelErrorMessage } from './modelDiagnostics';
import { refreshMoveCallPortsFromSignatures } from './moveCallSignaturePorts';
import { NodeTypes } from './nodes';
import { usePtb } from './PtbProvider';
import { createReactFlowCommitController } from './reactFlowCommitController';
import { StatusBar } from './StatusBar';
import { autoLayoutFlow, type LayoutPositions } from './utils/autoLayout';
import { createsFlowLoop, hasStartToEnd } from './utils/flowPath';
import { makeObject } from '../ptb/factories';
import { canConnectIO, inferCastTarget } from '../ptb/graph/typecheck';
import {
  type CommandRuntimeParams,
  parseHandleTypeSuffix,
  type Port,
  type PTBGraph,
  type PTBNode,
  type TypeArgumentNode,
  type VariableNode,
} from '../ptb/graph/types';
import {
  buildObjectRawInputForUsage,
  defaultObjectRawUsage,
} from '../ptb/objectAuthoring';
import type { ObjectAuthoringInfo } from '../ptb/objectAuthoring';
import {
  ptbNodeToRF,
  ptbToRF,
  type RFEdgeData,
  type RFNodeData,
  rfToPTB,
} from '../ptb/ptbAdapter';
import {
  buildCommandPorts,
  patchCommandUIParams,
  sanitizeCommandUIParams,
} from '../ptb/registry';
import { buildTransactionFromIR } from '../ptb/runtimeAdapter';
import { toColorMode } from '../types';

// ===== pure helpers (file-scope) =============================================

function adapterPreviewCode(
  chain: string,
  message: string,
  previousModelCode?: string,
): string {
  return [
    `// PTB Code Preview (network: ${chain})`,
    `// Preview is stale: ${message}`,
    '',
    previousModelCode?.trim()
      ? previousModelCode
      : '// No previous successful model-rendered code is available.',
  ].join('\n');
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

function pruneInvalidEdges(
  nodes: RFNode<RFNodeData>[],
  edges: RFEdge<RFEdgeData>[],
): RFEdge<RFEdgeData>[] {
  let pruned = pruneDanglingEdges(nodes, edges);
  pruned = pruneExistingIOEdges(nodes, pruned);
  pruned = pruneExistingTypeEdges(nodes, pruned);
  return pruned;
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

function hasCommandNode(nodes: RFNode<RFNodeData>[]): boolean {
  return nodes.some((node) => {
    const ptbNode = node.data?.ptbNode;
    return (
      ptbNode?.kind === 'Command' ||
      node.type === 'ptb-cmd' ||
      node.type === 'ptb-mvc'
    );
  });
}

type RFSnapshot = {
  rfNodes: RFNode<RFNodeData>[];
  rfEdges: RFEdge<RFEdgeData>[];
};

// ===== component =============================================================

export function PTBFlow() {
  const {
    graph,
    setGraph,
    setViewExternal,
    readOnly,
    theme,
    chain,
    moveSignatures,
    execOpts,
    dryRunTx,
    runTx,
    createUniqueId,
    registerFlowActions,
    graphEpoch,
    codePipOpenTick,
    toast,
    providerUiState,
    clearProviderNotice,
    loadTxStatus,
  } = usePtb();

  // Code preview
  const [code, setCode] = useState<string>(EMPTY_CODE(chain));
  const [codePreviewStatus, setCodePreviewStatus] = useState<
    'current' | 'stale'
  >('current');
  const lastSuccessfulCodeRef = useRef<string | undefined>(undefined);

  // UI toggles
  const [showMiniMap, setShowMiniMap] = useState(true);

  // Flow state flags
  const [layoutReady, setLayoutReady] = useState(false);

  // Persisted PTB snapshot ref (for RF→PTB diffs)
  const baseGraphRef = useRef(graph);

  // Rehydrate guard
  const rehydratingRef = useRef(false);
  const lastEpochRef = useRef<number>(-1);
  const flowSessionRef = useRef(0);
  const previewFrameRef = useRef<number | undefined>(undefined);
  const commitControllerRef = useRef<
    ReturnType<typeof createReactFlowCommitController<RFSnapshot>> | undefined
  >(undefined);
  const persistSnapshotRef = useRef<(snapshot: RFSnapshot) => void>(() => {});
  const onAutoLayoutRef = useRef<() => void | Promise<void>>(() => {});
  const measuredLayoutFrameRef = useRef<number | undefined>(undefined);

  // Patch callback refs (avoid TDZ during initial render)
  const patchUIRef = useRef<
    (id: string, patch: Record<string, unknown>) => void
  >(() => {});
  const patchCommandRef = useRef<
    (
      id: string,
      patch: {
        ui?: Record<string, unknown>;
        runtime?: CommandRuntimeParams;
        ports?: Port[];
      },
    ) => void
  >(() => {});
  const patchVarRef = useRef<
    (id: string, patch: Partial<VariableNode>) => void
  >(() => {});
  const patchTypeArgumentRef = useRef<
    (id: string, patch: Partial<TypeArgumentNode>) => void
  >(() => {});

  const reportGraphAdapterError = useCallback(
    (error: unknown) => {
      toast({
        message:
          error instanceof Error
            ? error.message
            : 'Failed to persist the current graph.',
        variant: 'error',
      });
    },
    [toast],
  );

  const safeRfToPTB = useCallback(
    (
      snapshot: RFSnapshot,
      opts?: { notify?: boolean; warn?: boolean },
    ):
      | { ok: true; graph: PTBGraph }
      | { ok: false; error: unknown; message: string } => {
      try {
        return {
          ok: true,
          graph: rfToPTB(
            snapshot.rfNodes,
            snapshot.rfEdges,
            baseGraphRef.current,
          ),
        };
      } catch (error) {
        const message = formatModelErrorMessage(error, 'Unexpected error');
        if (opts?.notify !== false) reportGraphAdapterError(error);
        else if (opts?.warn !== false)
          globalThis.console?.warn?.(
            '[ptb-builder] Graph adapter error:',
            message,
          );
        return { ok: false, error, message };
      }
    },
    [reportGraphAdapterError],
  );

  const nodeDataOnPatchUI = useCallback(
    (id: string, patch: Record<string, unknown>) =>
      patchUIRef.current(id, patch),
    [],
  );
  const nodeDataOnPatchCommand = useCallback(
    (
      id: string,
      patch: {
        ui?: Record<string, unknown>;
        runtime?: CommandRuntimeParams;
        ports?: Port[];
      },
    ) => patchCommandRef.current(id, patch),
    [],
  );
  const nodeDataOnPatchVar = useCallback(
    (id: string, patch: Partial<VariableNode>) =>
      patchVarRef.current(id, patch),
    [],
  );
  const nodeDataOnPatchTypeArgument = useCallback(
    (id: string, patch: Partial<TypeArgumentNode>) =>
      patchTypeArgumentRef.current(id, patch),
    [],
  );

  /** Inject stable callbacks into RF node data payloads only when missing. */
  const withCallbacks = useCallback(
    (nodes: RFNode<RFNodeData>[]) =>
      nodes.map((n) => {
        const data = n.data || {};
        if (
          data.onPatchUI === nodeDataOnPatchUI &&
          data.onPatchCommand === nodeDataOnPatchCommand &&
          data.onPatchVar === nodeDataOnPatchVar &&
          data.onPatchTypeArgument === nodeDataOnPatchTypeArgument
        ) {
          return n;
        }
        return {
          ...n,
          data: {
            ...data,
            onPatchUI: nodeDataOnPatchUI,
            onPatchCommand: nodeDataOnPatchCommand,
            onPatchVar: nodeDataOnPatchVar,
            onPatchTypeArgument: nodeDataOnPatchTypeArgument,
          },
        };
      }),
    [
      nodeDataOnPatchCommand,
      nodeDataOnPatchTypeArgument,
      nodeDataOnPatchUI,
      nodeDataOnPatchVar,
    ],
  );

  // ----- Node-level patchers (deferred to avoid setState in render) -----------

  /** Patch Command node UI params and keep ports consistent with UI. */
  const onPatchUI = useCallback(
    (nodeId: string, patch: Record<string, unknown>) => {
      const session = flowSessionRef.current;
      deferSetState(() => {
        if (session !== flowSessionRef.current) return;
        setRF((prev) => {
          const converted = safeRfToPTB(prev);
          if (!converted.ok) {
            return prev;
          }
          const currentPTB = converted.graph;
          const node = currentPTB.nodes.find((n) => n.id === nodeId);
          if (!node || node.kind !== 'Command') return prev;

          const nextUI = patchCommandUIParams(
            node.command,
            node.params?.ui,
            patch,
            node.params?.runtime,
          );
          const runtime = node.params?.runtime;
          node.params =
            nextUI || runtime
              ? {
                  ...(nextUI ? { ui: nextUI } : {}),
                  ...(runtime ? { runtime } : {}),
                }
              : undefined;
          node.ports = buildCommandPorts(
            node.command,
            nextUI,
            runtime,
            node.ports,
          );

          const { nodes: freshRFNodes, edges: freshRFEdges } =
            ptbToRF(currentPTB);
          const injected = withCallbacks(freshRFNodes);
          const pruned = pruneInvalidEdges(injected, freshRFEdges);

          return { rfNodes: injected, rfEdges: pruned };
        });
      });
    },
    [safeRfToPTB, withCallbacks],
  );

  /** Patch model command params and ports in one graph update. */
  const onPatchCommand = useCallback(
    (
      nodeId: string,
      patch: {
        ui?: Record<string, unknown>;
        runtime?: CommandRuntimeParams;
        ports?: Port[];
      },
    ) => {
      const session = flowSessionRef.current;
      deferSetState(() => {
        if (session !== flowSessionRef.current) return;
        setRF((prev) => {
          const converted = safeRfToPTB(prev);
          if (!converted.ok) {
            return prev;
          }
          const currentPTB = converted.graph;
          const node = currentPTB.nodes.find((n) => n.id === nodeId);
          if (!node || node.kind !== 'Command') return prev;

          const nextRuntime =
            patch.runtime === undefined
              ? node.params?.runtime
              : (Object.fromEntries(
                  Object.entries(patch.runtime).filter(
                    ([, value]) => value !== undefined,
                  ),
                ) as CommandRuntimeParams);
          const nextUI =
            patch.ui === undefined
              ? sanitizeCommandUIParams(
                  node.command,
                  node.params?.ui,
                  nextRuntime,
                )
              : sanitizeCommandUIParams(node.command, patch.ui, nextRuntime);
          const hasRuntime =
            nextRuntime !== undefined && Object.keys(nextRuntime).length > 0;
          node.params =
            nextUI || hasRuntime
              ? {
                  ...(nextUI ? { ui: nextUI } : {}),
                  ...(hasRuntime ? { runtime: nextRuntime } : {}),
                }
              : undefined;
          node.ports = patch.ports
            ? buildCommandPorts(node.command, nextUI, nextRuntime, patch.ports)
            : buildCommandPorts(node.command, nextUI, nextRuntime, node.ports);

          const { nodes: freshRFNodes, edges: freshRFEdges } =
            ptbToRF(currentPTB);
          const injected = withCallbacks(freshRFNodes);
          const pruned = pruneInvalidEdges(injected, freshRFEdges);

          return { rfNodes: injected, rfEdges: pruned };
        });
      });
    },
    [safeRfToPTB, withCallbacks],
  );

  /** Patch a Variable node (value and/or varType). */
  const onPatchVar = useCallback(
    (nodeId: string, patch: Partial<VariableNode>) => {
      const session = flowSessionRef.current;
      deferSetState(() => {
        if (session !== flowSessionRef.current) return;
        setRF((prev) => {
          if (!('varType' in patch)) {
            let changed = false;
            const nextNodes = prev.rfNodes.map((rfNode) => {
              if (rfNode.id !== nodeId) return rfNode;
              const node = rfNode.data?.ptbNode;
              if (!node || node.kind !== 'Variable') return rfNode;

              const nextNode: VariableNode = {
                ...node,
                position: rfNode.position,
              };
              if ('value' in patch) {
                if (patch.value === undefined) delete nextNode.value;
                else nextNode.value = patch.value;
              }
              if ('rawInput' in patch) {
                if (patch.rawInput === undefined) delete nextNode.rawInput;
                else nextNode.rawInput = patch.rawInput;
              }

              changed = true;
              return {
                ...rfNode,
                data: {
                  ...rfNode.data,
                  label: nextNode.label,
                  ptbNode: nextNode,
                },
              };
            });

            return changed
              ? { ...prev, rfNodes: withCallbacks(nextNodes) }
              : prev;
          }

          const converted = safeRfToPTB(prev);
          if (!converted.ok) {
            return prev;
          }
          const currentPTB = converted.graph;
          const node = currentPTB.nodes.find((n) => n.id === nodeId);
          if (!node || node.kind !== 'Variable') return prev;

          const v = node as VariableNode;
          if ('value' in patch) {
            if (patch.value === undefined) delete v.value;
            else v.value = patch.value;
          }
          if ('varType' in patch && patch.varType !== undefined)
            v.varType = patch.varType;
          if ('rawInput' in patch) {
            if (patch.rawInput === undefined) delete v.rawInput;
            else v.rawInput = patch.rawInput;
          }

          const { nodes: freshRFNodes, edges: freshRFEdges } =
            ptbToRF(currentPTB);
          const injected = withCallbacks(freshRFNodes);
          const pruned = pruneInvalidEdges(injected, freshRFEdges);

          return { rfNodes: injected, rfEdges: pruned };
        });
      });
    },
    [safeRfToPTB, withCallbacks],
  );

  const onPatchTypeArgument = useCallback(
    (nodeId: string, patch: Partial<TypeArgumentNode>) => {
      const session = flowSessionRef.current;
      deferSetState(() => {
        if (session !== flowSessionRef.current) return;
        setRF((prev) => {
          let changed = false;
          const nextNodes = prev.rfNodes.map((rfNode) => {
            if (rfNode.id !== nodeId) return rfNode;
            const node = rfNode.data?.ptbNode;
            if (!node || node.kind !== 'TypeArgument') return rfNode;

            const nextNode: TypeArgumentNode = {
              ...node,
              position: rfNode.position,
            };
            if ('value' in patch && typeof patch.value === 'string') {
              nextNode.value = patch.value;
              nextNode.label = patch.value || 'type';
            }
            if ('label' in patch) {
              if (patch.label === undefined) delete nextNode.label;
              else nextNode.label = patch.label;
            }

            changed = true;
            return {
              ...rfNode,
              data: {
                ...rfNode.data,
                label: nextNode.label,
                ptbNode: nextNode,
              },
            };
          });

          return changed
            ? { ...prev, rfNodes: withCallbacks(nextNodes) }
            : prev;
        });
      });
    },
    [withCallbacks],
  );

  // Keep refs pointing to latest patchers/loaders
  useEffect(() => {
    patchUIRef.current = onPatchUI;
    patchCommandRef.current = onPatchCommand;
  }, [onPatchCommand, onPatchUI]);
  useEffect(() => {
    patchVarRef.current = onPatchVar;
  }, [onPatchVar]);
  useEffect(() => {
    patchTypeArgumentRef.current = onPatchTypeArgument;
  }, [onPatchTypeArgument]);

  // ----- RF state (authoritative while editing) -------------------------------

  const [{ rfNodes, rfEdges }, setRF] = useState<{
    rfNodes: RFNode<RFNodeData>[];
    rfEdges: RFEdge<RFEdgeData>[];
  }>(() => {
    const { nodes, edges } = ptbToRF(graph);
    const injected = withCallbacks(nodes);
    const pruned = pruneInvalidEdges(injected, edges);
    return { rfNodes: injected, rfEdges: pruned };
  });
  const flowActive = useMemo(
    () => hasStartToEnd(rfNodes, rfEdges),
    [rfNodes, rfEdges],
  );
  const editorValidationResult = useMemo(() => {
    const converted = safeRfToPTB(
      { rfNodes, rfEdges },
      { notify: false, warn: false },
    );
    if (!converted.ok) {
      return {
        validation: emptyEditorValidationState(),
        unavailable: `Graph diagnostics unavailable: ${converted.message}`,
      };
    }
    try {
      const analysis = analyzePTBGraph(converted.graph, { moveSignatures });
      return {
        validation: buildEditorValidationState(analysis.diagnostics),
        unavailable: undefined,
      };
    } catch (error) {
      return {
        validation: emptyEditorValidationState(),
        unavailable: `Graph diagnostics unavailable: ${formatModelErrorMessage(
          error,
          'Unexpected error',
        )}`,
      };
    }
  }, [moveSignatures, rfEdges, rfNodes, safeRfToPTB]);
  const editorValidation = editorValidationResult.validation;
  const editorValidationUnavailable = editorValidationResult.unavailable;
  const [dismissedEditorValidationKey, setDismissedEditorValidationKey] =
    useState('');
  const editorValidationVisible =
    editorValidation.totalCount > 0 &&
    editorValidation.noticeKey !== dismissedEditorValidationKey;
  const visibleEditorValidation = editorValidationVisible
    ? editorValidation
    : undefined;
  const dismissEditorValidation = useCallback(() => {
    if (editorValidation.noticeKey) {
      setDismissedEditorValidationKey(editorValidation.noticeKey);
    }
  }, [editorValidation.noticeKey]);
  const rfSnapshotRef = useRef({ rfNodes, rfEdges });

  useEffect(() => {
    rfSnapshotRef.current = { rfNodes, rfEdges };
  }, [rfNodes, rfEdges]);

  useEffect(() => {
    setRF((prev) => {
      const refreshed = refreshMoveCallPortsFromSignatures(
        prev.rfNodes,
        prev.rfEdges,
        moveSignatures,
      );
      if (!refreshed) return prev;
      const injected = withCallbacks(refreshed);
      const nextEdges = pruneInvalidEdges(injected, prev.rfEdges);
      if (
        injected === prev.rfNodes &&
        edgesSig(nextEdges) === edgesSig(prev.rfEdges)
      ) {
        return prev;
      }
      return { rfNodes: injected, rfEdges: nextEdges };
    });
  }, [moveSignatures, rfEdges, rfNodes, withCallbacks]);

  // ----- Rehydrate from provider on epoch bump --------------------------------

  useEffect(() => {
    if (graphEpoch === lastEpochRef.current) return;
    lastEpochRef.current = graphEpoch;

    flowSessionRef.current += 1;
    const session = flowSessionRef.current;
    commitControllerRef.current?.cancel();
    if (previewFrameRef.current !== undefined) {
      cancelAnimationFrame(previewFrameRef.current);
      previewFrameRef.current = undefined;
    }
    lastSuccessfulCodeRef.current = undefined;
    setCodePreviewStatus('current');
    rehydratingRef.current = true;
    const { nodes, edges } = ptbToRF(graph);
    const injected = withCallbacks(nodes);
    const pruned = pruneInvalidEdges(injected, edges);

    setRF({ rfNodes: injected, rfEdges: pruned });
    baseGraphRef.current = graph;

    // Disable fit until layout finishes (prevents initial flicker).
    setLayoutReady(false);

    // Unmute next tick to let RF compute dimensions.
    requestAnimationFrame(() => {
      if (session !== flowSessionRef.current) return;
      rehydratingRef.current = false;
    });
  }, [graphEpoch, graph, withCallbacks]);

  // ----- Safety net: re-prune edges whenever nodes change --------------------

  useEffect(() => {
    if (readOnly) return;
    setRF((prev) => {
      const pruned = pruneInvalidEdges(prev.rfNodes, prev.rfEdges);
      if (edgesSig(pruned) === edgesSig(prev.rfEdges)) return prev; // no-op
      return { ...prev, rfEdges: pruned };
    });
  }, [readOnly, rfNodes]);

  // ----- Persist RF → PTB after commit (single place) ------------------------

  const persistRFSnapshotToPTB = useCallback(
    (snapshot: RFSnapshot) => {
      if (rehydratingRef.current) return;
      if (readOnly) return;
      const converted = safeRfToPTB(snapshot);
      if (!converted.ok) return;
      const nextPTB = converted.graph;
      setGraph(nextPTB);
      baseGraphRef.current = nextPTB;
    },
    [readOnly, safeRfToPTB, setGraph],
  );
  persistSnapshotRef.current = persistRFSnapshotToPTB;

  if (!commitControllerRef.current) {
    commitControllerRef.current = createReactFlowCommitController<RFSnapshot>({
      commit: (snapshot) => persistSnapshotRef.current(snapshot),
      schedule: deferSetState,
    });
  }

  const finishNodeDrag = useCallback(
    (_: unknown, node?: RFNode<RFNodeData>) => {
      if (readOnly) return;
      commitControllerRef.current?.endDrag(node?.id, rfSnapshotRef.current);
    },
    [readOnly],
  );

  const startNodeDrag = useCallback(
    (_: unknown, node: RFNode<RFNodeData>) => {
      if (readOnly) return;
      commitControllerRef.current?.startDrag(node.id);
    },
    [readOnly],
  );

  useEffect(() => {
    if (readOnly) return;
    if (rehydratingRef.current) return;
    commitControllerRef.current?.recordChange({ rfNodes, rfEdges });
  }, [readOnly, rfNodes, rfEdges]);

  useEffect(() => {
    if (!readOnly) return;
    commitControllerRef.current?.cancel();
  }, [readOnly]);

  useEffect(
    () => () => {
      if (measuredLayoutFrameRef.current !== undefined) {
        cancelAnimationFrame(measuredLayoutFrameRef.current);
        measuredLayoutFrameRef.current = undefined;
      }
      commitControllerRef.current?.cancel();
    },
    [],
  );

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
      const kind = getRFKind(rfNode);
      if (!kind || kind === 'Start' || kind === 'End') return;
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
        const edges = pruneInvalidEdges(nodes, prev.rfEdges);
        return { rfNodes: nodes, rfEdges: edges };
      });
    },
    [withCallbacks],
  );

  const deleteNode = useCallback((id: string) => {
    setRF((prev) => {
      const kind = getRFKind(prev.rfNodes.find((node) => node.id === id));
      if (!kind || kind === 'Start' || kind === 'End') return prev;
      const nextNodes = prev.rfNodes.filter((n) => n.id !== id);
      const nextEdges = prev.rfEdges.filter(
        (e) => e.source !== id && e.target !== id,
      );
      return { rfNodes: nextNodes, rfEdges: nextEdges };
    });
  }, []);

  const deleteEdge = useCallback((id: string) => {
    setRF((prev) => {
      const nextEdges = prev.rfEdges.filter((e) => e.id !== id);
      return { ...prev, rfEdges: nextEdges };
    });
  }, []);

  // ----- RF change handlers ---------------------------------------------------

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const rehydrating = rehydratingRef.current;
      const isMeasuredSizeChange = (change: NodeChange) =>
        change.type === 'dimensions';
      const isReadOnlyNodeChange = (change: NodeChange) =>
        change.type === 'select' || isMeasuredSizeChange(change);

      // During programmatic rehydrate, keep React Flow's measured node sizes
      // but ignore interaction changes that would feed back into graph state.
      const effective = rehydrating
        ? changes.filter(isMeasuredSizeChange)
        : readOnly
          ? changes.filter(isReadOnlyNodeChange)
          : changes;
      if (effective.length === 0) return;
      const hasMeasuredSizeChange = effective.some(isMeasuredSizeChange);

      // During dragging, defer updates until drag ends. Read-only mode keeps
      // the PTBGraph immutable, so only selection and measurements pass through.
      if (!readOnly && !rehydrating) {
        for (const change of changes) {
          if (change.type !== 'position') continue;
          const nodeId = (change as { id?: string }).id;
          if (!nodeId) continue;
          const dragging = (change as { dragging?: boolean }).dragging;
          if (dragging === true) commitControllerRef.current?.startDrag(nodeId);
          if (dragging === false) commitControllerRef.current?.endDrag(nodeId);
        }
      }

      setRF((prev) => {
        // Prevent deleting Start/End via bulk remove.
        const filtered = effective.filter((ch) => {
          if (ch.type !== 'remove') return true;
          const id = (ch as any).id as string | undefined;
          if (!id) return true;
          const kind = getRFKind(prev.rfNodes.find((n) => n.id === id));
          return !!kind && kind !== 'Start' && kind !== 'End';
        });
        const removedNodeIds = filtered.flatMap((change) => {
          if (change.type !== 'remove') return [];
          const id = (change as any).id as string | undefined;
          return id ? [id] : [];
        });

        // Do NOT re-inject callbacks here; prev.rfNodes already have them.
        const nextNodes = applyNodeChanges(filtered, prev.rfNodes);
        if (readOnly || rehydrating) {
          return nextNodes === prev.rfNodes
            ? prev
            : { ...prev, rfNodes: nextNodes };
        }
        const nextEdges = pruneInvalidEdges(nextNodes, prev.rfEdges);

        // Avoid redundant updates
        if (
          nextNodes === prev.rfNodes &&
          edgesSig(nextEdges) === edgesSig(prev.rfEdges)
        ) {
          return prev;
        }

        for (const id of removedNodeIds) {
          commitControllerRef.current?.removeNode(id, {
            rfNodes: nextNodes,
            rfEdges: nextEdges,
          });
        }

        return { rfNodes: nextNodes, rfEdges: nextEdges };
      });

      if ((readOnly || rehydrating) && hasMeasuredSizeChange) {
        if (measuredLayoutFrameRef.current !== undefined) return;
        measuredLayoutFrameRef.current = requestAnimationFrame(() => {
          measuredLayoutFrameRef.current = undefined;
          onAutoLayoutRef.current();
        });
      }
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
        if (readOnly) {
          return nextEdges === prev.rfEdges
            ? prev
            : { ...prev, rfEdges: nextEdges };
        }
        const pruned = pruneInvalidEdges(prev.rfNodes, nextEdges);
        if (edgesSig(pruned) === edgesSig(prev.rfEdges)) return prev; // no-op
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

      setRF((prev) => {
        const sp = findPortFromStore(
          prev.rfNodes,
          conn.source!,
          conn.sourceHandle ?? undefined,
        );
        const tp = findPortFromStore(
          prev.rfNodes,
          conn.target!,
          conn.targetHandle ?? undefined,
        );
        if (!sp || !tp) return prev;

        // FLOW EDGE
        if (sp.role === 'flow' || tp.role === 'flow') {
          if (!(sp.direction === 'out' && tp.direction === 'in')) return prev;

          const filtered = filterHandleConflictsForFlow(prev.rfEdges, conn);
          if (!filtered) return prev;
          if (conn.source === conn.target) return prev;
          if (createsFlowLoop(filtered, conn.source!, conn.target!))
            return prev;

          const newEdge: RFEdge<RFEdgeData> = {
            id: createUniqueId('edge'),
            type: 'ptb-flow',
            source: conn.source!,
            target: conn.target!,
            sourceHandle: conn.sourceHandle ?? undefined,
            targetHandle: conn.targetHandle ?? undefined,
          };

          const nextEdges = pruneInvalidEdges(prev.rfNodes, [
            ...filtered,
            newEdge,
          ]);
          if (edgesSig(nextEdges) === edgesSig(prev.rfEdges)) return prev;
          return { ...prev, rfEdges: nextEdges };
        }

        // TYPE ARGUMENT EDGE
        if (sp.role === 'type' || tp.role === 'type') {
          if (
            sp.role !== 'type' ||
            tp.role !== 'type' ||
            sp.direction !== 'out' ||
            tp.direction !== 'in'
          ) {
            return prev;
          }
          const filtered = filterConflictingTypeEdges(prev.rfEdges, conn);
          if (!filtered) return prev;
          const newEdge: RFEdge<RFEdgeData> = {
            id: createUniqueId('edge'),
            type: 'ptb-type',
            source: conn.source!,
            target: conn.target!,
            sourceHandle: conn.sourceHandle ?? undefined,
            targetHandle: conn.targetHandle ?? undefined,
          };
          const nextEdges = pruneInvalidEdges(prev.rfNodes, [
            ...filtered,
            newEdge,
          ]);
          if (edgesSig(nextEdges) === edgesSig(prev.rfEdges)) return prev;
          return { ...prev, rfEdges: nextEdges };
        }

        // IO EDGE
        if (!canConnectIO(sp, tp)) return prev;

        const filtered = filterConflictingIOEdges(prev.rfEdges, conn);
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
        };

        const nextEdges = pruneInvalidEdges(prev.rfNodes, [
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
    const session = flowSessionRef.current;
    const cancelScheduled = () => {
      if (previewFrameRef.current !== undefined) {
        cancelAnimationFrame(previewFrameRef.current);
        previewFrameRef.current = undefined;
      }
    };

    const runPreview = () => {
      if (session !== flowSessionRef.current) return;
      if (!chain) {
        lastSuccessfulCodeRef.current = undefined;
        setCode(EMPTY_CODE(chain));
        setCodePreviewStatus('current');
        return;
      }
      const converted = safeRfToPTB({ rfNodes, rfEdges }, { notify: false });
      if (!converted.ok) {
        setCodePreviewStatus('stale');
        setCode(
          adapterPreviewCode(
            chain,
            converted.message,
            lastSuccessfulCodeRef.current,
          ),
        );
        return;
      }
      const graph = converted.graph;
      const result = renderCodePreview(graph, {
        chain,
        envelope: execOpts,
        moveSignatures,
        previousModelCode: lastSuccessfulCodeRef.current,
      });
      if (result.ok) lastSuccessfulCodeRef.current = result.modelCode;
      setCodePreviewStatus(result.ok ? 'current' : 'stale');
      setCode(result.code.trim().length > 0 ? result.code : EMPTY_CODE(chain));
    };

    cancelScheduled();

    if (commitControllerRef.current?.isDragging()) {
      const tick = () => {
        if (session !== flowSessionRef.current) return;
        if (commitControllerRef.current?.isDragging()) {
          previewFrameRef.current = requestAnimationFrame(tick);
          return;
        }
        previewFrameRef.current = undefined;
        runPreview();
      };
      previewFrameRef.current = requestAnimationFrame(tick);
      return () => {
        cancelScheduled();
      };
    }

    runPreview();
    return () => {
      cancelScheduled();
    };
  }, [rfNodes, rfEdges, chain, execOpts, moveSignatures, safeRfToPTB]);

  // ----- Execute --------------------------------------------------------------

  const [isRunning, setIsRunning] = useState(false);

  const onDryRun = useCallback(async () => {
    try {
      if (!chain) return;
      setIsRunning(true);
      const converted = safeRfToPTB({ rfNodes, rfEdges });
      if (!converted.ok) return;
      const graph = converted.graph;
      const executableGraph = parseExecutableGraph(graph, { moveSignatures });
      const ir = graphToTransactionIR(executableGraph);
      const tx = buildTransactionFromIR(ir, execOpts);
      await dryRunTx?.(tx); // toast behavior is controlled in provider
    } catch (e: any) {
      toast?.({
        message: formatModelErrorMessage(e, e?.message || 'Unexpected error'),
        variant: 'error',
      });
    } finally {
      setIsRunning(false);
    }
  }, [
    rfNodes,
    rfEdges,
    chain,
    execOpts,
    moveSignatures,
    dryRunTx,
    safeRfToPTB,
    toast,
  ]);

  const onExecute = useCallback(async () => {
    try {
      if (!chain) return;
      setIsRunning(true);
      const converted = safeRfToPTB({ rfNodes, rfEdges });
      if (!converted.ok) return;
      const graph = converted.graph;
      const executableGraph = parseExecutableGraph(graph, { moveSignatures });
      const ir = graphToTransactionIR(executableGraph);
      const tx = buildTransactionFromIR(ir, execOpts);
      await runTx?.(tx); // runTx will show toasts (dry-run + execute)
    } catch (e: any) {
      toast?.({
        message: formatModelErrorMessage(e, e?.message || 'Unexpected error'),
        variant: 'error',
      });
    } finally {
      setIsRunning(false);
    }
  }, [
    rfNodes,
    rfEdges,
    chain,
    execOpts,
    moveSignatures,
    runTx,
    safeRfToPTB,
    toast,
  ]);

  // ----- Auto Layout (positions-only merge) ----------------------------------
  const { fitView, screenToFlowPosition, setViewport, getViewport } =
    useReactFlow();
  const retryFlag = useRef(false);
  const containerRef = useRef<HTMLDivElement | undefined>(undefined);
  const setContainerEl = useCallback((el: HTMLDivElement | null) => {
    containerRef.current = el ?? undefined;
  }, []);

  const getViewportCenterFlow = useCallback(() => {
    const el = containerRef.current;
    if (!el) return { x: 0, y: 0 };
    const w = el.clientWidth || 0;
    const h = el.clientHeight || 0;
    return screenToFlowPosition({ x: w / 2, y: h / 2 });
  }, [screenToFlowPosition]);

  const onAutoLayout = useCallback(async () => {
    const session = flowSessionRef.current;
    const isCurrentLayout = () =>
      session === flowSessionRef.current && !rehydratingRef.current;

    // Guard 1: rehydrate in progress → defer
    if (rehydratingRef.current) {
      if (!retryFlag.current) {
        retryFlag.current = true;
        requestAnimationFrame(() => {
          retryFlag.current = false;
          if (session !== flowSessionRef.current) return;
          onAutoLayout();
        });
      }
      return;
    }

    // Guard 2: nodes not ready yet → retry a few frames
    if (!rfNodes || rfNodes.length === 0) {
      let tries = 0;
      const retry = () => {
        if (session !== flowSessionRef.current) return;
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
    if (!isCurrentLayout()) return;

    // Fallback: retry next frame if layout returned empty
    if (!positions || Object.keys(positions).length === 0) {
      requestAnimationFrame(async () => {
        if (!isCurrentLayout()) return;
        const pos2: LayoutPositions = await autoLayoutFlow(rfNodes, rfEdges, {
          targetCenter: getViewportCenterFlow(),
        });
        if (!isCurrentLayout()) return;
        if (!pos2 || Object.keys(pos2).length === 0) return; // give up silently
        setRF((prev) => {
          if (!isCurrentLayout()) return prev;
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
          const nextEdges = pruneInvalidEdges(nextNodes, prev.rfEdges);
          return { rfNodes: nextNodes, rfEdges: nextEdges };
        });
        requestAnimationFrame(() => {
          if (!isCurrentLayout()) return;
          try {
            fitView({ padding: 0.2, duration: 300 });
          } catch {
            /* no-op */
          }
          // Mark layout ready so ReactFlow can auto-fit after remounts.
          setLayoutReady(true);
        });
      });
      return;
    }

    setRF((prev) => {
      if (!isCurrentLayout()) return prev;
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
      const nextEdges = pruneInvalidEdges(nextNodes, prev.rfEdges);
      return { rfNodes: nextNodes, rfEdges: nextEdges };
    });

    requestAnimationFrame(() => {
      if (!isCurrentLayout()) return;
      try {
        fitView({ padding: 0.2, duration: 300 });
      } catch {
        /* no-op */
      }
      setLayoutReady(true);
    });
  }, [rfNodes, rfEdges, getViewportCenterFlow, fitView]);

  useEffect(() => {
    onAutoLayoutRef.current = onAutoLayout;
  }, [onAutoLayout]);

  const fitToContent = useCallback(() => {
    onAutoLayoutRef.current();
  }, []);

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
    return () => {
      registerFlowActions({
        fitToContent: undefined,
        updateViewport: undefined,
      });
    };
  }, [registerFlowActions, fitToContent, updateViewport]);

  const onAssetPick = useCallback(
    (obj: {
      objectId: string;
      typeTag: string;
      authoring?: ObjectAuthoringInfo;
    }) => {
      const usage = obj.authoring
        ? defaultObjectRawUsage(obj.authoring)
        : undefined;
      const rawInput =
        obj.authoring && usage
          ? buildObjectRawInputForUsage(obj.authoring, usage)
          : undefined;
      if (rawInput && !rawInput.ok) {
        toast({
          message: rawInput.error,
          variant: 'warning',
        });
      } else if (obj.authoring && !usage) {
        toast({
          message:
            'This object needs an explicit raw input usage. Open the variable and load object metadata to choose one.',
          variant: 'warning',
        });
      }
      const center = getViewportCenterFlow();
      const placeAndAdd = (node: PTBNode) => {
        node.position = { x: center.x, y: center.y };
        addNode(node);
      };
      const nextRawInput = rawInput?.ok ? rawInput.rawInput : undefined;
      placeAndAdd(
        makeObject(obj.typeTag, {
          id: createUniqueId('var'),
          value:
            nextRawInput?.kind === 'Object'
              ? nextRawInput.object
              : obj.objectId,
          rawInput: nextRawInput,
        }),
      );
    },
    [addNode, createUniqueId, getViewportCenterFlow, toast],
  );

  // ----- Render ---------------------------------------------------------------

  const canBuildRuntimeTransaction =
    !!chain && !readOnly && flowActive && hasCommandNode(rfNodes);

  return (
    <div
      ref={setContainerEl}
      data-ptb-builder
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
        /** block graph-position edits when read-only */
        nodesDraggable={!readOnly}
        /** block creating/updating edges when read-only */
        nodesConnectable={!readOnly}
        edgesReconnectable={false}
        deleteKeyCode={[]}
        onPaneContextMenu={(e) => openMenu(e, 'canvas')}
        onNodeContextMenu={(e, node) => openMenu(e, 'node', node.id)}
        onEdgeContextMenu={(e, edge) => openMenu(e, 'edge', edge.id)}
        nodeTypes={NodeTypes}
        edgeTypes={EdgeTypes}
        onConnect={onConnect}
        onNodesChange={onNodesChange}
        onNodeDragStart={startNodeDrag}
        onNodeDragStop={finishNodeDrag}
        onEdgesChange={onEdgesChange}
        onMoveEnd={onMoveEnd}
      >
        {!chain ? (
          <Panel position="top-center" className="ptb-empty-state">
            <span>No PTB loaded</span>
          </Panel>
        ) : undefined}

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
        <Panel position="top-right" className="ptb-codepip-pad">
          <div className="ptb-codepip-wrap">
            <CodePip
              key={`codepip-${readOnly ? 'ro' : 'rw'}-${codePipOpenTick}`}
              defaultCollapsed={readOnly || codePipOpenTick === 0}
              code={code}
              previewStatus={codePreviewStatus}
              language="typescript"
              title="ts-sdk preview"
              emptyText={EMPTY_CODE(chain)}
              canDryRun={canBuildRuntimeTransaction}
              canExecute={canBuildRuntimeTransaction}
              isRunning={isRunning}
              onDryRun={dryRunTx ? onDryRun : undefined}
              onExecute={runTx ? onExecute : undefined}
              onAssetPick={onAssetPick}
              showMiniMap={showMiniMap}
              onToggleMiniMap={setShowMiniMap}
            />
          </div>
        </Panel>

        <Panel position="top-left" style={{ pointerEvents: 'none' }}>
          {(loadTxStatus ||
            providerUiState.notice ||
            editorValidationVisible ||
            editorValidationUnavailable) && (
            <div style={{ pointerEvents: 'auto' }}>
              <StatusBar
                transaction={loadTxStatus}
                notice={providerUiState.notice}
                editorValidation={visibleEditorValidation}
                editorValidationUnavailable={editorValidationUnavailable}
                onDismissNotice={clearProviderNotice}
                onDismissEditorValidation={dismissEditorValidation}
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
