// factories.ts
import type { PTBObjectKind, PTBScalar, PTBType } from './types';

/** Create a scalar type */
export const scalar = (name: PTBScalar): PTBType => ({ kind: 'scalar', name });

/** Create a vector type */
export const vector = (elem: PTBType): PTBType => ({ kind: 'vector', elem });

/** Create an object type */
export const object = (name: PTBObjectKind, typeArgs?: string[]): PTBType => ({
  kind: 'object',
  name,
  typeArgs,
});

/** Create a tuple type */
export const tuple = (...elems: PTBType[]): PTBType => ({
  kind: 'tuple',
  elems,
});

/** Create a precise Move numeric type */
export const moveNumeric = (
  width: 'u8' | 'u16' | 'u32' | 'u64' | 'u128' | 'u256',
): PTBType => ({
  kind: 'move_numeric',
  width,
});
