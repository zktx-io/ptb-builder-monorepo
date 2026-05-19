// src/ptb/ptbAdapter.ts

// -----------------------------------------------------------------------------
// PTBGraph ↔ React Flow adapter.
// - Nodes: SSOT lives in node.data.ptbNode. Variable nodes always materialize
//   a single IO out port that mirrors varType.
// - Edges: sourceHandle/targetHandle are projected into the React Flow handle
//   namespace used by rendered nodes. Handle aliases are also set because local
//   edge helpers read both field spellings.
// - Edge badges: serialized types are derived from the port dataType, not from
//   handle suffixes (suffixes are conservative).
// -----------------------------------------------------------------------------

import type { Edge as RFEdge, Node as RFNode } from '@xyflow/react';
import {
  indexedInputHandleIndex,
  nestedResultHandle,
  nestedResultHandleIndex,
  RESULT_HANDLE_ID,
} from '@zktx.io/ptb-model';

import type {
  CommandNode,
  CommandUIParams,
  NumericWidth,
  Port,
  PTBEdge,
  PTBGraph,
  PTBNode,
} from './graph/types';
import {
  buildHandleId,
  parseHandleTypeSuffix,
  serializePTBType,
} from './graph/types';
import { PORTS } from './portTemplates';
import { buildCommandPorts, sanitizeCommandUIParams } from './registry';
import { extractHandles } from '../ui/handles/handleUtils';

type RFEdgeWithHandleAliases = RFEdge<RFEdgeData> & {
  sourceHandleId?: string;
  targetHandleId?: string;
};

/** UI node payload: only label and the SSOT PTB node */
export interface RFNodeData extends Record<string, unknown> {
  label?: string;
  ptbNode?: PTBNode;
}

/** UI edge payload: serialized type & cast metadata for badges/debug */
export interface RFEdgeData extends Record<string, unknown> {
  dataType?: string;
  cast?: { to: NumericWidth };
}

/** Ensure a Variable node carries a concrete IO out port that reflects its varType. */
function materializeVarOutPort(n: PTBNode): PTBNode {
  if (n.kind !== 'Variable') return n;
  const v = n;

  const existingOut =
    (v.ports || []).find((p) => p.role === 'io' && p.direction === 'out')?.id ??
    'out';

  const outPort: Port = {
    id: existingOut,
    role: 'io',
    direction: 'out',
    label: v.label ?? 'out',
    dataType: v.varType,
    typeStr: v.varType ? serializePTBType(v.varType) : undefined,
  };

  return {
    ...v,
    ports: [outPort],
  };
}

function materializeStructuralPorts(n: PTBNode): PTBNode {
  if (n.kind === 'Start') return { ...n, ports: PORTS.start() };
  if (n.kind === 'End') return { ...n, ports: PORTS.end() };
  return n;
}

function keyedPort(port: Port): string {
  return `${port.role}:${port.direction}:${port.id}`;
}

// Preserve command output handles only when the model-aligned projection count
// matches the registry materialization. Otherwise the registry projection wins.
function mergeOutputPorts(
  existing: readonly Port[],
  materialized: readonly Port[],
): Port[] {
  const existingOutputs = existing.filter(
    (port) => port.role === 'io' && port.direction === 'out',
  );
  const materializedOutputs = materialized.filter(
    (port) => port.role === 'io' && port.direction === 'out',
  );
  if (existingOutputs.length === 0)
    return materializedOutputs.map((port) => ({ ...port }));
  if (existingOutputs.length !== materializedOutputs.length) {
    const singleResultAlias = nestedResultHandle(0);
    if (
      materializedOutputs.length === 1 &&
      materializedOutputs[0]?.id === RESULT_HANDLE_ID &&
      existingOutputs.length === 2 &&
      existingOutputs.some((port) => port.id === RESULT_HANDLE_ID) &&
      existingOutputs.some((port) => port.id === singleResultAlias)
    ) {
      const typed = materializedOutputs[0];
      return existingOutputs.map((port) => ({
        ...port,
        ...(typed.dataType ? { dataType: typed.dataType } : {}),
        ...(typed.typeStr ? { typeStr: typed.typeStr } : {}),
      }));
    }
    return materializedOutputs.map((port) => ({ ...port }));
  }

  return existingOutputs.map((port, index) => {
    const typed = materializedOutputs[index];
    return {
      ...port,
      ...(typed?.dataType ? { dataType: typed.dataType } : {}),
      ...(typed?.typeStr ? { typeStr: typed.typeStr } : {}),
    };
  });
}

