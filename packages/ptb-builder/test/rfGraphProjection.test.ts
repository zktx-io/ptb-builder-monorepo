import type { Edge as RFEdge, Node as RFNode } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import type {
  CommandNode,
  Port,
  PTBGraph,
  PTBNode,
  PTBType,
  VariableNode,
} from '../src/ptb/graph/types';
import { ptbToRF, type RFNodeData, rfToPTB } from '../src/ptb/ptbAdapter';
import {
  projectEdgesForCurrentPorts,
  type RFEdgeData,
} from '../src/ui/rfGraphProjection';

const unknownType: PTBType = { kind: 'unknown' };

const scalar = (
  name: 'address' | 'bool' | 'id' | 'number' | 'string',
): PTBType => ({
  kind: 'scalar',
  name,
});

const moveNumeric = (
  width: 'u8' | 'u16' | 'u32' | 'u64' | 'u128' | 'u256',
): PTBType => ({
  kind: 'move_numeric',
  width,
});

function variable(id: string, varType: PTBType): VariableNode {
  return {
    id,
    kind: 'Variable',
    label: id,
    name: id,
    varType,
    ports: [
      {
        id: 'out',
        role: 'io',
        direction: 'out',
        dataType: varType,
      },
    ],
    position: { x: 0, y: 0 },
  };
}

function command(id: string, ports: Port[]): CommandNode {
  return {
    id,
    kind: 'Command',
    command: 'moveCall',
    label: id,
    params: {
      runtime: {
        target: '0x2::demo::call',
        resultCount: 1,
      },
    },
    ports,
    position: { x: 0, y: 0 },
  };
}

function rfNode(ptbNode: PTBNode): RFNode<RFNodeData> {
  return {
    id: ptbNode.id,
    type: ptbNode.kind === 'Variable' ? 'ptb-var' : 'ptb-cmd',
    position: { x: 0, y: 0 },
    data: { label: ptbNode.label, ptbNode },
  };
}

function ioIn(id: string, dataType: PTBType): Port {
  return { id, role: 'io', direction: 'in', dataType };
}

function ioOut(id: string, dataType: PTBType): Port {
  return { id, role: 'io', direction: 'out', dataType };
}

function ioEdge(
  id: string,
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string,
  data?: RFEdgeData,
): RFEdge<RFEdgeData> {
  return {
    id,
    type: 'ptb-io',
    source,
    target,
    sourceHandle,
    targetHandle,
    data,
  };
}

