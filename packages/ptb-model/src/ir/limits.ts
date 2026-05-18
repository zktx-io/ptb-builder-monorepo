export const RAW_ARGUMENT_INDEX_MAX = 65_535;

// This is the raw argument index address space, not a Sui protocol execution limit.
export const MAX_RESULT_COUNT = RAW_ARGUMENT_INDEX_MAX + 1;

export function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function isU16Index(value: unknown): value is number {
  return isNonNegativeSafeInteger(value) && value <= RAW_ARGUMENT_INDEX_MAX;
}
