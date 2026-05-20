import type { Edge as RFEdge, Node as RFNode } from '@xyflow/react';
import type { MovePackageSignatureEvidence } from '@zktx.io/ptb-model';
import {
  indexedInputHandleIndex,
  parseMoveTypeTag,
  toPTBTypeFromOpenSignature,
} from '@zktx.io/ptb-model';

import type { Port, PTBNode } from '../ptb/graph/types';
import { parseHandleTypeSuffix } from '../ptb/graph/types';
import type { RFEdgeData, RFNodeData } from '../ptb/ptbAdapter';
import { buildCommandPorts, buildMoveCallPorts } from '../ptb/registry';

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
    const nextPorts = buildCommandPorts(
      'moveCall',
      ptbNode.params?.ui,
      ptbNode.params?.runtime,
      buildMoveCallPorts(inputs, outputs, signature.typeParameterCount),
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