describe('React Flow edge projection', () => {
  it('keeps handle ids stable while refreshing stale edge type data from current ports', () => {
    const nodes = [
      rfNode(command('source', [ioOut('out_result', moveNumeric('u64'))])),
      rfNode(command('target', [ioIn('in_arg_0', moveNumeric('u64'))])),
    ];
    const [edge] = projectEdgesForCurrentPorts(nodes, [
      ioEdge(
        'edge',
        'source',
        'out_result:string',
        'target',
        'in_arg_0:string',
        { dataType: 'string', cast: { to: 'u8' } },
      ),
    ]);

    expect(edge.sourceHandle).toBe('out_result');
    expect(edge.targetHandle).toBe('in_arg_0');
    expect(edge.data).toEqual({
      dataType: 'u64',
      visualState: 'ok',
      reason: 'type-compatible',
    });
  });

  it('uses a known target port type for edge display without mutating an unknown source variable', () => {
    const source = variable('source', unknownType);
    const nodes = [
      rfNode(source),
      rfNode(command('target', [ioIn('in_recipient', scalar('address'))])),
    ];
    const [edge] = projectEdgesForCurrentPorts(nodes, [
      ioEdge('edge', 'source', 'out', 'target', 'in_recipient'),
    ]);

    expect(edge.sourceHandle).toBe('out');
    expect(edge.targetHandle).toBe('in_recipient');
    expect(edge.data).toEqual({
      dataType: 'address',
      visualState: 'pending',
      reason: 'type-pending',
    });
    expect(source.varType).toEqual(unknownType);
  });

  it('uses a known source port type for edge display when the target type is unresolved', () => {
    const nodes = [
      rfNode(variable('source', scalar('address'))),
      rfNode(command('target', [ioIn('in_arg_0', unknownType)])),
    ];
    const [edge] = projectEdgesForCurrentPorts(nodes, [
      ioEdge('edge', 'source', 'out', 'target', 'in_arg_0'),
    ]);

    expect(edge.sourceHandle).toBe('out');
    expect(edge.targetHandle).toBe('in_arg_0');
    expect(edge.data).toEqual({
      dataType: 'address',
      visualState: 'pending',
      reason: 'type-pending',
    });
  });

  it('drops edges that cannot be rendered because a node or port endpoint is missing', () => {
    const nodes = [
      rfNode(variable('source', scalar('address'))),
      rfNode(command('target', [ioIn('in_recipient', scalar('address'))])),
    ];

    expect(
      projectEdgesForCurrentPorts(nodes, [
        ioEdge('missing-port', 'source', 'missing', 'target', 'in_recipient'),
        ioEdge(
          'missing-node',
          'source',
          'out',
          'deleted-target',
          'in_recipient',
        ),
        ioEdge('ok', 'source', 'out', 'target', 'in_recipient'),
      ]).map((edge) => edge.id),
    ).toEqual(['ok']);
  });

  it('recomputes numeric casts from current source and target port types', () => {
    const nodes = [
      rfNode(variable('source', scalar('number'))),
      rfNode(command('target', [ioIn('in_amount_0', moveNumeric('u64'))])),
    ];
    const [edge] = projectEdgesForCurrentPorts(nodes, [
      ioEdge('edge', 'source', 'out:string', 'target', 'in_amount_0:string'),
    ]);

    expect(edge.sourceHandle).toBe('out');
    expect(edge.targetHandle).toBe('in_amount_0');
    expect(edge.data).toEqual({
      dataType: 'number',
      cast: { to: 'u64' },
      visualState: 'ok',
      reason: 'type-compatible',
    });
  });

  it('marks incompatible existing IO edges without deleting their projection', () => {
    const nodes = [
      rfNode(variable('source', scalar('string'))),
      rfNode(command('target', [ioIn('in_recipient', scalar('address'))])),
    ];
    const [edge] = projectEdgesForCurrentPorts(nodes, [
      ioEdge('edge', 'source', 'out', 'target', 'in_recipient'),
    ]);

    expect(edge.sourceHandle).toBe('out');
    expect(edge.targetHandle).toBe('in_recipient');
    expect(edge.data).toEqual({
      dataType: 'string',
      visualState: 'incompatible',
      reason: 'type-incompatible',
    });
  });

  it('does not persist RF visual edge state into PTBGraph edges', () => {
    const nodes = [
      rfNode(variable('source', scalar('string'))),
      rfNode(command('target', [ioIn('in_recipient', scalar('address'))])),
    ];
    const graph = rfToPTB(nodes, [
      ioEdge('edge', 'source', 'out', 'target', 'in_recipient', {
        dataType: 'string',
        visualState: 'incompatible',
        reason: 'type-incompatible',
      }),
    ]);

    expect(graph.edges[0]).toEqual({
      id: 'edge',
      kind: 'io',
      source: 'source',
      target: 'target',
      sourceHandle: 'out',
      targetHandle: 'in_recipient',
    });
  });

  it('uses the same projection policy when loading a PTB graph into React Flow', () => {
    const graph: PTBGraph = {
      nodes: [
        variable('source', unknownType),
        {
          ...command('target', [ioIn('in_recipient', scalar('address'))]),
          command: 'transferObjects',
          params: { ui: { objectsCount: 0 } },
        },
      ],
      edges: [
        {
          id: 'edge',
          kind: 'io',
          source: 'source',
          target: 'target',
          sourceHandle: 'out',
          targetHandle: 'in_recipient',
        },
      ],
    };

    const { edges } = ptbToRF(graph);

    expect(edges[0]?.sourceHandle).toBe('out');
    expect(edges[0]?.targetHandle).toBe('in_recipient');
    expect(edges[0]?.data).toEqual({
      dataType: 'address',
      visualState: 'pending',
      reason: 'type-pending',
    });
  });

  it('materializes MoveCall ports referenced by edges before signature hydration', () => {
    const graph: PTBGraph = {
      nodes: [command('producer', []), command('consumer', [])],
      edges: [
        {
          id: 'edge',
          kind: 'io',
          source: 'producer',
          target: 'consumer',
          sourceHandle: 'out_result',
          targetHandle: 'in_arg_0',
        },
      ],
    };

    const { nodes, edges } = ptbToRF(graph);
    const producer = nodes.find((node) => node.id === 'producer')?.data
      .ptbNode as CommandNode | undefined;
    const consumer = nodes.find((node) => node.id === 'consumer')?.data
      .ptbNode as CommandNode | undefined;

    expect(
      producer?.ports?.find((port) => port.id === 'out_result'),
    ).toMatchObject({
      role: 'io',
      direction: 'out',
    });
    expect(
      consumer?.ports?.find((port) => port.id === 'in_arg_0'),
    ).toMatchObject({
      role: 'io',
      direction: 'in',
      label: 'arg0',
    });
    expect(edges[0]?.sourceHandle).toBe('out_result');
    expect(edges[0]?.targetHandle).toBe('in_arg_0');
    expect(edges[0]?.data).toEqual({
      visualState: 'pending',
      reason: 'type-pending',
    });
  });
});
