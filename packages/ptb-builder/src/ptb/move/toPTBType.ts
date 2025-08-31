// src/ptb/move/toPTBType.ts
import type { SuiMoveNormalizedType } from '@mysten/sui/client';

import type { PTBType } from '../graph/types';

/** Narrow helper */
function has<K extends string>(x: any, k: K): x is Record<K, unknown> {
  return x && typeof x === 'object' && k in x;
}

/** Optional: turn TypeParameter index (number) into a stable name */
function typeParamNameFromIndex(i: number): string {
  // T0, T1, ... (stable, readable)
  return `T${i}`;
}

export function toPTBTypeFromMove(t: SuiMoveNormalizedType): PTBType {
  // Primitives (by string literal)
  if (t === 'Bool') return { kind: 'scalar', name: 'bool' };
  if (t === 'Address') return { kind: 'scalar', name: 'address' };
  if (t === 'U8') return { kind: 'move_numeric', width: 'u8' };
  if (t === 'U16') return { kind: 'move_numeric', width: 'u16' };
  if (t === 'U32') return { kind: 'move_numeric', width: 'u32' };
  if (t === 'U64') return { kind: 'move_numeric', width: 'u64' };
  if (t === 'U128') return { kind: 'move_numeric', width: 'u128' };
  if (t === 'U256') return { kind: 'move_numeric', width: 'u256' };

  // References → unwrap
  if (has(t, 'Reference')) return toPTBTypeFromMove((t as any).Reference);
  if (has(t, 'MutableReference'))
    return toPTBTypeFromMove((t as any).MutableReference);

  // Vector<T>
  if (has(t, 'Vector')) {
    return { kind: 'vector', elem: toPTBTypeFromMove((t as any).Vector) };
  }

  // Type parameter (index:number) -> PTB typeparam with a readable name
  if (has(t, 'TypeParameter')) {
    const idx = (t as any).TypeParameter as number;
    return { kind: 'typeparam', name: typeParamNameFromIndex(idx) };
  }

  // Struct { address, module, name, typeArguments }
  if (has(t, 'Struct')) {
    const s = (t as any).Struct as {
      address: string;
      module: string;
      name: string;
      typeArguments?: SuiMoveNormalizedType[];
    };
    const args = s.typeArguments ?? [];

    // If struct has any type args, we cannot build a concrete tag in current PTBType,
    // because PTBType.object doesn't encode generic arguments.
    // Represent as a generic object (unknown concrete tag).
    if (args.length > 0) return { kind: 'object' };

    // Concrete (no type args) → carry full type tag
    const typeTag = `${s.address}::${s.module}::${s.name}`;
    return { kind: 'object', typeTag };
  }

  // Fallback
  return { kind: 'unknown' };
}
