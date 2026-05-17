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

type CloneFrame =
  | { kind: 'array'; source: unknown[]; target: unknown[] }
  | {
      kind: 'object';
      source: Record<string, unknown>;
      target: Record<string, unknown>;
    };

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

    if (isRecord(currentLeft) || isRecord(currentRight)) {
      if (!isRecord(currentLeft) || !isRecord(currentRight)) return false;
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;

  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
