import {
  graphToTransactionIR,
  hasErrors,
  NULL_VALUE,
  PTBModelError,
  type PTBType,
  type TransactionIR,
  transactionIRToTsSdkCode,
} from '@zktx.io/ptb-model';
import { describe, expect, it } from 'vitest';

import { makeGasObject } from '../src/ptb/factories';
import type { PTBGraph } from '../src/ptb/graph/types';
import { ptbToRF, rfToPTB } from '../src/ptb/ptbAdapter';
import { buildCommandPorts, buildMoveCallPorts } from '../src/ptb/registry';
import { buildTransactionFromIR } from '../src/ptb/runtimeAdapter';
import { renderCodePreview } from '../src/ui/codePreview';
import { EMPTY_CODE } from '../src/ui/emptyCode';

const ADDRESS =
  '0x0000000000000000000000000000000000000000000000000000000000000001';

function splitGasGraph(): PTBGraph {
  return {
    nodes: [
      {
        id: '@start',
        kind: 'Start',
        label: 'Start',
        ports: [{ id: 'next', direction: 'out', role: 'flow' }],
      },
      {
        id: '@end',
        kind: 'End',
        label: 'End',
        ports: [{ id: 'prev', direction: 'in', role: 'flow' }],
      },
      {
        id: '@gas',
        kind: 'Variable',
        label: 'gas',
        name: 'gas',
        varType: { kind: 'object' },
        semantic: { kind: 'GasCoin' },
        ports: [{ id: 'out', direction: 'out', role: 'io' }],
      },
      {
        id: 'amount',
        kind: 'Variable',
        label: 'amount',
        name: 'amount',
        varType: { kind: 'move_numeric', width: 'u64' },
        value: '100',
        ports: [
          {
            id: 'out',
            direction: 'out',
            role: 'io',
            dataType: { kind: 'move_numeric', width: 'u64' },
          },
        ],
      },
      {
        id: 'split',
        kind: 'Command',
        label: 'SplitCoins',
        command: 'splitCoins',
        params: { ui: { amountsCount: 1 } },
        ports: [
          { id: 'prev', direction: 'in', role: 'flow' },
          { id: 'next', direction: 'out', role: 'flow' },
          {
            id: 'in_coin',
            direction: 'in',
            role: 'io',
            dataType: { kind: 'object' },
          },
          {
            id: 'in_amount_0',
            direction: 'in',
            role: 'io',
            dataType: { kind: 'move_numeric', width: 'u64' },
          },
          {
            id: 'out_coin_0',
            direction: 'out',
            role: 'io',
            dataType: { kind: 'object' },
          },
        ],
      },
    ],
    edges: [
      {
        id: 'flow-start-split',
        kind: 'flow',
        source: '@start',
        sourceHandle: 'next',
        target: 'split',
        targetHandle: 'prev',
      },
      {
        id: 'flow-split-end',
        kind: 'flow',
        source: 'split',
        sourceHandle: 'next',
        target: '@end',
        targetHandle: 'prev',
      },
      {
        id: 'io-gas-split',
        kind: 'io',
        source: '@gas',
        sourceHandle: 'out',
        target: 'split',
        targetHandle: 'in_coin',
      },
      {
        id: 'io-amount-split',
        kind: 'io',
        source: 'amount',
        sourceHandle: 'out',
        target: 'split',
        targetHandle: 'in_amount_0',
      },
    ],
  };
}

