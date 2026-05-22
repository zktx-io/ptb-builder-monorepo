import type { Edge as RFEdge, Node as RFNode } from '@xyflow/react';
import type { RawOpenSignature } from '@zktx.io/ptb-model';
import { NULL_VALUE, RESULT_HANDLE_ID } from '@zktx.io/ptb-model';
import { describe, expect, it } from 'vitest';

import {
  toPTBFunctionDataEntry,
  toPTBFunctionOpenSignatures,
  toPTBModuleData,
} from '../src/ptb/move/toPTBModuleData';
import type { RFNodeData } from '../src/ptb/ptbAdapter';
import { buildDoc } from '../src/ptb/ptbDoc';
import { refreshMoveCallPortsFromSignatures } from '../src/ui/moveCallSignaturePorts';
import { buildResolvedMoveCallState } from '../src/ui/nodes/cmds/MoveCallCommand/resolveMoveCall';
import type { RFEdgeData } from '../src/ui/rfGraphProjection';

const PACKAGE_ID =
  '0x0000000000000000000000000000000000000000000000000000000000000002';

const signature = {
  tparamCount: 1,
  ins: [{ kind: 'object' as const }],
  outs: [{ kind: 'move_numeric' as const, width: 'u64' as const }],
  openSignatures: { parameters: [], returns: [] },
};

const genericOpenSignatures: {
  parameters: RawOpenSignature[];
  returns: RawOpenSignature[];
} = {
  parameters: [
    {
      reference: NULL_VALUE,
      body: { $kind: 'typeParameter', index: 0 },
    },
  ],
  returns: [
    {
      reference: NULL_VALUE,
      body: { $kind: 'vector', vector: { $kind: 'typeParameter', index: 0 } },
    },
  ],
};

function typeArgumentNode(value: string): RFNode<RFNodeData> {
  return {
    id: 'type-0',
    type: 'ptb-typearg',
    position: { x: 0, y: 0 },
    data: {
      ptbNode: {
        id: 'type-0',
        kind: 'TypeArgument',
        value,
        ports: [{ id: 'out_type', role: 'type', direction: 'out' }],
      },
    },
  };
}

function moveCallNode(): RFNode<RFNodeData> {
  return {
    id: 'call',
    type: 'ptb-mvc',
    position: { x: 200, y: 0 },
    data: {
      ptbNode: {
        id: 'call',
        kind: 'Command',
        command: 'moveCall',
        params: {
          runtime: { target: `${PACKAGE_ID}::generic::echo` },
        },
        ports: [
          { id: 'prev', role: 'flow', direction: 'in' },
          { id: 'next', role: 'flow', direction: 'out' },
          { id: 'in_type_0', role: 'type', direction: 'in' },
          {
            id: 'in_arg_0',
            role: 'io',
            direction: 'in',
            dataType: {
              kind: 'unknown',
              debugInfo: 'generic TypeParameter 0',
            },
          },
          {
            id: 'out_result',
            role: 'io',
            direction: 'out',
            dataType: {
              kind: 'vector',
              elem: {
                kind: 'unknown',
                debugInfo: 'generic TypeParameter 0',
              },
            },
          },
        ],
      },
    },
  };
}

function typeEdge(): RFEdge<RFEdgeData> {
  return {
    id: 'type-edge',
    type: 'ptb-type',
    source: 'type-0',
    sourceHandle: 'out_type',
    target: 'call',
    targetHandle: 'in_type_0',
  };
}

