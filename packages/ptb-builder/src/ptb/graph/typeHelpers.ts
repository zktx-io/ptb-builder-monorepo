import { PTBScalar, PTBType } from './types';

/** Scalar type factory (bool, string, address, number) */
export const S = (name: PTBScalar): PTBType => ({ kind: 'scalar', name });

/** Vector type factory */
export const V = (elem: PTBType): PTBType => ({ kind: 'vector', elem });

/** Object type factory (with optional type tag) */
export const O = (typeTag?: string): PTBType =>
  typeTag ? { kind: 'object', typeTag } : { kind: 'object' };

/** Move numeric type factory (u8, u16, u32, u64, u128, u256) */
export const M = (
  width: 'u8' | 'u16' | 'u32' | 'u64' | 'u128' | 'u256',
): PTBType => ({ kind: 'move_numeric', width });

/** Type parameter placeholder (e.g., T0, T1...).
 * If name is omitted, a generic placeholder is created.
 */
export const T = (name?: string): PTBType =>
  name ? { kind: 'typeparam', name } : ({ kind: 'typeparam' } as PTBType);

/** Tuple type factory */
export const Tup = (...elems: PTBType[]): PTBType => ({ kind: 'tuple', elems });

/** Unknown type factory */
export const Unknown = (): PTBType => ({ kind: 'unknown' });
