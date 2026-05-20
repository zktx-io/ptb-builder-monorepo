import {
  isMoveFunctionSignatureEvidence,
  parseMoveIdentifier,
  parseObjectId,
} from '@zktx.io/ptb-model';
import type {
  MoveFunctionSignatureEvidence,
  MovePackageSignatureEvidence,
} from '@zktx.io/ptb-model';

import type { Chain } from '../types';
import type { MovePackageFunctionIndex } from './movePackageIndex';
import type {
  PTBFunctionData,
  PTBModulesEmbed,
  PTBObjectData,
  PTBObjectsEmbed,
} from './ptbDoc';

export type PTBMetadataCache = {
  objectsByChain: Partial<Record<Chain, PTBObjectsEmbed>>;
  modulesByChain: Partial<Record<Chain, PTBModulesEmbed>>;
  packageIndexesByChain: Partial<
    Record<Chain, Record<string, MovePackageFunctionIndex>>
  >;
};

export type CachedMoveFunction = {
  packageId: string;
  moduleName: string;
  functionName: string;
  signature: PTBFunctionData[string];
};

export type { MovePackageFunctionIndex } from './movePackageIndex';

export type CachedMovePackageIndex = {
  packageId: string;
  modules: MovePackageFunctionIndex;
};

export function createPTBMetadataCache(): PTBMetadataCache {
  return {
    objectsByChain: {},
    modulesByChain: {},
    packageIndexesByChain: {},
  };
}

function getCachedObjects(
  cache: PTBMetadataCache,
  chain: Chain,
): PTBObjectsEmbed {
  return cache.objectsByChain[chain] ?? {};
}

function getCachedModules(
  cache: PTBMetadataCache,
  chain: Chain,
): PTBModulesEmbed {
  return cache.modulesByChain[chain] ?? {};
}

function getCachedPackageIndexes(
  cache: PTBMetadataCache,
  chain: Chain,
): Record<string, MovePackageFunctionIndex> {
  return cache.packageIndexesByChain[chain] ?? {};
}

function replaceCachedObjects(
  cache: PTBMetadataCache,
  chain: Chain,
  objects: PTBObjectsEmbed,
): PTBMetadataCache {
  return {
    ...cache,
    objectsByChain: {
      ...cache.objectsByChain,
      [chain]: objects,
    },
  };
}

function replaceCachedModules(
  cache: PTBMetadataCache,
  chain: Chain,
  modules: PTBModulesEmbed,
): PTBMetadataCache {
  return {
    ...cache,
    modulesByChain: {
      ...cache.modulesByChain,
      [chain]: modules,
    },
  };
}

export function replaceCachedChainData(
  cache: PTBMetadataCache,
  chain: Chain,
  data: {
    objects: PTBObjectsEmbed;
    modules: PTBModulesEmbed;
  },
): PTBMetadataCache {
  return {
    ...cache,
    objectsByChain: {
      ...cache.objectsByChain,
      [chain]: data.objects,
    },
    modulesByChain: {
      ...cache.modulesByChain,
      [chain]: data.modules,
    },
  };
}

export function upsertCachedObjectData(
  cache: PTBMetadataCache,
  chain: Chain,
  object: PTBObjectData,
): { cache: PTBMetadataCache; objects: PTBObjectsEmbed } {
  const objects = {
    ...getCachedObjects(cache, chain),
    [object.objectId]: object,
  };
  return {
    cache: replaceCachedObjects(cache, chain, objects),
    objects,
  };
}

export function getCachedMoveFunction(
  cache: PTBMetadataCache,
  chain: Chain,
  packageId: string,
  moduleName: string,
  functionName: string,
): CachedMoveFunction | undefined {
  const signature = getCachedModules(cache, chain)[packageId]?.[moduleName]?.[
    functionName
  ];
  if (!signature) return undefined;
  return {
    packageId,
    moduleName,
    functionName,
    signature,
  };
}

export function getCachedMovePackageIndex(
  cache: PTBMetadataCache,
  chain: Chain,
  packageId: string,
): CachedMovePackageIndex | undefined {
  const modules = getCachedPackageIndexes(cache, chain)[packageId];
  if (!modules) return undefined;
  return {
    packageId,
    modules,
  };
}

export function moveSignatureEvidenceFromCache(
  cache: PTBMetadataCache,
  chain: Chain,
): MovePackageSignatureEvidence | undefined {
  const modules = cache.modulesByChain[chain];
  if (modules === undefined) return undefined;

  const evidence: MovePackageSignatureEvidence = {};
  let hasEvidence = false;

  for (const [rawPackageId, moduleMap] of Object.entries(modules)) {
    const packageId = parseObjectId(rawPackageId);
    if (packageId === undefined) continue;

    for (const [rawModuleName, functions] of Object.entries(moduleMap)) {
      const moduleName = parseMoveIdentifier(rawModuleName);
      if (moduleName === undefined || moduleName !== rawModuleName) continue;

      for (const [rawFunctionName, signature] of Object.entries(functions)) {
        const functionName = parseMoveIdentifier(rawFunctionName);
        if (functionName === undefined || functionName !== rawFunctionName) {
          continue;
        }

        const signatureEvidence: MoveFunctionSignatureEvidence = {
          typeParameterCount: signature.tparamCount,
          parameters: signature.openSignatures.parameters,
          returns: signature.openSignatures.returns,
        };
        if (!isMoveFunctionSignatureEvidence(signatureEvidence)) continue;

        evidence[packageId] = evidence[packageId] ?? {};
        evidence[packageId][moduleName] = evidence[packageId][moduleName] ?? {};
        evidence[packageId][moduleName][functionName] = signatureEvidence;
        hasEvidence = true;
      }
    }
  }

  return hasEvidence ? evidence : undefined;
}

export function upsertCachedMoveFunction(
  cache: PTBMetadataCache,
  chain: Chain,
  entry: CachedMoveFunction,
): { cache: PTBMetadataCache; modules: PTBModulesEmbed } {
  const modules = getCachedModules(cache, chain);
  const nextModules = {
    ...modules,
    [entry.packageId]: {
      ...(modules[entry.packageId] ?? {}),
      [entry.moduleName]: {
        ...(modules[entry.packageId]?.[entry.moduleName] ?? {}),
        [entry.functionName]: entry.signature,
      },
    },
  };

  return {
    cache: replaceCachedModules(cache, chain, nextModules),
    modules: nextModules,
  };
}

export function upsertCachedMovePackageIndex(
  cache: PTBMetadataCache,
  chain: Chain,
  entry: CachedMovePackageIndex,
): {
  cache: PTBMetadataCache;
  packageIndexes: Record<string, MovePackageFunctionIndex>;
} {
  const packageIndexes = getCachedPackageIndexes(cache, chain);
  const nextPackageIndexes = {
    ...packageIndexes,
    [entry.packageId]: entry.modules,
  };

  return {
    cache: {
      ...cache,
      packageIndexesByChain: {
        ...cache.packageIndexesByChain,
        [chain]: nextPackageIndexes,
      },
    },
    packageIndexes: nextPackageIndexes,
  };
}