describe('MoveCall resolve state', () => {
  it('filters TxContext and maps open signatures through the model parser', () => {
    const txContext: RawOpenSignature = {
      reference: NULL_VALUE,
      body: {
        $kind: 'datatype',
        datatype: {
          typeName: '0x2::tx_context::TxContext',
          typeParameters: [],
        },
      },
    };
    const objectId: RawOpenSignature = {
      reference: NULL_VALUE,
      body: {
        $kind: 'datatype',
        datatype: {
          typeName: `${PACKAGE_ID}::object::ID`,
          typeParameters: [],
        },
      },
    };

    expect(
      toPTBFunctionOpenSignatures({
        parameters: [txContext, objectId],
        returns: [],
      }),
    ).toEqual({
      parameters: [objectId],
      returns: [],
    });
    expect(
      toPTBFunctionDataEntry({
        typeParameters: [],
        parameters: [txContext, objectId],
        returns: [],
      }),
    ).toEqual({
      tparamCount: 0,
      ins: [{ kind: 'scalar', name: 'id' }],
      outs: [],
      openSignatures: {
        parameters: [objectId],
        returns: [],
      },
    });
  });

  it('normalizes package-wide Move function metadata by module and function', () => {
    const modules = toPTBModuleData({
      zcoin: {
        value: {
          typeParameters: [{}],
          parameters: genericOpenSignatures.parameters,
          returns: genericOpenSignatures.returns,
        },
      },
      acoin: {
        z_last: {
          typeParameters: [],
          parameters: [],
          returns: [],
        },
        a_first: {
          typeParameters: [],
          parameters: [],
          returns: [],
        },
      },
    });

    expect(Object.keys(modules)).toEqual(['acoin', 'zcoin']);
    expect(Object.keys(modules.acoin)).toEqual(['a_first', 'z_last']);
    expect(
      toPTBModuleData({
        coin: {
          value: {
            typeParameters: [{}],
            parameters: genericOpenSignatures.parameters,
            returns: genericOpenSignatures.returns,
          },
        },
      }),
    ).toEqual({
      coin: {
        value: {
          tparamCount: 1,
          ins: [{ kind: 'unknown', debugInfo: 'generic TypeParameter 0' }],
          outs: [
            {
              kind: 'vector',
              elem: { kind: 'unknown', debugInfo: 'generic TypeParameter 0' },
            },
          ],
          openSignatures: genericOpenSignatures,
        },
      },
    });
  });

  it('stores SDK signature metadata as plain PTB document data', () => {
    class SdkOpenSignatureBody {
      $kind = 'u64' as const;
    }
    class SdkOpenSignature {
      reference = NULL_VALUE;
      body = new SdkOpenSignatureBody();
    }

    const entry = toPTBFunctionDataEntry({
      typeParameters: [],
      parameters: [new SdkOpenSignature() as RawOpenSignature],
      returns: [],
    });

    expect(Object.getPrototypeOf(entry.openSignatures.parameters[0])).toBe(
      Object.prototype,
    );
    expect(
      Object.getPrototypeOf(entry.openSignatures.parameters[0]?.body),
    ).toBe(Object.prototype);
    expect(() =>
      buildDoc({
        chain: 'sui:mainnet',
        graph: { nodes: [], edges: [] },
        view: { x: 0, y: 0, zoom: 1 },
        modules: {
          [PACKAGE_ID]: {
            coin: {
              value: entry,
            },
          },
        },
        objects: {},
      }),
    ).not.toThrow();
  });

  it('commits target and ports even before generic type arguments are complete', () => {
    const resolved = buildResolvedMoveCallState({
      packageId: '0x2',
      moduleName: 'coin',
      functionName: 'value',
      signature,
    });

    expect(resolved.typeArgumentCount).toBe(1);
    expect(resolved.patch.runtime).toEqual({
      target: `${PACKAGE_ID}::coin::value`,
      resultCount: 1,
    });
    expect(resolved.patch.ports.map((port) => port.id)).toContain('in_type_0');
    expect(resolved.patch.ports.map((port) => port.id)).toContain('in_arg_0');
  });

  it('does not write concrete type arguments into runtime params', () => {
    const resolved = buildResolvedMoveCallState({
      packageId: '0x2',
      moduleName: 'coin',
      functionName: 'value',
      signature,
    });

    expect(resolved.patch.runtime).toEqual({
      target: `${PACKAGE_ID}::coin::value`,
      resultCount: 1,
    });
  });

  it('drops stale concrete type argument state from resolved MoveCall runtime', () => {
    const resolved = buildResolvedMoveCallState({
      packageId: '0x2',
      moduleName: 'balance',
      functionName: 'value',
      signature,
    });

    expect(resolved.typeArgumentCount).toBe(1);
    expect(resolved.patch.runtime).toEqual({
      target: `${PACKAGE_ID}::balance::value`,
      resultCount: 1,
    });
  });

  it('does not validate TypeArgument node values while resolving the function target', () => {
    const resolved = buildResolvedMoveCallState({
      packageId: '0x2',
      moduleName: 'coin',
      functionName: 'value',
      signature,
    });

    expect(resolved.patch.runtime).toEqual({
      target: `${PACKAGE_ID}::coin::value`,
      resultCount: 1,
    });
  });

  it('materializes generic type ports and unresolved open signature value ports', () => {
    const resolved = buildResolvedMoveCallState({
      packageId: '0x2',
      moduleName: 'generic',
      functionName: 'echo',
      signature: {
        tparamCount: 1,
        ins: [
          { kind: 'unknown' as const, debugInfo: 'generic TypeParameter 0' },
        ],
        outs: [
          {
            kind: 'vector' as const,
            elem: {
              kind: 'unknown' as const,
              debugInfo: 'generic TypeParameter 0',
            },
          },
        ],
        openSignatures: genericOpenSignatures,
      },
      openSignatures: genericOpenSignatures,
    });

    expect(resolved.patch.runtime).toEqual({
      target: `${PACKAGE_ID}::generic::echo`,
      resultCount: 1,
    });
    expect(resolved.patch.ports.map((port) => port.id)).toEqual([
      'in_type_0',
      'in_arg_0',
      'out_result',
    ]);
    expect(resolved.patch.ports[1]?.dataType).toEqual({
      kind: 'unknown',
      debugInfo: 'generic TypeParameter 0',
    });
    expect(resolved.patch.ports[2]?.dataType).toEqual({
      kind: 'vector',
      elem: { kind: 'unknown', debugInfo: 'generic TypeParameter 0' },
    });
  });

  it('refreshes MoveCall value ports from connected TypeArgument nodes', () => {
    const refreshed = refreshMoveCallPortsFromSignatures(
      [typeArgumentNode('u64'), moveCallNode()],
      [typeEdge()],
      {
        [PACKAGE_ID]: {
          generic: {
            echo: {
              typeParameterCount: 1,
              parameters: genericOpenSignatures.parameters,
              returns: genericOpenSignatures.returns,
            },
          },
        },
      },
    );

    const ports = refreshed?.nodes.find((node) => node.id === 'call')?.data
      .ptbNode?.ports;

    expect(ports?.map((port) => port.id)).toEqual([
      'prev',
      'next',
      'in_type_0',
      'in_arg_0',
      'out_result',
    ]);
    expect(ports?.find((port) => port.id === 'in_arg_0')?.dataType).toEqual({
      kind: 'move_numeric',
      width: 'u64',
    });
    expect(ports?.find((port) => port.id === 'out_result')?.dataType).toEqual({
      kind: 'vector',
      elem: { kind: 'move_numeric', width: 'u64' },
    });
  });

  it('refreshes stale MoveCall resultCount when port signatures already match', () => {
    const call = moveCallNode();
    const ptbNode = call.data.ptbNode;
    if (ptbNode.kind !== 'Command') throw new Error('Expected MoveCall node');
    call.data.ptbNode = {
      ...ptbNode,
      params: {
        ...ptbNode.params,
        runtime: {
          ...ptbNode.params?.runtime,
          resultCount: 2,
        },
      },
      ports: ptbNode.ports?.map((port) => {
        if (port.id === 'in_arg_0') {
          return {
            ...port,
            dataType: { kind: 'move_numeric' as const, width: 'u64' as const },
          };
        }
        if (port.id === 'out_result') {
          return {
            ...port,
            dataType: {
              kind: 'vector' as const,
              elem: { kind: 'move_numeric' as const, width: 'u64' as const },
            },
          };
        }
        return port;
      }),
    };

    const refreshed = refreshMoveCallPortsFromSignatures(
      [typeArgumentNode('u64'), call],
      [typeEdge()],
      {
        [PACKAGE_ID]: {
          generic: {
            echo: {
              typeParameterCount: 1,
              parameters: genericOpenSignatures.parameters,
              returns: genericOpenSignatures.returns,
            },
          },
        },
      },
    );

    const refreshedNode = refreshed?.nodes.find((node) => node.id === 'call')
      ?.data.ptbNode;

    expect(refreshedNode?.kind).toBe('Command');
    if (refreshedNode?.kind !== 'Command') throw new Error('Expected command');
    expect(refreshedNode.params?.runtime?.resultCount).toBe(1);
  });

  it('remaps single-result MoveCall output edges during signature refresh', () => {
    const refreshed = refreshMoveCallPortsFromSignatures(
      [typeArgumentNode('u64'), moveCallNode()],
      [
        typeEdge(),
        {
          id: 'stale-result-edge',
          type: 'ptb-io',
          source: 'call',
          sourceHandle: 'out_0',
          sourceHandleId: 'out_0',
          target: 'consumer',
          targetHandle: 'in_arg_0',
          targetHandleId: 'in_arg_0',
        } as any,
      ],
      {
        [PACKAGE_ID]: {
          generic: {
            echo: {
              typeParameterCount: 1,
              parameters: genericOpenSignatures.parameters,
              returns: genericOpenSignatures.returns,
            },
          },
        },
      },
    );

    const edge = refreshed?.edges.find(
      (candidate) => candidate.id === 'stale-result-edge',
    ) as (RFEdge<RFEdgeData> & { sourceHandleId?: string }) | undefined;

    expect(edge?.sourceHandle).toBe(RESULT_HANDLE_ID);
    expect(edge?.sourceHandleId).toBe(RESULT_HANDLE_ID);
  });

  it('drops legacy MoveCall output aliases during signature refresh', () => {
    const refreshed = refreshMoveCallPortsFromSignatures(
      [typeArgumentNode('u64'), moveCallNode()],
      [
        typeEdge(),
        {
          id: 'legacy-result-edge',
          type: 'ptb-io',
          source: 'call',
          sourceHandle: 'out_ret_0',
          sourceHandleId: 'out_ret_0',
          target: 'consumer',
          targetHandle: 'in_arg_0',
          targetHandleId: 'in_arg_0',
        } as any,
      ],
      {
        [PACKAGE_ID]: {
          generic: {
            echo: {
              typeParameterCount: 1,
              parameters: genericOpenSignatures.parameters,
              returns: genericOpenSignatures.returns,
            },
          },
        },
      },
    );

    const edge = refreshed?.edges.find(
      (candidate) => candidate.id === 'legacy-result-edge',
    ) as (RFEdge<RFEdgeData> & { sourceHandleId?: string }) | undefined;

    expect(edge).toBeUndefined();
  });

  it('keeps edge-referenced MoveCall input ports that are not in the refreshed signature', () => {
    const refreshed = refreshMoveCallPortsFromSignatures(
      [typeArgumentNode('u64'), moveCallNode()],
      [
        typeEdge(),
        {
          id: 'pending-arg-edge',
          type: 'ptb-io',
          source: 'var-0',
          sourceHandle: 'out',
          target: 'call',
          targetHandle: undefined,
          targetHandleId: 'in_arg_1',
        } as any,
      ],
      {
        [PACKAGE_ID]: {
          generic: {
            echo: {
              typeParameterCount: 1,
              parameters: genericOpenSignatures.parameters,
              returns: genericOpenSignatures.returns,
            },
          },
        },
      },
    );

    const ports = refreshed?.nodes.find((node) => node.id === 'call')?.data
      .ptbNode?.ports;

    expect(ports?.map((port) => port.id)).toEqual([
      'prev',
      'next',
      'in_type_0',
      'in_arg_0',
      'out_result',
      'in_arg_1',
    ]);
    expect(ports?.find((port) => port.id === 'in_arg_1')).toMatchObject({
      role: 'io',
      direction: 'in',
      label: 'arg1',
      dataType: {
        kind: 'unknown',
        debugInfo: 'Referenced before MoveCall signature resolved',
      },
    });
  });

  it('keeps generic value ports unresolved while connected TypeArgument nodes are incomplete', () => {
    const refreshed = refreshMoveCallPortsFromSignatures(
      [typeArgumentNode(''), moveCallNode()],
      [typeEdge()],
      {
        [PACKAGE_ID]: {
          generic: {
            echo: {
              typeParameterCount: 1,
              parameters: genericOpenSignatures.parameters,
              returns: genericOpenSignatures.returns,
            },
          },
        },
      },
    );

    const ports = refreshed?.nodes.find((node) => node.id === 'call')?.data
      .ptbNode?.ports;

    expect(ports?.map((port) => port.id)).toEqual([
      'prev',
      'next',
      'in_type_0',
      'in_arg_0',
      'out_result',
    ]);
    expect(ports?.find((port) => port.id === 'in_arg_0')?.dataType).toEqual({
      kind: 'unknown',
      debugInfo: 'generic TypeParameter 0',
    });
    expect(ports?.find((port) => port.id === 'out_result')?.dataType).toEqual({
      kind: 'vector',
      elem: { kind: 'unknown', debugInfo: 'generic TypeParameter 0' },
    });
  });
});
