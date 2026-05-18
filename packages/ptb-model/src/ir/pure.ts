import { pureBcsSchemaFromTypeName, type PureTypeName } from '@mysten/sui/bcs';

import { errorDiagnostic } from './diagnostics.js';
import type { TransactionDiagnostic } from './diagnostics.js';
import { isPTBType } from '../ptbType.js';
import type { NumericWidth, PTBType } from '../ptbType.js';
import { decodeBase64Bytes, parseObjectId } from '../raw/types.js';
import {
  isCanonicalDecimalUnsignedIntegerString,
  isDenseArray,
  MAX_PTB_TYPE_DEPTH,
  NULL_VALUE,
} from '../utils.js';

const U64_MAX = 2n ** 64n - 1n;
const U128_MAX = 2n ** 128n - 1n;
const U256_MAX = 2n ** 256n - 1n;
const U8_MAX = 2n ** 8n - 1n;
const U16_MAX = 2n ** 16n - 1n;
const U32_MAX = 2n ** 32n - 1n;

const NUMERIC_MAX: Record<NumericWidth, bigint> = {
  u8: U8_MAX,
  u16: U16_MAX,
  u32: U32_MAX,
  u64: U64_MAX,
  u128: U128_MAX,
  u256: U256_MAX,
};

export function pureTypeName(
  type: PTBType | undefined,
  depth = 0,
): string | undefined {
  if (depth > MAX_PTB_TYPE_DEPTH) return undefined;
  if (!isPTBType(type)) return undefined;

  switch (type.kind) {
    case 'move_numeric':
      return type.width;
    case 'scalar':
      return type.name === 'number' ? undefined : type.name;
    case 'vector': {
      const elem = pureTypeName(type.elem, depth + 1);
      return elem ? `vector<${elem}>` : undefined;
    }
    case 'option': {
      const elem = pureTypeName(type.elem, depth + 1);
      return elem ? `option<${elem}>` : undefined;
    }
    case 'object':
    case 'tuple':
    case 'unknown':
      return undefined;
  }
}

export function normalizePureValueForRender(
  type: PTBType,
  value: unknown,
  depth = 0,
): unknown {
  if (depth > MAX_PTB_TYPE_DEPTH) return value;
  switch (type.kind) {
    case 'move_numeric': {
      const parsed = bigUnsignedInteger(value);
      if (parsed === undefined || parsed > NUMERIC_MAX[type.width]) {
        return value;
      }
      return type.width === 'u8' || type.width === 'u16' || type.width === 'u32'
        ? Number(parsed)
        : parsed.toString();
    }
    case 'scalar':
      return type.name === 'address' || type.name === 'id'
        ? (parseObjectId(value) ?? value)
        : value;
    case 'vector':
      return isDenseArray(value)
        ? value.map((item) =>
            normalizePureValueForRender(type.elem, item, depth + 1),
          )
        : value;
    case 'option':
      return value === NULL_VALUE
        ? value
        : normalizePureValueForRender(type.elem, value, depth + 1);
    case 'object':
    case 'tuple':
    case 'unknown':
      return value;
  }
}

export function pureValueDiagnostic(
  inputId: string,
  type: PTBType,
  value: unknown,
  valuePath: string,
  typePath: string,
  code = 'ir.input.pureValue',
): TransactionDiagnostic | undefined {
  const unsupported = unsupportedPureTypeIssue(inputId, type, typePath);
  if (unsupported) {
    return errorDiagnostic(code, unsupported.message, unsupported.path);
  }
  const issue = describePureValueIssue(inputId, type, value, valuePath);
  return issue ? errorDiagnostic(code, issue.message, issue.path) : undefined;
}

export function isPureValueCompatible(type: PTBType, value: unknown): boolean {
  return (
    unsupportedPureTypeIssue('', type, '$') === undefined &&
    describePureValueIssue('', type, value, '$') === undefined
  );
}

/**
 * Validate canonical raw Pure bytes against an explicit pure type hint.
 * The caller must already have accepted the string as canonical base64.
 */
