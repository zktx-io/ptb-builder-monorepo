import { asString, isDenseArray, isRecord, NULL_VALUE } from '../utils.js';

export type ObjectId = string;
export type ObjectDigest = string;
export type JsonU64 = string;
export type Base64Bytes = string;
export type RawInputArgumentType = 'pure' | 'object' | 'withdrawal';
export type RawOpenSignatureReference = 'mutable' | 'immutable' | 'unknown';
export type RawOpenSignatureBody =
  | { $kind: 'address' }
  | { $kind: 'bool' }
  | { $kind: 'u8' }
  | { $kind: 'u16' }
  | { $kind: 'u32' }
  | { $kind: 'u64' }
  | { $kind: 'u128' }
  | { $kind: 'u256' }
  | { $kind: 'unknown' }
  | { $kind: 'vector'; vector: RawOpenSignatureBody }
  | {
      $kind: 'datatype';
      datatype: {
        typeName: string;
        typeParameters: RawOpenSignatureBody[];
      };
    }
  | { $kind: 'typeParameter'; index: number };
export interface RawOpenSignature {
  reference: RawOpenSignatureReference | null;
  body: RawOpenSignatureBody;
}
export type RawMoveCallArgumentTypes = RawOpenSignature[] | null;

export interface RawProgrammableTransaction {
  inputs: RawCallArg[];
  commands: RawCommand[];
}

export type RawCallArg =
  | { kind: 'Pure'; bytes: Base64Bytes }
  | { kind: 'Object'; object: RawObjectArg }
  | { kind: 'FundsWithdrawal'; value: RawFundsWithdrawalArg };

export type RawObjectArg =
  | {
      kind: 'ImmOrOwnedObject';
      objectId: ObjectId;
      version: JsonU64;
      digest: ObjectDigest;
    }
  | {
      kind: 'SharedObject';
      objectId: ObjectId;
      initialSharedVersion: JsonU64;
      mutable: boolean;
    }
  | {
      kind: 'Receiving';
      objectId: ObjectId;
      version: JsonU64;
      digest: ObjectDigest;
    };

export interface RawFundsWithdrawalArg {
  reservation: { kind: 'MaxAmountU64'; amount: JsonU64 };
  typeArg: { kind: 'Balance'; type: string };
  withdrawFrom: { kind: 'Sender' } | { kind: 'Sponsor' };
}

export type RawArgument =
  | { kind: 'GasCoin' }
  | { kind: 'Input'; index: number; type?: RawInputArgumentType }
  | { kind: 'Result'; commandIndex: number }
  | {
      kind: 'NestedResult';
      commandIndex: number;
      resultIndex: number;
    };

export type RawCommand =
  | { kind: 'MoveCall'; call: RawProgrammableMoveCall }
  | { kind: 'TransferObjects'; objects: RawArgument[]; address: RawArgument }
  | { kind: 'SplitCoins'; coin: RawArgument; amounts: RawArgument[] }
  | { kind: 'MergeCoins'; destination: RawArgument; sources: RawArgument[] }
  | { kind: 'Publish'; modules: Base64Bytes[]; dependencies: ObjectId[] }
  | { kind: 'MakeMoveVec'; type: string | null; elements: RawArgument[] }
  | {
      kind: 'Upgrade';
      modules: Base64Bytes[];
      dependencies: ObjectId[];
      package: ObjectId;
      ticket: RawArgument;
    };

export interface RawProgrammableMoveCall {
  package: ObjectId;
  module: string;
  function: string;
  typeArguments: string[];
  arguments: RawArgument[];
  _argumentTypes?: RawMoveCallArgumentTypes;
}

const U64_MAX = 18_446_744_073_709_551_615n;
const SUI_ADDRESS_LENGTH = 32;
const BASE64_ASCII_WHITESPACE = /[\t\n\f\r ]/g;
const RAW_INPUT_ARGUMENT_TYPES = ['pure', 'object', 'withdrawal'] as const;
const OPEN_SIGNATURE_KEYS = ['reference', 'body'] as const;
const OPEN_SIGNATURE_REFERENCES = ['mutable', 'immutable', 'unknown'] as const;
const OPEN_SIGNATURE_SCALAR_BODY_KEYS = ['$kind'] as const;
const OPEN_SIGNATURE_VECTOR_BODY_KEYS = ['$kind', 'vector'] as const;
const OPEN_SIGNATURE_DATATYPE_BODY_KEYS = ['$kind', 'datatype'] as const;
const OPEN_SIGNATURE_DATATYPE_KEYS = ['typeName', 'typeParameters'] as const;
const OPEN_SIGNATURE_TYPE_PARAMETER_BODY_KEYS = ['$kind', 'index'] as const;
const OPEN_SIGNATURE_SCALAR_KINDS = [
  'address',
  'bool',
  'u8',
  'u16',
  'u32',
  'u64',
  'u128',
  'u256',
  'unknown',
] as const;

