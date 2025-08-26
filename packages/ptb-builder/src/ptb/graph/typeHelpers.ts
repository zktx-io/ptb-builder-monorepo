import { PTBScalar, PTBType } from './types';

export const S = (name: PTBScalar): PTBType => ({ kind: 'scalar', name });
export const V = (elem: PTBType): PTBType => ({ kind: 'vector', elem });
export const O = (typeTag?: string): PTBType =>
  typeTag ? { kind: 'object', typeTag } : { kind: 'object' };
export const M = (
  width: 'u8' | 'u16' | 'u32' | 'u64' | 'u128' | 'u256',
): PTBType => ({ kind: 'move_numeric', width });

/** New: type parameter placeholder (e.g., T0, T1...).
 * If name is omitted, callers can still provide a display label separately. */
export const T = (name?: string): PTBType =>
  name ? { kind: 'typeparam', name } : ({ kind: 'typeparam' } as PTBType);

/** (Optional) convenience helpers if you want them */
export const Tup = (...elems: PTBType[]): PTBType => ({ kind: 'tuple', elems });
export const Unknown = (): PTBType => ({ kind: 'unknown' });
