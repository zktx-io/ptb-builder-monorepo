import type { Node as RFNode } from '@xyflow/react';
import {
  type PTBGraph,
  ptbTypesEqual,
  type VariableNode,
} from '@zktx.io/ptb-model';

import { serializePTBType } from '../ptb/graph/types';
import type { RFNodeData } from '../ptb/ptbAdapter';

export function applyInferredVariableTypesToRFNodes(
  nodes: RFNode<RFNodeData>[],
  inferredGraph: PTBGraph,
): RFNode<RFNodeData>[] {
  const inferredVariables = new Map(
    inferredGraph.nodes
      .filter((node): node is VariableNode => node.kind === 'Variable')
      .map((node) => [node.id, node]),
  );
  let changed = false;

  const nextNodes = nodes.map((rfNode) => {
    const ptbNode = rfNode.data?.ptbNode;
    if (ptbNode?.kind !== 'Variable') return rfNode;
    const inferred = inferredVariables.get(ptbNode.id);
    if (!inferred || inferred.varType.kind === 'unknown') return rfNode;
    if (ptbTypesEqual(ptbNode.varType, inferred.varType)) return rfNode;

    changed = true;
    const nextPTBNode: VariableNode = {
      ...ptbNode,
      varType: inferred.varType,
      ports: ptbNode.ports.map((port) =>
        port.role === 'io' && port.direction === 'out'
          ? {
              ...port,
              dataType: inferred.varType,
              typeStr: serializePTBType(inferred.varType),
            }
          : port,
      ),
    };

    return {
      ...rfNode,
      data: {
        ...rfNode.data,
        ptbNode: nextPTBNode,
      },
    };
  });

  return changed ? nextNodes : nodes;
}
