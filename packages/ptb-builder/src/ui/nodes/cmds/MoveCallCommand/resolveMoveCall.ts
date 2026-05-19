import {
  parseMoveTypeTag,
  parseObjectId,
  toPTBTypeFromOpenSignature,
} from '@zktx.io/ptb-model';

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
  typeArgumentBuffers: string[];
  needsConcreteTypeArguments: boolean;
  typeArgumentError?: string;
};

export function padTypeArguments(
  values: readonly string[],
  count: number,
): string[] {
  return Array.from({ length: count }, (_value, index) => values[index] ?? '');
}

type ConcreteTypeArgumentsResult =
  | { kind: 'ready'; values: string[] }
  | { kind: 'incomplete' }
  | { kind: 'invalid'; index: number; value: string };

function resolveConcreteTypeArguments(
  values: readonly string[],
  count: number,
): ConcreteTypeArgumentsResult {
  const next = padTypeArguments(values, count).map((value) => value.trim());
  const firstMissing = next.findIndex((value) => value.length === 0);
  if (firstMissing >= 0) return { kind: 'incomplete' };

  const canonical: string[] = [];
  for (const [index, value] of next.entries()) {
    const parsed = parseMoveTypeTag(value);
    if (!parsed) return { kind: 'invalid', index, value };
    canonical.push(parsed);
  }
  return { kind: 'ready', values: canonical };
}

export function buildResolvedMoveCallState(params: {
  packageId: string;
  moduleName: string;
  functionName: string;
  signature: PTBFunctionData[string];
  openSignatures?: PTBFunctionOpenSignatures;
  typeArgumentBuffers: readonly string[];
}): ResolvedMoveCallState {
  const typeArgumentCount = params.signature.tparamCount;
  const typeArgumentResult = resolveConcreteTypeArguments(
    params.typeArgumentBuffers,
    typeArgumentCount,
  );
  const typeArguments =
    typeArgumentResult.kind === 'ready' ? typeArgumentResult.values : undefined;
  const packageId = parseObjectId(params.packageId) ?? params.packageId;
  const target = `${packageId}::${params.moduleName}::${params.functionName}`;
  const inputs =
    params.openSignatures && typeArguments
      ? params.openSignatures.parameters.map((signature) =>
          toPTBTypeFromOpenSignature(signature, typeArguments),
        )
      : params.signature.ins;
  const outputs =
    params.openSignatures && typeArguments
      ? params.openSignatures.returns.map((signature) =>
          toPTBTypeFromOpenSignature(signature, typeArguments),
        )
      : params.signature.outs;
  const typeArgumentError =
    typeArgumentResult.kind === 'invalid'
      ? `Type argument ${typeArgumentResult.index + 1} is not a supported Move type tag: ${typeArgumentResult.value}`
      : undefined;

  return {
    patch: {
      runtime: {
        target,
        ...(typeArguments && typeArguments.length > 0 ? { typeArguments } : {}),
      },
      ports: buildMoveCallPorts(inputs, outputs),
    },
    typeArgumentCount,
    typeArgumentBuffers:
      typeArguments ??
      padTypeArguments(params.typeArgumentBuffers, typeArgumentCount),
    needsConcreteTypeArguments: typeArgumentCount > 0 && !typeArguments,
    ...(typeArgumentError ? { typeArgumentError } : {}),
  };
}
