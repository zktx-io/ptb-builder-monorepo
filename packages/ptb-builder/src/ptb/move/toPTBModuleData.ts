// src/ptb/move/toPTBModuleData.ts

// -----------------------------------------------------------------------------
// Convert SDK Core open signatures into PTB-friendly function metadata.
// PTBFunctionData keeps both resolved PTB port types and the original open
// signatures so generic MoveCall ports can be recomputed after reload.
// TxContext is not modeled by PTB and is dropped from both parameters/returns.
// -----------------------------------------------------------------------------

import {
  isTxContextOpenSignature,
  type RawOpenSignature,
  toPTBTypeFromOpenSignature,
} from '@zktx.io/ptb-model';

import type { PTBFunctionData, PTBFunctionOpenSignatures } from '../ptbDoc';

export type PTBMoveFunctionMetadata = {
  typeParameters?: unknown[];
  parameters?: RawOpenSignature[];
  returns?: RawOpenSignature[];
};

export type PTBMoveModuleMetadata = Record<string, PTBMoveFunctionMetadata>;

export type PTBMovePackageMetadata = Record<string, PTBMoveModuleMetadata>;

export function toPTBFunctionOpenSignatures(data: {
  parameters?: RawOpenSignature[];
  returns?: RawOpenSignature[];
}): PTBFunctionOpenSignatures {
  return {
    parameters: (data.parameters ?? []).filter(
      (signature) => !isTxContextOpenSignature(signature),
    ),
    returns: (data.returns ?? []).filter(
      (signature) => !isTxContextOpenSignature(signature),
    ),
  };
}

export function toPTBFunctionDataEntry(data: {
  typeParameters?: unknown[];
  parameters?: RawOpenSignature[];
  returns?: RawOpenSignature[];
}): PTBFunctionData[string] {
  const open = toPTBFunctionOpenSignatures(data);

  return {
    tparamCount: Array.isArray(data.typeParameters)
      ? data.typeParameters.length
      : 0,
    ins: open.parameters.map((signature) =>
      toPTBTypeFromOpenSignature(signature),
    ),
    outs: open.returns.map((signature) =>
      toPTBTypeFromOpenSignature(signature),
    ),
    openSignatures: open,
  };
}

export function toPTBModuleData(
  data: PTBMovePackageMetadata,
): Record<string, PTBFunctionData> {
  const modules: Record<string, PTBFunctionData> = {};

  for (const [moduleName, functions] of Object.entries(data)) {
    const moduleFunctions: PTBFunctionData = {};
    for (const [functionName, functionData] of Object.entries(functions).sort(
      ([left], [right]) => left.localeCompare(right),
    )) {
      moduleFunctions[functionName] = toPTBFunctionDataEntry(functionData);
    }
    modules[moduleName] = moduleFunctions;
  }

  return Object.fromEntries(
    Object.entries(modules).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
}
