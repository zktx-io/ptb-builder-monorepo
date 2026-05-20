import {
  graphToTransactionIR,
  hasErrors,
  type MovePackageSignatureEvidence,
  nestedResultHandle,
  NULL_VALUE,
  PTBModelError,
  type PTBType,
  type RawOpenSignature,
  RESULT_HANDLE_ID,
  type TransactionIR,
  transactionIRToGraph,
  transactionIRToTsSdkCode,
} from '@zktx.io/ptb-model';
import { describe, expect, it } from 'vitest';

import {
  makeAddress,
  makeCommandNode,
  makeGasObject,
  makeObject,
  makeString,
} from '../src/ptb/factories';
import { parseHandleTypeSuffix, type PTBGraph } from '../src/ptb/graph/types';
import { ptbToRF, rfToPTB } from '../src/ptb/ptbAdapter';
import { buildCommandPorts, buildMoveCallPorts } from '../src/ptb/registry';
import { buildTransactionFromIR } from '../src/ptb/runtimeAdapter';
import { renderCodePreview } from '../src/ui/codePreview';
import { EMPTY_CODE } from '../src/ui/emptyCode';
import { stableGraphSig } from '../src/ui/graphSignature';

const ADDRESS =
  '0x0000000000000000000000000000000000000000000000000000000000000001';
const SUI_PACKAGE =
  '0x0000000000000000000000000000000000000000000000000000000000000002';
const SUI_TYPE = `${SUI_PACKAGE}::sui::SUI`;
const TEST_DIGEST = 'vQMG8nrGirX14JLfyzy15DrYD3gwRC1eUmBmBzYUsgh';

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
            id: 'out_result',
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

const u64OpenSignature: RawOpenSignature = {
  reference: NULL_VALUE,
  body: { $kind: 'u64' },
};

function moveCallResultCountGraph(): PTBGraph {
  return {
    nodes: [
      {
        id: 'call',
        kind: 'Command',
        label: 'MoveCall',
        command: 'moveCall',
        params: {
          runtime: {
            target: `${ADDRESS}::m::f`,
            resultCount: 1,
          },
        },
        ports: [
          { id: 'in', role: 'flow', direction: 'in' },
          { id: 'out', role: 'flow', direction: 'out' },
          { id: 'out_result', role: 'io', direction: 'out' },
        ],
      },
    ],
    edges: [],
  };
}

