// src/ptb/graph/typeHelpers.ts
// -----------------------------------------------------------------------------
// Canonical PTB type factories. Single source of truth.
// -----------------------------------------------------------------------------

import type { NumericWidth, PTBScalar, PTBType } from './types';

/** Scalar type factory (bool, string, address, number) */
export const S = (name: PTBScalar): PTBType => ({ kind: 'scalar', name });

/** Vector type factory */
export const V = (elem: PTBType): PTBType => ({ kind: 'vector', elem });

/** Object type factory (with optional type tag) */
export const O = (typeTag?: string): PTBType =>
  typeTag ? { kind: 'object', typeTag } : { kind: 'object' };

/** Move numeric type factory (u8, u16, u32, u64, u128, u256) */
export const M = (width: NumericWidth): PTBType => ({
  kind: 'move_numeric',
  width,
});

/** Type parameter placeholder (e.g., "T0", "T", "U1") */
export const T = (name = 'T'): PTBType => ({ kind: 'typeparam', name });

/** Tuple type factory */
export const Tup = (...elems: PTBType[]): PTBType => ({ kind: 'tuple', elems });

/** Unknown type factory */
export const Unknown = (): PTBType => ({ kind: 'unknown' });

// Back-compat (optional): friendly aliases some code may expect
export const scalar = S;
export const vector = V;
export const object = O;
export const moveNumeric = M;
export const typeParam = T;
export const tuple = Tup;
export const unknown = Unknown;
