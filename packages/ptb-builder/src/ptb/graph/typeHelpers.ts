// src/ptb/graph/typeHelpers.ts

// -----------------------------------------------------------------------------
// Canonical PTB type factories. Single source of truth.
// tx.pure aligned: scalar, move_numeric, object, vector, option, tuple
// Notes:
// - 'typeparam' factory is intentionally removed. Generics are resolved via
//   typeArguments: string[] and never appear as PTBType.
// - The model permits vector<option<...>> etc. at any depth, but the UI may
//   restrict creation for simplicity.
// - Although the model permits vector<object> / option<object> for forward
//   compatibility, UI-level creation currently disallows them.
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

/** Option type factory (kept for future; not emitted by resolver now) */
export const Opt = (elem: PTBType): PTBType => ({ kind: 'option', elem });

/** Tuple type factory */
export const T = (...elems: PTBType[]): PTBType => ({ kind: 'tuple', elems });

/** Unknown type factory */
export const Unknown = (): PTBType => ({ kind: 'unknown' });

// Optional friendly aliases (back-compat)
export const scalar = S;
export const moveNumeric = M;
export const object = O;
export const vector = V;
export const option = Opt;
export const tuple = T;
export const unknown = Unknown;
