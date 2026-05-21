export const NULL_VALUE: null = null;
export const MAX_PTB_TYPE_DEPTH = 64;

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

export function isCanonicalDecimalUnsignedIntegerString(
  value: unknown,
): value is string {
  return typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value);
}

export function jsonStringifyWithBigInt(value: unknown): string {
  return JSON.stringify(value, (_key, item) =>
    typeof item === 'bigint' ? item.toString() : item,
  );
}

export interface PlainDataIssue {
  path: string;
  message: string;
}

type CloneFrame =
  | { kind: 'array'; source: unknown[]; target: unknown[] }
  | {
      kind: 'object';
      source: Record<string, unknown>;
      target: Record<string, unknown>;
    };

/**
 * Detach arrays and plain objects while preserving primitive values.
 *
 * Non-plain objects are returned as-is so callers can still surface diagnostics
 * for unsupported source payloads instead of throwing before validation. Callers
 * that need model-owned data must pair this with findNonPlainData().
 */
export function cloneJsonLike<T>(value: T): T {
  if (!Array.isArray(value) && !isPlainObject(value)) {
    return value;
  }

  const seen = new WeakMap<object, unknown>();
  const stack: CloneFrame[] = [];
  let root: unknown[] | Record<string, unknown>;
  if (Array.isArray(value)) {
    root = new Array(value.length);
    stack.push({ kind: 'array', source: value, target: root });
  } else {
    root = {};
    stack.push({
      kind: 'object',
      source: value as Record<string, unknown>,
      target: root,
    });
  }
  seen.set(value as object, root);

  while (stack.length > 0) {
    const frame = stack.pop()!;
    if (frame.kind === 'array') {
      for (let index = 0; index < frame.source.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(frame.source, index)) {
          continue;
        }
        frame.target[index] = cloneJsonLikeChild(
          frame.source[index],
          seen,
          stack,
        );
      }
      continue;
    }

    Object.entries(frame.source).forEach(([key, item]) => {
      frame.target[key] = cloneJsonLikeChild(item, seen, stack);
    });
  }

  return root as T;
}

export function findNonPlainData(
  value: unknown,
  path = '$',
): PlainDataIssue | undefined {
  const stack: Array<{ value: unknown; path: string }> = [{ value, path }];
  const seen = new WeakSet<object>();

  while (stack.length > 0) {
    const current = stack.pop()!;
    const item = current.value;

    if (
      item === NULL_VALUE ||
      item === undefined ||
      typeof item === 'string' ||
      typeof item === 'number' ||
      typeof item === 'boolean' ||
      typeof item === 'bigint'
    ) {
      continue;
    }

    if (Array.isArray(item)) {
      if (!isDenseArray(item)) {
        return {
          path: current.path,
          message: 'Plain data arrays must be dense.',
        };
      }
      if (seen.has(item)) continue;
      seen.add(item);
      for (let index = item.length - 1; index >= 0; index -= 1) {
        stack.push({ value: item[index], path: `${current.path}[${index}]` });
      }
      continue;
    }

    if (isPlainObject(item)) {
      if (seen.has(item)) continue;
      seen.add(item);
      Object.entries(item).forEach(([key, child]) => {
        stack.push({ value: child, path: `${current.path}.${key}` });
      });
      continue;
    }

    return {
      path: current.path,
      message: `Plain data must not contain ${describeNonPlainData(item)} values.`,
    };
  }

  return undefined;
}

export function deepFreezeJsonLike(value: unknown): void {
  const stack: unknown[] = [value];
  const seen = new WeakSet<object>();

  while (stack.length > 0) {
    const item = stack.pop();
    if (!Array.isArray(item) && !isPlainObject(item)) continue;
    if (seen.has(item)) continue;
    seen.add(item);

    if (Array.isArray(item)) {
      item.forEach((child) => stack.push(child));
    } else {
      Object.values(item).forEach((child) => stack.push(child));
    }
    Object.freeze(item);
  }
}

function cloneJsonLikeChild(
  value: unknown,
  seen: WeakMap<object, unknown>,
  stack: CloneFrame[],
): unknown {
  if (Array.isArray(value)) {
    const existing = seen.get(value);
    if (existing) return existing;

    const copy: unknown[] = new Array(value.length);
    seen.set(value, copy);
    stack.push({ kind: 'array', source: value, target: copy });
    return copy;
  }

  if (isPlainObject(value)) {
    const existing = seen.get(value);
    if (existing) return existing;

    const copy: Record<string, unknown> = {};
    seen.set(value, copy);
    stack.push({ kind: 'object', source: value, target: copy });
    return copy;
  }

  return value;
}

export function jsonLikeEqual(left: unknown, right: unknown): boolean {
  const stack: Array<[unknown, unknown]> = [[left, right]];

  while (stack.length > 0) {
    const [currentLeft, currentRight] = stack.pop()!;
    if (Object.is(currentLeft, currentRight)) continue;

    if (Array.isArray(currentLeft) || Array.isArray(currentRight)) {
      if (!Array.isArray(currentLeft) || !Array.isArray(currentRight)) {
        return false;
      }
      if (currentLeft.length !== currentRight.length) return false;

      for (let index = 0; index < currentLeft.length; index += 1) {
        const hasLeft = Object.prototype.hasOwnProperty.call(
          currentLeft,
          index,
        );
        const hasRight = Object.prototype.hasOwnProperty.call(
          currentRight,
          index,
        );
        if (hasLeft !== hasRight) return false;
        if (hasLeft) stack.push([currentLeft[index], currentRight[index]]);
      }
      continue;
    }

    if (isPlainObject(currentLeft) || isPlainObject(currentRight)) {
      if (!isPlainObject(currentLeft) || !isPlainObject(currentRight)) {
        return false;
      }
      const leftKeys = Object.keys(currentLeft);
      const rightKeys = Object.keys(currentRight);
      if (leftKeys.length !== rightKeys.length) return false;
      for (const key of leftKeys) {
        if (!Object.prototype.hasOwnProperty.call(currentRight, key)) {
          return false;
        }
        stack.push([currentLeft[key], currentRight[key]]);
      }
      continue;
    }

    return false;
  }

  return true;
}

export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  if (!isRecord(value)) return false;

  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function describeNonPlainData(value: unknown): string {
  if (typeof value === 'function') return 'function';
  if (typeof value === 'symbol') return 'symbol';
  if (typeof value === 'object' && value !== NULL_VALUE) {
    return value.constructor?.name ?? 'non-plain object';
  }
  return typeof value;
}
