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
import type { PTBFunctionOpenSignatures } from './move/toPTBModuleData';
import type {
  PTBFunctionData,
  PTBModulesEmbed,
  PTBObjectData,
  PTBObjectsEmbed,
} from './ptbDoc';

export type PTBMetadataCache = {
  objectsByChain: Partial<Record<Chain, PTBObjectsEmbed>>;
  modulesByChain: Partial<Record<Chain, PTBModulesEmbed>>;
  moveFunctionsByChain: Partial<
    Record<Chain, Record<string, CachedMoveFunction>>
  >;
};

export type CachedMoveFunction = {
  completeness: 'partial' | 'complete';
  packageId: string;
  moduleName: string;
  functionName: string;
  signature: PTBFunctionData[string];
  openSignatures?: PTBFunctionOpenSignatures;
};

export function createPTBMetadataCache(): PTBMetadataCache {
  return {
    objectsByChain: {},
    modulesByChain: {},
    moveFunctionsByChain: {},
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
    moveFunctionsByChain: {
      ...cache.moveFunctionsByChain,
      [chain]: {},
    },
  };
}

function moveFunctionKey(
  packageId: string,
  moduleName: string,
  functionName: string,
): string {
  return `${packageId}::${moduleName}::${functionName}`;
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
    moveFunctionsByChain: {
      ...cache.moveFunctionsByChain,
      [chain]: {},
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
  opts?: { requireComplete?: boolean },
): CachedMoveFunction | undefined {
  const cached =
    cache.moveFunctionsByChain[chain]?.[
      moveFunctionKey(packageId, moduleName, functionName)
    ];
  if (
    cached &&
    (!opts?.requireComplete || cached.completeness === 'complete')
  ) {
    return cached;
  }

  const signature = getCachedModules(cache, chain)[packageId]?.[moduleName]?.[
    functionName
  ];
  if (!signature) return undefined;
  if (opts?.requireComplete) return undefined;
  return {
    completeness: 'partial',
    packageId,
    moduleName,
    functionName,
    signature,
  };
}

export function moveSignatureEvidenceFromCache(
  cache: PTBMetadataCache,
  chain: Chain,
): MovePackageSignatureEvidence | undefined {
  const moveFunctions = cache.moveFunctionsByChain[chain];
  if (moveFunctions === undefined) return undefined;

  const evidence: MovePackageSignatureEvidence = {};
  let hasEvidence = false;

  for (const entry of Object.values(moveFunctions)) {
    if (entry.completeness !== 'complete') continue;
    if (entry.openSignatures === undefined) continue;

    const packageId = parseObjectId(entry.packageId);
    const moduleName = parseMoveIdentifier(entry.moduleName);
    const functionName = parseMoveIdentifier(entry.functionName);
    if (
      packageId === undefined ||
      moduleName === undefined ||
      moduleName !== entry.moduleName ||
      functionName === undefined ||
      functionName !== entry.functionName
    ) {
      continue;
    }

    const signatureEvidence: MoveFunctionSignatureEvidence = {
      typeParameterCount: entry.signature.tparamCount,
      parameters: entry.openSignatures.parameters,
      returns: entry.openSignatures.returns,
    };
    if (!isMoveFunctionSignatureEvidence(signatureEvidence)) continue;

    evidence[packageId] = evidence[packageId] ?? {};
    evidence[packageId][moduleName] = evidence[packageId][moduleName] ?? {};
    evidence[packageId][moduleName][functionName] = signatureEvidence;
    hasEvidence = true;
  }

  return hasEvidence ? evidence : undefined;
}

export function upsertCachedMoveFunction(
  cache: PTBMetadataCache,
  chain: Chain,
  entry: Omit<CachedMoveFunction, 'completeness'> &
    Partial<Pick<CachedMoveFunction, 'completeness'>>,
): { cache: PTBMetadataCache; modules: PTBModulesEmbed } {
  const modules = getCachedModules(cache, chain);
  const moveFunctions = cache.moveFunctionsByChain[chain] ?? {};
  const nextEntry: CachedMoveFunction = {
    ...entry,
    completeness:
      entry.completeness ??
      (entry.openSignatures !== undefined ? 'complete' : 'partial'),
  };
  const nextModules = {
    ...modules,
    [nextEntry.packageId]: {
      ...(modules[nextEntry.packageId] ?? {}),
      [nextEntry.moduleName]: {
        ...(modules[nextEntry.packageId]?.[nextEntry.moduleName] ?? {}),
        [nextEntry.functionName]: nextEntry.signature,
      },
    },
  };

  const nextCache = replaceCachedModules(cache, chain, nextModules);
  return {
    cache: {
      ...nextCache,
      moveFunctionsByChain: {
        ...cache.moveFunctionsByChain,
        [chain]: {
          ...moveFunctions,
          [moveFunctionKey(
            entry.packageId,
            entry.moduleName,
            entry.functionName,
          )]: nextEntry,
        },
      },
    },
    modules: nextModules,
  };
}
