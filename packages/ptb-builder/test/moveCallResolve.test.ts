import { NULL_VALUE, type RawOpenSignature } from '@zktx.io/ptb-model';
import { describe, expect, it } from 'vitest';

import {
  isTxContextOpenSignature,
  toPTBTypeFromOpenSignature,
} from '../src/ptb/move/toPTBType';
import { buildResolvedMoveCallState } from '../src/ui/nodes/cmds/MoveCallCommand/resolveMoveCall';

const PACKAGE_ID =
  '0x0000000000000000000000000000000000000000000000000000000000000002';
const SUI_TYPE = `${PACKAGE_ID}::sui::SUI`;

const signature = {
  tparamCount: 1,
  ins: [{ kind: 'object' as const }],
  outs: [{ kind: 'move_numeric' as const, width: 'u64' as const }],
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

describe('MoveCall resolve state', () => {
  it('normalizes open-signature struct addresses through the model parser', () => {
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

    expect(isTxContextOpenSignature(txContext)).toBe(true);
    expect(toPTBTypeFromOpenSignature(objectId)).toEqual({
      kind: 'scalar',
      name: 'id',
    });
  });

  it('commits target and ports even before generic type arguments are complete', () => {
    const resolved = buildResolvedMoveCallState({
      packageId: '0x2',
      moduleName: 'coin',
      functionName: 'value',
      signature,
      typeArgumentBuffers: [''],
    });

    expect(resolved.needsConcreteTypeArguments).toBe(true);
    expect(resolved.patch.runtime).toEqual({
      target: `${PACKAGE_ID}::coin::value`,
    });
    expect(resolved.patch.ports.length).toBeGreaterThan(0);
  });

  it('adds concrete type arguments when all generic slots are filled', () => {
    const resolved = buildResolvedMoveCallState({
      packageId: '0x2',
      moduleName: 'coin',
      functionName: 'value',
      signature,
      typeArgumentBuffers: [' 0x2::sui::SUI '],
    });

    expect(resolved.needsConcreteTypeArguments).toBe(false);
    expect(resolved.patch.runtime).toEqual({
      target: `${PACKAGE_ID}::coin::value`,
      typeArguments: [SUI_TYPE],
    });
  });

  it('drops stale extra type arguments when the resolved signature shrinks', () => {
    const resolved = buildResolvedMoveCallState({
      packageId: '0x2',
      moduleName: 'balance',
      functionName: 'value',
      signature,
      typeArgumentBuffers: ['0x2::sui::SUI', '0x2::coin::COIN'],
    });

    expect(resolved.typeArgumentCount).toBe(1);
    expect(resolved.typeArgumentBuffers).toEqual([SUI_TYPE]);
    expect(resolved.patch.runtime).toEqual({
      target: `${PACKAGE_ID}::balance::value`,
      typeArguments: [SUI_TYPE],
    });
  });

  it('rejects invalid type arguments instead of writing them into runtime params', () => {
    const resolved = buildResolvedMoveCallState({
      packageId: '0x2',
      moduleName: 'coin',
      functionName: 'value',
      signature,
      typeArgumentBuffers: ['signer'],
    });

    expect(resolved.needsConcreteTypeArguments).toBe(true);
    expect(resolved.typeArgumentError).toContain(
      'not a supported Move type tag',
    );
    expect(resolved.patch.runtime).toEqual({
      target: `${PACKAGE_ID}::coin::value`,
    });
  });

  it('substitutes concrete generic type arguments into resolved value ports', () => {
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
      },
      openSignatures: genericOpenSignatures,
      typeArgumentBuffers: ['u64'],
    });

    expect(resolved.needsConcreteTypeArguments).toBe(false);
    expect(resolved.patch.runtime).toEqual({
      target: `${PACKAGE_ID}::generic::echo`,
      typeArguments: ['u64'],
    });
    expect(resolved.patch.ports[0]?.dataType).toEqual({
      kind: 'move_numeric',
      width: 'u64',
    });
    expect(resolved.patch.ports[1]?.dataType).toEqual({
      kind: 'vector',
      elem: { kind: 'move_numeric', width: 'u64' },
    });
  });
});
