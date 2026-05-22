import type { Edge as RFEdge, Node as RFNode } from '@xyflow/react';
import type { MovePackageSignatureEvidence } from '@zktx.io/ptb-model';
import {
  indexedInputHandleIndex,
  nestedResultHandle,
  parseMoveTypeTag,
  resolveMoveCallSignatureEvidence,
  RESULT_HANDLE_ID,
  toPTBTypeFromOpenSignature,
} from '@zktx.io/ptb-model';

import type { Port, PTBNode } from '../ptb/graph/types';
import { parseHandleTypeSuffix } from '../ptb/graph/types';
import type { RFNodeData } from '../ptb/ptbAdapter';
import { buildCommandPorts, buildMoveCallPorts } from '../ptb/registry';
import { extractHandles } from './handles/handleUtils';
import type { RFEdgeData } from './rfGraphProjection';

function splitMoveCallTarget(
  target: unknown,
): { packageId: string; moduleName: string; functionName: string } | undefined {
  if (typeof target !== 'string') return undefined;
  const [packageId, moduleName, functionName, extra] = target.split('::');
  if (!packageId || !moduleName || !functionName || extra !== undefined) {
    return undefined;
  }
  return { packageId, moduleName, functionName };
}

function collectTypeArgumentsByMoveCall(
  nodes: readonly RFNode<RFNodeData>[],
  edges: readonly RFEdge<RFEdgeData>[],
): Map<string, Map<number, string>> {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const result = new Map<string, Map<number, string>>();

  for (const edge of edges) {
    if (edge.type !== 'ptb-type') continue;
    const source = nodesById.get(edge.source)?.data?.ptbNode;
    const target = nodesById.get(edge.target)?.data?.ptbNode;
    if (source?.kind !== 'TypeArgument') continue;
    if (target?.kind !== 'Command' || target.command !== 'moveCall') continue;

    const targetHandle = parseHandleTypeSuffix(
      edge.targetHandle ?? undefined,
    ).baseId;
    const index = targetHandle
      ? indexedInputHandleIndex(targetHandle, 'type')
      : undefined;
    const value = parseMoveTypeTag(source.value);
    if (index === undefined || value === undefined) continue;

    const typeArguments = result.get(target.id) ?? new Map<number, string>();
    typeArguments.set(index, value);
    result.set(target.id, typeArguments);
  }

  return result;
}

function denseConnectedTypeArguments(
  connected: ReadonlyMap<number, string> | undefined,
): string[] {
  if (!connected || connected.size === 0) return [];
  const maxIndex = Math.max(...connected.keys());
  const values: string[] = [];
  for (let index = 0; index <= maxIndex; index += 1) {
    const value = connected.get(index);
    if (value === undefined) return [];
    values.push(value);
  }
  return values;
}

function portsSignature(ports: readonly Port[] | undefined): string {
  return JSON.stringify(
    (ports ?? []).map((port) => ({
      id: port.id,
      role: port.role,
      direction: port.direction,
      typeStr: port.typeStr,
      dataType: port.dataType,
      label: port.label,
    })),
  );
}

function portKey(port: Port): string {
  return `${port.role}:${port.direction}:${port.id}`;
}

function labelForMoveCallPort(port: Port): string | undefined {
  if (port.role === 'type' && port.direction === 'in') {
    const index = indexedInputHandleIndex(port.id, 'type');
    return index === undefined ? port.label : (port.label ?? `T${index}`);
  }
  if (port.role === 'io' && port.direction === 'in') {
    const index = indexedInputHandleIndex(port.id, 'arg');
    return index === undefined ? port.label : (port.label ?? `arg${index}`);
  }
  if (port.role === 'io' && port.direction === 'out') {
    return port.label ?? port.id;
  }
  return port.label;
}

function portReferencedByEdge(
  currentPorts: readonly Port[] | undefined,
  edge: RFEdge<RFEdgeData>,
  nodeId: string,
): Port | undefined {
  const endpoint =
    edge.source === nodeId
      ? 'source'
      : edge.target === nodeId
        ? 'target'
        : undefined;
  if (!endpoint) return undefined;
  const role =
    edge.type === 'ptb-type'
      ? 'type'
      : edge.type === 'ptb-io'
        ? 'io'
        : undefined;
  if (!role) return undefined;

  const handles = extractHandles(edge);
  const projectedHandle =
    endpoint === 'source' ? handles.source : handles.target;
  const id = parseHandleTypeSuffix(projectedHandle ?? undefined).baseId;
  if (!id) return undefined;

  const direction = endpoint === 'source' ? 'out' : 'in';
  if (role === 'io' && direction === 'out') return undefined;
  const existing = currentPorts?.find(
    (port) =>
      port.id === id && port.role === role && port.direction === direction,
  );
  if (existing) return existing;

  const port: Port = {
    id,
    role,
    direction,
    ...(role === 'io'
      ? {
          dataType: {
            kind: 'unknown',
            debugInfo: 'Referenced before MoveCall signature resolved',
          } as const,
        }
      : {}),
  };
  const label = labelForMoveCallPort(port);
  return label === undefined ? port : { ...port, label };
}

