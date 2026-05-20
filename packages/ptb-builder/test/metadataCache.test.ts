import { NULL_VALUE } from '@zktx.io/ptb-model';
import { describe, expect, it } from 'vitest';

import {
  createPTBMetadataCache,
  getCachedMoveFunction,
  getCachedMovePackageIndex,
  moveSignatureEvidenceFromCache,
  replaceCachedChainData,
  upsertCachedMoveFunction,
  upsertCachedMovePackageIndex,
  upsertCachedObjectData,
} from '../src/ptb/metadataCache';
import type { PTBFunctionData, PTBObjectData } from '../src/ptb/ptbDoc';

const object: PTBObjectData = {
  objectId: '0x1',
  typeTag: '0x2::coin::Coin<0x2::sui::SUI>',
};

const openSignatures = {
  parameters: [{ reference: NULL_VALUE, body: { $kind: 'u64' as const } }],
  returns: [],
};
const signature = {
  tparamCount: 0,
  ins: [{ kind: 'move_numeric' as const, width: 'u64' as const }],
  outs: [],
  openSignatures,
} satisfies PTBFunctionData[string];
const evidencePackageId =
  '0x0000000000000000000000000000000000000000000000000000000000000002';
const evidenceModuleName = 'coin';
const evidenceFunctionName = 'value';

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
    expect(cached?.signature).toEqual(refreshed);
  });

  it('uses stored module embeds as complete Move function cache entries', () => {
    let cache = createPTBMetadataCache();

    cache = replaceCachedChainData(cache, 'sui:testnet', {
      objects: {},
      modules: {
        '0xpkg': {
          m: {
            f: signature,
          },
        },
      },
    });

    expect(
      getCachedMoveFunction(cache, 'sui:testnet', '0xpkg', 'm', 'f')?.signature,
    ).toEqual(signature);
  });

  it('stores package discovery indexes separately from persisted signatures', () => {
    let cache = createPTBMetadataCache();
    const next = upsertCachedMovePackageIndex(cache, 'sui:testnet', {
      packageId: '0xpkg',
      modules: {
        coin: [
          { name: 'burn', visibility: 'public', isEntry: false },
          { name: 'mint', visibility: 'public', isEntry: true },
        ],
      },
    });
    cache = next.cache;

    expect(
      getCachedMovePackageIndex(cache, 'sui:testnet', '0xpkg')?.modules,
    ).toEqual({
      coin: [
        { name: 'burn', visibility: 'public', isEntry: false },
        { name: 'mint', visibility: 'public', isEntry: true },
      ],
    });
    expect(
      getCachedMoveFunction(cache, 'sui:testnet', '0xpkg', 'coin', 'mint'),
    ).toBeUndefined();
    expect(cache.modulesByChain['sui:testnet']).toBeUndefined();
  });

  it('keeps package indexes when document-backed modules are replaced', () => {
    let cache = createPTBMetadataCache();
    cache = upsertCachedMovePackageIndex(cache, 'sui:testnet', {
      packageId: '0xpkg',
      modules: {
        coin: [{ name: 'value', visibility: 'public', isEntry: false }],
      },
    }).cache;

    cache = replaceCachedChainData(cache, 'sui:testnet', {
      objects: {},
      modules: {
        '0xdoc': {
          m: {
            f: signature,
          },
        },
      },
    });

    expect(
      getCachedMovePackageIndex(cache, 'sui:testnet', '0xpkg')?.modules,
    ).toEqual({
      coin: [{ name: 'value', visibility: 'public', isEntry: false }],
    });
    expect(
      getCachedMoveFunction(cache, 'sui:testnet', '0xdoc', 'm', 'f')?.signature,
    ).toEqual(signature);
  });

  it('projects cached Move functions into model signature evidence', () => {
    let cache = createPTBMetadataCache();
    cache = upsertCachedMoveFunction(cache, 'sui:testnet', {
      packageId: evidencePackageId,
      moduleName: evidenceModuleName,
      functionName: evidenceFunctionName,
      signature: {
        ...signature,
        tparamCount: 1,
      },
    }).cache;

    const evidence = moveSignatureEvidenceFromCache(cache, 'sui:testnet');

    expect(evidence).toEqual({
      [evidencePackageId]: {
        [evidenceModuleName]: {
          [evidenceFunctionName]: {
            typeParameterCount: 1,
            parameters: openSignatures.parameters,
            returns: openSignatures.returns,
          },
        },
      },
    });
    expect(
      moveSignatureEvidenceFromCache(cache, 'sui:mainnet'),
    ).toBeUndefined();
  });

  it('canonicalizes package ids when projecting Move signature evidence', () => {
    let cache = createPTBMetadataCache();
    cache = upsertCachedMoveFunction(cache, 'sui:testnet', {
      packageId: '0x2',
      moduleName: evidenceModuleName,
      functionName: evidenceFunctionName,
      signature,
    }).cache;

    expect(moveSignatureEvidenceFromCache(cache, 'sui:testnet')).toEqual({
      [evidencePackageId]: {
        [evidenceModuleName]: {
          [evidenceFunctionName]: {
            typeParameterCount: 0,
            parameters: openSignatures.parameters,
            returns: openSignatures.returns,
          },
        },
      },
    });
  });

  it('keeps valid Move signature evidence while omitting invalid entries', () => {
    let cache = createPTBMetadataCache();
    cache = upsertCachedMoveFunction(cache, 'sui:testnet', {
      packageId: evidencePackageId,
      moduleName: evidenceModuleName,
      functionName: evidenceFunctionName,
      signature,
    }).cache;
    cache = upsertCachedMoveFunction(cache, 'sui:testnet', {
      packageId: 'not-an-id',
      moduleName: 'coin',
      functionName: 'value',
      signature,
    }).cache;
    cache = upsertCachedMoveFunction(cache, 'sui:testnet', {
      packageId: evidencePackageId,
      moduleName: 'bad-module',
      functionName: 'value',
      signature,
    }).cache;
    cache = upsertCachedMoveFunction(cache, 'sui:testnet', {
      packageId: evidencePackageId,
      moduleName: evidenceModuleName,
      functionName: 'bad_signature',
      signature: {
        ...signature,
        tparamCount: -1,
      },
    }).cache;

    expect(moveSignatureEvidenceFromCache(cache, 'sui:testnet')).toEqual({
      [evidencePackageId]: {
        [evidenceModuleName]: {
          [evidenceFunctionName]: {
            typeParameterCount: 0,
            parameters: openSignatures.parameters,
            returns: openSignatures.returns,
          },
        },
      },
    });
  });
});
