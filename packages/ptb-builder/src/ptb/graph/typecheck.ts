// src/ptb/graph/typecheck.ts
import type { NumericWidth, PTBType } from './types';

/* ---------------------------------------------------------------------
 * Narrowing guards
 * -------------------------------------------------------------------*/
export const isScalar = (
  t?: PTBType,
): t is Extract<PTBType, { kind: 'scalar' }> => !!t && t.kind === 'scalar';

export const isMoveNumeric = (
  t?: PTBType,
): t is Extract<PTBType, { kind: 'move_numeric' }> =>
  !!t && t.kind === 'move_numeric';

export const isVector = (
  t?: PTBType,
): t is Extract<PTBType, { kind: 'vector' }> => !!t && t.kind === 'vector';

export const isObject = (
  t?: PTBType,
): t is Extract<PTBType, { kind: 'object' }> => !!t && t.kind === 'object';

export const isTuple = (
  t?: PTBType,
): t is Extract<PTBType, { kind: 'tuple' }> => !!t && t.kind === 'tuple';

export const isUnknownType = (t?: PTBType) => !t || t.kind === 'unknown';

/* ---------------------------------------------------------------------
 * IO category (for coloring / UX)
 *  - Category is independent of "shape" (single/vector/array).
 *  - For vectors, we forward to the element type's category.
 * -------------------------------------------------------------------*/
export type IOCategory =
  | 'address'
  | 'object'
  | 'string'
  | 'number'
  | 'bool'
  | 'unknown';

export function ioCategoryOf(t?: PTBType): IOCategory {
  if (!t) return 'unknown';
  switch (t.kind) {
    case 'scalar':
      // UI scalar('number' | 'string' | 'bool' | 'address')
      return t.name === 'number' ? 'number' : t.name;
    case 'move_numeric':
      // precise on-chain numerics map to "number" in UI
      return 'number';
    case 'object':
      return 'object';
    case 'vector':
      // vectors inherit the element's category
      return ioCategoryOf(t.elem);
    case 'tuple':
    case 'unknown':
    default:
      return 'unknown';
  }
}

/* ---------------------------------------------------------------------
 * Handle shape (cardinality)
 *  - We expose three shapes to the UI:
 *      'single' | 'vector' | 'array'
 *  - NOTE: Structured PTBType only models 'vector' shape explicitly.
 *          'array' is a UI/serialization form (e.g. "T[]") that we detect
 *          from serialized handle type strings, not from PTBType structure.
 * -------------------------------------------------------------------*/
export type Cardinality = 'single' | 'vector' | 'array';

/** From structured type: only 'vector' is modeled; everything else is 'single'. */
export function cardinalityOf(t?: PTBType): Cardinality {
  return isVector(t) ? 'vector' : 'single';
}

/* ---------------------------------------------------------------------
 * Structural equality (used as a fallback compatibility check)
 * -------------------------------------------------------------------*/
function isSameType(a: PTBType, b: PTBType): boolean {
  if (a.kind !== b.kind) return false;

  switch (a.kind) {
    case 'scalar':
      return (b as any).name === a.name;

    case 'move_numeric':
      return (b as any).width === a.width;

    case 'vector':
      return isSameType(a.elem, (b as any).elem);

    case 'object': {
      // With the new object shape, equality is based on the typeTag string.
      const bo = b as Extract<PTBType, { kind: 'object' }>;
      return (a.typeTag ?? '') === (bo.typeTag ?? '');
    }

    case 'tuple': {
      const bt = b as Extract<PTBType, { kind: 'tuple' }>;
      return (
        a.elems.length === bt.elems.length &&
        a.elems.every((t, i) => isSameType(t, bt.elems[i]))
      );
    }

    case 'unknown':
      return true;
  }
}

/* ---------------------------------------------------------------------
 * Compatibility policy
 *  - scalar('number')      → move_numeric: allowed (cast required)
 *  - vector<number>        → vector<move_numeric>: allowed (cast required)
 *  - move_numeric          → move_numeric: widths must match
 *  - otherwise             → structural equality
 * -------------------------------------------------------------------*/
