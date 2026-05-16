import { describe, expect, it } from 'vitest';

import {
  createPTBMetadataCache,
  getCachedMoveFunction,
  replaceCachedChainData,
  upsertCachedMoveFunction,
  upsertCachedObjectData,
} from '../src/ptb/metadataCache';
import type { PTBObjectData } from '../src/ptb/ptbDoc';

const object: PTBObjectData = {
  objectId: '0x1',
  typeTag: '0x2::coin::Coin<0x2::sui::SUI>',
};

const signature = {
  tparamCount: 0,
  ins: [],
  outs: [],
};

describe('PTB metadata cache', () => {
  it('keys object metadata by chain', () => {
    let cache = createPTBMetadataCache();
    const next = upsertCachedObjectData(cache, 'sui:testnet', object);
    cache = next.cache;

    expect(cache.objectsByChain['sui:testnet']?.['0x1']).toEqual(object);
    expect(cache.objectsByChain['sui:mainnet']?.['0x1']).toBeUndefined();
  });

  it('replaces only the selected chain object cache', () => {
    let cache = createPTBMetadataCache();
    cache = upsertCachedObjectData(cache, 'sui:testnet', object).cache;
    cache = replaceCachedChainData(cache, 'sui:mainnet', {
      objects: { '0x2': { ...object, objectId: '0x2' } },
      modules: {},
    });

    expect(cache.objectsByChain['sui:testnet']?.['0x1']).toEqual(object);
    expect(cache.objectsByChain['sui:mainnet']?.['0x1']).toBeUndefined();
    expect(cache.objectsByChain['sui:mainnet']?.['0x2']?.objectId).toBe('0x2');
  });

  it('replaces modules and objects for one chain without touching other chains', () => {
    let cache = createPTBMetadataCache();
    cache = upsertCachedObjectData(cache, 'sui:testnet', object).cache;
    cache = upsertCachedMoveFunction(cache, 'sui:testnet', {
      packageId: '0xpkg',
      moduleName: 'm',
      functionName: 'f',
      signature,
    }).cache;

    cache = replaceCachedChainData(cache, 'sui:mainnet', {
      objects: { '0x2': { ...object, objectId: '0x2' } },
      modules: {
        '0xmain': {
          m: {
            f: {
              ...signature,
              tparamCount: 2,
            },
          },
        },
      },
    });

    expect(cache.objectsByChain['sui:testnet']?.['0x1']).toEqual(object);
    expect(
      getCachedMoveFunction(cache, 'sui:testnet', '0xpkg', 'm', 'f')?.signature,
    ).toEqual(signature);
    expect(cache.objectsByChain['sui:mainnet']?.['0x2']?.objectId).toBe('0x2');
    expect(
      getCachedMoveFunction(cache, 'sui:mainnet', '0xmain', 'm', 'f')?.signature
        .tparamCount,
    ).toBe(2);
  });

  it('keys Move function metadata by chain and supports overwrite refresh', () => {
    let cache = createPTBMetadataCache();
    cache = upsertCachedMoveFunction(cache, 'sui:testnet', {
      packageId: '0xpkg',
      moduleName: 'm',
      functionName: 'f',
      signature,
    }).cache;

    expect(
      getCachedMoveFunction(cache, 'sui:testnet', '0xpkg', 'm', 'f')?.signature,
    ).toEqual(signature);
    expect(
      getCachedMoveFunction(cache, 'sui:mainnet', '0xpkg', 'm', 'f'),
    ).toBeUndefined();

    const refreshed = {
      ...signature,
      tparamCount: 1,
    };
    cache = upsertCachedMoveFunction(cache, 'sui:testnet', {
      packageId: '0xpkg',
      moduleName: 'm',
      functionName: 'f',
      signature: refreshed,
    }).cache;

    const cached = getCachedMoveFunction(
      cache,
      'sui:testnet',
      '0xpkg',
      'm',
      'f',
    );
    expect(cached?.signature.tparamCount).toBe(1);
  });
});