function maxIndexedPortCount(
  ports: readonly Port[] | undefined,
  indexOf: (handle: string) => number | undefined,
): number | undefined {
  let count = 0;
  for (const port of ports ?? []) {
    const index = indexOf(port.id);
    if (index !== undefined) count = Math.max(count, index + 1);
  }
  return count === 0 ? undefined : count;
}

function materializedUIFromPorts(
  command: CommandNode,
): CommandUIParams | undefined {
  const ports = command.ports ?? [];
  const sanitized = sanitizeCommandUIParams(
    command.command,
    command.params?.ui,
    command.params?.runtime,
  );
  switch (command.command) {
    case 'makeMoveVec': {
      const count =
        maxIndexedPortCount(ports, (handle) =>
          indexedInputHandleIndex(handle, 'elem'),
        ) ?? sanitized?.elemsCount;
      if (count !== undefined) return { ...sanitized, elemsCount: count };
      if (
        typeof command.params?.runtime?.type === 'string' &&
        ports.some((port) => port.id === RESULT_HANDLE_ID)
      ) {
        return { ...sanitized, elemsCount: 0 };
      }
      return sanitized;
    }
    case 'mergeCoins': {
      const count =
        maxIndexedPortCount(ports, (handle) =>
          indexedInputHandleIndex(handle, 'source'),
        ) ?? sanitized?.sourcesCount;
      return count === undefined
        ? sanitized
        : { ...sanitized, sourcesCount: count };
    }
    case 'splitCoins': {
      const count =
        maxIndexedPortCount(ports, (handle) =>
          indexedInputHandleIndex(handle, 'amount'),
        ) ??
        maxIndexedPortCount(ports, nestedResultHandleIndex) ??
        sanitized?.amountsCount;
      return count === undefined
        ? sanitized
        : { ...sanitized, amountsCount: count };
    }
    case 'transferObjects': {
      const count =
        maxIndexedPortCount(ports, (handle) =>
          indexedInputHandleIndex(handle, 'object'),
        ) ?? sanitized?.objectsCount;
      return count === undefined
        ? sanitized
        : { ...sanitized, objectsCount: count };
    }
    default:
      return sanitized;
  }
}

