// src/ui/PTBFlow.tsx
// -----------------------------------------------------------------------------
// RF is the *source of truth* while the editor is open.
// We rehydrate PTB → RF only when provider.graphEpoch changes.
// RF mutations persist to PTB *after commit* in a single effect (no debounce).
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
  inferGraphInputTypes,
  parseExecutableGraph,
} from '@zktx.io/ptb-model';

import { CodePip } from './CodePip';
import { renderCodePreview, renderMermaidCopyText } from './codePreview';
import {
  decideConnection,
  deleteEdgeById,
  deleteEdgesForRemovedNodes,
} from './edgeLifecycle';
import { EdgeTypes } from './edges';
import {
  buildEditorValidationState,
  emptyEditorValidationState,
} from './editorValidationState';
import { EMPTY_CODE } from './emptyCode';
import { applyInferredVariableTypesToRFNodes } from './graphSemanticReconcile';
import { ContextMenu } from './menu/ContextMenu';
import { formatModelErrorMessage } from './modelDiagnostics';
import { refreshMoveCallPortsFromSignatures } from './moveCallSignaturePorts';
import { NodeTypes } from './nodes';
import { usePtb } from './PtbProvider';
import { createReactFlowCommitController } from './reactFlowCommitController';
import {
  projectEdgesForCurrentPorts,
  type RFEdgeData,
} from './rfGraphProjection';
import { StatusBar } from './StatusBar';
import { autoLayoutFlow, type LayoutPositions } from './utils/autoLayout';
import { copyTextToClipboard } from './utils/clipboard';
import { hasStartToEnd } from './utils/flowPath';
import { makeObject } from '../ptb/factories';
import {
  type CommandRuntimeParams,
  type Port,
  type PTBGraph,
  type PTBNode,
  toModelPTBGraph,
  type TypeArgumentNode,
  type VariableNode,
} from '../ptb/graph/types';
import type { ObjectMetadataInfo } from '../ptb/objectMetadata';
import {
  ptbNodeToRF,
  ptbToRF,
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
type FlowPoint = { x: number; y: number };

type AutoLayoutSnapshotResult =
  | { ok: true; graph: PTBGraph; snapshot: RFSnapshot }
  | { ok: false; error: string };
type AutoLayoutActionResult =
  | { ok: true; graph: PTBGraph }
  | { ok: false; error: string };

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
    graphRehydrateViewportPolicy,
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
  const fitViewportToContentRef = useRef<() => void>(() => {});
  const rehydrateViewportPolicyRef = useRef(graphRehydrateViewportPolicy);
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
      opts?: { notify?: boolean; warn?: boolean; baseGraph?: PTBGraph },
    ):
      | { ok: true; graph: PTBGraph }
      | { ok: false; error: unknown; message: string } => {
      try {
        return {
          ok: true,
          graph: rfToPTB(
            snapshot.rfNodes,
            snapshot.rfEdges,
            opts?.baseGraph ?? baseGraphRef.current,
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

  const reconcileRFSnapshot = useCallback(
    (snapshot: RFSnapshot): RFSnapshot => {
      const converted = safeRfToPTB(snapshot, {
        notify: false,
        warn: false,
      });
      const semanticNodes = converted.ok
        ? applyInferredVariableTypesToRFNodes(
            snapshot.rfNodes,
            inferGraphInputTypes(toModelPTBGraph(converted.graph), {
              moveSignatures,
            }).graph,
          )
        : snapshot.rfNodes;
      const nextNodes =
        semanticNodes === snapshot.rfNodes
          ? snapshot.rfNodes
          : withCallbacks(semanticNodes);
      return {
        rfNodes: nextNodes,
        rfEdges: projectEdgesForCurrentPorts(nextNodes, snapshot.rfEdges),
      };
    },
    [moveSignatures, safeRfToPTB, withCallbacks],
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

          return reconcileRFSnapshot({
            rfNodes: injected,
            rfEdges: freshRFEdges,
          });
        });
      });
    },
    [reconcileRFSnapshot, safeRfToPTB, withCallbacks],
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

          return reconcileRFSnapshot({
            rfNodes: injected,
            rfEdges: freshRFEdges,
          });
        });
      });
    },
    [reconcileRFSnapshot, safeRfToPTB, withCallbacks],
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

          return reconcileRFSnapshot({
            rfNodes: injected,
            rfEdges: freshRFEdges,
          });
        });
      });
    },
    [reconcileRFSnapshot, safeRfToPTB, withCallbacks],
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
            ? reconcileRFSnapshot({
                rfNodes: withCallbacks(nextNodes),
                rfEdges: prev.rfEdges,
              })
            : prev;
        });
      });
    },
    [reconcileRFSnapshot, withCallbacks],
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
    return reconcileRFSnapshot({ rfNodes: injected, rfEdges: edges });
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
      const analysis = analyzePTBGraph(toModelPTBGraph(converted.graph), {
        moveSignatures,
      });
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
      const nextNodes = refreshed
        ? withCallbacks(refreshed.nodes)
        : prev.rfNodes;
      const reconciled = reconcileRFSnapshot({
        rfNodes: nextNodes,
        rfEdges: refreshed ? refreshed.edges : prev.rfEdges,
      });
      if (
        reconciled.rfNodes === prev.rfNodes &&
        edgesSig(reconciled.rfEdges) === edgesSig(prev.rfEdges)
      ) {
        return prev;
      }
      return reconciled;
    });
  }, [moveSignatures, reconcileRFSnapshot, rfEdges, rfNodes, withCallbacks]);

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
    if (measuredLayoutFrameRef.current !== undefined) {
      cancelAnimationFrame(measuredLayoutFrameRef.current);
      measuredLayoutFrameRef.current = undefined;
    }
    lastSuccessfulCodeRef.current = undefined;
    setCodePreviewStatus('current');
    rehydratingRef.current = true;
    rehydrateViewportPolicyRef.current = graphRehydrateViewportPolicy;
    baseGraphRef.current = graph;
    const { nodes, edges } = ptbToRF(graph);
    const injected = withCallbacks(nodes);
    const reconciled = reconcileRFSnapshot({
      rfNodes: injected,
      rfEdges: edges,
    });

    setRF(reconciled);

    // Unmute next tick to let RF compute dimensions.
    requestAnimationFrame(() => {
      if (session !== flowSessionRef.current) return;
      rehydratingRef.current = false;
    });
  }, [
    graphEpoch,
    graph,
    graphRehydrateViewportPolicy,
    reconcileRFSnapshot,
    withCallbacks,
  ]);

  // ----- Safety net: re-project edges whenever nodes change ------------------

  useEffect(() => {
    if (readOnly) return;
    setRF((prev) => {
      const pruned = projectEdgesForCurrentPorts(prev.rfNodes, prev.rfEdges);
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
        const candidate = { rfNodes: nodes, rfEdges: prev.rfEdges };
        const converted = safeRfToPTB(candidate, {
          notify: true,
          warn: false,
        });
        if (!converted.ok) return prev;
        return reconcileRFSnapshot(candidate);
      });
    },
    [reconcileRFSnapshot, safeRfToPTB, withCallbacks],
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
        const retainedEdges =
          removedNodeIds.length > 0
            ? deleteEdgesForRemovedNodes(nextNodes, prev.rfEdges)
            : prev.rfEdges;
        const nextEdges = projectEdgesForCurrentPorts(nextNodes, retainedEdges);

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
        const shouldFitMeasuredLayout =
          !rehydrating || rehydrateViewportPolicyRef.current === 'fit';
        measuredLayoutFrameRef.current = requestAnimationFrame(() => {
          measuredLayoutFrameRef.current = undefined;
          if (shouldFitMeasuredLayout) fitViewportToContentRef.current();
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
        const removedEdgeIds = effective.flatMap((change) => {
          if (change.type !== 'remove') return [];
          const id = (change as { id?: string }).id;
          return id ? [id] : [];
        });
        const remainingChanges = effective.filter(
          (change) => change.type !== 'remove',
        );
        const explicitlyRetained = removedEdgeIds.reduce(
          (edges, id) => deleteEdgeById(edges, id),
          prev.rfEdges,
        );
        const nextEdges = applyEdgeChanges(
          remainingChanges,
          explicitlyRetained,
        );
        if (readOnly) {
          return nextEdges === prev.rfEdges
            ? prev
            : { ...prev, rfEdges: nextEdges };
        }
        const pruned = projectEdgesForCurrentPorts(prev.rfNodes, nextEdges);
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
        const decision = decideConnection(prev.rfNodes, prev.rfEdges, conn);
        if (decision.action === 'reject') return prev;
        const newEdge: RFEdge<RFEdgeData> = {
          id: createUniqueId('edge'),
          type: decision.edgeType,
          source: conn.source!,
          target: conn.target!,
          sourceHandle: conn.sourceHandle ?? undefined,
          targetHandle: conn.targetHandle ?? undefined,
          data: decision.data,
        };
        const reconciled = reconcileRFSnapshot({
          rfNodes: prev.rfNodes,
          rfEdges: [...decision.filteredEdges, newEdge],
        });
        if (
          reconciled.rfNodes === prev.rfNodes &&
          edgesSig(reconciled.rfEdges) === edgesSig(prev.rfEdges)
        ) {
          return prev;
        }
        return reconciled;
      });
    },
    [readOnly, createUniqueId, reconcileRFSnapshot],
  );

  const onCopyMermaid = useCallback(async () => {
    const converted = safeRfToPTB(
      { rfNodes, rfEdges },
      { notify: false, warn: false },
    );
    if (!converted.ok) {
      throw new Error(`Mermaid unavailable: ${converted.message}`);
    }

    let mermaid: string;
    try {
      mermaid = renderMermaidCopyText(converted.graph, {
        direction: 'LR',
        moveSignatures,
      });
    } catch (error) {
      throw new Error(formatModelErrorMessage(error, 'Mermaid unavailable.'));
    }

    await copyTextToClipboard(mermaid);
  }, [rfEdges, rfNodes, moveSignatures, safeRfToPTB]);

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
      const executableGraph = parseExecutableGraph(toModelPTBGraph(graph), {
        moveSignatures,
      });
      const ir = graphToTransactionIR(executableGraph);
      const tx = buildTransactionFromIR(ir, execOpts, { moveSignatures });
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
      const executableGraph = parseExecutableGraph(toModelPTBGraph(graph), {
        moveSignatures,
      });
      const ir = graphToTransactionIR(executableGraph);
      const tx = buildTransactionFromIR(ir, execOpts, { moveSignatures });
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

  const graphToLayoutSnapshot = useCallback(
    (sourceGraph: PTBGraph): RFSnapshot => {
      const { nodes, edges } = ptbToRF(sourceGraph);
      const rfNodes = withCallbacks(nodes);
      return {
        rfNodes,
        rfEdges: projectEdgesForCurrentPorts(rfNodes, edges),
      };
    },
    [withCallbacks],
  );

  const computeAutoLayoutSnapshot = useCallback(
    async (
      snapshot: RFSnapshot,
      opts?: {
        baseGraph?: PTBGraph;
        isCurrent?: () => boolean;
        targetCenter?: FlowPoint;
      },
    ): Promise<AutoLayoutSnapshotResult> => {
      const isCurrent = opts?.isCurrent ?? (() => true);
      if (!isCurrent()) {
        return {
          ok: false as const,
          error: 'Graph layout was superseded.',
        };
      }
      if (snapshot.rfNodes.length === 0) {
        return {
          ok: false as const,
          error: 'Graph layout requires at least one node.',
        };
      }

      let layoutSnapshot = snapshot;
      let positions: LayoutPositions = await autoLayoutFlow(
        layoutSnapshot.rfNodes,
        layoutSnapshot.rfEdges,
        {
          targetCenter: opts?.targetCenter ?? getViewportCenterFlow(),
        },
      );
      if (!isCurrent()) {
        return {
          ok: false as const,
          error: 'Graph layout was superseded.',
        };
      }

      if (!positions || Object.keys(positions).length === 0) {
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve());
        });
        if (!isCurrent()) {
          return {
            ok: false as const,
            error: 'Graph layout was superseded.',
          };
        }
        positions = await autoLayoutFlow(
          layoutSnapshot.rfNodes,
          layoutSnapshot.rfEdges,
          {
            targetCenter: opts?.targetCenter ?? getViewportCenterFlow(),
          },
        );
        if (!isCurrent()) {
          return {
            ok: false as const,
            error: 'Graph layout was superseded.',
          };
        }
        if (!positions || Object.keys(positions).length === 0) {
          return {
            ok: false as const,
            error: 'Graph layout did not produce node positions.',
          };
        }
      }

      const nextNodes = layoutSnapshot.rfNodes.map((n) =>
        positions[n.id]
          ? {
              ...n,
              position: positions[n.id],
              positionAbsolute: undefined,
              dragging: false,
            }
          : n,
      );
      const nextEdges = projectEdgesForCurrentPorts(
        nextNodes,
        layoutSnapshot.rfEdges,
      );
      layoutSnapshot = { rfNodes: nextNodes, rfEdges: nextEdges };
      const converted = safeRfToPTB(layoutSnapshot, {
        baseGraph: opts?.baseGraph,
        notify: false,
      });
      if (!converted.ok) {
        return {
          ok: false as const,
          error: converted.message,
        };
      }
      return {
        ok: true as const,
        graph: converted.graph,
        snapshot: layoutSnapshot,
      };
    },
    [getViewportCenterFlow, safeRfToPTB],
  );

  const computeAutoLayoutGraph = useCallback(
    async (
      sourceGraph: PTBGraph,
      opts?: { targetCenter?: FlowPoint },
    ): Promise<AutoLayoutActionResult> => {
      const layout = await computeAutoLayoutSnapshot(
        graphToLayoutSnapshot(sourceGraph),
        { baseGraph: sourceGraph, targetCenter: opts?.targetCenter },
      );
      if (!layout.ok) return layout;
      return { ok: true as const, graph: layout.graph };
    },
    [computeAutoLayoutSnapshot, graphToLayoutSnapshot],
  );

  const onAutoLayout =
    useCallback(async (): Promise<AutoLayoutActionResult> => {
      const session = flowSessionRef.current;
      const isCurrentLayout = () =>
        session === flowSessionRef.current && !rehydratingRef.current;
      if (rehydratingRef.current) {
        return {
          ok: false as const,
          error: 'Graph layout is unavailable while the graph is rehydrating.',
        };
      }

      const layout = await computeAutoLayoutSnapshot(rfSnapshotRef.current, {
        isCurrent: isCurrentLayout,
      });
      if (!layout.ok) return layout;

      setRF((prev) => (isCurrentLayout() ? layout.snapshot : prev));
      requestAnimationFrame(() => {
        if (!isCurrentLayout()) return;
        try {
          fitView({ padding: 0.2, duration: 300 });
        } catch {
          /* no-op */
        }
      });
      return { ok: true as const, graph: layout.graph };
    }, [computeAutoLayoutSnapshot, fitView]);

  const fitViewportToContent = useCallback(() => {
    requestAnimationFrame(() => {
      try {
        fitView({ padding: 0.2, duration: 300 });
      } catch {
        /* no-op */
      }
    });
  }, [fitView]);

  useEffect(() => {
    fitViewportToContentRef.current = fitViewportToContent;
  }, [fitViewportToContent]);

  const fitViewportToContentAction = useCallback(() => {
    fitViewportToContentRef.current();
  }, []);

  const applyAutoLayoutToCurrentGraph = useCallback(
    () => onAutoLayout(),
    [onAutoLayout],
  );

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

  const captureGraph = useCallback(() => {
    const converted = safeRfToPTB(rfSnapshotRef.current, { notify: false });
    if (!converted.ok) return { ok: false as const, error: converted.message };
    return { ok: true as const, graph: converted.graph };
  }, [safeRfToPTB]);

  const getViewportState = useCallback(() => getViewport(), [getViewport]);

  useEffect(() => {
    registerFlowActions({
      fitViewportToContent: fitViewportToContentAction,
      applyAutoLayoutToCurrentGraph,
      computeAutoLayoutGraph,
      updateViewport,
      captureGraph,
      getViewportState,
    });
    return () => {
      registerFlowActions({
        fitViewportToContent: undefined,
        applyAutoLayoutToCurrentGraph: undefined,
        computeAutoLayoutGraph: undefined,
        updateViewport: undefined,
        captureGraph: undefined,
        getViewportState: undefined,
      });
    };
  }, [
    registerFlowActions,
    fitViewportToContentAction,
    applyAutoLayoutToCurrentGraph,
    computeAutoLayoutGraph,
    updateViewport,
    captureGraph,
    getViewportState,
  ]);

  const onAssetPick = useCallback(
    (obj: {
      objectId: string;
      typeTag: string;
      metadata?: ObjectMetadataInfo;
    }) => {
      const center = getViewportCenterFlow();
      const placeAndAdd = (node: PTBNode) => {
        node.position = { x: center.x, y: center.y };
        addNode(node);
      };
      placeAndAdd(
        makeObject(obj.typeTag, {
          id: createUniqueId('var'),
          value: obj.objectId,
        }),
      );
    },
    [addNode, createUniqueId, getViewportCenterFlow],
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
        fitView={false}
        /** block graph-position edits when read-only */
        nodesDraggable={!readOnly}
        /** block creating/updating edges when read-only */
        nodesConnectable={!readOnly}
        edgesReconnectable={false}
        elevateEdgesOnSelect={false}
        zIndexMode="manual"
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
              onCopyMermaid={onCopyMermaid}
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
