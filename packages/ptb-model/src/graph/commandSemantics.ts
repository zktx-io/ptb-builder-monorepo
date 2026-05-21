import {
  indexedInputHandle,
  indexedInputHandleIndex,
  inputHandle,
  isInputHandle,
  knownResultOutputHandles,
} from './handles.js';
import { parseGraphMoveCallTarget } from './moveCallEvidence.js';
import type { CommandKind } from './shapes.js';
import type { PTBCommandInputSlot } from '../inputTypeEvidence.js';
import type { IRArgRef, IRCommand } from '../ir/types.js';
import {
  type MovePackageSignatureEvidence,
  resolveMoveCallSignatureEvidence,
} from '../move/evidence.js';
import { NULL_VALUE } from '../utils.js';

export type CommandInputPortMatch =
  | { kind: 'single' }
  | { kind: 'indexed'; group: string; index: number };

export interface IRCommandGraphArgEntry {
  arg: IRArgRef;
  handle: string;
}

export type GraphCommandInputSlotResolution =
  | { kind: 'slot'; slot: PTBCommandInputSlot }
  | { kind: 'blocked' };

export function graphCommandInputPortMatch(
  commandKind: CommandKind,
  portId: string,
): CommandInputPortMatch | undefined {
  switch (commandKind) {
    case 'splitCoins':
      return (
        singleInputPortMatch(portId, 'coin') ??
        indexedInputPortMatch(portId, 'amount')
      );
    case 'mergeCoins':
      return (
        singleInputPortMatch(portId, 'destination') ??
        indexedInputPortMatch(portId, 'source')
      );
    case 'transferObjects':
      return (
        singleInputPortMatch(portId, 'recipient') ??
        indexedInputPortMatch(portId, 'object')
      );
    case 'makeMoveVec':
      return indexedInputPortMatch(portId, 'elem');
    case 'moveCall':
      return indexedInputPortMatch(portId, 'arg');
    case 'upgrade':
      return singleInputPortMatch(portId, 'upgradeCap');
    case 'publish':
    case 'unsupported':
      return undefined;
  }
}

export function graphCommandTypeInputPortMatch(
  commandKind: CommandKind,
  portId: string,
): CommandInputPortMatch | undefined {
  return commandKind === 'moveCall'
    ? indexedInputPortMatch(portId, 'type')
    : undefined;
}

export function graphCommandInputSlot(
  commandKind: CommandKind,
  portId: string,
  context: {
    moveSignatures?: MovePackageSignatureEvidence;
    runtime?: Record<string, unknown>;
    typeArgumentsByIndex?: ReadonlyMap<number, string>;
  } = {},
): GraphCommandInputSlotResolution | undefined {
  const match = graphCommandInputPortMatch(commandKind, portId);
  if (match === undefined) {
    return commandKind === 'publish' || commandKind === 'unsupported'
      ? {
          kind: 'slot',
          slot: { commandKind: graphCommandKindSlot(commandKind) },
        }
      : undefined;
  }

  switch (commandKind) {
    case 'splitCoins':
      return match.kind === 'single'
        ? { kind: 'slot', slot: { commandKind: 'SplitCoins', field: 'coin' } }
        : {
            kind: 'slot',
            slot: {
              commandKind: 'SplitCoins',
              field: 'amount',
              index: match.index,
            },
          };
    case 'mergeCoins':
      return match.kind === 'single'
        ? {
            kind: 'slot',
            slot: { commandKind: 'MergeCoins', field: 'destination' },
          }
        : {
            kind: 'slot',
            slot: {
              commandKind: 'MergeCoins',
              field: 'source',
              index: match.index,
            },
          };
    case 'transferObjects':
      return match.kind === 'single'
        ? {
            kind: 'slot',
            slot: { commandKind: 'TransferObjects', field: 'address' },
          }
        : {
            kind: 'slot',
            slot: {
              commandKind: 'TransferObjects',
              field: 'object',
              index: match.index,
            },
          };
    case 'makeMoveVec': {
      if (match.kind !== 'indexed') return undefined;
      const type = graphMakeMoveVecElementType(context.runtime);
      if (type === undefined) return { kind: 'blocked' };
      return {
        kind: 'slot',
        slot: {
          commandKind: 'MakeMoveVec',
          field: 'element',
          index: match.index,
          type,
        },
      };
    }
    case 'upgrade':
      return {
        kind: 'slot',
        slot: { commandKind: 'Upgrade', field: 'ticket' },
      };
    case 'moveCall':
      if (match.kind !== 'indexed') return undefined;
      return graphMoveCallArgumentSlot(match.index, context);
    case 'publish':
    case 'unsupported':
      return {
        kind: 'slot',
        slot: { commandKind: graphCommandKindSlot(commandKind) },
      };
  }
}