/** Ensure a Command node carries RF-projected typed ports for React Flow editing. */
function materializeCommandPorts(n: PTBNode): PTBNode {
  if (n.kind !== 'Command') return n;
  const command = n as CommandNode;
  const ui = materializedUIFromPorts(command);
  const materialized = buildCommandPorts(
    command.command,
    ui,
    command.params?.runtime,
    command.ports,
  );
  const flowPorts = materialized
    .filter((port) => port.role === 'flow')
    .map((port) => ({ ...port }));
  const inputPorts = materialized
    .filter((port) => port.role === 'io' && port.direction === 'in')
    .map((port) => ({ ...port }));
  const outputPorts = mergeOutputPorts(command.ports ?? [], materialized);
  const seen = new Set<string>();
  const ports = [...flowPorts, ...inputPorts, ...outputPorts].filter((port) => {
    const key = keyedPort(port);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // Rebuild params from the supported UI keys plus the existing runtime block.
  // Unknown UI keys are intentionally not re-emitted into the RF projection.
  const runtime = command.params?.runtime;
  const params =
    ui !== undefined || runtime !== undefined
      ? {
          ...(ui !== undefined ? { ui } : {}),
          ...(runtime !== undefined ? { runtime } : {}),
        }
      : undefined;

  return {
    ...command,
    params,
    ports,
  };
}

function materializeNodeForRF(n: PTBNode): PTBNode {
  return materializeCommandPorts(
    materializeVarOutPort(materializeStructuralPorts(n)),
  );
}

function projectFlowHandleForRF(
  handle: string,
  endpoint: 'source' | 'target',
): string {
  const { baseId, typeStr } = parseHandleTypeSuffix(handle);
  if (!baseId) return handle;
  const projected =
    endpoint === 'source'
      ? baseId === 'out'
        ? 'next'
        : baseId
      : baseId === 'in'
        ? 'prev'
        : baseId;
  return typeStr ? `${projected}:${typeStr}` : projected;
}

function projectEdgeHandleForRF(
  edge: PTBEdge,
  endpoint: 'source' | 'target',
): string {
  const handle = endpoint === 'source' ? edge.sourceHandle : edge.targetHandle;
  return edge.kind === 'flow'
    ? projectFlowHandleForRF(handle, endpoint)
    : handle;
}

function projectFlowHandleForPTB(
  handle: string,
  endpoint: 'source' | 'target',
): string {
  const { baseId, typeStr } = parseHandleTypeSuffix(handle);
  if (!baseId) return handle;
  const projected =
    endpoint === 'source'
      ? baseId === 'next'
        ? 'out'
        : baseId
      : baseId === 'prev'
        ? 'in'
        : baseId;
  return typeStr ? `${projected}:${typeStr}` : projected;
}

function projectPortForPTB(nodeKind: PTBNode['kind'], port: Port): Port {
  if (port.role !== 'flow') return { ...port };
  if (nodeKind === 'Start' && port.direction === 'out') {
    return { ...port, id: 'out' };
  }
  if (nodeKind === 'End' && port.direction === 'in') {
    return { ...port, id: 'in' };
  }
  if (nodeKind === 'Command') {
    if (port.direction === 'in' && port.id === 'prev')
      return { ...port, id: 'in' };
    if (port.direction === 'out' && port.id === 'next')
      return { ...port, id: 'out' };
  }
  return { ...port };
}

function projectNodeForPTB(node: PTBNode): PTBNode {
  if (node.kind === 'Variable') return node;
  const ports = (node.ports ?? []).map((port) =>
    projectPortForPTB(node.kind, port),
  );
  return { ...node, ports };
}

function projectEdgeHandleForPTB(
  edgeKind: PTBEdge['kind'],
  handle: string,
  endpoint: 'source' | 'target',
): string {
  const base = parseHandleTypeSuffix(handle).baseId;
  if (!base) return handle;
  const projected =
    edgeKind === 'flow' ? projectFlowHandleForPTB(base, endpoint) : base;
  return projected;
}

/**
 * PTBGraph → React Flow
 * - Project sourceHandle/targetHandle into the RF handle namespace.
 * - dataType for badges comes from the materialized port types (more reliable than suffix).
 */
export function ptbToRF(graph: PTBGraph): {
  nodes: RFNode<RFNodeData>[];
  edges: RFEdge<RFEdgeData>[];
} {
  const matNodes = graph.nodes.map((n) => materializeNodeForRF(n));
  const portByNodeAndId = new Map<string, Port>();
  for (const node of matNodes) {
    for (const port of node.ports ?? []) {
      portByNodeAndId.set(`${node.id}:${port.id}`, port);
    }
  }

  const nodes: RFNode<RFNodeData>[] = matNodes.map((n) => ({
    id: n.id,
    type: mapPTBNodeToRFType(n),
    position: n.position ?? { x: 0, y: 0 },
    data: { label: n.label, ptbNode: n },
  }));

  const edges: RFEdge<RFEdgeData>[] = graph.edges.map((e) => {
    const projectedSourceHandle = projectEdgeHandleForRF(e, 'source');
    const projectedTargetHandle = projectEdgeHandleForRF(e, 'target');
    const sBase = parseHandleTypeSuffix(projectedSourceHandle).baseId;
    const tBase = parseHandleTypeSuffix(projectedTargetHandle).baseId;

    const sPort = sBase
      ? portByNodeAndId.get(`${e.source}:${sBase}`)
      : undefined;
    const tPort = tBase
      ? portByNodeAndId.get(`${e.target}:${tBase}`)
      : undefined;
    const sh = sPort ? buildHandleId(sPort) : projectedSourceHandle;
    const th = tPort ? buildHandleId(tPort) : projectedTargetHandle;

    const srcTypeStr = sPort?.dataType
      ? serializePTBType(sPort.dataType)
      : undefined;
    const edge: RFEdgeWithHandleAliases = {
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: sh,
      targetHandle: th,
      sourceHandleId: sh,
      targetHandleId: th,
      type: mapPTBEdgeToRFType(e),
      data: {
        dataType: srcTypeStr,
        cast: e.cast,
      },
    };
    return edge;
  });

  return { nodes, edges };
}

/** Single-node helper */
export function ptbNodeToRF(node: PTBNode): RFNode<RFNodeData> {
  const { nodes } = ptbToRF({ nodes: [node], edges: [] } as PTBGraph);
  return nodes[0];
}

/**
 * React Flow → PTBGraph
 * - Node SSOT prefers node.data.ptbNode; falls back to prev graph; last resorts to template ports.
 * - Edges are projected back into the PTBGraph handle namespace.
 * - Variable nodes must never receive fallback flow ports.
 */
export function rfToPTB(
  rfNodes: RFNode<RFNodeData>[],
  rfEdges: RFEdge<RFEdgeData>[],
  prev?: PTBGraph,
): PTBGraph {
  const prevNodeById = new Map((prev?.nodes ?? []).map((n) => [n.id, n]));

  const nodes: PTBNode[] = rfNodes.map((rn) => {
    const base = prevNodeById.get(rn.id);
    const dataNode = rn.data?.ptbNode as PTBNode | undefined;

    const kind = mapRFTypeToPTBKind(rn.type as string);
    const chosen = dataNode ?? base;

    const basePortsByKind =
      kind === 'Start'
        ? PORTS.start()
        : kind === 'End'
          ? PORTS.end()
          : kind === 'Variable'
            ? [] // Variable: no flow ports
            : PORTS.commandBase();

    return projectNodeForPTB({
      ...(chosen ?? ({} as PTBNode)),
      id: rn.id,
      kind,
      label:
        (rn.data?.label as string | undefined) ?? chosen?.label ?? base?.label,
      ports: chosen?.ports ?? base?.ports ?? basePortsByKind,
      position: rn.position ?? chosen?.position ?? base?.position,
    } as PTBNode);
  });

  const edges: PTBEdge[] = rfEdges.map((re) => {
    const { source, target } = extractHandles(re);
    const cast = (re.data as RFEdgeData | undefined)?.cast;
    const edgeKind = mapRFTypeToPTBEdgeKind(re.type as string);
    const sourceBase = parseHandleTypeSuffix(source).baseId;
    const targetBase = parseHandleTypeSuffix(target).baseId;
    if (!sourceBase || !targetBase) {
      throw new Error(
        `Cannot persist React Flow edge ${re.id}: source and target handles are required.`,
      );
    }
    const sourceHandle = projectEdgeHandleForPTB(
      edgeKind,
      sourceBase,
      'source',
    );
    const targetHandle = projectEdgeHandleForPTB(
      edgeKind,
      targetBase,
      'target',
    );

    return {
      id: re.id,
      kind: edgeKind,
      source: re.source,
      target: re.target,
      sourceHandle,
      targetHandle,
      ...(cast ? { cast } : {}),
    };
  });

  return { nodes, edges };
}

/* ------------------------- Mapping helpers ------------------------- */

function mapPTBNodeToRFType(n: PTBNode): string {
  switch (n.kind) {
    case 'Start':
      return 'ptb-start';
    case 'End':
      return 'ptb-end';
    case 'Variable':
      return 'ptb-var';
    case 'Command': {
      return n.command === 'moveCall' ? 'ptb-mvc' : 'ptb-cmd';
    }
  }
  const _exhaustive: never = n;
  return String(_exhaustive);
}

function mapRFTypeToPTBKind(rfType: string): PTBNode['kind'] {
  if (rfType === 'ptb-start') return 'Start';
  if (rfType === 'ptb-end') return 'End';
  if (rfType === 'ptb-var') return 'Variable';
  if (rfType === 'ptb-mvc') return 'Command';
  return 'Command';
}

function mapPTBEdgeToRFType(e: PTBEdge): string {
  return e.kind === 'flow' ? 'ptb-flow' : 'ptb-io';
}

function mapRFTypeToPTBEdgeKind(rfType?: string): PTBEdge['kind'] {
  return rfType === 'ptb-flow' ? 'flow' : 'io';
}
