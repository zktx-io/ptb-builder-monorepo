import { freezeDiagnostics } from './diagnostics.js';
import type { TransactionDiagnostic } from './diagnostics.js';
import type { PTBType } from '../graph/types.js';
import type {
  RawCallArg,
  RawCommand,
  RawFundsWithdrawalArg,
  RawInputArgumentType,
  RawMoveCallArgumentTypes,
  RawObjectArg,
} from '../raw/types.js';
import { isRawInputArgumentType } from '../raw/types.js';
import { isDenseArray, isRecord } from '../utils.js';

export type IRPureValue =
  | string
  | number
  | boolean
  | bigint
  | null
  | IRPureValue[];

export type IRArgRef =
  | { kind: 'GasCoin' }
  | { kind: 'Input'; index: number; type?: RawInputArgumentType }
  | { kind: 'Result'; commandIndex: number }
  | { kind: 'NestedResult'; commandIndex: number; resultIndex: number };

export type IRInput =
  | {
      id: string;
      kind: 'Pure';
      bytes?: string;
      value?: IRPureValue;
      type?: PTBType;
      canonicalRaw?: RawCallArg;
    }
  | {
      id: string;
      kind: 'Object';
      object?: RawObjectArg;
      type?: PTBType;
      canonicalRaw?: RawCallArg;
    }
  | {
      id: string;
      kind: 'FundsWithdrawal';
      value: RawFundsWithdrawalArg;
      canonicalRaw?: RawCallArg;
    }
  | {
      id: string;
      kind: 'Unsupported';
      sourceKind: string;
      value?: unknown;
    };

export type IRCommand =
  | {
      id: string;
      kind: 'MoveCall';
      package: string;
      module: string;
      function: string;
      typeArguments: string[];
      arguments: IRArgRef[];
      _argumentTypes?: RawMoveCallArgumentTypes;
      resultCount?: number;
      canonicalRaw?: RawCommand;
    }
  | {
      id: string;
      kind: 'TransferObjects';
      objects: IRArgRef[];
      address: IRArgRef;
      resultCount: 0;
      canonicalRaw?: RawCommand;
    }
  | {
      id: string;
      kind: 'SplitCoins';
      coin: IRArgRef;
      amounts: IRArgRef[];
      resultCount: number;
      canonicalRaw?: RawCommand;
    }
  | {
      id: string;
      kind: 'MergeCoins';
      destination: IRArgRef;
      sources: IRArgRef[];
      resultCount: 0;
      canonicalRaw?: RawCommand;
    }
  | {
      id: string;
      kind: 'Publish';
      modules: string[];
      dependencies: string[];
      resultCount: 1;
      canonicalRaw?: RawCommand;
    }
  | {
      id: string;
      kind: 'MakeMoveVec';
      type: string | null;
      elements: IRArgRef[];
      resultCount: 1;
      canonicalRaw?: RawCommand;
    }
  | {
      id: string;
      kind: 'Upgrade';
      modules: string[];
      dependencies: string[];
      package: string;
      ticket: IRArgRef;
      resultCount: 1;
      canonicalRaw?: RawCommand;
    }
  | {
      id: string;
      kind: 'Unsupported';
      sourceKind: string;
      value?: unknown;
      resultCount: 0;
    };

export interface TransactionIR {
  version: 'transaction_ir_1';
  inputs: IRInput[];
  commands: IRCommand[];
  diagnostics: readonly TransactionDiagnostic[];
}

export function createTransactionIR(
  inputs: IRInput[],
  commands: IRCommand[],
  diagnostics: readonly TransactionDiagnostic[] = [],
): TransactionIR {
  return {
    version: 'transaction_ir_1',
    inputs,
    commands,
    diagnostics: freezeDiagnostics(diagnostics),
  };
}

export function irCommandArgRefs(command: IRCommand): IRArgRef[] {
  if (!isRecord(command) || typeof command.kind !== 'string') {
    return [];
  }

  switch (command.kind) {
    case 'MoveCall':
      return argRefArray(command.arguments);
    case 'TransferObjects':
      return [
        ...argRefArray(command.objects),
        ...optionalArgRef(command.address),
      ];
    case 'SplitCoins':
      return [...optionalArgRef(command.coin), ...argRefArray(command.amounts)];
    case 'MergeCoins':
      return [
        ...optionalArgRef(command.destination),
        ...argRefArray(command.sources),
      ];
    case 'Publish':
      return [];
    case 'MakeMoveVec':
      return argRefArray(command.elements);
    case 'Upgrade':
      return optionalArgRef(command.ticket);
    case 'Unsupported':
    default:
      return [];
  }
}

function argRefArray(value: unknown): IRArgRef[] {
  return isDenseArray(value) ? value.filter(isIRArgRef) : [];
}

function optionalArgRef(value: unknown): IRArgRef[] {
  return isIRArgRef(value) ? [value] : [];
}

export function isIRArgRef(value: unknown): value is IRArgRef {
  if (!isRecord(value) || typeof value.kind !== 'string') return false;

  switch (value.kind) {
    case 'GasCoin':
      return true;
    case 'Input':
      return (
        'index' in value &&
        (!('type' in value) || isRawInputArgumentType(value.type))
      );
    case 'Result':
      return 'commandIndex' in value;
    case 'NestedResult':
      return 'commandIndex' in value && 'resultIndex' in value;
    default:
      return false;
  }
}
