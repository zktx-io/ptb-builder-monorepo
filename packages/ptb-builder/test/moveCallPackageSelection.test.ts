import { describe, expect, it } from 'vitest';

import {
  moveCallFunctionNames,
  moveCallModuleNames,
  selectTargetAfterPackageLoad,
} from '../src/ui/nodes/cmds/MoveCallCommand/packageSelection';

const packageIndex = {
  coin: [
    { name: 'burn', visibility: 'public' as const, isEntry: true },
    { name: 'mint', visibility: 'public' as const, isEntry: false },
  ],
  pay: [{ name: 'split', visibility: 'public' as const, isEntry: false }],
};

describe('MoveCall package selection', () => {
  it('preserves an existing loaded target when package metadata is refreshed', () => {
    expect(
      selectTargetAfterPackageLoad(packageIndex, {
        moduleName: 'coin',
        functionName: 'mint',
      }),
    ).toEqual({
      moduleName: 'coin',
      functionName: 'mint',
    });
  });

  it('does not replace a missing target with the first package function', () => {
    expect(
      selectTargetAfterPackageLoad(packageIndex, {
        moduleName: 'coin',
        functionName: 'missing',
      }),
    ).toEqual({
      moduleName: 'coin',
      functionName: '',
    });
    expect(
      selectTargetAfterPackageLoad(packageIndex, {
        moduleName: '',
        functionName: '',
      }),
    ).toEqual({
      moduleName: '',
      functionName: '',
    });
  });

  it('reads module and function names from package indexes and signature embeds', () => {
    expect(moveCallModuleNames(packageIndex)).toEqual(['coin', 'pay']);
    expect(moveCallFunctionNames(packageIndex.coin)).toEqual(['burn', 'mint']);
    expect(
      moveCallFunctionNames({
        mint: {
          tparamCount: 0,
          ins: [],
          outs: [],
          openSignatures: { parameters: [], returns: [] },
        },
      }),
    ).toEqual(['mint']);
  });
});
