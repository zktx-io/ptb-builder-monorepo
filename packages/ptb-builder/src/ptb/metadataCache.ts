import type { Chain } from '../types';
import type {
  PTBFunctionData,
  PTBModulesEmbed,
  PTBObjectData,
  PTBObjectsEmbed,
} from './ptbDoc';

export type PTBMetadataCache = {
  objectsByChain: Partial<Record<Chain, PTBObjectsEmbed>>;
  modulesByChain: Partial<Record<Chain, PTBModulesEmbed>>;
};

export type CachedMoveFunction = {
  packageId: string;
  moduleName: string;
  functionName: string;
  signature: PTBFunctionData[string];
};

export function createPTBMetadataCache(): PTBMetadataCache {
  return {
    objectsByChain: {},
    modulesByChain: {},
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
