// src/ptb/graph/factories.ts
import type { NumericWidth, PTBScalar, PTBType } from './types';

/** Create a scalar type */
export const scalar = (name: PTBScalar): PTBType => ({ kind: 'scalar', name });

/** Create a vector type */
export const vector = (elem: PTBType): PTBType => ({ kind: 'vector', elem });

/** Create a generic on-chain object (optional Move type tag) */
export const object = (typeTag?: string): PTBType =>
  typeTag ? { kind: 'object', typeTag } : { kind: 'object' };

/** Create a tuple type */
export const tuple = (...elems: PTBType[]): PTBType => ({
  kind: 'tuple',
  elems,
});

/** Create a precise Move numeric type */
export const moveNumeric = (width: NumericWidth): PTBType => ({
  kind: 'move_numeric',
  width,
});