export function pureBytesTypeHintDiagnostic(
  inputId: string,
  type: PTBType,
  bytes: string,
  path: string,
): TransactionDiagnostic | undefined {
  const typeName = pureTypeName(type);
  if (typeName === undefined) return undefined;

  const decoded = decodeBase64Bytes(bytes);
  if (!decoded) return undefined;

  try {
    const schema = pureBcsSchemaFromTypeName(typeName as PureTypeName);
    const sourceBytes = Uint8Array.from(decoded);
    const parsed = schema.parse(sourceBytes);
    const canonicalBytes = schema.serialize(parsed as never).toBytes();

    if (bytesEqual(sourceBytes, canonicalBytes)) return undefined;
  } catch {
    // Fall through to the canonical BCS diagnostic below.
  }

  return errorDiagnostic(
    'ir.input.pureBytesType',
    `Pure input ${inputId} raw bytes must be canonical BCS for ${typeName}.`,
    path,
  );
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function unsupportedPureTypeIssue(
  inputId: string,
  type: PTBType,
  path: string,
  depth = 0,
): { message: string; path: string } | undefined {
  if (depth > MAX_PTB_TYPE_DEPTH) {
    return {
      message: `Pure input ${inputId} type nesting must not exceed ${MAX_PTB_TYPE_DEPTH}.`,
      path,
    };
  }

  switch (type.kind) {
    case 'move_numeric':
      return undefined;
    case 'scalar':
      return type.name === 'number'
        ? {
            message: `Pure input ${inputId} uses the abstract number placeholder; choose a concrete Move integer width.`,
            path,
          }
        : undefined;
    case 'vector':
      return unsupportedPureTypeIssue(
        inputId,
        type.elem,
        `${path}.elem`,
        depth + 1,
      );
    case 'option': {
      const nested = unsupportedPureTypeIssue(
        inputId,
        type.elem,
        `${path}.elem`,
        depth + 1,
      );
      if (nested) return nested;
      return pureTypeName(type.elem)
        ? undefined
        : {
            message: `Pure input ${inputId} option element type cannot be represented by the @mysten/sui pure helper surface.`,
            path: `${path}.elem`,
          };
    }
    case 'object':
      return {
        message: `Pure input ${inputId} cannot use object as a pure value type. Use an Object input instead.`,
        path,
      };
    case 'tuple':
      return {
        message: `Pure input ${inputId} cannot use tuple as a pure value type.`,
        path,
      };
    case 'unknown':
      return {
        message: `Pure input ${inputId} cannot use unknown as a pure value type.`,
        path,
      };
  }
}

function describePureValueIssue(
  inputId: string,
  type: PTBType,
  value: unknown,
  path: string,
  depth = 0,
): { message: string; path: string } | undefined {
  if (depth > MAX_PTB_TYPE_DEPTH) {
    return {
      message: `Pure input ${inputId} type nesting must not exceed ${MAX_PTB_TYPE_DEPTH}.`,
      path,
    };
  }

  switch (type.kind) {
    case 'move_numeric':
      return numericPureValueIssue(inputId, type.width, value, path);
    case 'scalar':
      switch (type.name) {
        case 'address':
        case 'id':
          return parseObjectId(value) !== undefined
            ? undefined
            : {
                message:
                  typeof value === 'string' &&
                  value.replace(/^0x/i, '').length === 0
                    ? `Pure input ${inputId} requires a non-empty Sui ${type.name === 'id' ? 'object ID' : 'address'}.`
                    : `Pure input ${inputId} requires a valid Sui ${type.name === 'id' ? 'object ID' : 'address'}.`,
                path,
              };
        case 'bool':
          return typeof value === 'boolean'
            ? undefined
            : {
                message: `Pure input ${inputId} requires a boolean value.`,
                path,
              };
        case 'string':
          return typeof value === 'string'
            ? undefined
            : {
                message: `Pure input ${inputId} requires a string value.`,
                path,
              };
        case 'number':
          return undefined;
      }
      return undefined;
    case 'vector':
      if (!isDenseArray(value)) {
        return {
          message: `Pure input ${inputId} requires an array value for vector pure input.`,
          path,
        };
      }
      for (let index = 0; index < value.length; index += 1) {
        const issue = describePureValueIssue(
          inputId,
          type.elem,
          value[index],
          `${path}[${index}]`,
          depth + 1,
        );
        if (issue) return issue;
      }
      return undefined;
    case 'option':
      return value === NULL_VALUE
        ? undefined
        : describePureValueIssue(inputId, type.elem, value, path, depth + 1);
    case 'object':
    case 'tuple':
    case 'unknown':
      return undefined;
  }
}

function numericPureValueIssue(
  inputId: string,
  width: NumericWidth,
  value: unknown,
  path: string,
): { message: string; path: string } | undefined {
  const max = NUMERIC_MAX[width];
  const parsed = bigUnsignedInteger(value);
  if (parsed === undefined) {
    return {
      message: `Pure input ${inputId} requires a canonical unsigned integer string, bigint, or safe integer number for ${width}.`,
      path,
    };
  }
  return parsed <= max
    ? undefined
    : {
        message: `Pure input ${inputId} requires a ${width} value within the supported unsigned integer range.`,
        path,
      };
}

function bigUnsignedInteger(value: unknown): bigint | undefined {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0
      ? BigInt(value)
      : undefined;
  }
  if (typeof value === 'bigint') {
    return value >= 0n ? value : undefined;
  }
  if (!isCanonicalDecimalUnsignedIntegerString(value)) {
    return undefined;
  }
  return BigInt(value);
}