export function isTypeCompatible(src?: PTBType, dst?: PTBType): boolean {
  if (!src || !dst) return true;
  if (isUnknownType(src) || isUnknownType(dst)) return true;

  if (isScalar(src) && src.name === 'number' && isMoveNumeric(dst)) return true;

  if (isVector(src) && isVector(dst)) {
    const se = src.elem;
    const de = dst.elem;
    if (isScalar(se) && se.name === 'number' && isMoveNumeric(de)) return true;
    return isTypeCompatible(se, de);
  }

  if (isMoveNumeric(src) && isMoveNumeric(dst)) return src.width === dst.width;

  return isSameType(src, dst);
}

/* ---------------------------------------------------------------------
 * Cast inference
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
 * Serialized-type helpers (for handleId strings)
 *  - We need these for edges/handles that carry serialized types like:
 *      "u64", "vector<number>", "object<0x2::sui::SUI>", "number[]"
 * -------------------------------------------------------------------*/

/** Return the base (inner-most) type name in lowercase, unwrapping:
 *  - vector<...> repeatedly
 *  - trailing [] repeatedly
 *  Examples:
 *    baseOfSerializedType("vector<u64>")         -> "u64"
 *    baseOfSerializedType("vector<vector<u8>>")  -> "u8"
 *    baseOfSerializedType("address[]")           -> "address"
 */
function baseOfSerializedType(s?: string): string | undefined {
  if (!s) return undefined;
  let t = s.trim();

  // unwrap nested vector<...> and trailing [] iteratively
  // e.g., "vector<vector<u8>>" -> "u8", "address[]" -> "address"
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const lower = t.toLowerCase();
    if (lower.startsWith('vector<') && lower.endsWith('>')) {
      t = t.slice(7, -1).trim(); // drop "vector<" and ">"
      continue;
    }
    if (lower.endsWith('[]')) {
      t = t.slice(0, -2).trim(); // drop trailing "[]"
      continue;
    }
    break;
  }
  return t.toLowerCase();
}

/** IO category from a serialized type string (kept consistent with ioCategoryOf).
 *  Note: we must check the OUTER token first, otherwise "object<0x2::...>"
 *  would unwrap to "0x2::..." and be misclassified as "unknown".
 */
export function ioCategoryOfSerialized(s?: string): IOCategory {
  const base = baseOfSerializedType(s);
  if (!base) return 'unknown';

  if (base === 'address') return 'address';
  if (base === 'string') return 'string';
  if (base === 'bool') return 'bool';
  if (base === 'number') return 'number';
  if (/^u(8|16|32|64|128|256)$/.test(base)) return 'number'; // move_numeric widths
  if (base.startsWith('object')) return 'object'; // "object" or "object<...>"

  return 'unknown';
}

/** Cardinality from a serialized type string:
 *  - starts with 'vector<'            -> 'vector'
 *  - ends with '[]'                   -> 'array'
 *  - otherwise                        -> 'single'
 */
export function cardinalityOfSerialized(s?: string): Cardinality {
  if (!s) return 'single';
  const lower = s.trim().toLowerCase();
  if (lower.startsWith('vector<')) return 'vector';
  if (lower.endsWith('[]')) return 'array';
  return 'single';
}

/* ---------------------------------------------------------------------
 * IO shape helpers (category + cardinality)
 *  - Used by UI to decide both the color (category) and the handle shape.
 * -------------------------------------------------------------------*/
export interface IOShape {
  /** Color group: 'number' | 'string' | 'bool' | 'address' | 'object' | 'unknown' */
  category: IOCategory;
  /** Handle shape: 'single' | 'vector' | 'array' */
  cardinality: Cardinality;
}

/** Shape from structured PTBType (no 'array' at the structure level). */
export function ioCategoryWithCardinality(t?: PTBType): IOShape {
  return {
    category: ioCategoryOf(t),
    cardinality: cardinalityOf(t), // 'vector' or 'single'
  };
}

/** Shape from serialized type string (can distinguish 'array' via '[]'). */
export function ioShapeOfSerialized(s?: string): IOShape {
  return {
    category: ioCategoryOfSerialized(s),
    cardinality: cardinalityOfSerialized(s), // 'vector' | 'array' | 'single'
  };
}