export function missingRequiredGraphInputHandles(
  commandKind: CommandKind,
  incomingHandles: ReadonlySet<string>,
  context: {
    declaredInputPortIds: ReadonlySet<string>;
    runtime: Record<string, unknown> | undefined;
    moveCallParameterCount?: number;
  },
): string[] {
  return requiredGraphCommandInputHandles(commandKind, context).filter(
    (handle) => !incomingHandles.has(handle),
  );
}

export function invalidGraphCommandInputHandles(
  commandKind: CommandKind,
  context: {
    declaredInputPortIds: ReadonlySet<string>;
    declaredTypeInputPortIds: ReadonlySet<string>;
    moveCallParameterCount?: number;
    moveCallTypeParameterCount?: number;
  },
): string[] {
  if (commandKind !== 'moveCall') {
    return [];
  }

  const invalidHandles: string[] = [];
  if (typeof context.moveCallParameterCount === 'number') {
    invalidHandles.push(
      ...declaredIndexedInputHandles(
        context.declaredInputPortIds,
        'arg',
      ).filter((handle) => {
        const index = indexedInputHandleIndex(handle, 'arg');
        return index !== undefined && index >= context.moveCallParameterCount!;
      }),
    );
  }
  if (typeof context.moveCallTypeParameterCount === 'number') {
    invalidHandles.push(
      ...declaredIndexedInputHandles(
        context.declaredTypeInputPortIds,
        'type',
      ).filter((handle) => {
        const index = indexedInputHandleIndex(handle, 'type');
        return (
          index !== undefined && index >= context.moveCallTypeParameterCount!
        );
      }),
    );
  }
  return invalidHandles;
}

export function requiredGraphCommandInputHandles(
  commandKind: CommandKind,
  context: {
    declaredInputPortIds: ReadonlySet<string>;
    runtime?: Record<string, unknown>;
    moveCallParameterCount?: number;
  },
): string[] {
  switch (commandKind) {
    case 'splitCoins':
      return [
        inputHandle('coin'),
        ...declaredIndexedInputHandlesOrFallback(
          context.declaredInputPortIds,
          'amount',
        ),
      ];
    case 'mergeCoins':
      return [
        inputHandle('destination'),
        ...declaredIndexedInputHandlesOrFallback(
          context.declaredInputPortIds,
          'source',
        ),
      ];
    case 'transferObjects':
      return [
        inputHandle('recipient'),
        ...declaredIndexedInputHandlesOrFallback(
          context.declaredInputPortIds,
          'object',
        ),
      ];
    case 'makeMoveVec':
      return makeMoveVecInputHandles(
        context.declaredInputPortIds,
        context.runtime,
      );
    case 'upgrade':
      return [inputHandle('upgradeCap')];
    case 'moveCall':
      return moveCallInputHandles(
        context.declaredInputPortIds,
        context.moveCallParameterCount,
      );
    case 'publish':
    case 'unsupported':
      return [];
  }
}

export function expectedGraphCommandOutputHandles(
  commandKind: CommandKind,
  context: {
    declaredInputPortIds: ReadonlySet<string>;
    moveCallResultCount?: number;
  },
): string[] {
  switch (commandKind) {
    case 'transferObjects':
    case 'mergeCoins':
    case 'unsupported':
      return [];
    case 'publish':
    case 'makeMoveVec':
    case 'upgrade':
      return knownResultOutputHandles(1);
    case 'splitCoins':
      return knownResultOutputHandles(
        countIndexedDeclaredInputPorts(context.declaredInputPortIds, 'amount'),
      );
    case 'moveCall':
      return typeof context.moveCallResultCount === 'number'
        ? knownResultOutputHandles(context.moveCallResultCount)
        : [];
  }
}

