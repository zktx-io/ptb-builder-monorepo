// src/ptb/graph/typeHelpers.ts

// -----------------------------------------------------------------------------
// Canonical PTB type factories. Single source of truth.
// tx.pure aligned: scalar, move_numeric, object, vector, option, tuple, typeparam
// -----------------------------------------------------------------------------

import type { NumericWidth, PTBScalar, PTBType } from './types';

/** Scalar type factory (bool, string, address, id, number) */
export const S = (name: PTBScalar): PTBType => ({ kind: 'scalar', name });

/** Move numeric type factory (u8, u16, u32, u64, u128, u256) */
export const M = (width: NumericWidth): PTBType => ({
  kind: 'move_numeric',
  width,
});

/** Object type factory (with optional type tag) */
export const O = (typeTag?: string): PTBType =>
  typeTag ? { kind: 'object', typeTag } : { kind: 'object' };

/** Vector type factory */
export const V = (elem: PTBType): PTBType => ({ kind: 'vector', elem });

/** Option type factory */
export const Opt = (elem: PTBType): PTBType => ({ kind: 'option', elem });

/** Tuple type factory */
export const Tup = (...elems: PTBType[]): PTBType => ({ kind: 'tuple', elems });

/** Type-parameter factory (e.g., "T0") */
export const T = (name = 'T0'): PTBType => ({ kind: 'typeparam', name });

/** Unknown type factory */
export const Unknown = (): PTBType => ({ kind: 'unknown' });

/** Pretty label for variables inferred from PTBType. */
export function labelFromType(t: PTBType): string {
  switch (t.kind) {
    case 'scalar':
      return t.name;
    case 'move_numeric':
      return t.width;
    case 'object':
      return t.typeTag ? `object<${t.typeTag}>` : 'object';
    case 'vector':
      return `vector<${labelFromType(t.elem)}>`;
    case 'option':
      return `option<${labelFromType(t.elem)}>`;
    case 'tuple':
      return `(${t.elems.map(labelFromType).join(',')})`;
    case 'typeparam':
      return t.name;
    case 'unknown':
    default:
      return 'unknown';
  }
}

// Optional friendly aliases (back-compat)
export const scalar = S;
export const moveNumeric = M;
export const object = O;
export const vector = V;
export const option = Opt;
export const tuple = Tup;
export const typeParam = T;
export const unknown = Unknown;
