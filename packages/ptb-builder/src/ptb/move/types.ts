// src/ptb/move/types.ts
import type { SuiMoveNormalizedModule } from '@mysten/sui/client';

export type PTBModuleData = {
  _nameModules_: string[]; // for module selector
  modules: Record<
    string,
    SuiMoveNormalizedModule & { _nameFunctions_: string[] } // for function selector
  >;
};
