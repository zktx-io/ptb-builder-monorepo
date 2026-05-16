import type { CommandRuntimeParams, Port } from '../../../../ptb/graph/types';
import type { PTBFunctionData } from '../../../../ptb/ptbDoc';
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
};

export function padTypeArguments(
  values: readonly string[],
  count: number,
): string[] {
  return Array.from({ length: count }, (_value, index) => values[index] ?? '');
}

export function concreteTypeArguments(
  values: readonly string[],
  count: number,
): string[] | undefined {
  const next = padTypeArguments(values, count).map((value) => value.trim());
  return next.every((value) => value.length > 0) ? next : undefined;
}

export function buildResolvedMoveCallState(params: {
  packageId: string;
  moduleName: string;
  functionName: string;
  signature: PTBFunctionData[string];
  typeArgumentBuffers: readonly string[];
}): ResolvedMoveCallState {
  const typeArgumentCount = params.signature.tparamCount;
  const typeArguments = concreteTypeArguments(
    params.typeArgumentBuffers,
    typeArgumentCount,
  );
  const target = `${params.packageId}::${params.moduleName}::${params.functionName}`;

  return {
    patch: {
      runtime: {
        target,
        ...(typeArguments && typeArguments.length > 0 ? { typeArguments } : {}),
      },
      ports: buildMoveCallPorts(params.signature.ins, params.signature.outs),
    },
    typeArgumentCount,
    typeArgumentBuffers: padTypeArguments(
      params.typeArgumentBuffers,
      typeArgumentCount,
    ),
    needsConcreteTypeArguments: typeArgumentCount > 0 && !typeArguments,
  };
}
