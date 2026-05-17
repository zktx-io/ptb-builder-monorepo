import { bcs, TypeTagSerializer } from '@mysten/sui/bcs';
import {
  fromBase64,
  isValidSuiAddress,
  normalizeSuiAddress,
  toBase64,
} from '@mysten/sui/utils';

import {
  asString,
  isCanonicalDecimalUnsignedIntegerString,
  isDenseArray,
  isRecord,
  NULL_VALUE,
} from '../utils.js';

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
const BASE64_ASCII_WHITESPACE = /[\t\n\f\r ]/g;
const MAX_MOVE_TYPE_TAG_DEPTH = 64;
const MAX_RAW_OPEN_SIGNATURE_DEPTH = 64;
const MAX_MOVE_IDENTIFIER_LENGTH = 128;
const SCALAR_PARSE_CACHE_LIMIT = 2_048;
const MOVE_IDENTIFIER_PATTERN = /^([a-zA-Z][a-zA-Z0-9_]*|_[a-zA-Z0-9_]+)$/;
const TYPE_TAG_PRIMITIVES = [
  'address',
  'bool',
  'u8',
  'u16',
  'u32',
  'u64',
  'u128',
  'u256',
] as const;
const RAW_INPUT_ARGUMENT_TYPES = ['pure', 'object', 'withdrawal'] as const;
const RAW_OWNED_OBJECT_KEYS = [
  'kind',
  'objectId',
  'version',
  'digest',
] as const;
const RAW_SHARED_OBJECT_KEYS = [
  'kind',
  'objectId',
  'initialSharedVersion',
  'mutable',
] as const;
const RAW_FUNDS_WITHDRAWAL_KEYS = [
  'reservation',
  'typeArg',
  'withdrawFrom',
] as const;
const RAW_FUNDS_RESERVATION_KEYS = ['kind', 'amount'] as const;
const RAW_FUNDS_TYPE_ARG_KEYS = ['kind', 'type'] as const;
const RAW_FUNDS_WITHDRAW_FROM_KEYS = ['kind'] as const;
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

const objectDigestParseCache = new Map<string, ObjectDigest | undefined>();
const moveTypeTagParseCache = new Map<string, string | undefined>();

export function parseJsonU64(value: unknown): JsonU64 | undefined {
  if (
    typeof value === 'string' &&
    !isCanonicalDecimalUnsignedIntegerString(value)
  ) {
    return undefined;
  }
  if (typeof value !== 'string') {
    if (!(typeof value === 'number' && Number.isSafeInteger(value))) {
      return undefined;
    }
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
  const normalized = text.replace(BASE64_ASCII_WHITESPACE, '');
  const decoded = decodeBase64Bytes(normalized);
  return decoded === undefined ? undefined : toBase64(Uint8Array.from(decoded));
}

export function decodeBase64Bytes(value: string): number[] | undefined {
  if (!isBase64Text(value)) return undefined;
  try {
    return Array.from(fromBase64(value));
  } catch {
    return decodeBase64BytesWithBuffer(value);
  }
}

export function parseObjectId(value: unknown): ObjectId | undefined {
  const text = asString(value);
  if (text === undefined) return undefined;
  if (!/^0x/i.test(text)) return undefined;
  const body = text.replace(/^0x/i, '');
  if (body.length === 0) return undefined;
  const normalized = normalizeSuiAddress(text);
  return isValidSuiAddress(normalized) ? normalized : undefined;
}

export function parseObjectDigest(value: unknown): ObjectDigest | undefined {
  const text = asString(value);
  if (text === undefined) return undefined;
  return cachedStringParse(objectDigestParseCache, text, () =>
    parseObjectDigestUncached(text),
  );
}

function parseObjectDigestUncached(text: string): ObjectDigest | undefined {
  try {
    bcs.ObjectDigest.serialize(text);
    return text;
  } catch {
    return undefined;
  }
}

export function parseMoveIdentifier(value: unknown): string | undefined {
  const text = asString(value);
  if (text === undefined) return undefined;
  return text.length <= MAX_MOVE_IDENTIFIER_LENGTH &&
    MOVE_IDENTIFIER_PATTERN.test(text)
    ? text
    : undefined;
}

export function parseMoveTypeTag(value: unknown): string | undefined {
  const text = asString(value);
  if (text === undefined) return undefined;
  return cachedStringParse(moveTypeTagParseCache, text, () =>
    parseMoveTypeTagUncached(text),
  );
}

function parseMoveTypeTagUncached(text: string): string | undefined {
  if (maxAngleDepth(text) > MAX_MOVE_TYPE_TAG_DEPTH) return undefined;
  const scanned = scanMoveTypeTag(text, 0, 0);
  if (scanned === undefined || scanned !== text.length) return undefined;

  try {
    const parsed = TypeTagSerializer.parseFromStr(text, true);
    return isValidSdkTypeTag(parsed, 0)
      ? TypeTagSerializer.tagToString(parsed)
      : undefined;
  } catch {
    return undefined;
  }
}

function cachedStringParse<T extends string>(
  cache: Map<string, T | undefined>,
  text: string,
  parse: () => T | undefined,
): T | undefined {
  if (cache.has(text)) return cache.get(text);

  const result = parse();
  if (cache.size >= SCALAR_PARSE_CACHE_LIMIT) {
    cache.clear();
  }
  cache.set(text, result);
  return result;
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
      value.every((item) => isRawOpenSignature(item, new WeakSet<object>(), 0)))
  );
}

