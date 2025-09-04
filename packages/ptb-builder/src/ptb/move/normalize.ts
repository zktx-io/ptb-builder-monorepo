// src/ptb/move/normalize.ts
import type {
  SuiMoveNormalizedFunction,
  SuiMoveNormalizedModule,
  SuiMoveNormalizedModules,
  SuiMoveNormalizedType,
} from '@mysten/sui/client';

import type { PTBModuleData } from './types';

export function deleteTxContext(
  types: SuiMoveNormalizedType[],
): SuiMoveNormalizedType[] {
  return types.filter((type) => {
    if (typeof type === 'object') {
      const s =
        (type as any).MutableReference?.Struct ||
        (type as any).Reference?.Struct ||
        (type as any).Struct;
      return !(
        s &&
        s.address === '0x2' &&
        s.module === 'tx_context' &&
        s.name === 'TxContext'
      );
    }
    return true;
  });
}

export function toPTBModuleData(data: SuiMoveNormalizedModules): PTBModuleData {
  const out: PTBModuleData = { _nameModules_: [], modules: {} };

  for (const [
    moduleName,
    moduleData,
  ] of Object.entries<SuiMoveNormalizedModule>(data)) {
    // sort function names for stable UI / debugging
    const names = Object.keys(moduleData.exposedFunctions).sort();
    const funcs: Record<string, SuiMoveNormalizedFunction> = {};

    for (const fname of names) {
      const f = moduleData.exposedFunctions[fname];
      funcs[fname] = {
        ...f,
        // TxContext is not relevant for PTB, so strip it out
        parameters: deleteTxContext(f.parameters),
        typeParameters: f.typeParameters,
      };
    }

    out._nameModules_.push(moduleName);
    out.modules[moduleName] = {
      ...moduleData,
      exposedFunctions: funcs,
      _nameFunctions_: names,
    };
  }

  // sort module names at the very end
  out._nameModules_.sort();

  return out;
}