const moveCallTwoReturnEvidence: MovePackageSignatureEvidence = {
  [ADDRESS]: {
    m: {
      f: {
        typeParameterCount: 0,
        parameters: [],
        returns: [u64OpenSignature, u64OpenSignature],
      },
    },
  },
};

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

    expect(ir.diagnostics).toEqual([]);
    expect(ir.commands[0]).toMatchObject({ kind: 'SplitCoins' });
  });

  it('projects React Flow edges behind graph nodes', () => {
    const rf = ptbToRF(splitGasGraph());
    const nodeZIndex = rf.nodes.map((node) => node.zIndex ?? 0);
    const edgeZIndex = rf.edges.map((edge) => edge.zIndex ?? 0);

    expect(nodeZIndex.length).toBeGreaterThan(0);
    expect(edgeZIndex.length).toBeGreaterThan(0);
    expect(Math.min(...nodeZIndex)).toBeGreaterThan(Math.max(...edgeZIndex));
  });

  it('round-trips TypeArgument nodes and type edges through React Flow', () => {
    const graph: PTBGraph = {
      nodes: [
        {
          id: 'type-0',
          kind: 'TypeArgument',
          label: 'SUI',
          value: SUI_TYPE,
          ports: [{ id: 'out_type', role: 'type', direction: 'out' }],
        },
        {
          id: 'call',
          kind: 'Command',
          command: 'moveCall',
          params: { runtime: { target: `${SUI_PACKAGE}::coin::value` } },
          ports: [{ id: 'in_type_0', role: 'type', direction: 'in' }],
        },
      ],
      edges: [
        {
          id: 'type-edge',
          kind: 'type',
          source: 'type-0',
          sourceHandle: 'out_type',
          target: 'call',
          targetHandle: 'in_type_0',
        },
      ],
    };

    const rf = ptbToRF(graph);
    expect(rf.nodes.find((node) => node.id === 'type-0')?.type).toBe(
      'ptb-typearg',
    );
    expect(rf.edges.find((edge) => edge.id === 'type-edge')?.type).toBe(
      'ptb-type',
    );

    const roundTripGraph = rfToPTB(rf.nodes, rf.edges, graph);
    const ir = graphToTransactionIR(roundTripGraph);

    expect(roundTripGraph.edges[0]).toMatchObject({ kind: 'type' });
    expect(ir.diagnostics).toEqual([]);
    expect(ir.commands[0]).toMatchObject({
      kind: 'MoveCall',
      typeArguments: [SUI_TYPE],
    });
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
    expect(preview.code).toContain('// gasBudget: 123');
    expect(preview.code).toContain('export function buildTransaction()');
    expect(preview.code).toContain('tx.splitCoins');
  });

  it('renders current model code with an invalid runtime envelope warning', () => {
    const preview = renderCodePreview(splitGasGraph(), {
      chain: 'sui:testnet',
      envelope: { sender: '0x1', gasBudget: 123 },
    });

    expect(preview.ok).toBe(true);
    expect(preview.code).toContain('// envelope: invalid (');
    expect(preview.code).toContain(
      'Runtime sender must be a canonical Sui address.',
    );
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
    expect(preview.code).toContain('ir.input.pureValue');
    expect(preview.code).toContain('tx.splitCoins');
  });

  it('uses Move signature evidence for code preview diagnostics when provided', () => {
    const graph = moveCallResultCountGraph();
    const previous = renderCodePreview(graph, {
      chain: 'sui:testnet',
    });

    expect(previous.ok).toBe(true);

    const preview = renderCodePreview(graph, {
      chain: 'sui:testnet',
      moveSignatures: moveCallTwoReturnEvidence,
      previousModelCode: previous.modelCode,
    });

    expect(preview.ok).toBe(false);
    expect(preview.code).toContain('verified Move signature metadata');
    expect(preview.code).toContain(
      'graph.command.moveCall.resultCountMismatch',
    );
    expect(preview.code).toContain('$.nodes[0].params.runtime.resultCount');
    expect(preview.code).not.toContain(
      'ir.command.moveCall.resultCountMismatch',
    );
    expect(preview.code).toContain('tx.moveCall');
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

  it('creates new variables with generated model input ids instead of duplicate names', () => {
    const graph: PTBGraph = {
      nodes: [
        makeAddress({ id: 'recipient', value: ADDRESS }),
        makeString({ id: 'memo', value: 'hello' }),
      ],
      edges: [],
    };

    const ir = graphToTransactionIR(graph);

    expect(ir.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain(
      'graph.variable.duplicateName',
    );
    expect(ir.inputs.map((input) => input.id)).toEqual(['input_0', 'input_1']);
  });

  it('uses the model MergeCoins destination handle when creating registry ports', () => {
    const sourceObjectId =
      '0x0000000000000000000000000000000000000000000000000000000000000002';
    const destination = makeObject('0x2::coin::Coin<0x2::sui::SUI>', {
      id: 'destination',
      value: ADDRESS,
    });
    const source = makeObject('0x2::coin::Coin<0x2::sui::SUI>', {
      id: 'source',
      value: sourceObjectId,
    });
    const merge = makeCommandNode('mergeCoins', {
      id: 'merge',
      ui: { sourcesCount: 1 },
    });
    const graph: PTBGraph = {
      nodes: [destination, source, merge],
      edges: [
        {
          id: 'destination-edge',
          kind: 'io',
          source: 'destination',
          sourceHandle: 'out',
          target: 'merge',
          targetHandle: 'in_destination',
        },
        {
          id: 'source-edge',
          kind: 'io',
          source: 'source',
          sourceHandle: 'out',
          target: 'merge',
          targetHandle: 'in_source_0',
        },
      ],
    };

    expect(merge.ports.map((port) => port.id)).toContain('in_destination');

    const ir = graphToTransactionIR(graph);

    expect(ir.diagnostics).toEqual([]);
    expect(ir.commands[0]).toMatchObject({
      kind: 'MergeCoins',
      destination: { kind: 'Input', index: 0 },
      sources: [{ kind: 'Input', index: 1 }],
    });
  });

  it('materializes MakeMoveVec runtime type tags into concrete port types', () => {
    const numericPorts = buildCommandPorts(
      'makeMoveVec',
      { elemsCount: 1 },
      { type: 'u64' },
    );

    expect(numericPorts.find((port) => port.id === 'in_elem_0')).toMatchObject({
      dataType: { kind: 'move_numeric', width: 'u64' },
      typeStr: 'u64',
    });
    expect(numericPorts.find((port) => port.id === 'out_result')).toMatchObject(
      {
        dataType: {
          kind: 'vector',
          elem: { kind: 'move_numeric', width: 'u64' },
        },
        typeStr: 'vector<u64>',
      },
    );

    const objectPorts = buildCommandPorts(
      'makeMoveVec',
      { elemsCount: 1 },
      { type: '0x2::sui::SUI' },
    );
    const canonicalSuiType =
      '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI';

    expect(objectPorts.find((port) => port.id === 'in_elem_0')).toMatchObject({
      dataType: { kind: 'object', typeTag: canonicalSuiType },
    });
    expect(objectPorts.find((port) => port.id === 'out_result')).toMatchObject({
      dataType: {
        kind: 'vector',
        elem: { kind: 'object', typeTag: canonicalSuiType },
      },
    });
  });

  it('projects model-authored command ports and handles for React Flow editing', () => {
    const graph: PTBGraph = {
      nodes: [
        {
          id: 'amount',
          kind: 'Variable',
          label: 'amount',
          name: 'amount',
          varType: { kind: 'move_numeric', width: 'u64' },
          value: '10',
          ports: [{ id: 'out', role: 'io', direction: 'out' }],
        },
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
            { id: 'out_result', role: 'io', direction: 'out' },
          ],
        },
        {
          id: 'transfer',
          kind: 'Command',
          label: 'TransferObjects',
          command: 'transferObjects',
          params: { ui: { objectsCount: 1 } },
          ports: [
            { id: 'in', role: 'flow', direction: 'in' },
            { id: 'out', role: 'flow', direction: 'out' },
            { id: 'in_recipient', role: 'io', direction: 'in' },
            { id: 'in_object_0', role: 'io', direction: 'in' },
          ],
        },
        {
          id: 'merge',
          kind: 'Command',
          label: 'MergeCoins',
          command: 'mergeCoins',
          params: { ui: { sourcesCount: 1 } },
          ports: [
            { id: 'in', role: 'flow', direction: 'in' },
            { id: 'out', role: 'flow', direction: 'out' },
            { id: 'in_destination', role: 'io', direction: 'in' },
            { id: 'in_source_0', role: 'io', direction: 'in' },
          ],
        },
        {
          id: 'vec',
          kind: 'Command',
          label: 'MakeMoveVec',
          command: 'makeMoveVec',
          params: { ui: { elemsCount: 1 }, runtime: { type: 'u64' } },
          ports: [
            { id: 'in', role: 'flow', direction: 'in' },
            { id: 'out', role: 'flow', direction: 'out' },
            { id: 'in_elem_0', role: 'io', direction: 'in' },
            { id: 'out_result', role: 'io', direction: 'out' },
          ],
        },
        {
          id: 'unresolved-move',
          kind: 'Command',
          label: 'MoveCall',
          command: 'moveCall',
          params: { runtime: { target: '0x2::coin::value' } },
          ports: [
            { id: 'in', role: 'flow', direction: 'in' },
            { id: 'out', role: 'flow', direction: 'out' },
            { id: 'in_arg_0', role: 'io', direction: 'in' },
            { id: 'out_result', role: 'io', direction: 'out' },
          ],
        },
      ],
      edges: [
        {
          id: 'amount-edge',
          kind: 'io',
          source: 'amount',
          sourceHandle: 'out',
          target: 'split',
          targetHandle: 'in_amount_0',
        },
      ],
    };

    const rf = ptbToRF(graph);
    const split = rf.nodes.find((node) => node.id === 'split')!.data.ptbNode!;
    const transfer = rf.nodes.find((node) => node.id === 'transfer')!.data
      .ptbNode!;
    const merge = rf.nodes.find((node) => node.id === 'merge')!.data.ptbNode!;
    const vec = rf.nodes.find((node) => node.id === 'vec')!.data.ptbNode!;
    const unresolvedMove = rf.nodes.find(
      (node) => node.id === 'unresolved-move',
    )!.data.ptbNode!;

    expect(split.ports.find((port) => port.id === 'prev')).toMatchObject({
      role: 'flow',
    });
    expect(split.ports.find((port) => port.id === 'in_amount_0')).toMatchObject(
      { dataType: { kind: 'move_numeric', width: 'u64' } },
    );
    expect(
      transfer.ports.find((port) => port.id === 'in_recipient'),
    ).toMatchObject({ dataType: { kind: 'scalar', name: 'address' } });
    expect(
      merge.ports.find((port) => port.id === 'in_destination'),
    ).toMatchObject({ dataType: { kind: 'object' } });
    expect(vec.ports.find((port) => port.id === 'in_elem_0')).toMatchObject({
      dataType: { kind: 'move_numeric', width: 'u64' },
    });
    expect(
      unresolvedMove.ports.find((port) => port.id === 'in_arg_0')?.dataType,
    ).toBeUndefined();
    expect(rf.edges.find((edge) => edge.id === 'amount-edge')).toMatchObject({
      sourceHandle: 'out',
      targetHandle: 'in_amount_0',
      data: {
        dataType: 'u64',
        visualState: 'ok',
        reason: 'type-compatible',
      },
    });

    const roundTrip = rfToPTB(rf.nodes, rf.edges, graph);
    const rfAgain = ptbToRF(roundTrip);
    const roundTripAgain = rfToPTB(rfAgain.nodes, rfAgain.edges, roundTrip);

    expect(stableGraphSig(roundTripAgain)).toBe(stableGraphSig(roundTrip));
  });

  it('preserves model-owned MoveCall result handles through RF projection', () => {
    const ir: TransactionIR = {
      version: 'transaction_ir_1',
      inputs: [],
      diagnostics: [],
      commands: [
        {
          id: 'source',
          kind: 'MoveCall',
          package: ADDRESS,
          module: 'module',
          function: 'source',
          typeArguments: [],
          arguments: [],
          resultCount: 1,
        },
        {
          id: 'consumer',
          kind: 'MoveCall',
          package: ADDRESS,
          module: 'module',
          function: 'consume',
          typeArguments: [],
          arguments: [{ kind: 'Result', commandIndex: 0 }],
          resultCount: 0,
        },
      ],
    };

    const graph = transactionIRToGraph(ir);
    const rf = ptbToRF(graph);
    const source = rf.nodes.find((node) => node.id === 'cmd-0')?.data.ptbNode;
    const sourcePorts = source?.kind === 'Command' ? source.ports : [];

    expect(sourcePorts.map((port) => port.id)).toEqual(
      expect.arrayContaining(['prev', 'next', 'out_result']),
    );
    expect(sourcePorts.map((port) => port.id)).not.toContain('out_ret_0');
    expect(
      rf.edges.find(
        (edge) =>
          edge.type === 'ptb-io' &&
          edge.source === 'cmd-0' &&
          edge.target === 'cmd-1',
      ),
    ).toMatchObject({
      sourceHandle: 'out_result',
      targetHandle: 'in_arg_0',
    });

    const roundTrip = rfToPTB(rf.nodes, rf.edges, graph);
    const projected = graphToTransactionIR(roundTrip);
    const consumer = projected.commands[1];

    expect(projected.diagnostics).toEqual([]);
    expect(consumer?.kind).toBe('MoveCall');
    if (consumer?.kind !== 'MoveCall') throw new Error('Expected MoveCall');
    expect(consumer.arguments).toEqual([{ kind: 'Result', commandIndex: 0 }]);
  });

  it('preserves model-owned MoveCall nested result handles through RF projection', () => {
    const ir: TransactionIR = {
      version: 'transaction_ir_1',
      inputs: [],
      diagnostics: [],
      commands: [
        {
          id: 'source',
          kind: 'MoveCall',
          package: ADDRESS,
          module: 'module',
          function: 'source',
          typeArguments: [],
          arguments: [],
          resultCount: 2,
        },
        {
          id: 'consumer',
          kind: 'MoveCall',
          package: ADDRESS,
          module: 'module',
          function: 'consume',
          typeArguments: [],
          arguments: [
            { kind: 'NestedResult', commandIndex: 0, resultIndex: 0 },
            { kind: 'NestedResult', commandIndex: 0, resultIndex: 1 },
          ],
          resultCount: 0,
        },
      ],
    };

    const graph = transactionIRToGraph(ir);
    const rf = ptbToRF(graph);
    const source = rf.nodes.find((node) => node.id === 'cmd-0')?.data.ptbNode;
    const sourcePortIds =
      source?.kind === 'Command' ? source.ports.map((port) => port.id) : [];
    const sourceHandles = rf.edges
      .filter(
        (edge) =>
          edge.type === 'ptb-io' &&
          edge.source === 'cmd-0' &&
          edge.target === 'cmd-1',
      )
      .map((edge) => edge.sourceHandle)
      .sort();

    expect(sourcePortIds).toEqual(expect.arrayContaining(['out_0', 'out_1']));
    expect(sourcePortIds).not.toContain('out_result');
    expect(sourcePortIds).not.toContain('out_ret_0');
    expect(sourceHandles).toEqual(['out_0', 'out_1']);

    const roundTrip = rfToPTB(rf.nodes, rf.edges, graph);
    const projected = graphToTransactionIR(roundTrip);
    const consumer = projected.commands[1];

    expect(projected.diagnostics).toEqual([]);
    expect(consumer?.kind).toBe('MoveCall');
    if (consumer?.kind !== 'MoveCall') throw new Error('Expected MoveCall');
    expect(consumer.arguments).toEqual([
      { kind: 'NestedResult', commandIndex: 0, resultIndex: 0 },
      { kind: 'NestedResult', commandIndex: 0, resultIndex: 1 },
    ]);
  });

  it.each([
    {
      label: 'Publish',
      ir: {
        version: 'transaction_ir_1',
        inputs: [],
        diagnostics: [],
        commands: [
          {
            id: 'source',
            kind: 'Publish',
            modules: ['AA=='],
            dependencies: [],
            resultCount: 1,
          },
          {
            id: 'consumer',
            kind: 'MoveCall',
            package: ADDRESS,
            module: 'module',
            function: 'consume',
            typeArguments: [],
            arguments: [
              { kind: 'NestedResult', commandIndex: 0, resultIndex: 0 },
            ],
            resultCount: 0,
          },
        ],
      } satisfies TransactionIR,
    },
    {
      label: 'MakeMoveVec',
      ir: {
        version: 'transaction_ir_1',
        inputs: [],
        diagnostics: [],
        commands: [
          {
            id: 'source',
            kind: 'MakeMoveVec',
            type: 'u64',
            elements: [],
            resultCount: 1,
          },
          {
            id: 'consumer',
            kind: 'MoveCall',
            package: ADDRESS,
            module: 'module',
            function: 'consume',
            typeArguments: [],
            arguments: [
              { kind: 'NestedResult', commandIndex: 0, resultIndex: 0 },
            ],
            resultCount: 0,
          },
        ],
      } satisfies TransactionIR,
    },
    {
      label: 'Upgrade',
      ir: {
        version: 'transaction_ir_1',
        inputs: [
          {
            id: 'ticket',
            kind: 'Object',
            source: {
              kind: 'Resolved',
              object: {
                kind: 'ImmOrOwnedObject',
                objectId: ADDRESS,
                version: '1',
                digest: TEST_DIGEST,
              },
            },
          },
        ],
        diagnostics: [],
        commands: [
          {
            id: 'source',
            kind: 'Upgrade',
            modules: ['AA=='],
            dependencies: [],
            package: ADDRESS,
            ticket: { kind: 'Input', index: 0 },
            resultCount: 1,
          },
          {
            id: 'consumer',
            kind: 'MoveCall',
            package: ADDRESS,
            module: 'module',
            function: 'consume',
            typeArguments: [],
            arguments: [
              { kind: 'NestedResult', commandIndex: 0, resultIndex: 0 },
            ],
            resultCount: 0,
          },
        ],
      } satisfies TransactionIR,
    },
    {
      label: 'SplitCoins',
      ir: {
        version: 'transaction_ir_1',
        inputs: [
          {
            id: 'coin',
            kind: 'Object',
            source: {
              kind: 'Resolved',
              object: {
                kind: 'ImmOrOwnedObject',
                objectId: ADDRESS,
                version: '1',
                digest: TEST_DIGEST,
              },
            },
          },
          {
            id: 'amount',
            kind: 'Pure',
            value: '1',
            type: { kind: 'move_numeric', width: 'u64' },
          },
        ],
        diagnostics: [],
        commands: [
          {
            id: 'source',
            kind: 'SplitCoins',
            coin: { kind: 'Input', index: 0 },
            amounts: [{ kind: 'Input', index: 1 }],
            resultCount: 1,
          },
          {
            id: 'consumer',
            kind: 'MoveCall',
            package: ADDRESS,
            module: 'module',
            function: 'consume',
            typeArguments: [],
            arguments: [
              { kind: 'NestedResult', commandIndex: 0, resultIndex: 0 },
            ],
            resultCount: 0,
          },
        ],
      } satisfies TransactionIR,
    },
  ])(
    'preserves model-owned $label single-result nested handles through RF projection',
    ({ ir }) => {
      const graph = transactionIRToGraph(ir);
      const rf = ptbToRF(graph);
      const source = rf.nodes.find((node) => node.id === 'cmd-0')?.data.ptbNode;
      const sourcePortIds =
        source?.kind === 'Command' ? source.ports.map((port) => port.id) : [];
      const sourceHandles = rf.edges
        .filter(
          (edge) =>
            edge.type === 'ptb-io' &&
            edge.source === 'cmd-0' &&
            edge.target === 'cmd-1',
        )
        .map((edge) => edge.sourceHandle);
      const sourceHandleBases = sourceHandles.map(
        (handle) => parseHandleTypeSuffix(handle).baseId,
      );

      expect(sourcePortIds).toEqual(
        expect.arrayContaining([RESULT_HANDLE_ID, nestedResultHandle(0)]),
      );
      expect(sourceHandleBases).toEqual([nestedResultHandle(0)]);

      const roundTrip = rfToPTB(rf.nodes, rf.edges, graph);
      const projected = graphToTransactionIR(roundTrip);
      const consumer = projected.commands[1];

      expect(projected.diagnostics).toEqual([]);
      expect(consumer?.kind).toBe('MoveCall');
      if (consumer?.kind !== 'MoveCall') throw new Error('Expected MoveCall');
      expect(consumer.arguments).toEqual([
        { kind: 'NestedResult', commandIndex: 0, resultIndex: 0 },
      ]);
    },
  );

  it('projects model flow handles to RF handles and persists them back to graph handles', () => {
    const graph: PTBGraph = {
      nodes: [
        {
          id: '@start',
          kind: 'Start',
          label: 'Start',
          ports: [{ id: 'out', role: 'flow', direction: 'out' }],
        },
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
            { id: 'out_result', role: 'io', direction: 'out' },
          ],
        },
        {
          id: '@end',
          kind: 'End',
          label: 'End',
          ports: [{ id: 'in', role: 'flow', direction: 'in' }],
        },
      ],
      edges: [
        {
          id: 'flow-start-split',
          kind: 'flow',
          source: '@start',
          sourceHandle: 'out',
          target: 'split',
          targetHandle: 'in',
        },
        {
          id: 'flow-split-end',
          kind: 'flow',
          source: 'split',
          sourceHandle: 'out',
          target: '@end',
          targetHandle: 'in',
        },
      ],
    };

    const rf = ptbToRF(graph);

    expect(
      rf.nodes.find((node) => node.id === 'split')?.data.ptbNode?.ports,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'prev', role: 'flow', direction: 'in' }),
        expect.objectContaining({ id: 'next', role: 'flow', direction: 'out' }),
        expect.objectContaining({
          id: 'out_result',
          role: 'io',
          direction: 'out',
        }),
      ]),
    );
    expect(rf.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'flow-start-split',
          sourceHandle: 'next',
          targetHandle: 'prev',
        }),
        expect.objectContaining({
          id: 'flow-split-end',
          sourceHandle: 'next',
          targetHandle: 'prev',
        }),
      ]),
    );

    const roundTrip = rfToPTB(rf.nodes, rf.edges, graph);

    expect(roundTrip.nodes.find((node) => node.id === 'split')?.ports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'in', role: 'flow', direction: 'in' }),
        expect.objectContaining({ id: 'out', role: 'flow', direction: 'out' }),
        expect.objectContaining({
          id: 'out_result',
          role: 'io',
          direction: 'out',
        }),
      ]),
    );
    expect(roundTrip.edges).toEqual(graph.edges);
  });

  it('keeps builder-authored object ids unresolved for SDK runtime resolution', () => {
    const objectNode = makeObject('0x2::coin::Coin<0x2::sui::SUI>', {
      id: 'coin-node',
      value: ADDRESS,
    });
    objectNode.name = 'coin';
    const graph: PTBGraph = {
      nodes: [objectNode],
      edges: [],
    };

    const roundTrippedGraph = JSON.parse(JSON.stringify(graph)) as PTBGraph;
    const ir = graphToTransactionIR(roundTrippedGraph);

    expect(ir.diagnostics).toEqual([]);
    expect(ir.inputs[0]).toMatchObject({
      id: 'coin',
      kind: 'Object',
      source: { kind: 'Unresolved', objectId: ADDRESS },
    });
    expect(() => buildTransactionFromIR(ir)).not.toThrow();
  });

  it('keeps sponsor FundsWithdrawal rejected at the runtime adapter boundary', () => {
    const ir: TransactionIR = {
      version: 'transaction_ir_1',
      inputs: [
        {
          id: 'withdrawal',
          kind: 'FundsWithdrawal',
          value: {
            reservation: { kind: 'MaxAmountU64', amount: '1000' },
            typeArg: { kind: 'Balance', type: SUI_TYPE },
            withdrawFrom: { kind: 'Sponsor' },
          },
        },
      ],
      commands: [],
      diagnostics: [],
    };

    expect(() => buildTransactionFromIR(ir)).toThrow(PTBModelError);
    try {
      buildTransactionFromIR(ir);
    } catch (error) {
      expect((error as PTBModelError).diagnostics).toContainEqual(
        expect.objectContaining({
          code: 'runtime.input.fundsWithdrawalSponsor',
          path: '$.inputs[0].value.withdrawFrom',
        }),
      );
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
      gasBudget: 123n,
    });
    const data = tx.getData();

    expect(data.sender).toBe(ADDRESS);
    expect(data.gasData.budget).toBe('123');
    expect(JSON.stringify(data)).not.toContain('myAddress');
  });

  it('rejects non-canonical runtime envelope values before SDK transaction mutation', () => {
    const ir = graphToTransactionIR(splitGasGraph());

    expect(() => buildTransactionFromIR(ir, { sender: '0x1' })).toThrow(
      'Runtime sender must be a canonical Sui address.',
    );
    expect(() => buildTransactionFromIR(ir, { gasBudget: 1.5 })).toThrow(
      'Runtime gasBudget must be a canonical unsigned u64 value.',
    );
  });

  it('materializes MoveCall ports from an explicit function signature', () => {
    const materializedPorts = buildMoveCallPorts(
      [{ kind: 'object' }, { kind: 'scalar', name: 'address' }],
      [{ kind: 'vector', elem: { kind: 'move_numeric', width: 'u64' } }],
      1,
    );

    expect(materializedPorts.map((port) => port.id)).toEqual([
      'in_type_0',
      'in_arg_0',
      'in_arg_1',
      'out_result',
    ]);
    expect(
      buildMoveCallPorts(
        [],
        [{ kind: 'object' }, { kind: 'scalar', name: 'address' }],
      ).map((port) => port.id),
    ).toEqual(['out_0', 'out_1']);

    const resolvedNodePorts = buildCommandPorts(
      'moveCall',
      undefined,
      {
        target: '0x2::coin::transfer',
      },
      materializedPorts,
    );

    expect(resolvedNodePorts.map((port) => port.id)).toEqual([
      'prev',
      'next',
      'in_type_0',
      'in_arg_0',
      'in_arg_1',
      'out_result',
    ]);
  });
});
