// src/ptb/move/toPTBModuleData.ts

// -----------------------------------------------------------------------------
// Convert SDK Core open signatures into PTB-friendly function metadata.
// PTBFunctionData captures only what PTB needs: tparamCount, ins, outs.
// TxContext is not modeled by PTB and is dropped from both parameters/returns.
// -----------------------------------------------------------------------------

import type { RawOpenSignature } from '@zktx.io/ptb-model';

import {
  isTxContextOpenSignature,
  toPTBTypeFromOpenSignature,
} from './toPTBType';
import type { PTBFunctionData } from '../ptbDoc';

export function toPTBFunctionDataEntry(data: {
  typeParameters?: unknown[];
  parameters?: RawOpenSignature[];
  returns?: RawOpenSignature[];
}): PTBFunctionData[string] {
  const parameters = (data.parameters ?? []).filter(
    (signature) => !isTxContextOpenSignature(signature),
  );
  const returns = (data.returns ?? []).filter(
    (signature) => !isTxContextOpenSignature(signature),
  );

  return {
    tparamCount: Array.isArray(data.typeParameters)
      ? data.typeParameters.length
      : 0,
    ins: parameters.map(toPTBTypeFromOpenSignature),
    outs: returns.map(toPTBTypeFromOpenSignature),
  };
}
