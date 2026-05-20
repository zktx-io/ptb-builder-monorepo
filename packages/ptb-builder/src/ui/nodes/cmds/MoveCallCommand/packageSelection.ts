import {
  hasMovePackageFunction,
  movePackageFunctionNames,
} from '../../../../ptb/movePackageIndex';
import type {
  MovePackageFunctionEntry,
  MovePackageFunctionIndex,
} from '../../../../ptb/movePackageIndex';
import type { PTBFunctionData, PTBModulesEmbed } from '../../../../ptb/ptbDoc';

export type MoveCallTargetDraft = {
  moduleName: string;
  functionName: string;
};

export function moveCallModuleNames(
  modules: MovePackageFunctionIndex | PTBModulesEmbed[string] | undefined,
): string[] {
  return modules
    ? Object.keys(modules).sort((left, right) => left.localeCompare(right))
    : [];
}

export function moveCallFunctionNames(
  moduleEntry:
    | readonly MovePackageFunctionEntry[]
    | PTBFunctionData
    | undefined,
): string[] {
  if (!moduleEntry) return [];
  return Array.isArray(moduleEntry)
    ? movePackageFunctionNames(moduleEntry)
    : Object.keys(moduleEntry).sort((left, right) => left.localeCompare(right));
}

export function selectTargetAfterPackageLoad(
  modules: MovePackageFunctionIndex,
  current: MoveCallTargetDraft,
): MoveCallTargetDraft {
  if (
    current.moduleName &&
    current.functionName &&
    hasMovePackageFunction(modules, current.moduleName, current.functionName)
  ) {
    return current;
  }

  if (current.moduleName && modules[current.moduleName]) {
    return {
      moduleName: current.moduleName,
      functionName: '',
    };
  }

  return {
    moduleName: '',
    functionName: '',
  };
}