export function isGraphCommandOutputHandleAllowed(
  commandKind: CommandKind,
  portId: string,
  context: {
    declaredInputPortIds: ReadonlySet<string>;
    moveCallResultCount?: number;
  },
): boolean {
  return expectedGraphCommandOutputHandles(commandKind, context).some(
    (handle) => handle === portId,
  );
}

export function irCommandGraphKind(command: IRCommand): CommandKind {
  switch (command.kind) {
    case 'MoveCall':
      return 'moveCall';
    case 'TransferObjects':
      return 'transferObjects';
    case 'SplitCoins':
      return 'splitCoins';
    case 'MergeCoins':
      return 'mergeCoins';
    case 'Publish':
      return 'publish';
    case 'MakeMoveVec':
      return 'makeMoveVec';
    case 'Upgrade':
      return 'upgrade';
    case 'Unsupported':
      return 'unsupported';
  }
}

export function irCommandGraphInputEntries(
  command: IRCommand,
): IRCommandGraphArgEntry[] {
  switch (command.kind) {
    case 'MoveCall':
      return command.arguments.map((arg, index) => ({
        arg,
        handle: indexedInputHandle('arg', index),
      }));
    case 'TransferObjects':
      return [
        ...command.objects.map((arg, index) => ({
          arg,
          handle: indexedInputHandle('object', index),
        })),
        { arg: command.address, handle: inputHandle('recipient') },
      ];
    case 'SplitCoins':
      return [
        { arg: command.coin, handle: inputHandle('coin') },
        ...command.amounts.map((arg, index) => ({
          arg,
          handle: indexedInputHandle('amount', index),
        })),
      ];
    case 'MergeCoins':
      return [
        { arg: command.destination, handle: inputHandle('destination') },
        ...command.sources.map((arg, index) => ({
          arg,
          handle: indexedInputHandle('source', index),
        })),
      ];
    case 'MakeMoveVec':
      return command.elements.map((arg, index) => ({
        arg,
        handle: indexedInputHandle('elem', index),
      }));
    case 'Upgrade':
      return [{ arg: command.ticket, handle: inputHandle('upgradeCap') }];
    case 'Publish':
    case 'Unsupported':
      return [];
  }
}

export function irCommandGraphOutputHandles(
  command: IRCommand,
  resultArity: number | undefined,
): string[] {
  switch (command.kind) {
    case 'TransferObjects':
    case 'MergeCoins':
    case 'Unsupported':
      return [];
    case 'Publish':
    case 'MakeMoveVec':
    case 'Upgrade':
      return knownResultOutputHandles(1);
    case 'MoveCall':
      return resultArity === undefined
        ? []
        : knownResultOutputHandles(resultArity);
    case 'SplitCoins':
      return knownResultOutputHandles(command.resultCount);
  }
}

function singleInputPortMatch(
  portId: string,
  name: string,
): CommandInputPortMatch | undefined {
  return isInputHandle(portId, name) ? { kind: 'single' } : undefined;
}

function indexedInputPortMatch(
  portId: string,
  name: string,
): CommandInputPortMatch | undefined {
  const index = indexedInputHandleIndex(portId, name);
  return index === undefined
    ? undefined
    : { kind: 'indexed', group: name, index };
}

function declaredIndexedInputHandlesOrFallback(
  inputPortIds: ReadonlySet<string>,
  name: string,
): string[] {
  const handles = declaredIndexedInputHandles(inputPortIds, name);
  return handles.length > 0 ? handles : [indexedInputHandle(name, 0)];
}

function countIndexedDeclaredInputPorts(
  inputPortIds: ReadonlySet<string>,
  name: string,
): number {
  let count = 0;
  inputPortIds.forEach((handle) => {
    if (indexedInputHandleIndex(handle, name) !== undefined) count += 1;
  });
  return count;
}

