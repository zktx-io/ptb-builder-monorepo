import type { Edge as RFEdge } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import type { PTBNode, PTBType } from '../src/ptb/graph/types';
import type { RFEdgeData } from '../src/ptb/ptbAdapter';
import {
  filterConflictingIOEdges,
  pruneExistingIOEdges,
} from '../src/ui/edgePruning';

const scalar = (
  name: 'address' | 'bool' | 'id' | 'number' | 'string',
): PTBType => ({
  kind: 'scalar',
  name,
});

const moveNumeric = (
  width: 'u8' | 'u16' | 'u32' | 'u64' | 'u128' | 'u256',
): PTBType => ({ kind: 'move_numeric', width });

const option = (elem: PTBType): PTBType => ({ kind: 'option', elem });

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

describe('IO edge pruning', () => {
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

  it('keeps compatible IO edges after stripping React Flow type suffixes', () => {
    const nodes = [
      node('source', { out: scalar('number') }),
      node('target', { in_amount_0: moveNumeric('u64') }),
    ].map(rfNode);
    const edges = [
      {
        ...edge('compatible', 'source', '', 'target', ''),
        sourceHandleId: 'out:number',
        targetHandleId: 'in_amount_0:u64',
      } as RFEdge<RFEdgeData>,
    ];

    expect(pruneExistingIOEdges(nodes, edges).map((item) => item.id)).toEqual([
      'compatible',
    ]);
  });

  it('drops incompatible option and non-option IO edges', () => {
    const nodes = [
      node('source', { out: option(scalar('address')) }),
      node('target', { in_recipient: scalar('address') }),
    ].map(rfNode);
    const edges = [
      edge(
        'incompatible',
        'source',
        'out:option<address>',
        'target',
        'in_recipient:address',
      ),
    ];

    expect(pruneExistingIOEdges(nodes, edges)).toEqual([]);
  });

  it('preserves IO edges with unknown endpoint types and non-IO edges', () => {
    const nodes = [
      node('source', { out: unknownType }),
      node('target', { in_recipient: scalar('address') }),
    ].map(rfNode);
    const edges = [
      edge('unknown-io', 'source', 'out', 'target', 'in_recipient'),
      edge('flow', 'source', 'flow-out', 'target', 'flow-in', 'ptb-flow'),
    ];

    expect(pruneExistingIOEdges(nodes, edges).map((item) => item.id)).toEqual([
      'unknown-io',
      'flow',
    ]);
  });

  it('drops IO edges with missing endpoint ports', () => {
    const nodes = [
      node('source', { out: scalar('address') }),
      node('target', { in_recipient: scalar('address') }),
    ].map(rfNode);
    const edges = [
      edge('dangling', 'source', 'missing', 'target', 'in_recipient'),
      edge('compatible', 'source', 'out', 'target', 'in_recipient'),
    ];

    expect(pruneExistingIOEdges(nodes, edges).map((item) => item.id)).toEqual([
      'compatible',
    ]);
  });
});
