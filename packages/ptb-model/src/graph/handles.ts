import { isU16Index } from '../ir/limits.js';

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

export function singleResultOutputHandles(
  referencedNestedResultIndexes: readonly number[],
): string[] {
  return [
    RESULT_HANDLE_ID,
    ...(referencedNestedResultIndexes.includes(0)
      ? [nestedResultHandle(0)]
      : []),
  ];
}

export function knownResultOutputHandles(
  resultCount: number,
  referencedNestedResultIndexes: readonly number[] = [],
): string[] {
  if (resultCount <= 0) return [];
  if (resultCount === 1)
    return singleResultOutputHandles(referencedNestedResultIndexes);

  return Array.from({ length: resultCount }, (_value, index) =>
    nestedResultHandle(index),
  );
}

export function unknownResultOutputHandles(
  referencedNestedResultIndexes: readonly number[] = [],
): string[] {
  return [
    RESULT_HANDLE_ID,
    ...referencedNestedResultIndexes.map((index) => nestedResultHandle(index)),
  ];
}

export function isUnknownResultOutputHandle(handle: string): boolean {
  return handle === RESULT_HANDLE_ID || isNestedResultHandle(handle);
}

function parseIndexSuffix(value: string): number | undefined {
  if (!INDEX_SUFFIX_PATTERN.test(value)) return undefined;

  const index = Number(value);
  return isU16Index(index) ? index : undefined;
}
