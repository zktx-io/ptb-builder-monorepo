// src/ptb/graph/typecheck.ts

// ---------------------------------------------------------------------
// PTB type guards, IO category utilities, compatibility rules, and helpers.
// Policy overview (matches implementation):
// - Pure types (tx.pure-encodable):
//     * scalar (bool, string, address, id, number)
//     * move_numeric (u8..u256)
//     * vector<T> and option<T> are pure iff T is pure (arbitrary depth).
//       UI may restrict creating nested vectors/options for simplicity.
// - object and tuple are non-pure (tx.pure does not encode them).
// - The type model permits vector<object> / option<object>, but UI-level
//   creation disallows them.
// - Compatibility:
//     * option<X> vs non-option are incompatible; option<X> ↔ option<Y> uses exact inner types.
//     * scalar(number) → move_numeric(uXX) is compatible only at top level
//       (edge.cast carries width).
//     * vector<X> ↔ vector<Y> uses exact inner types, including object tags.
//     * move_numeric ↔ move_numeric compatible only if width matches.
//     * top-level object ↔ object: lenient if either side lacks typeTag; canonical
//       PTB object type-tag candidate equality if both present.
// - Serialized-type helpers unwrap vector/option/tuple syntax conservatively.
// ---------------------------------------------------------------------

import { parsePTBObjectTypeTagCandidate } from '@zktx.io/ptb-model';

import type { NumericWidth, PTBType } from './types';

/* ---------------------------------------------------------------------
 * Type guards & small helpers
 * -------------------------------------------------------------------*/
export const isScalar = (
  t?: PTBType,
): t is Extract<PTBType, { kind: 'scalar' }> => !!t && t.kind === 'scalar';

export const isMoveNumeric = (
  t?: PTBType,
): t is Extract<PTBType, { kind: 'move_numeric' }> =>
  !!t && t.kind === 'move_numeric';

export const isObject = (
  t?: PTBType,
): t is Extract<PTBType, { kind: 'object' }> => !!t && t.kind === 'object';

export const isVector = (
  t?: PTBType,
): t is Extract<PTBType, { kind: 'vector' }> => !!t && t.kind === 'vector';

export const isOption = (
  t?: PTBType,
): t is Extract<PTBType, { kind: 'option' }> => !!t && t.kind === 'option';

export const isUnknownType = (t?: PTBType) => !t || t.kind === 'unknown';

export const vectorElem = (t?: PTBType): PTBType | undefined =>
  isVector(t) ? t.elem : undefined;

export const optionElem = (t?: PTBType): PTBType | undefined =>
  isOption(t) ? t.elem : undefined;

/** Maximum recursion depth for type checking to prevent stack overflow */
const MAX_TYPE_DEPTH = 32;

/* ---------------------------------------------------------------------
 * IO category (for color/UI grouping)
 * -------------------------------------------------------------------*/
export type IOCategory =
  | 'address'
  | 'number'
  | 'bool'
  | 'string'
  | 'object'
  | 'id'
  | 'unknown';

export function ioCategoryOf(t?: PTBType): IOCategory {
  if (!t) return 'unknown';

  switch (t.kind) {
    case 'vector':
    case 'option':
      return ioCategoryOf(t.elem);
    case 'move_numeric':
      return 'number';
    case 'scalar': {
      const n = t.name;
      if (n === 'number') return 'number';
      if (n === 'address') return 'address';
      if (n === 'bool') return 'bool';
      if (n === 'string') return 'string';
      if (n === 'id') return 'id';
      return 'unknown';
    }
    case 'object':
      return 'object';
    case 'tuple':
    case 'unknown':
    default:
      return 'unknown';
  }
}

/* Structural equality (strict, used for nested vector/option/tuple members). */
function isSameType(a: PTBType, b: PTBType, depth = 0): boolean {
  if (depth > MAX_TYPE_DEPTH) return false; // Prevent infinite recursion
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'scalar':
      return (b as any).name === a.name;
    case 'move_numeric':
      return (b as any).width === a.width;
    case 'object':
      return isSameObjectType(a, b as PTBType);
    case 'vector':
      return isSameType(a.elem, (b as any).elem, depth + 1);
    case 'option':
      return isSameType(a.elem, (b as any).elem, depth + 1);
    case 'tuple': {
      const bt = b as Extract<PTBType, { kind: 'tuple' }>;
      return (
        a.elems.length === bt.elems.length &&
        a.elems.every((t, i) => isSameType(t, bt.elems[i], depth + 1))
      );
    }
    case 'unknown':
      return false;
  }
}

function canonicalObjectTypeTag(type: PTBType): string | undefined {
  if (!isObject(type) || !type.typeTag) return undefined;
  return parsePTBObjectTypeTagCandidate(type.typeTag);
}