function maxAngleDepth(value: string): number {
  let current = 0;
  let max = 0;
  for (const char of value) {
    if (char === '<') {
      current += 1;
      if (current > max) max = current;
    } else if (char === '>') {
      current -= 1;
      if (current < 0) return Number.POSITIVE_INFINITY;
    }
  }
  return current === 0 ? max : Number.POSITIVE_INFINITY;
}

type SdkTypeTag = ReturnType<typeof TypeTagSerializer.parseFromStr>;

function isValidSdkTypeTag(tag: SdkTypeTag, depth: number): boolean {
  if (depth > MAX_MOVE_TYPE_TAG_DEPTH) return false;

  if ('vector' in tag) return isValidSdkTypeTag(tag.vector, depth + 1);
  if ('struct' in tag) {
    return (
      parseObjectId(tag.struct.address) === tag.struct.address &&
      parseMoveIdentifier(tag.struct.module) === tag.struct.module &&
      parseMoveIdentifier(tag.struct.name) === tag.struct.name &&
      tag.struct.typeParams.every((typeParam) =>
        isValidSdkTypeTag(typeParam, depth + 1),
      )
    );
  }
  return true;
}

function scanMoveTypeTag(
  value: string,
  index: number,
  depth: number,
): number | undefined {
  if (depth > MAX_MOVE_TYPE_TAG_DEPTH) return undefined;
  const primitiveEnd = scanTypeTagPrimitive(value, index);
  if (primitiveEnd !== undefined) return primitiveEnd;

  if (value.startsWith('vector<', index)) {
    const innerStart = index + 'vector<'.length;
    const innerEnd = scanMoveTypeTag(value, innerStart, depth + 1);
    return innerEnd !== undefined && value[innerEnd] === '>'
      ? innerEnd + 1
      : undefined;
  }

  return scanStructTypeTag(value, index, depth);
}

function scanTypeTagPrimitive(
  value: string,
  index: number,
): number | undefined {
  for (const primitive of TYPE_TAG_PRIMITIVES) {
    if (value.startsWith(primitive, index)) return index + primitive.length;
  }
  return undefined;
}

function scanStructTypeTag(
  value: string,
  index: number,
  depth: number,
): number | undefined {
  const addressEnd = value.indexOf('::', index);
  if (addressEnd < 0) return undefined;
  const address = value.slice(index, addressEnd);
  if (parseObjectId(address) === undefined) return undefined;

  const moduleStart = addressEnd + 2;
  const moduleEnd = value.indexOf('::', moduleStart);
  if (moduleEnd < 0) return undefined;
  const moduleName = value.slice(moduleStart, moduleEnd);
  if (parseMoveIdentifier(moduleName) === undefined) return undefined;

  const nameStart = moduleEnd + 2;
  const nameEnd = scanMoveIdentifier(value, nameStart);
  if (nameEnd === undefined) return undefined;
  if (parseMoveIdentifier(value.slice(nameStart, nameEnd)) === undefined) {
    return undefined;
  }

  if (value[nameEnd] !== '<') return nameEnd;
  return scanTypeArguments(value, nameEnd, depth + 1);
}

function scanMoveIdentifier(value: string, index: number): number | undefined {
  let end = index;
  while (end < value.length && /[a-zA-Z0-9_]/.test(value[end])) end += 1;
  return end > index ? end : undefined;
}

