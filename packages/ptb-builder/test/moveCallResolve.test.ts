import { describe, expect, it } from 'vitest';

import { buildResolvedMoveCallState } from '../src/ui/nodes/cmds/MoveCallCommand/resolveMoveCall';

const signature = {
  tparamCount: 1,
  ins: [{ kind: 'object' as const }],
  outs: [{ kind: 'move_numeric' as const, width: 'u64' as const }],
};

describe('MoveCall resolve state', () => {
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
      target: '0x2::coin::value',
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
      target: '0x2::coin::value',
      typeArguments: ['0x2::sui::SUI'],
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
    expect(resolved.typeArgumentBuffers).toEqual(['0x2::sui::SUI']);
    expect(resolved.patch.runtime).toEqual({
      target: '0x2::balance::value',
      typeArguments: ['0x2::sui::SUI'],
    });
  });
});
