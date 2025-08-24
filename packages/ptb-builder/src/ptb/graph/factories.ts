// src/ptb/graph/factories.ts
import type { NumericWidth, PTBScalar, PTBType } from './types';

/** Scalars */
export const scalar = (name: PTBScalar): PTBType => ({ kind: 'scalar', name });
export const num = (): PTBType => scalar('number');
export const str = (): PTBType => scalar('string');
export const bool = (): PTBType => scalar('bool');
export const addr = (): PTBType => scalar('address');

/** Containers */
export const vector = (elem: PTBType): PTBType => ({ kind: 'vector', elem });
export const tuple = (...elems: PTBType[]): PTBType => ({
  kind: 'tuple',
  elems,
});

/** Objects */
export const object = (typeTag?: string): PTBType =>
  typeTag ? { kind: 'object', typeTag } : { kind: 'object' };

/** Move numeric */
export const moveNumeric = (width: NumericWidth): PTBType => ({
  kind: 'move_numeric',
  width,
});

/** Unknown */
export const unknown = (): PTBType => ({ kind: 'unknown' });
