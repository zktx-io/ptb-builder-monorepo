import type { IRArgRef, IRInput, TransactionIR } from './ir/types.js';
import {
  normalizeMovePackageSignatureEvidenceOption,
  resolveMoveCallSignatureEvidence,
} from './move/evidence.js';
import type { MovePackageSignatureEvidence } from './move/evidence.js';
import {
  toPTBTypeFromConcreteTypeArgument,
  toPTBTypeFromOpenSignature,
} from './move/signature.js';
import {
  isPTBType,
  isPureInputPTBType,
  isResolvedPTBType,
  type PTBType,
  ptbTypesEqual,
} from './ptbType.js';
import {
  isRawOpenSignature,
  parseBase64Bytes,
  type RawInputArgumentType,
  type RawOpenSignature,
} from './raw/types.js';
import { isDenseArray, isRecord, NULL_VALUE } from './utils.js';

export type PTBInputArgumentKind = RawInputArgumentType;

export type PTBCommandInputSlot =
  | {
      commandKind: 'MoveCall';
      argumentIndex: number;
      argumentType?: RawOpenSignature;
      typeArguments: readonly string[];
    }
  | { commandKind: 'TransferObjects'; field: 'object'; index: number }
  | { commandKind: 'TransferObjects'; field: 'address' }
  | { commandKind: 'SplitCoins'; field: 'coin' }
  | { commandKind: 'SplitCoins'; field: 'amount'; index: number }
  | { commandKind: 'MergeCoins'; field: 'destination' }
  | { commandKind: 'MergeCoins'; field: 'source'; index: number }
  | {
      commandKind: 'MakeMoveVec';
      field: 'element';
      index: number;
      type: string | null;
    }
  | { commandKind: 'Upgrade'; field: 'ticket' }
  | { commandKind: 'Publish' | 'Unsupported'; field?: string };

export interface PTBInputTypeExpectation {
  inputKind?: PTBInputArgumentKind;
  ptbType?: PTBType;
}

export interface IRCommandInputUse {
  arg: IRArgRef;
  path: string;
  slot?: PTBCommandInputSlot;
  expectation?: PTBInputTypeExpectation;
}

export interface TransactionIRInputTypeInference {
  inputIndex: number;
  type: PTBType;
}

export interface TransactionIRInputTypeInferenceResult {
  inferences: readonly TransactionIRInputTypeInference[];
}

export interface TransactionIRInputTypeInferenceOptions {
  moveSignatures?: MovePackageSignatureEvidence;
}

type InferenceCandidate = {
  type: PTBType;
};

export function commandInputSlotExpectation(
  slot: PTBCommandInputSlot,
): PTBInputTypeExpectation | undefined {
  switch (slot.commandKind) {
    case 'MoveCall':
      if (slot.argumentType === undefined) return undefined;
      return expectationFromPTBType(
        toPTBTypeFromOpenSignature(slot.argumentType, slot.typeArguments),
      );
    case 'TransferObjects':
      return slot.field === 'address'
        ? pureExpectation({ kind: 'scalar', name: 'address' })
        : objectExpectation();
    case 'SplitCoins':
      return slot.field === 'amount'
        ? pureExpectation({ kind: 'move_numeric', width: 'u64' })
        : objectExpectation();
    case 'MergeCoins':
      return objectExpectation();
    case 'MakeMoveVec':
      if (slot.type === NULL_VALUE) return objectExpectation();
      return expectationFromMoveTypeTag(slot.type);
    case 'Upgrade':
      return objectExpectation();
    case 'Publish':
    case 'Unsupported':
      return undefined;
  }
}

