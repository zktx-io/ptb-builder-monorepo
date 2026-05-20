import { parseObjectId, toPTBTypeFromOpenSignature } from '@zktx.io/ptb-model';

import type { CommandRuntimeParams, Port } from '../../../../ptb/graph/types';
import type {
  PTBFunctionData,
  PTBFunctionOpenSignatures,
} from '../../../../ptb/ptbDoc';
import { buildMoveCallPorts } from '../../../../ptb/registry';

export type ResolvedMoveCallPatch = {
  runtime: CommandRuntimeParams;
  ports: Port[];
};

export type ResolvedMoveCallState = {
  patch: ResolvedMoveCallPatch;
  typeArgumentCount: number;
};

export function buildResolvedMoveCallState(params: {
  packageId: string;
  moduleName: string;
  functionName: string;
  signature: PTBFunctionData[string];
  openSignatures?: PTBFunctionOpenSignatures;
}): ResolvedMoveCallState {
  const typeArgumentCount = params.signature.tparamCount;
  const packageId = parseObjectId(params.packageId) ?? params.packageId;
  const target = `${packageId}::${params.moduleName}::${params.functionName}`;
  const inputs = params.openSignatures
    ? params.openSignatures.parameters.map((signature) =>
        toPTBTypeFromOpenSignature(signature),
      )
    : params.signature.ins;
  const outputs = params.openSignatures
    ? params.openSignatures.returns.map((signature) =>
        toPTBTypeFromOpenSignature(signature),
      )
    : params.signature.outs;

  return {
    patch: {
      runtime: {
        target,
      },
      ports: buildMoveCallPorts(inputs, outputs, typeArgumentCount),
    },
    typeArgumentCount,
  };
}
