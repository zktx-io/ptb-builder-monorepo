import { PTBScalar, PTBType } from './types';

export const S = (name: PTBScalar): PTBType => ({ kind: 'scalar', name });
export const V = (elem: PTBType): PTBType => ({ kind: 'vector', elem });
export const O = (typeTag?: string): PTBType =>
  typeTag ? { kind: 'object', typeTag } : { kind: 'object' };
export const M = (
  width: 'u8' | 'u16' | 'u32' | 'u64' | 'u128' | 'u256',
): PTBType => ({
  kind: 'move_numeric',
  width,
});