function transferToAddressGraph(value: string): PTBGraph {
  return {
    nodes: [
      {
        id: '@start',
        kind: 'Start',
        ports: [{ id: 'next', direction: 'out', role: 'flow' }],
      },
      {
        id: '@end',
        kind: 'End',
        ports: [{ id: 'prev', direction: 'in', role: 'flow' }],
      },
      {
        id: '@gas',
        kind: 'Variable',
        name: 'gas',
        varType: { kind: 'object' },
        semantic: { kind: 'GasCoin' },
        ports: [{ id: 'out', direction: 'out', role: 'io' }],
      },
      {
        id: 'recipient',
        kind: 'Variable',
        name: 'recipient',
        varType: { kind: 'scalar', name: 'address' },
        value,
        ports: [
          {
            id: 'out',
            direction: 'out',
            role: 'io',
            dataType: { kind: 'scalar', name: 'address' },
          },
        ],
      },
      {
        id: 'transfer',
        kind: 'Command',
        command: 'transferObjects',
        params: { ui: { objectsCount: 1 } },
        ports: [
          { id: 'prev', direction: 'in', role: 'flow' },
          { id: 'next', direction: 'out', role: 'flow' },
          {
            id: 'in_recipient',
            direction: 'in',
            role: 'io',
            dataType: { kind: 'scalar', name: 'address' },
          },
          {
            id: 'in_object_0',
            direction: 'in',
            role: 'io',
            dataType: { kind: 'object' },
          },
        ],
      },
    ],
    edges: [
      {
        id: 'flow-start-transfer',
        kind: 'flow',
        source: '@start',
        sourceHandle: 'next',
        target: 'transfer',
        targetHandle: 'prev',
      },
      {
        id: 'flow-transfer-end',
        kind: 'flow',
        source: 'transfer',
        sourceHandle: 'next',
        target: '@end',
        targetHandle: 'prev',
      },
      {
        id: 'io-gas-transfer',
        kind: 'io',
        source: '@gas',
        sourceHandle: 'out',
        target: 'transfer',
        targetHandle: 'in_object_0',
      },
      {
        id: 'io-recipient-transfer',
        kind: 'io',
        source: 'recipient',
        sourceHandle: 'out',
        target: 'transfer',
        targetHandle: 'in_recipient',
      },
    ],
  };
}