function mergeMoveCallSignaturePorts(
  currentPorts: readonly Port[] | undefined,
  signaturePorts: readonly Port[],
  nodeId: string,
  edges: readonly RFEdge<RFEdgeData>[],
): Port[] {
  const nextPorts = signaturePorts.map((port) => ({ ...port }));
  const seen = new Set(nextPorts.map(portKey));

  for (const edge of edges) {
    const referenced = portReferencedByEdge(currentPorts, edge, nodeId);
    if (!referenced) continue;
    const key = portKey(referenced);
    if (seen.has(key)) continue;
    seen.add(key);
    nextPorts.push({
      ...referenced,
      label: labelForMoveCallPort(referenced),
    });
  }

  return nextPorts;
}

function remapSingleResultMoveCallOutputEdges(
  edges: readonly RFEdge<RFEdgeData>[],
  singleResultMoveCallIds: ReadonlySet<string>,
): RFEdge<RFEdgeData>[] {
  let changed = false;
  const nestedZeroHandle = nestedResultHandle(0);
  const nextEdges = edges.flatMap((edge) => {
    if (edge.type !== 'ptb-io') return [edge];
    if (!singleResultMoveCallIds.has(edge.source)) return [edge];
    const handles = extractHandles(edge);
    const sourceBase = parseHandleTypeSuffix(
      handles.source ?? undefined,
    ).baseId;
    if (sourceBase === RESULT_HANDLE_ID) return [edge];
    if (sourceBase !== nestedZeroHandle) {
      changed = true;
      return [];
    }
    changed = true;
    return [
      {
        ...edge,
        sourceHandle: RESULT_HANDLE_ID,
        sourceHandleId: RESULT_HANDLE_ID,
      },
    ];
  });
  return changed ? nextEdges : (edges as RFEdge<RFEdgeData>[]);
}

export function refreshMoveCallPortsFromSignatures(
  nodes: readonly RFNode<RFNodeData>[],
  edges: readonly RFEdge<RFEdgeData>[],
  moveSignatures: MovePackageSignatureEvidence | undefined,
): { nodes: RFNode<RFNodeData>[]; edges: RFEdge<RFEdgeData>[] } | undefined {
  if (!moveSignatures) return undefined;
  const typeArgumentsByMoveCall = collectTypeArgumentsByMoveCall(nodes, edges);
  const singleResultMoveCallIds = new Set<string>();
  let changed = false;

  const nextNodes = nodes.map((rfNode) => {
    const ptbNode = rfNode.data?.ptbNode;
    if (ptbNode?.kind !== 'Command' || ptbNode.command !== 'moveCall') {
      return rfNode;
    }

    const target = splitMoveCallTarget(ptbNode.params?.runtime?.target);
    if (!target) return rfNode;
    const connected = typeArgumentsByMoveCall.get(ptbNode.id);
    const signatureTypeArguments = denseConnectedTypeArguments(connected);
    const evidence = resolveMoveCallSignatureEvidence({
      packageId: target.packageId,
      moduleName: target.moduleName,
      functionName: target.functionName,
      moveSignatures,
      typeArguments: signatureTypeArguments,
      explicitResultCount: ptbNode.params?.runtime?.resultCount,
    });
    if (!evidence) return rfNode;
    const { signature } = evidence;
    const nextResultCount = signature.returns.length;
    if (nextResultCount === 1) {
      singleResultMoveCallIds.add(ptbNode.id);
    }
    const completeTypeArguments =
      evidence.typeArgumentsComplete && signature.typeParameterCount > 0
        ? Array.from(
            { length: signature.typeParameterCount },
            (_value, index) => connected!.get(index)!,
          )
        : [];

    const inputs = signature.parameters.map((openSignature) =>
      toPTBTypeFromOpenSignature(openSignature, completeTypeArguments),
    );
    const outputs = signature.returns.map((openSignature) =>
      toPTBTypeFromOpenSignature(openSignature, completeTypeArguments),
    );
    const nextRuntime = {
      ...ptbNode.params?.runtime,
      resultCount: nextResultCount,
    };
    const signaturePorts = buildCommandPorts(
      'moveCall',
      ptbNode.params?.ui,
      nextRuntime,
      buildMoveCallPorts(inputs, outputs, signature.typeParameterCount),
    );
    const nextPorts = mergeMoveCallSignaturePorts(
      ptbNode.ports,
      signaturePorts,
      ptbNode.id,
      edges,
    );
    const resultCountChanged =
      ptbNode.params?.runtime?.resultCount !== nextResultCount;
    if (
      portsSignature(nextPorts) === portsSignature(ptbNode.ports) &&
      !resultCountChanged
    ) {
      return rfNode;
    }

    changed = true;
    const nextPTBNode: PTBNode = {
      ...ptbNode,
      params: {
        ...ptbNode.params,
        runtime: nextRuntime,
      },
      ports: nextPorts,
    };
    return {
      ...rfNode,
      data: {
        ...rfNode.data,
        ptbNode: nextPTBNode,
      },
    };
  });

  const nextEdges = remapSingleResultMoveCallOutputEdges(
    edges,
    singleResultMoveCallIds,
  );

  return changed || nextEdges !== edges
    ? { nodes: nextNodes, edges: nextEdges }
    : undefined;
}
