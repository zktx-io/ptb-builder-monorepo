import { rawTransactionToIR, transactionIRToGraph } from '@zktx.io/ptb-model';
import { describe, expect, it } from 'vitest';

import { makeCommandNode } from '../src/ptb/factories';
import type {
  CommandNode,
  CommandUIParams,
  Port,
  PTBGraph,
} from '../src/ptb/graph/types';
import { ptbToRF, rfToPTB } from '../src/ptb/ptbAdapter';
import { buildCommandPorts, patchCommandUIParams } from '../src/ptb/registry';

function commandPorts(raw: unknown, command: CommandNode['command']): Port[] {
  const ir = rawTransactionToIR(raw);
  const graph = transactionIRToGraph(ir);
  const { nodes } = ptbToRF(graph);
  const node = nodes.find(
    (rfNode) =>
      rfNode.data?.ptbNode?.kind === 'Command' &&
      rfNode.data.ptbNode.command === command,
  );
  const ptbNode = node?.data?.ptbNode;
  return ptbNode?.kind === 'Command' ? (ptbNode.ports ?? []) : [];
}

function portIds(ports: readonly Port[]): string[] {
  return ports.map((port) => port.id);
}

describe('ptbToRF command port materialization', () => {
  it('preserves all loaded SplitCoins amount ports', () => {
    const ports = commandPorts(
      {
        inputs: [
          { kind: 'Pure', bytes: 'CgAAAAAAAAA=' },
          { kind: 'Pure', bytes: 'FAAAAAAAAAA=' },
          { kind: 'Pure', bytes: 'HgAAAAAAAAA=' },
        ],
        commands: [
          {
            kind: 'SplitCoins',
            coin: { kind: 'GasCoin' },
            amounts: [
              { kind: 'Input', index: 0 },
              { kind: 'Input', index: 1 },
              { kind: 'Input', index: 2 },
            ],
          },
        ],
      },
      'splitCoins',
    );

    expect(portIds(ports)).toEqual(
      expect.arrayContaining(['in_amount_0', 'in_amount_1', 'in_amount_2']),
    );
    expect(ports.find((port) => port.id === 'in_amount_2')?.dataType).toEqual({
      kind: 'move_numeric',
      width: 'u64',
    });
  });

  it('preserves all loaded TransferObjects object ports', () => {
    const ports = commandPorts(
      {
        inputs: [
          {
            kind: 'Pure',
            bytes: '/wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA8=',
          },
        ],
        commands: [
          {
            kind: 'TransferObjects',
            objects: [
              { kind: 'GasCoin' },
              { kind: 'GasCoin' },
              { kind: 'GasCoin' },
              { kind: 'GasCoin' },
            ],
            address: { kind: 'Input', index: 0 },
          },
        ],
      },
      'transferObjects',
    );

    expect(portIds(ports)).toEqual(
      expect.arrayContaining([
        'in_object_0',
        'in_object_1',
        'in_object_2',
        'in_object_3',
      ]),
    );
    expect(ports.find((port) => port.id === 'in_object_3')?.dataType).toEqual({
      kind: 'object',
    });
  });

  it('preserves all loaded MergeCoins source ports', () => {
    const ports = commandPorts(
      {
        inputs: [],
        commands: [
          {
            kind: 'MergeCoins',
            destination: { kind: 'GasCoin' },
            sources: [
              { kind: 'GasCoin' },
              { kind: 'GasCoin' },
              { kind: 'GasCoin' },
            ],
          },
        ],
      },
      'mergeCoins',
    );

    expect(portIds(ports)).toEqual(
      expect.arrayContaining(['in_source_0', 'in_source_1', 'in_source_2']),
    );
    expect(ports.find((port) => port.id === 'in_source_2')?.dataType).toEqual({
      kind: 'object',
    });
  });

  it('preserves all loaded MakeMoveVec element ports with concrete runtime type', () => {
    const ports = commandPorts(
      {
        inputs: [
          { kind: 'Pure', bytes: 'CgAAAAAAAAA=' },
          { kind: 'Pure', bytes: 'FAAAAAAAAAA=' },
          { kind: 'Pure', bytes: 'HgAAAAAAAAA=' },
        ],
        commands: [
          {
            kind: 'MakeMoveVec',
            type: 'u64',
            elements: [
              { kind: 'Input', index: 0 },
              { kind: 'Input', index: 1 },
              { kind: 'Input', index: 2 },
            ],
          },
        ],
      },
      'makeMoveVec',
    );

    expect(portIds(ports)).toEqual(
      expect.arrayContaining(['in_elem_0', 'in_elem_1', 'in_elem_2']),
    );
    expect(ports.find((port) => port.id === 'in_elem_2')?.dataType).toEqual({
      kind: 'move_numeric',
      width: 'u64',
    });
  });

  it('labels loaded MoveCall positional ports before signature hydration', () => {
    const ports = commandPorts(
      {
        inputs: [
          { $kind: 'Pure', Pure: { bytes: 'CgAAAAAAAAA=' } },
          { $kind: 'Pure', Pure: { bytes: 'FAAAAAAAAAA=' } },
        ],
        commands: [
          {
            $kind: 'MoveCall',
            MoveCall: {
              package:
                '0x0000000000000000000000000000000000000000000000000000000000000002',
              module: 'coin',
              function: 'value',
              typeArguments: [
                '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI',
              ],
              arguments: [
                { $kind: 'Input', Input: 0 },
                { $kind: 'Input', Input: 1 },
              ],
            },
          },
        ],
      },
      'moveCall',
    );

    expect(ports.find((port) => port.id === 'in_type_0')?.label).toBe('T0');
    expect(ports.find((port) => port.id === 'in_arg_0')?.label).toBe('arg0');
    expect(ports.find((port) => port.id === 'in_arg_1')?.label).toBe('arg1');
  });

  it('preserves loaded typed zero-element MakeMoveVec ports', () => {
    const ports = commandPorts(
      {
        inputs: [],
        commands: [
          {
            kind: 'MakeMoveVec',
            type: 'u64',
            elements: [],
          },
        ],
      },
      'makeMoveVec',
    );

    expect(portIds(ports)).toEqual(['prev', 'next', 'out_result']);
  });

  it('uses loaded indexed ports over stale UI count params', () => {
    const graph: PTBGraph = {
      nodes: [
        {
          id: 'split',
          kind: 'Command',
          label: 'SplitCoins',
          command: 'splitCoins',
          params: { ui: { amountsCount: 1 } },
          ports: [
            { id: 'in', role: 'flow', direction: 'in' },
            { id: 'out', role: 'flow', direction: 'out' },
            { id: 'in_coin', role: 'io', direction: 'in' },
            { id: 'in_amount_0', role: 'io', direction: 'in' },
            { id: 'in_amount_1', role: 'io', direction: 'in' },
            { id: 'in_amount_2', role: 'io', direction: 'in' },
            { id: 'out_0', role: 'io', direction: 'out' },
            { id: 'out_1', role: 'io', direction: 'out' },
            { id: 'out_2', role: 'io', direction: 'out' },
          ],
        },
      ],
      edges: [],
    };

    const { nodes } = ptbToRF(graph);
    const split = nodes[0]?.data?.ptbNode;
    const ports = split?.kind === 'Command' ? split.ports : [];

    expect(portIds(ports)).toEqual(
      expect.arrayContaining(['in_amount_0', 'in_amount_1', 'in_amount_2']),
    );
    expect(ports.filter((port) => port.id.startsWith('out_'))).toHaveLength(3);
    expect(split?.kind === 'Command' ? split.params?.ui : undefined).toEqual({
      amountsCount: 3,
    });

    const persisted = rfToPTB(nodes, [], graph).nodes[0];
    expect(
      persisted?.kind === 'Command' ? persisted.params?.ui : undefined,
    ).toEqual({ amountsCount: 3 });
  });

  it('keeps MakeMoveVec zero-element authoring only when the runtime type is explicit', () => {
    const typed = buildCommandPorts(
      'makeMoveVec',
      { elemsCount: 0 },
      { type: 'u64' },
    );
    const untyped = buildCommandPorts('makeMoveVec', { elemsCount: 0 });

    expect(portIds(typed)).toEqual(['prev', 'next', 'out_result']);
    expect(portIds(untyped)).toEqual([
      'prev',
      'next',
      'in_elem_0',
      'out_result',
    ]);
  });

  it('uses model-owned handles for Publish and Upgrade ports', () => {
    expect(portIds(buildCommandPorts('publish'))).toEqual([
      'prev',
      'next',
      'out_result',
    ]);
    expect(portIds(buildCommandPorts('upgrade'))).toEqual([
      'prev',
      'next',
      'in_upgradeCap',
      'out_result',
    ]);
  });

  it('sanitizes UI count patches to the command-owned count field', () => {
    expect(
      patchCommandUIParams(
        'splitCoins',
        { amountsCount: 2 },
        { amountsCount: 3, unknownCount: 99, unknownFlag: true },
      ),
    ).toEqual({ amountsCount: 3 });
    expect(
      patchCommandUIParams(
        'makeMoveVec',
        { elemsCount: 2 },
        { elemsCount: 0 },
        { type: 'u64' },
      ),
    ).toEqual({ elemsCount: 0 });
    expect(
      patchCommandUIParams('makeMoveVec', { elemsCount: 2 }, { elemsCount: 0 }),
    ).toEqual({ elemsCount: 1 });
  });

  it('sanitizes direct command factory UI params through the command registry', () => {
    const split = makeCommandNode('splitCoins', {
      ui: {
        amountsCount: 3,
        unknownCount: 99,
        unknownFlag: true,
      } as unknown as CommandUIParams,
    });
    const publish = makeCommandNode('publish', {
      ui: { unknownCount: 99 } as unknown as CommandUIParams,
    });

    expect(split.params?.ui).toEqual({ amountsCount: 3 });
    expect(publish.params?.ui).toBeUndefined();
  });
});
