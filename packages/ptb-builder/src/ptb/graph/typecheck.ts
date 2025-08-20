// typecheck.ts
import type { NumericWidth, PTBType } from './types';

/** Narrowing guards */
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

/** IO categories (used for coloring/UX) */
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
      if (t.name === 'number') return 'number';
      if (t.name === 'string') return 'string';
      if (t.name === 'bool') return 'bool';
      if (t.name === 'address') return 'address';
      return 'unknown';
    case 'move_numeric':
      return 'number';
    case 'object':
      return 'object';
    case 'vector':
    case 'tuple':
    case 'unknown':
    default:
      return 'unknown';
  }
}

/** Handle shape cardinality */
export type Cardinality = 'single' | 'vector';
export function cardinalityOf(t?: PTBType): Cardinality {
  return isVector(t) ? 'vector' : 'single';
}

/** Internal equality check for type structure */
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
      const bo = b as Extract<PTBType, { kind: 'object' }>;
      const ax = JSON.stringify(a.typeArgs ?? []);
      const bx = JSON.stringify(bo.typeArgs ?? []);
      return a.name === bo.name && ax === bx;
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

/** Compatibility check (policy):
 * - scalar('number') → move_numeric: allowed (cast required)
 * - vector<number> → vector<move_numeric>: allowed (cast required)
 * - move_numeric → move_numeric: must match width
 * - otherwise: must be structurally identical
 */
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

/** Infer cast requirement for edges */
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

/** -------- Serialized-type helpers (for handleId strings) -------- */

/** unwrap vector wrappers in serialized form: vector<T> -> T (recursively) */
function baseOfSerializedType(s?: string): string | undefined {
  if (!s) return undefined;
  let t = s.trim();
  // unwrap nested vectors: vector<vector<T>> -> T
  while (t.toLowerCase().startsWith('vector<') && t.endsWith('>')) {
    t = t.slice(7, -1).trim();
  }
  return t.toLowerCase();
}

/** IOCategory from serialized PTB type string (kept consistent with ioCategoryOf) */
export function ioCategoryOfSerialized(s?: string): IOCategory {
  const base = baseOfSerializedType(s);
  if (!base) return 'unknown';

  if (base.startsWith('object') || base.startsWith('coin')) return 'object';
  if (base === 'address') return 'address';
  if (base === 'string') return 'string';
  if (base === 'bool') return 'bool';
  if (['u8', 'u16', 'u32', 'u64', 'u128', 'u256'].includes(base))
    return 'number';
  if (base === 'number') return 'number';

  return 'unknown';
}

/** Cardinality ('vector' if serialized type is vector<...>, else 'single') */
export function cardinalityOfSerialized(s?: string): Cardinality {
  if (!s) return 'single';
  const trimmed = s.trim().toLowerCase();
  return trimmed.startsWith('vector<') ? 'vector' : 'single';
}
