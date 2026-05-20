import { describe, expect, it } from 'vitest';

import {
  hasMovePackageFunction,
  movePackageFunctionNames,
  sortMovePackageFunctionIndex,
} from '../src/ptb/movePackageIndex';

describe('Move package function indexes', () => {
  it('sorts modules and callable function entries by name', () => {
    expect(
      sortMovePackageFunctionIndex({
        z: [{ name: 'last', visibility: 'public', isEntry: false }],
        a: [
          { name: 'mint', visibility: 'public', isEntry: false },
          { name: 'burn', visibility: 'public', isEntry: true },
          { name: 'mint', visibility: 'public', isEntry: false },
        ],
        empty: [],
      }),
    ).toEqual({
      a: [
        { name: 'burn', visibility: 'public', isEntry: true },
        { name: 'mint', visibility: 'public', isEntry: false },
      ],
      z: [{ name: 'last', visibility: 'public', isEntry: false }],
    });
  });

  it('checks function existence through the entry shape', () => {
    const modules = {
      coin: [
        { name: 'burn', visibility: 'public' as const, isEntry: true },
        { name: 'mint', visibility: 'public' as const, isEntry: false },
      ],
    };

    expect(movePackageFunctionNames(modules.coin)).toEqual(['burn', 'mint']);
    expect(hasMovePackageFunction(modules, 'coin', 'mint')).toBe(true);
    expect(hasMovePackageFunction(modules, 'coin', 'split')).toBe(false);
  });
});
