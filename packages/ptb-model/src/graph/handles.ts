import {
  isNonNegativeSafeInteger,
  isU16Index,
  MAX_RESULT_COUNT,
} from '../ir/limits.js';

export const RESULT_HANDLE_ID = 'out_result';

const INDEX_SUFFIX_PATTERN = /^(0|[1-9]\d*)$/;
const NESTED_RESULT_HANDLE_PATTERN = /^out_(0|[1-9]\d*)$/;

export interface IndexedHandleSuffix {
  prefix: string;
  index: number;
}

export function inputHandle(name: string): string {
  return `in_${name}`;
}

export function indexedInputHandle(name: string, index: number): string {
  if (!isU16Index(index)) {
    throw new RangeError(
      `Indexed input handle index must be a non-negative u16 integer, got ${String(index)}.`,
    );
  }
  return `${inputHandle(name)}_${index}`;
}

export function indexedInputHandleIndex(
  handle: string,
  name: string,
): number | undefined {
  const prefix = `${inputHandle(name)}_`;
  if (!handle.startsWith(prefix)) return undefined;

  const index = handle.slice(prefix.length);
  return parseIndexSuffix(index);
}

export function isInputHandle(handle: string, name: string): boolean {
  return handle === inputHandle(name);
}

export function isIndexedInputHandle(handle: string, name: string): boolean {
  return indexedInputHandleIndex(handle, name) !== undefined;
}

export function nestedResultHandle(index: number): string {
  if (!isU16Index(index)) {
    throw new RangeError(
      `Nested result handle index must be a non-negative u16 integer, got ${String(index)}.`,
    );
  }
  return `out_${index}`;
}

export function nestedResultHandleIndex(handle: string): number | undefined {
  const match = NESTED_RESULT_HANDLE_PATTERN.exec(handle);
  return match ? parseIndexSuffix(match[1]) : undefined;
}

export function isNestedResultHandle(handle: string): boolean {
  return nestedResultHandleIndex(handle) !== undefined;
}

export function indexedHandleSuffix(
  value: string,
): IndexedHandleSuffix | undefined {
  const separatorIndex = value.lastIndexOf('_');
  if (separatorIndex < 0) return undefined;

  const index = parseIndexSuffix(value.slice(separatorIndex + 1));
  return index === undefined
    ? undefined
    : { prefix: value.slice(0, separatorIndex), index };
}

export function knownResultOutputHandles(resultCount: number): string[] {
  if (
    !isNonNegativeSafeInteger(resultCount) ||
    resultCount > MAX_RESULT_COUNT
  ) {
    return [];
  }
  if (resultCount <= 0) return [];
  if (resultCount === 1) return [RESULT_HANDLE_ID];

  return Array.from({ length: resultCount }, (_value, index) =>
    nestedResultHandle(index),
  );
}

export function isKnownResultOutputHandle(
  handle: string,
  resultCount: number,
): boolean {
  if (
    !isNonNegativeSafeInteger(resultCount) ||
    resultCount > MAX_RESULT_COUNT ||
    resultCount <= 0
  ) {
    return false;
  }
  if (resultCount === 1) return handle === RESULT_HANDLE_ID;

  const index = nestedResultHandleIndex(handle);
  return index !== undefined && index < resultCount;
}

function parseIndexSuffix(value: string): number | undefined {
  if (!INDEX_SUFFIX_PATTERN.test(value)) return undefined;

  const index = Number(value);
  return isU16Index(index) ? index : undefined;
}
