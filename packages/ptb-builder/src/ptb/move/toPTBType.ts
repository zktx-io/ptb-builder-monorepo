// src/ptb/move/toPTBType.ts
import type { SuiMoveNormalizedType } from '@mysten/sui/client';

import type { PTBType } from '../graph/types';

/** Narrow helper */
function has<K extends string>(x: any, k: K): x is Record<K, unknown> {
  return x && typeof x === 'object' && k in x;
}

/** Normalize Sui address for comparison (lowercase, strip leading zeros). */
function normAddr(a: string): string {
  const x = a.toLowerCase();
  if (!x.startsWith('0x')) return x;
  const body = x.slice(2).replace(/^0+/, '');
  return '0x' + (body.length ? body : '0');
}

/** Struct tag equality (address/module/name) with normalized address. */
function isStructTag(
  s: { address: string; module: string; name: string },
  addr: string,
  module: string,
  name: string,
): boolean {
  return (
    normAddr(s.address) === normAddr(addr) &&
    s.module === module &&
    s.name === name
  );
}

/**
 * Normalize Move ABI type into PTBType.
 * Policy:
 * - No generic placeholders in PTBType (no 'typeparam' kind).
 * - Type parameters are handled via SSOT (UI state) as counts/strings, not in PTBType.
 * - Known pure structs are mapped to PTB scalars/options.
 * - Generic structs (with type args) become generic objects (no concrete tag).
 */
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

  // (Optional) Signer → unsupported for PTB; mark as unknown
  if (t === 'Signer') return { kind: 'unknown' };

  // References → unwrap
  if (has(t, 'Reference')) return toPTBTypeFromMove((t as any).Reference);
  if (has(t, 'MutableReference'))
    return toPTBTypeFromMove((t as any).MutableReference);

  // vector<T>
  if (has(t, 'Vector')) {
    return { kind: 'vector', elem: toPTBTypeFromMove((t as any).Vector) };
  }

  // TypeParameter(index:number)
  // Generics are handled out-of-band in UI (as count/strings), not in PTBType.
  // Return 'unknown' to avoid introducing a 'typeparam' variant in PTBType.
  if (has(t, 'TypeParameter')) {
    return {
      kind: 'unknown',
      debugInfo: 'generic TypeParameter (use UI _fnTParams)',
    };
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

    // Map known pure structs to scalar/option:
    // - 0x1::string::String -> scalar('string')
    if (isStructTag(s, '0x1', 'string', 'String') && args.length === 0) {
      return { kind: 'scalar', name: 'string' };
    }
    // - 0x2::object::ID -> scalar('id')
    if (isStructTag(s, '0x2', 'object', 'ID') && args.length === 0) {
      return { kind: 'scalar', name: 'id' };
    }
    // - 0x1::option::Option<T> -> option<...>
    if (isStructTag(s, '0x1', 'option', 'Option') && args.length === 1) {
      return { kind: 'option', elem: toPTBTypeFromMove(args[0]!) };
    }

    // Generic structs → treat as generic object (do not preserve type args)
    if (args.length > 0) return { kind: 'object' };

    // Concrete (no type args) → carry full type tag
    const typeTag = `${s.address}::${s.module}::${s.name}`;
    return { kind: 'object', typeTag };
  }

  // Fallback
  return { kind: 'unknown', debugInfo: `unrecognized Move type: ${String(t)}` };
}
