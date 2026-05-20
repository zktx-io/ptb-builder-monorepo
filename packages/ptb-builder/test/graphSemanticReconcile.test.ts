import type { Node as RFNode } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import type { PTBGraph, PTBType, VariableNode } from '../src/ptb/graph/types';
import type { RFNodeData } from '../src/ptb/ptbAdapter';
import { applyInferredVariableTypesToRFNodes } from '../src/ui/graphSemanticReconcile';

const unknownType: PTBType = { kind: 'unknown', debugInfo: 'Pure' };
const addressType: PTBType = { kind: 'scalar', name: 'address' };

describe('graph semantic reconciliation', () => {
  it('applies model-inferred input types to RF variable output ports only', () => {
    const source = variable('input', unknownType, {
      kind: 'Pure',
      bytes: 'AA==',
    });
    const nodes: RFNode<RFNodeData>[] = [rfNode(source)];
    const inferredGraph: PTBGraph = {
      nodes: [variable('input', addressType, { kind: 'Pure', bytes: 'AA==' })],
      edges: [],
    };

    const [next] = applyInferredVariableTypesToRFNodes(nodes, inferredGraph);
    const nextNode = next?.data?.ptbNode as VariableNode | undefined;

    expect(nextNode?.varType).toEqual(addressType);
    expect(nextNode?.rawInput).toEqual({ kind: 'Pure', bytes: 'AA==' });
    expect(nextNode?.value).toBeUndefined();
    expect(nextNode?.ports).toEqual([
      {
        id: 'out',
        role: 'io',
        direction: 'out',
        dataType: addressType,
        typeStr: 'address',
      },
    ]);
  });
});

function variable(
  id: string,
  varType: PTBType,
  rawInput?: VariableNode['rawInput'],
): VariableNode {
  return {
    id,
    kind: 'Variable',
    label: id,
    name: id,
    varType,
    ...(rawInput ? { rawInput } : {}),
    ports: [{ id: 'out', role: 'io', direction: 'out', dataType: varType }],
    position: { x: 0, y: 0 },
  };
}

function rfNode(ptbNode: VariableNode): RFNode<RFNodeData> {
  return {
    id: ptbNode.id,
    type: 'ptb-var',
    position: { x: 0, y: 0 },
    data: { label: ptbNode.label, ptbNode },
  };
}
