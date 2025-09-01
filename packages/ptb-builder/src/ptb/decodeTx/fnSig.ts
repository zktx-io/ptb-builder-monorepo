// Optional module/function signature lookup from normalized Move modules.

import type { SuiMoveNormalizedModules } from '@mysten/sui/client';

/**
 * Return normalized function entry if available in the provided modules map.
 * Accepts either `pkgEntry.modules[mod]` (PTBModuleData) or `pkgEntry[mod]` (raw Sui map).
 */
export function getFnSig(
  modules: Record<string, SuiMoveNormalizedModules> | undefined,
  pkg: string,
  mod: string,
  fn: string,
): any | undefined {
  const pkgEntry = (modules as any)?.[pkg];
  if (!pkgEntry) return undefined;
  const modEntry = pkgEntry?.modules?.[mod] ?? pkgEntry?.[mod];
  return modEntry?.exposedFunctions?.[fn];
}
