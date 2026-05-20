import type { Edge as RFEdge } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import type { PTBNode, PTBType } from '../src/ptb/graph/types';
import {
  decideConnection,
  filterConflictingIOEdges,
} from '../src/ui/edgeLifecycle';
import type { RFEdgeData } from '../src/ui/rfGraphProjection';

const scalar = (
  name: 'address' | 'bool' | 'id' | 'number' | 'string',
): PTBType => ({
  kind: 'scalar',
  name,
});

describe('connection decision', () => {
  it('creates incompatible IO edges so diagnostics can explain the problem', () => {
    const nodes = [
      node('source', { out: scalar('string') }),
      node('target', { in_recipient: scalar('address') }),
    ].map(rfNode);

    const decision = decideConnection(nodes, [], {
      source: 'source',
      sourceHandle: 'out',
      target: 'target',
      targetHandle: 'in_recipient',
    });

    expect(decision).toMatchObject({
      action: 'create',
      edgeType: 'ptb-io',
      data: {
        dataType: 'string',
        visualState: 'incompatible',
        reason: 'type-incompatible',
      },
    });
  });

  it('creates pending IO edges while endpoint types are unresolved', () => {
    const nodes = [
      node('source', { out: unknownType }),
      node('target', { in_recipient: scalar('address') }),
    ].map(rfNode);

    const decision = decideConnection(nodes, [], {
      source: 'source',
      sourceHandle: 'out',
      target: 'target',
      targetHandle: 'in_recipient',
    });

    expect(decision).toMatchObject({
      action: 'create',
      edgeType: 'ptb-io',
      data: {
        dataType: 'address',
        visualState: 'pending',
        reason: 'type-pending',
      },
    });
  });

  it('rejects self connections before edge creation', () => {
    const nodes = [node('source', { out: scalar('address') })].map(rfNode);

    expect(
      decideConnection(nodes, [], {
        source: 'source',
        sourceHandle: 'out',
        target: 'source',
        targetHandle: 'out',
      }),
    ).toEqual({ action: 'reject', reason: 'self-loop' });
  });
});

const unknownType: PTBType = { kind: 'unknown' };

function node(id: string, ports: Record<string, PTBType>): PTBNode {
  return {
    id,
    kind: 'Variable',
    label: id,
    name: id,
    varType: scalar('number'),
    ports: Object.entries(ports).map(([portId, dataType]) => ({
      id: portId,
      role: 'io',
      direction: portId.startsWith('in_') ? 'in' : 'out',
      dataType,
    })),
    position: { x: 0, y: 0 },
  };
}

function rfNode(ptbNode: PTBNode) {
  return {
    id: ptbNode.id,
    data: { ptbNode },
  };
}

function edge(
  id: string,
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string,
  type = 'ptb-io',
): RFEdge<RFEdgeData> {
  return {
    id,
    type,
    source,
    target,
    sourceHandle,
    targetHandle,
  };
}

describe('IO edge replacement', () => {
  it('replaces existing IO target edges by base handle, ignoring type suffixes', () => {
    const edges = [
      edge(
        'same-base',
        'old-source',
        'out:number',
        'target',
        'in_amount_0:u64',
      ),
      edge(
        'other-base',
        'other-source',
        'out:number',
        'target',
        'in_amount_1:u64',
      ),
      edge('flow', 'a', 'next', 'b', 'prev', 'ptb-flow'),
    ];

    const filtered = filterConflictingIOEdges(edges, {
      source: 'new-source',
      target: 'target',
      sourceHandle: 'out:number',
      targetHandle: 'in_amount_0:number',
    });

    expect(filtered?.map((item) => item.id)).toEqual(['other-base', 'flow']);
  });

  it('uses local handle aliases when replacing existing IO target edges', () => {
    const edges = [
      {
        ...edge('same-base', 'old-source', 'out:number', 'target', ''),
        targetHandle: undefined,
        targetHandleId: 'in_amount_0:u64',
      } as RFEdge<RFEdgeData>,
      edge(
        'other-base',
        'other-source',
        'out:number',
        'target',
        'in_amount_1:u64',
      ),
    ];

    const filtered = filterConflictingIOEdges(edges, {
      source: 'new-source',
      target: 'target',
      sourceHandle: 'out:number',
      targetHandle: undefined,
      targetHandleId: 'in_amount_0:number',
    } as any);

    expect(filtered?.map((item) => item.id)).toEqual(['other-base']);
  });
});
