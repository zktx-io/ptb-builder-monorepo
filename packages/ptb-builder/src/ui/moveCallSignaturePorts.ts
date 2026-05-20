import type { Edge as RFEdge, Node as RFNode } from '@xyflow/react';
import type { MovePackageSignatureEvidence } from '@zktx.io/ptb-model';
import {
  indexedInputHandleIndex,
  parseMoveTypeTag,
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

export function refreshMoveCallPortsFromSignatures(
  nodes: readonly RFNode<RFNodeData>[],
  edges: readonly RFEdge<RFEdgeData>[],
  moveSignatures: MovePackageSignatureEvidence | undefined,
): RFNode<RFNodeData>[] | undefined {
  if (!moveSignatures) return undefined;
  const typeArgumentsByMoveCall = collectTypeArgumentsByMoveCall(nodes, edges);
  let changed = false;

  const nextNodes = nodes.map((rfNode) => {
    const ptbNode = rfNode.data?.ptbNode;
    if (ptbNode?.kind !== 'Command' || ptbNode.command !== 'moveCall') {
      return rfNode;
    }

    const target = splitMoveCallTarget(ptbNode.params?.runtime?.target);
    if (!target) return rfNode;
    const signature =
      moveSignatures[target.packageId]?.[target.moduleName]?.[
        target.functionName
      ];
    if (!signature) return rfNode;

    const connected = typeArgumentsByMoveCall.get(ptbNode.id);
    const completeTypeArguments =
      signature.typeParameterCount > 0 &&
      Array.from({ length: signature.typeParameterCount }).every(
        (_value, index) => connected?.has(index),
      )
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
    const signaturePorts = buildCommandPorts(
      'moveCall',
      ptbNode.params?.ui,
      ptbNode.params?.runtime,
      buildMoveCallPorts(inputs, outputs, signature.typeParameterCount),
    );
    const nextPorts = mergeMoveCallSignaturePorts(
      ptbNode.ports,
      signaturePorts,
      ptbNode.id,
      edges,
    );
    if (portsSignature(nextPorts) === portsSignature(ptbNode.ports)) {
      return rfNode;
    }

    changed = true;
    const nextPTBNode: PTBNode = {
      ...ptbNode,
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

  return changed ? nextNodes : undefined;
}
