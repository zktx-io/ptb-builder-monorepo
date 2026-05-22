import { describe, expect, it } from 'vitest';

import type { PTBGraph } from '../src/ptb/graph/types';
import { autoLayoutFlow } from '../src/ui/utils/autoLayout';
import { autoLayoutPTBGraph } from '../src/ui/utils/ptbGraphAutoLayout';

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

  it('does not estimate vector node height from vector item count', async () => {
    const nodes = [
      baseNode('start', 'Start'),
      baseNode('var-0', 'Variable', {
        varType: { kind: 'vector', elem: { kind: 'scalar', name: 'string' } },
        value: Array.from({ length: 50 }, (_, index) => `item-${index}`),
      }),
      baseNode('var-1', 'Variable', {
        varType: { kind: 'scalar', name: 'string' },
      }),
      baseNode('end', 'End'),
    ];

    const positions = await autoLayoutFlow(nodes, [], {});

    expect(positions['var-1']!.y - positions['var-0']!.y).toBe(124);
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

    expect(positions.start!.x).toBeLessThan(positions.call!.x);
    expect(positions.call!.x).toBeLessThan(positions.end!.x);
    expect(positions.start!.y).toBe(positions.call!.y);
    expect(positions.end!.y).toBe(positions.call!.y);
    expect(positions['type-0']!.y).toBeLessThan(positions['type-1']!.y);
    expect(positions['type-1']!.y).toBeLessThan(positions['var-0']!.y);
    expect(positions['var-0']!.y).toBeLessThan(positions['var-1']!.y);
  });

  it('lays out a PTBGraph before React Flow rehydrate', async () => {
    const graph: PTBGraph = {
      nodes: [
        {
          id: 'start',
          kind: 'Start',
          ports: [{ id: 'out', role: 'flow', direction: 'out' }],
          position: { x: 0, y: 0 },
        },
        {
          id: 'cmd-0',
          kind: 'Command',
          command: 'transferObjects',
          ports: [
            { id: 'in', role: 'flow', direction: 'in' },
            { id: 'out', role: 'flow', direction: 'out' },
          ],
          position: { x: 0, y: 120 },
        },
        {
          id: 'end',
          kind: 'End',
          ports: [{ id: 'in', role: 'flow', direction: 'in' }],
          position: { x: 0, y: 240 },
        },
      ],
      edges: [
        {
          id: 'flow-start-cmd-0',
          kind: 'flow',
          source: 'start',
          sourceHandle: 'out',
          target: 'cmd-0',
          targetHandle: 'in',
        },
        {
          id: 'flow-cmd-0-end',
          kind: 'flow',
          source: 'cmd-0',
          sourceHandle: 'out',
          target: 'end',
          targetHandle: 'in',
        },
      ],
    };

    const result = await autoLayoutPTBGraph(graph, {
      targetCenter: { x: 400, y: 325 },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const byId = new Map(result.graph.nodes.map((node) => [node.id, node]));
    expect(byId.get('start')!.position!.x).toBeLessThan(
      byId.get('cmd-0')!.position!.x,
    );
    expect(byId.get('cmd-0')!.position!.x).toBeLessThan(
      byId.get('end')!.position!.x,
    );
  });
});