function isSameObjectType(a: PTBType, b: PTBType): boolean {
  if (!isObject(a) || !isObject(b)) return false;
  const aTag = (a.typeTag ?? '').trim();
  const bTag = (b.typeTag ?? '').trim();
  if (!aTag || !bTag) return !aTag && !bTag;
  const canonicalA = canonicalObjectTypeTag(a);
  const canonicalB = canonicalObjectTypeTag(b);
  return !!canonicalA && !!canonicalB && canonicalA === canonicalB;
}

/* Top-level object edge compatibility is intentionally more lenient than
 * strict object equality because builder inputs may omit fetched type metadata.
 * A present but model-invalid typeTag is never compatible.
 */
function isObjectTypeCompatible(src: PTBType, dst: PTBType): boolean {
  if (!isObject(src) || !isObject(dst)) return false;
  const sourceTag = (src.typeTag ?? '').trim();
  const targetTag = (dst.typeTag ?? '').trim();
  const canonicalSource = sourceTag ? canonicalObjectTypeTag(src) : undefined;
  const canonicalTarget = targetTag ? canonicalObjectTypeTag(dst) : undefined;
  if ((sourceTag && !canonicalSource) || (targetTag && !canonicalTarget)) {
    return false;
  }
  if (!sourceTag || !targetTag) return true;
  return canonicalSource === canonicalTarget;
}

/* Compatibility policy (UI wiring) */
export function isTypeCompatible(
  src?: PTBType,
  dst?: PTBType,
  depth = 0,
): boolean {
  if (!src || !dst) return false;
  if (depth > MAX_TYPE_DEPTH) return false; // Prevent infinite recursion
  if (isUnknownType(src) || isUnknownType(dst)) return false;

  // option vs non-option are incompatible; option<X> ↔ option<Y> requires exact inner types
  if (isOption(src) || isOption(dst)) {
    return isOption(src) && isOption(dst) && isSameType(src.elem, dst.elem);
  }

  // scalar(number) → move_numeric(width), only at the top-level edge.
  if (
    depth === 0 &&
    isScalar(src) &&
    src.name === 'number' &&
    isMoveNumeric(dst)
  ) {
    return true;
  }

  // vector<X> ↔ vector<Y> requires exact inner types.
  if (isVector(src) && isVector(dst)) {
    return isSameType(src.elem, dst.elem);
  }

  // move_numeric ↔ move_numeric (same width)
  if (isMoveNumeric(src) && isMoveNumeric(dst)) {
    return src.width === dst.width;
  }

  // object ↔ object (lenient when a tag is missing; strict when both present)
  if (isObject(src) && isObject(dst)) {
    return isObjectTypeCompatible(src, dst);
  }

  // exact match for remaining cases (scalars/tuples)
  return isSameType(src, dst, depth);
}

/* Cast inference: bind an abstract number source to a concrete top-level Move integer input. */
export function inferCastTarget(
  src?: PTBType,
  dst?: PTBType,
): { to: NumericWidth } | undefined {
  if (!src || !dst) return undefined;

  if (isScalar(src) && src.name === 'number' && isMoveNumeric(dst)) {
    return { to: dst.width };
  }

  return undefined;
}

/* Serialized-type helpers (UI-only) */
function norm(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLowerCase();
}

function stripOneWrapper(s: string): [string, boolean] {
  const x = norm(s);

  // vector<...>
  if (x.startsWith('vector<') && x.endsWith('>')) {
    return [x.slice('vector<'.length, -1), true];
  }
  // option<...>
  if (x.startsWith('option<') && x.endsWith('>')) {
    return [x.slice('option<'.length, -1), true];
  }
  if (x.startsWith('(') && x.endsWith(')')) return [x.slice(1, -1), true];
  if (x.endsWith('[]')) return [x.slice(0, -2), true];
  return [x, false];
}

function unwrapToBase(s: string): string {
  let cur = norm(s);
  // Strip wrappers greedily (handles nested vector<option<vector<T>>>)
  for (let i = 0; i < 8; i++) {
    const [next, stripped] = stripOneWrapper(cur);
    if (!stripped) break;
    cur = norm(next);
  }
  return cur;
}

export function ioCategoryOfSerialized(s?: string): IOCategory {
  if (!s) return 'unknown';
  const base = unwrapToBase(s);

  // object or object<...>
  if (base === 'object' || base.startsWith('object<')) return 'object';
  if (['u8', 'u16', 'u32', 'u64', 'u128', 'u256'].includes(base)) {
    return 'number';
  }
  if (base === 'number') return 'number';
  if (base === 'address') return 'address';
  if (base === 'bool') return 'bool';
  if (base === 'string') return 'string';
  if (base === 'id') return 'id';
  return 'unknown';
}

/** True if the serialized string represents a vector<...> or ...[] */
export function isVectorSerialized(s?: string): boolean {
  if (!s) return false;
  const lower = s.trim().toLowerCase();
  return lower.startsWith('vector<') || lower.endsWith('[]');
}

/** True if the serialized string represents an option<...> */
export function isOptionSerialized(s?: string): boolean {
  if (!s) return false;
  const lower = s.trim().toLowerCase();
  return lower.startsWith('option<');
}
