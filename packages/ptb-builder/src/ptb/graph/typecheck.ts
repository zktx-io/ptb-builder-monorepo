import type { NumericWidth, PTBType, UICardinality } from './types';
import { uiCardinalityOf } from './types';

/* ---------------------------------------------------------------------
 * Type guards
 * -------------------------------------------------------------------*/
export const isScalar = (
  t?: PTBType,
): t is Extract<PTBType, { kind: 'scalar' }> => !!t && t.kind === 'scalar';

export const isMoveNumeric = (
  t?: PTBType,
): t is Extract<PTBType, { kind: 'move_numeric' }> =>
  !!t && t.kind === 'move_numeric';

export function isVector(
  t?: PTBType,
): t is Extract<PTBType, { kind: 'vector' }> {
  return Boolean(t && t.kind === 'vector');
}

export function vectorElem(t?: PTBType): PTBType | undefined {
  return isVector(t) ? t.elem : undefined;
}

export function isNestedVector(t?: PTBType): boolean {
  return isVector(t) && isVector(t.elem);
}

export const isObject = (
  t?: PTBType,
): t is Extract<PTBType, { kind: 'object' }> => !!t && t.kind === 'object';

export const isTuple = (
  t?: PTBType,
): t is Extract<PTBType, { kind: 'tuple' }> => !!t && t.kind === 'tuple';

export const isTypeParam = (
  t?: PTBType,
): t is Extract<PTBType, { kind: 'typeparam' }> =>
  !!t && t.kind === 'typeparam';

export const isUnknownType = (t?: PTBType) => !t || t.kind === 'unknown';

/* ---------------------------------------------------------------------
 * IO category (color group for UI)
 *   Note: we treat 'typeparam' as 'unknown' for coloring.
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
      return t.name === 'number' ? 'number' : t.name;
    case 'move_numeric':
      return 'number';
    case 'object':
      return 'object';
    case 'vector':
      return ioCategoryOf(t.elem);
    case 'tuple':
    case 'typeparam':
    case 'unknown':
    default:
      return 'unknown';
  }
}

/* ---------------------------------------------------------------------
 * Structural equality (fallback compatibility)
 *   - 'typeparam' is equal iff names match (e.g., T0 === T0).
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
    case 'typeparam': {
      // Generic placeholders considered equal if their names are equal (T0 === T0).
      return (b as any).name === a.name;
    }
    case 'unknown':
      return true;
  }
}

/* ---------------------------------------------------------------------
 * Compatibility policy
 *   - unknown is compatible with anything (UI-friendly).
 *   - number → move_numeric is compatible.
 *   - V<number> → V<move_numeric> via inner rule.
 *   - Any side being 'typeparam' is considered compatible (generic placeholder).
 * -------------------------------------------------------------------*/
export function isTypeCompatible(src?: PTBType, dst?: PTBType): boolean {
  if (!src || !dst) return true;
  if (isUnknownType(src) || isUnknownType(dst)) return true;

  // Generic placeholders are permissive in UI wiring.
  if (isTypeParam(src) || isTypeParam(dst)) return true;

  // number → move_numeric
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
 * Cast inference (number → move_numeric)
 *   - For vectors, bubble inner cast width up.
 *   - 'typeparam' does not imply a concrete width; no cast suggested.
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
 * Serialized-type helpers (for handleId/type strings)
 * -------------------------------------------------------------------*/
function baseOfSerializedType(s?: string): string | undefined {
  if (!s) return undefined;
  let t = s.trim();

  while (true) {
    const lower = t.toLowerCase();
    if (lower.startsWith('vector<') && lower.endsWith('>')) {
      t = t.slice(7, -1).trim();
      continue;
    }
    if (lower.endsWith('[]')) {
      t = t.slice(0, -2).trim();
      continue;
    }
    break;
  }
  return t.toLowerCase();
}

/* Category from serialized string (mirrors ioCategoryOf) */
const isSerializedTypeParam = (s?: string) => !!s && /^t\d+$/i.test(s.trim());
export function ioCategoryOfSerialized(s?: string): IOCategory {
  const base = baseOfSerializedType(s);
  if (!base) return 'unknown';
  if (isSerializedTypeParam(base)) return 'unknown';
  if (base === 'address') return 'address';
  if (base === 'string') return 'string';
  if (base === 'bool') return 'bool';
  if (base === 'number') return 'number';
  if (/^u(8|16|32|64|128|256)$/.test(base)) return 'number';
  if (base.startsWith('object')) return 'object';
  return 'unknown';
}

/* ---------------------------------------------------------------------
 * UI cardinality (single | multi)
 * -------------------------------------------------------------------*/
export function uiCardinalityOfSerialized(s?: string): UICardinality {
  if (!s) return 'single';
  const lower = s.trim().toLowerCase();
  if (lower.startsWith('vector<')) return 'multi';
  if (lower.endsWith('[]')) return 'multi';
  return 'single';
}

/* ---------------------------------------------------------------------
 * IO shape for UI (category + single/multi)
 * -------------------------------------------------------------------*/
export interface IOShape {
  category: IOCategory;
  cardinality: UICardinality; // 'single' | 'multi'
}

export function ioShapeOf(t?: PTBType): IOShape {
  return { category: ioCategoryOf(t), cardinality: uiCardinalityOf(t) };
}

export function ioShapeOfSerialized(s?: string): IOShape {
  return {
    category: ioCategoryOfSerialized(s),
    cardinality: uiCardinalityOfSerialized(s),
  };
}