function declaredIndexedInputHandles(
  inputPortIds: ReadonlySet<string>,
  name: string,
): string[] {
  return [...inputPortIds]
    .map((handle) => ({
      handle,
      index: indexedInputHandleIndex(handle, name),
    }))
    .filter(
      (entry): entry is { handle: string; index: number } =>
        entry.index !== undefined,
    )
    .sort((left, right) => left.index - right.index)
    .map(({ handle }) => handle);
}

function makeMoveVecInputHandles(
  inputPortIds: ReadonlySet<string>,
  runtime: Record<string, unknown> | undefined,
): string[] {
  const declared = declaredIndexedInputHandles(inputPortIds, 'elem');
  if (declared.length > 0) return declared;

  const type = graphMakeMoveVecElementType(runtime);
  return type === NULL_VALUE ? [indexedInputHandle('elem', 0)] : [];
}

function moveCallInputHandles(
  inputPortIds: ReadonlySet<string>,
  parameterCount: number | undefined,
): string[] {
  if (typeof parameterCount === 'number') {
    return Array.from({ length: parameterCount }, (_, index) =>
      indexedInputHandle('arg', index),
    );
  }
  return declaredIndexedInputHandles(inputPortIds, 'arg');
}

function graphCommandKindSlot(
  commandKind: Extract<CommandKind, 'publish' | 'unsupported'>,
): Extract<
  PTBCommandInputSlot,
  { commandKind: 'Publish' | 'Unsupported' }
>['commandKind'] {
  return commandKind === 'publish' ? 'Publish' : 'Unsupported';
}

function graphMakeMoveVecElementType(
  runtime: Record<string, unknown> | undefined,
): string | null | undefined {
  if (runtime?.type === undefined || runtime.type === NULL_VALUE) {
    return NULL_VALUE;
  }
  return typeof runtime.type === 'string' ? runtime.type : undefined;
}

function graphMoveCallArgumentSlot(
  argumentIndex: number,
  context: {
    moveSignatures?: MovePackageSignatureEvidence;
    runtime?: Record<string, unknown>;
    typeArgumentsByIndex?: ReadonlyMap<number, string>;
  },
): GraphCommandInputSlotResolution | undefined {
  const target = parseGraphMoveCallTarget(context.runtime?.target).target;
  if (!target) return { kind: 'blocked' };

  const evidenceTypeArguments = denseTypeArguments(
    context.typeArgumentsByIndex,
  );
  const evidence = resolveMoveCallSignatureEvidence({
    packageId: target.packageId,
    moduleName: target.moduleName,
    functionName: target.functionName,
    moveSignatures: context.moveSignatures,
    typeArguments: evidenceTypeArguments,
    explicitResultCount: context.runtime?.resultCount,
  });
  if (evidence === undefined) return undefined;

  const parameter = evidence.signature.parameters[argumentIndex];
  if (!parameter) return { kind: 'blocked' };

  return {
    kind: 'slot',
    slot: {
      commandKind: 'MoveCall',
      argumentIndex,
      argumentType: parameter,
      typeArguments: typeArgumentsForInference(
        evidence.signature.typeParameterCount,
        context.typeArgumentsByIndex,
      ),
    },
  };
}

function denseTypeArguments(
  byIndex: ReadonlyMap<number, string> | undefined,
): string[] {
  if (!byIndex || byIndex.size === 0) return [];
  const maxIndex = Math.max(...byIndex.keys());
  const result: string[] = [];
  for (let index = 0; index <= maxIndex; index += 1) {
    const value = byIndex.get(index);
    if (value === undefined) return [];
    result.push(value);
  }
  return result;
}

function typeArgumentsForInference(
  count: number,
  byIndex: ReadonlyMap<number, string> | undefined,
): string[] {
  if (count === 0) return [];
  const typeArguments: string[] = [];
  for (let index = 0; index < count; index += 1) {
    typeArguments.push(byIndex?.get(index) ?? '');
  }
  return typeArguments;
}