describe('model-root PTB boundary', () => {
  it('creates gas resource variables with explicit model GasCoin semantics', () => {
    expect(makeGasObject()).toMatchObject({
      id: '@gas',
      semantic: { kind: 'GasCoin' },
    });
  });

  it('round-trips model PTBGraph through React Flow and model IR', () => {
    const graph = splitGasGraph();
    const rf = ptbToRF(graph);
    const roundTripGraph = rfToPTB(rf.nodes, rf.edges, graph);
    const ir = graphToTransactionIR(roundTripGraph);

    expect(hasErrors(ir.diagnostics)).toBe(false);
    expect(ir.commands[0]).toMatchObject({ kind: 'SplitCoins' });
  });

  it('rejects malformed React Flow edges before persisting a PTB graph', () => {
    const graph = splitGasGraph();
    const rf = ptbToRF(graph);
    const malformedEdges = rf.edges.map((edge, index) =>
      index === 0
        ? { ...edge, sourceHandle: undefined, sourceHandleId: undefined }
        : edge,
    );

    expect(() => rfToPTB(rf.nodes, malformedEdges, graph)).toThrow(
      'source and target handles are required',
    );
  });

  it('renders code preview through the model renderer', () => {
    const preview = renderCodePreview(splitGasGraph(), {
      chain: 'sui:testnet',
      envelope: { sender: ADDRESS, gasBudget: 123 },
    });

    expect(preview.ok).toBe(true);
    expect(preview.code).toContain('// Preview metadata only');
    expect(preview.code).toContain(`// sender: ${ADDRESS}`);
    expect(preview.code).toContain('export function buildTransaction()');
    expect(preview.code).toContain('tx.splitCoins');
  });

  it('keeps empty preview placeholders aligned with model-rendered metadata', () => {
    const uninitialized = EMPTY_CODE(undefined);
    const initialized = EMPTY_CODE('sui:testnet');

    expect(uninitialized).not.toContain('undefined');
    expect(uninitialized).not.toContain('setSenderIfNotSet');
    expect(uninitialized).not.toContain('setGasBudgetIfNotSet');
    expect(uninitialized).toContain('Add a command node');
    expect(uninitialized).not.toContain('Connect nodes (Start -> End)');
    expect(initialized).toContain('// PTB Code Preview (network: sui:testnet)');
    expect(initialized).toContain('Add a MoveCall, SplitCoins');
    expect(initialized).not.toContain('setSenderIfNotSet');
    expect(initialized).not.toContain('setGasBudgetIfNotSet');
    expect(initialized).not.toContain('Connect nodes (Start -> End)');
  });

  it('keeps stale model preview visible when the current graph has diagnostics', () => {
    const previousModelCode = transactionIRToTsSdkCode(
      graphToTransactionIR(splitGasGraph()),
    );
    const preview = renderCodePreview(transferToAddressGraph('myAddress'), {
      chain: 'sui:testnet',
      previousModelCode,
    });

    expect(preview.ok).toBe(false);
    expect(preview.code).toContain('Code preview is stale');
    expect(preview.code).toContain('codegen.input.pure');
    expect(preview.code).toContain('tx.splitCoins');
  });

  it('does not substitute wallet sentinels into IR arguments', () => {
    const ir = graphToTransactionIR(transferToAddressGraph('myAddress'));

    expect(() => buildTransactionFromIR(ir, { sender: ADDRESS })).toThrow(
      PTBModelError,
    );
  });

  it('explains that abstract number placeholders need concrete Move widths', () => {
    const ir: TransactionIR = {
      version: 'transaction_ir_1',
      inputs: [
        {
          id: 'amount',
          kind: 'Pure',
          value: '10',
          type: { kind: 'scalar', name: 'number' },
        },
      ],
      commands: [
        {
          id: 'split',
          kind: 'SplitCoins',
          coin: { kind: 'GasCoin' },
          amounts: [{ kind: 'Input', index: 0 }],
          resultCount: 1,
        },
      ],
      diagnostics: [],
    };

    expect(() => buildTransactionFromIR(ir)).toThrow(PTBModelError);
    try {
      buildTransactionFromIR(ir);
    } catch (error) {
      expect((error as PTBModelError).diagnostics[0]?.message).toMatch(
        /abstract number placeholder/,
      );
    }
  });

  it('explains nested abstract number placeholders before runtime build', () => {
    const cases: Array<{
      label: string;
      type: PTBType;
      value: unknown;
      path: string;
    }> = [
      {
        label: 'option<number>',
        type: { kind: 'option', elem: { kind: 'scalar', name: 'number' } },
        value: '10',
        path: '$.inputs[0].type.elem',
      },
      {
        label: 'vector<number>',
        type: { kind: 'vector', elem: { kind: 'scalar', name: 'number' } },
        value: ['10'],
        path: '$.inputs[0].type.elem',
      },
    ];

    for (const testCase of cases) {
      const ir: TransactionIR = {
        version: 'transaction_ir_1',
        inputs: [
          {
            id: testCase.label,
            kind: 'Pure',
            value: testCase.value,
            type: testCase.type,
          },
        ],
        commands: [],
        diagnostics: [],
      };

      expect(() => buildTransactionFromIR(ir)).toThrow(PTBModelError);
      try {
        buildTransactionFromIR(ir);
      } catch (error) {
        const diagnostic = (error as PTBModelError).diagnostics[0];
        expect(diagnostic?.message).toMatch(/abstract number placeholder/);
        expect(diagnostic?.path).toBe(testCase.path);
      }
    }
  });

  it('builds runtime raw pure bytes even when the type hint contains abstract number', () => {
    const cases: PTBType[] = [
      { kind: 'scalar', name: 'number' },
      { kind: 'option', elem: { kind: 'scalar', name: 'number' } },
      { kind: 'vector', elem: { kind: 'scalar', name: 'number' } },
    ];

    for (const type of cases) {
      const ir: TransactionIR = {
        version: 'transaction_ir_1',
        inputs: [
          {
            id: 'rawPureWithAbstractNumberHint',
            kind: 'Pure',
            bytes: 'AQID',
            type,
          },
        ],
        commands: [],
        diagnostics: [],
      };

      expect(() => buildTransactionFromIR(ir)).not.toThrow();
    }
  });

  it('rejects empty address and id pure values before runtime build', () => {
    const cases: Array<{ id: string; type: PTBType; value: unknown }> = [
      {
        id: 'recipient',
        type: { kind: 'scalar', name: 'address' },
        value: '',
      },
      {
        id: 'objectId',
        type: { kind: 'scalar', name: 'id' },
        value: '0x',
      },
      {
        id: 'addressList',
        type: {
          kind: 'vector',
          elem: { kind: 'scalar', name: 'address' },
        },
        value: ['0x1', ''],
      },
    ];

    for (const testCase of cases) {
      const ir: TransactionIR = {
        version: 'transaction_ir_1',
        inputs: [
          {
            id: testCase.id,
            kind: 'Pure',
            value: testCase.value,
            type: testCase.type,
          },
        ],
        commands: [],
        diagnostics: [],
      };

      expect(() => buildTransactionFromIR(ir)).toThrow(PTBModelError);
    }
  });

  it('builds runtime pure inputs for option<bool> values authored as booleans', () => {
    const ir: TransactionIR = {
      version: 'transaction_ir_1',
      inputs: [
        {
          id: 'maybeFlag',
          kind: 'Pure',
          value: true,
          type: { kind: 'option', elem: { kind: 'scalar', name: 'bool' } },
        },
      ],
      commands: [],
      diagnostics: [],
    };

    expect(() => buildTransactionFromIR(ir)).not.toThrow();
  });

  it('preserves builder-authored option None through graph JSON and runtime build', () => {
    const graph: PTBGraph = {
      nodes: [
        {
          id: 'maybeFlag',
          kind: 'Variable',
          label: 'option<bool>',
          name: 'maybeFlag',
          varType: { kind: 'option', elem: { kind: 'scalar', name: 'bool' } },
          value: NULL_VALUE,
          ports: [
            {
              id: 'out',
              direction: 'out',
              role: 'io',
              dataType: {
                kind: 'option',
                elem: { kind: 'scalar', name: 'bool' },
              },
            },
          ],
        },
      ],
      edges: [],
    };

    const roundTrippedGraph = JSON.parse(JSON.stringify(graph)) as PTBGraph;
    const ir = graphToTransactionIR(roundTrippedGraph);
    const input = ir.inputs[0];

    expect(ir.diagnostics).toEqual([]);
    expect(Object.prototype.hasOwnProperty.call(input, 'value')).toBe(true);
    expect(input).toMatchObject({
      id: 'maybeFlag',
      kind: 'Pure',
      value: NULL_VALUE,
      type: { kind: 'option', elem: { kind: 'scalar', name: 'bool' } },
    });
    expect(transactionIRToTsSdkCode(ir)).toContain(
      'tx.pure.option("bool", null)',
    );
    expect(() => buildTransactionFromIR(ir)).not.toThrow();
  });

  it('applies runtime envelope only to transaction metadata', () => {
    const ir = graphToTransactionIR(splitGasGraph());
    const tx = buildTransactionFromIR(ir, {
      sender: ADDRESS,
      gasBudget: 123,
    });
    const data = tx.getData();

    expect(data.sender).toBe(ADDRESS);
    expect(data.gasData.budget).toBe('123');
    expect(JSON.stringify(data)).not.toContain('myAddress');
  });

  it('materializes MoveCall ports from an explicit function signature', () => {
    const materializedPorts = buildMoveCallPorts(
      [{ kind: 'object' }, { kind: 'scalar', name: 'address' }],
      [{ kind: 'vector', elem: { kind: 'move_numeric', width: 'u64' } }],
    );

    expect(materializedPorts.map((port) => port.id)).toEqual([
      'in_arg_0',
      'in_arg_1',
      'out_ret_0',
    ]);

    const resolvedNodePorts = buildCommandPorts(
      'moveCall',
      undefined,
      {
        target: '0x2::coin::transfer',
        typeArguments: ['0x2::sui::SUI'],
      },
      [
        ...materializedPorts,
        {
          id: 'in_type_0',
          role: 'io',
          direction: 'in',
          dataType: { kind: 'scalar', name: 'string' },
        },
      ],
    );

    expect(resolvedNodePorts.map((port) => port.id)).toEqual([
      'prev',
      'next',
      'in_arg_0',
      'in_arg_1',
      'out_ret_0',
    ]);
  });
});
