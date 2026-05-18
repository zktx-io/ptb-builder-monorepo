// src/ptb/move/toPTBModuleData.ts

// -----------------------------------------------------------------------------
// Convert SDK Core open signatures into PTB-friendly function metadata.
// PTBFunctionData captures only what PTB needs: tparamCount, ins, outs.
// TxContext is not modeled by PTB and is dropped from both parameters/returns.
// -----------------------------------------------------------------------------

import {
  isTxContextOpenSignature,
  type RawOpenSignature,
  toPTBTypeFromOpenSignature,
} from '@zktx.io/ptb-model';

import type { PTBFunctionData } from '../ptbDoc';

export type PTBFunctionOpenSignatures = {
  parameters: RawOpenSignature[];
  returns: RawOpenSignature[];
};

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
  };
}