export function irCommandInputUses(
  command: unknown,
  commandIndex: number,
  options: TransactionIRInputTypeInferenceOptions = {},
): readonly IRCommandInputUse[] {
  if (!isRecord(command) || typeof command.kind !== 'string') return [];

  switch (command.kind) {
    case 'MoveCall':
      return moveCallInputUses(command, commandIndex, options.moveSignatures);
    case 'TransferObjects':
      return [
        ...argArray(command.objects).map((arg, index) =>
          irInputUse(arg, `$.commands[${commandIndex}].objects[${index}]`, {
            commandKind: 'TransferObjects',
            field: 'object',
            index,
          }),
        ),
        ...optionalArg(command.address).map((arg) =>
          irInputUse(arg, `$.commands[${commandIndex}].address`, {
            commandKind: 'TransferObjects',
            field: 'address',
          }),
        ),
      ];
    case 'SplitCoins':
      return [
        ...optionalArg(command.coin).map((arg) =>
          irInputUse(arg, `$.commands[${commandIndex}].coin`, {
            commandKind: 'SplitCoins',
            field: 'coin',
          }),
        ),
        ...argArray(command.amounts).map((arg, index) =>
          irInputUse(arg, `$.commands[${commandIndex}].amounts[${index}]`, {
            commandKind: 'SplitCoins',
            field: 'amount',
            index,
          }),
        ),
      ];
    case 'MergeCoins':
      return [
        ...optionalArg(command.destination).map((arg) =>
          irInputUse(arg, `$.commands[${commandIndex}].destination`, {
            commandKind: 'MergeCoins',
            field: 'destination',
          }),
        ),
        ...argArray(command.sources).map((arg, index) =>
          irInputUse(arg, `$.commands[${commandIndex}].sources[${index}]`, {
            commandKind: 'MergeCoins',
            field: 'source',
            index,
          }),
        ),
      ];
    case 'MakeMoveVec':
      return argArray(command.elements).map((arg, index) => {
        const type = canonicalMakeMoveVecType(command.type);
        return irInputUse(
          arg,
          `$.commands[${commandIndex}].elements[${index}]`,
          type === undefined
            ? undefined
            : {
                commandKind: 'MakeMoveVec',
                field: 'element',
                index,
                type,
              },
        );
      });
    case 'Upgrade':
      return optionalArg(command.ticket).map((arg) =>
        irInputUse(arg, `$.commands[${commandIndex}].ticket`, {
          commandKind: 'Upgrade',
          field: 'ticket',
        }),
      );
    case 'Publish':
    case 'Unsupported':
    default:
      return [];
  }
}

export function inferTransactionIRInputTypes(
  ir: Pick<TransactionIR, 'inputs' | 'commands'>,
  options: TransactionIRInputTypeInferenceOptions = {},
): TransactionIRInputTypeInferenceResult {
  const moveSignatures = normalizeMovePackageSignatureEvidenceOption(
    options.moveSignatures,
  );
  const inputs = isDenseArray(ir.inputs) ? ir.inputs : [];
  const commands = isDenseArray(ir.commands) ? ir.commands : [];
  const candidatesByInput = new Map<number, InferenceCandidate[]>();

  commands.forEach((command, commandIndex) => {
    irCommandInputUses(command, commandIndex, { moveSignatures }).forEach(
      ({ arg, expectation }) => {
        if (arg.kind !== 'Input') return;
        if (!Number.isSafeInteger(arg.index) || arg.index < 0) return;
        if (arg.index >= inputs.length) return;
        const type = expectation?.ptbType;
        if (!type || type.kind === 'unknown') return;
        const input = inputs[arg.index];
        if (!inputCanAcceptInferredType(input)) return;

        const inputKind = rawArgumentTypeForIRInput(input);
        if (
          inputKind === undefined ||
          !inputArgumentKindCanCarryType(inputKind, type)
        ) {
          return;
        }
        const candidates = candidatesByInput.get(arg.index) ?? [];
        candidates.push({ type });
        candidatesByInput.set(arg.index, candidates);
      },
    );
  });

  const inferences: TransactionIRInputTypeInference[] = [];
  candidatesByInput.forEach((candidates, inputIndex) => {
    const first = candidates[0]?.type;
    if (!first) return;
    if (
      !candidates.every((candidate) => ptbTypesEqual(candidate.type, first))
    ) {
      return;
    }
    inferences.push({ inputIndex, type: first });
  });
  inferences.sort((left, right) => left.inputIndex - right.inputIndex);

  return { inferences };
}

export function rawArgumentTypeForIRInput(
  input: IRInput | undefined,
): PTBInputArgumentKind | undefined {
  switch (input?.kind) {
    case 'Pure':
      return 'pure';
    case 'Object':
      return 'object';
    case 'FundsWithdrawal':
      return 'withdrawal';
    case 'Unsupported':
    case undefined:
      return undefined;
  }
}

export function inputArgumentKindCanCarryType(
  inputKind: PTBInputArgumentKind,
  type: PTBType,
): boolean {
  switch (inputKind) {
    case 'pure':
      return isPureInputPTBType(type);
    case 'object':
      return type.kind === 'object';
    case 'withdrawal':
      return type.kind === 'unknown';
  }
}

