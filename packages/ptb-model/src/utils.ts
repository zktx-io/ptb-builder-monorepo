export const NULL_VALUE: null = null;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

export function asArray(value: unknown): unknown[] {
  return isDenseArray(value) ? value : [];
}

export function isDenseArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value)) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) return false;
  }
  return true;
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function jsonStringifyWithBigInt(value: unknown): string {
  return JSON.stringify(value, (_key, item) =>
    typeof item === 'bigint' ? item.toString() : item,
  );
}

export function quote(value: string): string {
  return JSON.stringify(value);
}

export function cloneJsonLike<T>(value: T): T {
  return cloneJsonLikeInner(value, new WeakMap<object, unknown>());
}

function cloneJsonLikeInner<T>(value: T, seen: WeakMap<object, unknown>): T {
  if (Array.isArray(value)) {
    const existing = seen.get(value);
    if (existing) return existing as T;

    const copy: unknown[] = new Array(value.length);
    seen.set(value, copy);
    for (let index = 0; index < value.length; index += 1) {
      if (Object.prototype.hasOwnProperty.call(value, index)) {
        copy[index] = cloneJsonLikeInner(value[index], seen);
      }
    }
    return copy as T;
  }

  if (isPlainObject(value)) {
    const existing = seen.get(value);
    if (existing) return existing as T;

    const copy: Record<string, unknown> = {};
    seen.set(value, copy);
    Object.entries(value).forEach(([key, item]) => {
      copy[key] = cloneJsonLikeInner(item, seen);
    });
    return copy as T;
  }

  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;

  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
