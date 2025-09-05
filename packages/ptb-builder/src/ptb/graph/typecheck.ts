// src/ptb/graph/typecheck.ts

// ---------------------------------------------------------------------
// PTB type guards, IO category utilities, compatibility rules, and helpers.
// Policy highlights:
// - Pure types map to tx.pure: scalar/move_numeric/vector (no nested vector).
// - object / vector<object> are non-pure (refs), still allowed for IO wiring.
// - 'option' is CURRENTLY UNSUPPORTED for wiring/codegen: treat as incompatible.
// - scalar(number) → move_numeric(uXX) allows cast (hint carried in edge.cast).
// - Generic placeholders ('typeparam') are REMOVED by policy.
// ---------------------------------------------------------------------

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

export const isTuple = (
  t?: PTBType,
): t is Extract<PTBType, { kind: 'tuple' }> => !!t && t.kind === 'tuple';

export const isUnknownType = (t?: PTBType) => !t || t.kind === 'unknown';

export const vectorElem = (t?: PTBType): PTBType | undefined =>
  isVector(t) ? t.elem : undefined;

export const optionElem = (t?: PTBType): PTBType | undefined =>
  isOption(t) ? t.elem : undefined;

export const isNestedVector = (t?: PTBType): boolean =>
  isVector(t) && isVector(t.elem);

/** Pure scalar names that map to tx.pure.* helpers */
export function isPureScalarName(name: string | undefined): boolean {
  return (
    name === 'bool' ||
    name === 'string' ||
    name === 'address' ||
    name === 'id' ||
    name === 'number'
  );
}

/** True if t is encodable by tx.pure (scalar/move_numeric/vector of pure) */
export function isPureType(t?: PTBType): boolean {
  if (!t) return false;
  if (isUnknownType(t) || isTuple(t) || isObject(t) || isOption(t))
    return false;

  if (isScalar(t)) return isPureScalarName(t.name);
  if (isMoveNumeric(t)) return true;
  if (isVector(t)) {
    // single-level vector only
    return !isNestedVector(t) && isPureType(t.elem);
  }
  return false;
}

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
      return ioCategoryOf(t.elem);
    case 'option':
      return 'unknown'; // unsupported currently
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

/* ---------------------------------------------------------------------
 * Structural equality (strict)
 * - 'object' equal iff typeTag equal (both missing is equal).
 * - 'unknown' is not equal here; reserve unknown for "blocked" state.
 * -------------------------------------------------------------------*/
function isSameType(a: PTBType, b: PTBType): boolean {
  if (a.kind !== b.kind) return false;

  switch (a.kind) {
    case 'scalar':
      return (b as any).name === a.name;
    case 'move_numeric':
      return (b as any).width === a.width;
    case 'object':
      return (a.typeTag ?? '') === ((b as any).typeTag ?? '');
    case 'vector':
      return isSameType(a.elem, (b as any).elem);
    case 'option':
      return isSameType(a.elem, (b as any).elem);
    case 'tuple': {
      const bt = b as Extract<PTBType, { kind: 'tuple' }>;
      return (
        a.elems.length === bt.elems.length &&
        a.elems.every((t, i) => isSameType(t, bt.elems[i]))
      );
    }
    case 'unknown':
      return false;
  }
}

/* ---------------------------------------------------------------------
 * Compatibility policy (UI wiring)
 * - unknown on either side → NOT compatible (block).
 * - option on either side → NOT compatible (unsupported).
 * - scalar(number) ↔ move_numeric(width) is compatible (cast required).
 * - vector<X> ↔ vector<Y> via recursive inner rule (1D only).
 * - move_numeric widths must match unless src/dst is scalar(number).
 * - object tags are **soft-required**:
 *     • if either side has no typeTag → compatible (lenient)
 *     • if both have typeTag → must be equal (strict)
 * - exact match for remaining scalar/tuple forms.
 * -------------------------------------------------------------------*/
export function isTypeCompatible(src?: PTBType, dst?: PTBType): boolean {
  if (!src || !dst) return false;

  if (isUnknownType(src) || isUnknownType(dst)) return false;
  if (isOption(src) || isOption(dst)) return false;

  // scalar(number) ↔ move_numeric(width)
  if (isScalar(src) && src.name === 'number' && isMoveNumeric(dst)) return true;
  if (isMoveNumeric(src) && isScalar(dst) && dst.name === 'number') return true;

  // vector<X> ↔ vector<Y>
  if (isVector(src) && isVector(dst)) {
    return isTypeCompatible(src.elem, dst.elem);
  }

  // move_numeric ↔ move_numeric (same width)
  if (isMoveNumeric(src) && isMoveNumeric(dst)) {
    return src.width === dst.width;
  }

  // object ↔ object (lenient when a tag is missing; strict when both present)
  if (isObject(src) && isObject(dst)) {
    const a = (src.typeTag ?? '').trim();
    const b = (dst.typeTag ?? '').trim();
    if (!a || !b) return true; // lenient: one side unspecified
    return a === b; // strict: both specified must match
  }

  // exact match for remaining cases (scalar names, tuple)
  return isSameType(src, dst);
}

/* ---------------------------------------------------------------------
 * Cast inference (number → move_numeric)
 * - For vectors, bubble inner cast width up.
 * - Options are unsupported → no cast inference.
 * -------------------------------------------------------------------*/
export function inferCastTarget(
  src?: PTBType,
  dst?: PTBType,
): { to: NumericWidth } | undefined {
  if (!src || !dst) return undefined;

  if (isScalar(src) && src.name === 'number' && isMoveNumeric(dst)) {
    return { to: dst.width };
  }
  if (isVector(src) && isVector(dst)) {
    const inner = inferCastTarget(src.elem, dst.elem);
    if (inner?.to) return { to: inner.to };
  }
  return undefined;
}

/* ---------------------------------------------------------------------
 * Serialized-type helpers (string hints -> category/vector checks)
 * - UI-only: for badges and CSS fallbacks when structured type is absent.
 * -------------------------------------------------------------------*/
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

  // bracketed tuple "(...)" → treat as tuple → unknown later
  if (x.startsWith('(') && x.endsWith(')')) {
    return [x.slice(1, -1), true];
  }

  // JS-ish array hint "...[]"
  if (x.endsWith('[]')) {
    return [x.slice(0, -2), true];
  }

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

  // move numeric widths
  if (
    base === 'u8' ||
    base === 'u16' ||
    base === 'u32' ||
    base === 'u64' ||
    base === 'u128' ||
    base === 'u256'
  ) {
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
