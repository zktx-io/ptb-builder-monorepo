import { describe, expect, it } from 'vitest';

import { autoLayoutFlow } from '../src/ui/utils/autoLayout';

const baseNode = (
  id: string,
  kind: string,
  extra: Record<string, unknown> = {},
) =>
  ({
    id,
    position: { x: 0, y: 0 },
    data: {
      ptbNode: {
        id,
        kind,
        ...extra,
      },
    },
  }) as any;

describe('autoLayoutFlow', () => {
  it('uses rendered React Flow node height when stacking variable nodes', async () => {
    const nodes = [
      baseNode('start', 'Start'),
      baseNode('var-0', 'Variable', {
        varType: { kind: 'scalar', name: 'string' },
      }),
      {
        ...baseNode('var-1', 'Variable', {
          varType: { kind: 'scalar', name: 'string' },
        }),
        measured: { width: 180, height: 240 },
      },
      baseNode('var-2', 'Variable', {
        varType: { kind: 'scalar', name: 'string' },
      }),
      baseNode('end', 'End'),
    ];

    const positions = await autoLayoutFlow(nodes, [], {});

    expect(positions['var-2']!.y - positions['var-1']!.y).toBe(264);
  });

  it('orders MoveCall TypeArgument and value input nodes by target handle order', async () => {
    const nodes = [
      baseNode('start', 'Start'),
      baseNode('var-0', 'Variable', {
        varType: { kind: 'move_numeric', width: 'u64' },
      }),
      baseNode('type-1', 'TypeArgument', {
        value: '0x2::sui::SUI',
        ports: [{ id: 'out_type', role: 'type', direction: 'out' }],
      }),
      baseNode('var-1', 'Variable', {
        varType: { kind: 'move_numeric', width: 'u64' },
      }),
      baseNode('type-0', 'TypeArgument', {
        value: '0x2::coin::Coin<0x2::sui::SUI>',
        ports: [{ id: 'out_type', role: 'type', direction: 'out' }],
      }),
      baseNode('call', 'Command', {
        command: 'moveCall',
        ports: [
          { id: 'prev', role: 'flow', direction: 'in' },
          { id: 'next', role: 'flow', direction: 'out' },
          { id: 'in_type_0', role: 'type', direction: 'in' },
          { id: 'in_type_1', role: 'type', direction: 'in' },
          { id: 'in_arg_0', role: 'io', direction: 'in' },
          { id: 'in_arg_1', role: 'io', direction: 'in' },
          { id: 'out_result', role: 'io', direction: 'out' },
        ],
      }),
      baseNode('end', 'End'),
    ];
    const edges = [
      {
        id: 'flow-start-call',
        type: 'ptb-flow',
        source: 'start',
        target: 'call',
      },
      {
        id: 'flow-call-end',
        type: 'ptb-flow',
        source: 'call',
        target: 'end',
      },
      {
        id: 'type-0-call',
        type: 'ptb-type',
        source: 'type-0',
        sourceHandle: 'out_type',
        target: 'call',
        targetHandle: 'in_type_0',
      },
      {
        id: 'type-1-call',
        type: 'ptb-type',
        source: 'type-1',
        sourceHandle: 'out_type',
        target: 'call',
        targetHandle: 'in_type_1',
      },
      {
        id: 'var-0-call',
        type: 'ptb-io',
        source: 'var-0',
        sourceHandle: 'out',
        target: 'call',
        targetHandle: 'in_arg_0',
      },
      {
        id: 'var-1-call',
        type: 'ptb-io',
        source: 'var-1',
        sourceHandle: 'out',
        target: 'call',
        targetHandle: 'in_arg_1',
      },
    ] as any[];

    const positions = await autoLayoutFlow(nodes, edges, {});

    expect(positions['type-0']!.y).toBeLessThan(positions['type-1']!.y);
    expect(positions['type-1']!.y).toBeLessThan(positions['var-0']!.y);
    expect(positions['var-0']!.y).toBeLessThan(positions['var-1']!.y);
  });
});