export function parseJsonU64(value: unknown): JsonU64 | undefined {
  if (
    typeof value !== 'string' &&
    !(typeof value === 'number' && Number.isSafeInteger(value))
  ) {
    return undefined;
  }

  try {
    const parsed = BigInt(value);
    return parsed >= 0n && parsed <= U64_MAX ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function parseBase64Bytes(value: unknown): Base64Bytes | undefined {
  const text = asString(value);
  if (text === undefined) return undefined;
  return canDecodeBase64WithAtob(text)
    ? text.replace(BASE64_ASCII_WHITESPACE, '')
    : undefined;
}

export function parseObjectId(value: unknown): ObjectId | undefined {
  const text = asString(value);
  if (text === undefined) return undefined;
  const normalized = normalizeSuiAddress(text);
  return isValidSuiAddress(normalized) ? normalized : undefined;
}

export function isRawInputArgumentType(
  value: unknown,
): value is RawInputArgumentType {
  return (
    typeof value === 'string' &&
    (RAW_INPUT_ARGUMENT_TYPES as readonly string[]).includes(value)
  );
}

export function isRawMoveCallArgumentTypes(
  value: unknown,
): value is RawMoveCallArgumentTypes {
  return (
    value === NULL_VALUE ||
    (isDenseArray(value) &&
      value.every((item) => isRawOpenSignature(item, new WeakSet<object>())))
  );
}

function canDecodeBase64WithAtob(value: string): boolean {
  const atob = (globalThis as { atob?: (input: string) => string }).atob;
  if (atob) {
    try {
      atob(value);
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

// Mirrors @mysten/sui@2.16.2 packages/sui/src/utils/sui-types.ts.
// Keep this local to avoid adding a runtime SDK dependency to ptb-model.
function normalizeSuiAddress(value: string): string {
  let address = value.toLowerCase();
  if (address.startsWith('0x')) {
    address = address.slice(2);
  }
  return `0x${address.padStart(SUI_ADDRESS_LENGTH * 2, '0')}`;
}

function isValidSuiAddress(value: string): boolean {
  return isHex(value) && getHexByteLength(value) === SUI_ADDRESS_LENGTH;
}

function isHex(value: string): boolean {
  return /^(0x|0X)?[a-fA-F0-9]+$/.test(value) && value.length % 2 === 0;
}

function getHexByteLength(value: string): number {
  return /^(0x|0X)/.test(value) ? (value.length - 2) / 2 : value.length / 2;
}

export function isRawObjectArg(value: unknown): value is RawObjectArg {
  if (!isRecord(value) || typeof value.kind !== 'string') return false;

  switch (value.kind) {
    case 'ImmOrOwnedObject':
    case 'Receiving':
      return (
        parseObjectId(value.objectId) === value.objectId &&
        typeof value.version === 'string' &&
        parseJsonU64(value.version) === value.version &&
        typeof value.digest === 'string'
      );
    case 'SharedObject':
      return (
        parseObjectId(value.objectId) === value.objectId &&
        typeof value.initialSharedVersion === 'string' &&
        parseJsonU64(value.initialSharedVersion) ===
          value.initialSharedVersion &&
        typeof value.mutable === 'boolean'
      );
    default:
      return false;
  }
}

export function isRawFundsWithdrawalArg(
  value: unknown,
): value is RawFundsWithdrawalArg {
  if (!isRecord(value)) return false;
  const reservation = isRecord(value.reservation)
    ? value.reservation
    : undefined;
  const typeArg = isRecord(value.typeArg) ? value.typeArg : undefined;
  const withdrawFrom = isRecord(value.withdrawFrom)
    ? value.withdrawFrom
    : undefined;

  return (
    reservation?.kind === 'MaxAmountU64' &&
    typeof reservation.amount === 'string' &&
    parseJsonU64(reservation.amount) === reservation.amount &&
    typeArg?.kind === 'Balance' &&
    typeof typeArg.type === 'string' &&
    (withdrawFrom?.kind === 'Sender' || withdrawFrom?.kind === 'Sponsor')
  );
}

function isRawOpenSignature(
  value: unknown,
  seen: WeakSet<object>,
): value is RawOpenSignature {
  if (!isRecord(value)) return false;
  if (!hasOnlyKeys(value, OPEN_SIGNATURE_KEYS)) return false;
  const reference = value.reference;
  return (
    (reference === NULL_VALUE ||
      (typeof reference === 'string' &&
        (OPEN_SIGNATURE_REFERENCES as readonly string[]).includes(
          reference,
        ))) &&
    isRawOpenSignatureBody(value.body, seen)
  );
}

function isRawOpenSignatureBody(
  value: unknown,
  seen: WeakSet<object>,
): value is RawOpenSignatureBody {
  if (!isRecord(value) || typeof value.$kind !== 'string') return false;
  if (seen.has(value)) return false;
  seen.add(value);

  let valid: boolean;
  if (
    (OPEN_SIGNATURE_SCALAR_KINDS as readonly string[]).includes(value.$kind)
  ) {
    valid = hasOnlyKeys(value, OPEN_SIGNATURE_SCALAR_BODY_KEYS);
  } else {
    switch (value.$kind) {
      case 'vector':
        valid =
          hasOnlyKeys(value, OPEN_SIGNATURE_VECTOR_BODY_KEYS) &&
          isRawOpenSignatureBody(value.vector, seen);
        break;
      case 'datatype': {
        const datatype = isRecord(value.datatype) ? value.datatype : undefined;
        valid =
          hasOnlyKeys(value, OPEN_SIGNATURE_DATATYPE_BODY_KEYS) &&
          datatype !== undefined &&
          hasOnlyKeys(datatype, OPEN_SIGNATURE_DATATYPE_KEYS) &&
          typeof datatype.typeName === 'string' &&
          isDenseArray(datatype.typeParameters) &&
          datatype.typeParameters.every((item) =>
            isRawOpenSignatureBody(item, seen),
          );
        break;
      }
      case 'typeParameter':
        valid =
          hasOnlyKeys(value, OPEN_SIGNATURE_TYPE_PARAMETER_BODY_KEYS) &&
          typeof value.index === 'number' &&
          Number.isInteger(value.index) &&
          value.index >= 0;
        break;
      default:
        valid = false;
    }
  }

  seen.delete(value);
  return valid;
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}