function inputCanAcceptInferredType(input: IRInput | undefined): boolean {
  if (!isRecord(input)) return false;
  const record: Record<string, unknown> = input;
  if (record.kind !== 'Pure') return false;
  if (Object.prototype.hasOwnProperty.call(record, 'value')) return false;
  if (typeof record.bytes !== 'string') return false;
  if (parseBase64Bytes(record.bytes) !== record.bytes) return false;
  if (!Object.prototype.hasOwnProperty.call(record, 'type')) return true;
  return isPTBType(record.type) && record.type.kind === 'unknown';
}

function moveCallInputUses(
  command: Record<string, unknown>,
  commandIndex: number,
  moveSignatures: MovePackageSignatureEvidence | undefined,
): readonly IRCommandInputUse[] {
  const argumentTypes = isDenseArray(command._argumentTypes)
    ? command._argumentTypes
    : undefined;
  const typeArguments = isDenseArray(command.typeArguments)
    ? command.typeArguments.filter((typeArgument): typeArgument is string => {
        return typeof typeArgument === 'string';
      })
    : [];
  const evidence =
    typeof command.package === 'string' &&
    typeof command.module === 'string' &&
    typeof command.function === 'string'
      ? resolveMoveCallSignatureEvidence({
          packageId: command.package,
          moduleName: command.module,
          functionName: command.function,
          moveSignatures,
          typeArguments,
          explicitResultCount: command.resultCount,
        })
      : undefined;
  const parameters = evidence?.signature.parameters ?? argumentTypes;

  return argArray(command.arguments).map((arg, index) =>
    irInputUse(arg, `$.commands[${commandIndex}].arguments[${index}]`, {
      commandKind: 'MoveCall',
      argumentIndex: index,
      argumentType: isRawOpenSignature(parameters?.[index])
        ? parameters[index]
        : undefined,
      typeArguments,
    }),
  );
}

function irInputUse(
  arg: IRArgRef,
  path: string,
  slot: PTBCommandInputSlot | undefined,
): IRCommandInputUse {
  return {
    arg,
    path,
    slot,
    expectation: slot ? commandInputSlotExpectation(slot) : undefined,
  };
}

function canonicalMakeMoveVecType(value: unknown): string | null | undefined {
  return typeof value === 'string' || value === NULL_VALUE ? value : undefined;
}

function expectationFromMoveTypeTag(
  typeTag: string,
): PTBInputTypeExpectation | undefined {
  const ptbType = toPTBTypeFromConcreteTypeArgument(typeTag);
  if (!ptbType) return undefined;
  return ptbType.kind === 'object'
    ? { ptbType }
    : expectationFromPTBType(ptbType);
}

function expectationFromPTBType(
  ptbType: PTBType,
): PTBInputTypeExpectation | undefined {
  if (!isPTBType(ptbType) || ptbType.kind === 'unknown') return undefined;
  const inputKind = inputArgumentKindForPTBType(ptbType);
  const expectation: PTBInputTypeExpectation = inputKind ? { inputKind } : {};
  if (isResolvedPTBType(ptbType)) {
    expectation.ptbType = ptbType;
  }
  return expectation.inputKind || expectation.ptbType ? expectation : undefined;
}

function inputArgumentKindForPTBType(
  type: PTBType,
): PTBInputArgumentKind | undefined {
  if (type.kind === 'object') return 'object';
  if (isPureInputPTBType(type)) return 'pure';
  return undefined;
}

function pureExpectation(type: PTBType): PTBInputTypeExpectation {
  return { inputKind: 'pure', ptbType: type };
}

function objectExpectation(): PTBInputTypeExpectation {
  return { inputKind: 'object', ptbType: { kind: 'object' } };
}

function argArray(value: unknown): IRArgRef[] {
  return isDenseArray(value) ? value.filter(isIRArgRefLike) : [];
}

function optionalArg(value: unknown): IRArgRef[] {
  return isIRArgRefLike(value) ? [value] : [];
}

function isIRArgRefLike(value: unknown): value is IRArgRef {
  if (!isRecord(value) || typeof value.kind !== 'string') return false;
  switch (value.kind) {
    case 'GasCoin':
      return true;
    case 'Input':
      return typeof value.index === 'number';
    case 'Result':
      return typeof value.commandIndex === 'number';
    case 'NestedResult':
      return (
        typeof value.commandIndex === 'number' &&
        typeof value.resultIndex === 'number'
      );
    default:
      return false;
  }
}