function scanTypeArguments(
  value: string,
  index: number,
  depth: number,
): number | undefined {
  if (value[index] !== '<') return undefined;
  let cursor = skipTypeTagWhitespace(value, index + 1);
  if (value[cursor] === '>') return undefined;

  while (cursor < value.length) {
    const itemEnd = scanMoveTypeTag(value, cursor, depth);
    if (itemEnd === undefined) return undefined;
    cursor = skipTypeTagWhitespace(value, itemEnd);
    if (value[cursor] === '>') return cursor + 1;
    if (value[cursor] !== ',') return undefined;
    cursor = skipTypeTagWhitespace(value, cursor + 1);
    if (value[cursor] === '>') return undefined;
  }

  return undefined;
}

function skipTypeTagWhitespace(value: string, index: number): number {
  let cursor = index;
  while (value[cursor] === ' ' || value[cursor] === '\t') cursor += 1;
  return cursor;
}

export function isRawObjectArg(value: unknown): value is RawObjectArg {
  if (!isRecord(value) || typeof value.kind !== 'string') return false;

  switch (value.kind) {
    case 'ImmOrOwnedObject':
    case 'Receiving':
      return (
        hasOnlyKeys(value, RAW_OWNED_OBJECT_KEYS) &&
        parseObjectId(value.objectId) === value.objectId &&
        typeof value.version === 'string' &&
        parseJsonU64(value.version) === value.version &&
        typeof value.digest === 'string' &&
        parseObjectDigest(value.digest) === value.digest
      );
    case 'SharedObject':
      return (
        hasOnlyKeys(value, RAW_SHARED_OBJECT_KEYS) &&
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
  if (!hasOnlyKeys(value, RAW_FUNDS_WITHDRAWAL_KEYS)) return false;
  const reservation = isRecord(value.reservation)
    ? value.reservation
    : undefined;
  const typeArg = isRecord(value.typeArg) ? value.typeArg : undefined;
  const withdrawFrom = isRecord(value.withdrawFrom)
    ? value.withdrawFrom
    : undefined;

  return (
    reservation !== undefined &&
    hasOnlyKeys(reservation, RAW_FUNDS_RESERVATION_KEYS) &&
    reservation?.kind === 'MaxAmountU64' &&
    typeof reservation.amount === 'string' &&
    parseJsonU64(reservation.amount) === reservation.amount &&
    typeArg !== undefined &&
    hasOnlyKeys(typeArg, RAW_FUNDS_TYPE_ARG_KEYS) &&
    typeArg?.kind === 'Balance' &&
    typeof typeArg.type === 'string' &&
    parseMoveTypeTag(typeArg.type) === typeArg.type &&
    withdrawFrom !== undefined &&
    hasOnlyKeys(withdrawFrom, RAW_FUNDS_WITHDRAW_FROM_KEYS) &&
    (withdrawFrom?.kind === 'Sender' || withdrawFrom?.kind === 'Sponsor')
  );
}

function isRawOpenSignature(
  value: unknown,
  seen: WeakSet<object>,
  depth: number,
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
    isRawOpenSignatureBody(value.body, seen, depth)
  );
}

function isRawOpenSignatureBody(
  value: unknown,
  seen: WeakSet<object>,
  depth: number,
): value is RawOpenSignatureBody {
  if (depth > MAX_RAW_OPEN_SIGNATURE_DEPTH) return false;
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
          isRawOpenSignatureBody(value.vector, seen, depth + 1);
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
            isRawOpenSignatureBody(item, seen, depth + 1),
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

function isBase64Text(value: string): boolean {
  if (/[^A-Za-z0-9+/=]/.test(value)) return false;
  if (value.length % 4 === 1) return false;

  const firstPaddingIndex = value.indexOf('=');
  if (firstPaddingIndex < 0) return true;

  const padding = value.slice(firstPaddingIndex);
  return value.length % 4 === 0 && padding.length <= 2 && /^=+$/.test(padding);
}

function decodeBase64BytesWithBuffer(value: string): number[] | undefined {
  const bufferCtor = (
    globalThis as {
      Buffer?: {
        from(input: string, encoding: 'base64'): Uint8Array;
      };
    }
  ).Buffer;
  if (!bufferCtor) return undefined;

  try {
    return Array.from(bufferCtor.from(value, 'base64'));
  } catch {
    return undefined;
  }
}
