// src/codegen/argPolicy.ts
// -----------------------------------------------------------------------------
// Single source of truth for classification & serialization policy.
// - Only moveCall.arguments are pure-serialized.
// - ParamKind is derived from node port metadata (preprocess); no runtime probing.
// - Vectors are serialized with tx.pure.vector('<elem>', arr) only for array-*.
// -----------------------------------------------------------------------------

import type { ParamKind } from './types';

/** Hex Sui address like 0x... */
export function isHexAddr(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  // Sui addresses are 0x + up to 64 hex chars (32 bytes)
  // This also covers package IDs and object IDs
  return /^0x[0-9a-fA-F]{1,64}$/.test(s);
}

/** Decimal string like "123" */
export function isDecString(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  // Limit to 78 digits (max u256 is ~10^77)
  return /^\d{1,78}$/.test(s);
}

/** Validate package ID (same format as addresses) */
export function isValidPackageId(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  return /^0x[0-9a-fA-F]{1,64}$/.test(s);
}

/** Special sender sentinel */
export function isMySentinel(s: unknown): s is string {
  return s === 'myAddress' || s === 'sender';
}

/** Inject actual address for 'myAddress'/'sender' if provided */
export function injectMySentinel(raw: unknown, my?: string): unknown {
  if (!my) return raw;
  if (isMySentinel(raw)) return my;
  return raw;
}

// ==== Runtime serializer for moveCall.arguments (no probing) =================

/** Serialize a single argument according to ParamKind. */
export function serializeMoveArgRuntime(
  tx: any,
  raw: any,
  kind: ParamKind,
  my?: string,
) {
  if (typeof raw === 'undefined') {
    // Option<T> can be encoded as None with no input.
    switch (kind) {
      case 'opt-addr':
        return tx.pure.option('address', undefined);
      case 'opt-id':
        return tx.pure.option('id', undefined);
      case 'opt-bool':
        return tx.pure.option('bool', undefined);
      case 'opt-str':
        return tx.pure.option('string', undefined);
      case 'opt-u8':
        return tx.pure.option('u8', undefined);
      case 'opt-u16':
        return tx.pure.option('u16', undefined);
      case 'opt-u32':
        return tx.pure.option('u32', undefined);
      case 'opt-u64':
        return tx.pure.option('u64', undefined);
      case 'opt-u128':
        return tx.pure.option('u128', undefined);
      case 'opt-u256':
        return tx.pure.option('u256', undefined);
      default:
        break;
    }
    return undefined;
  }

  switch (kind) {
    case 'txarg':
      // Handles/Tx args must be passed through untouched.
      return raw;

    case 'addr': {
      // Always call pure.address; support 'myAddress'/'sender' sentinel.
      if (typeof raw === 'string')
        return tx.pure.address(injectMySentinel(raw, my));
      return tx.pure.address(raw);
    }

    case 'opt-addr': {
      const v = raw == undefined ? undefined : injectMySentinel(raw, my);
      return tx.pure.option('address', v);
    }
    case 'opt-id':
      return tx.pure.option('id', raw);
    case 'opt-bool':
      return tx.pure.option('bool', raw);
    case 'opt-str':
      return tx.pure.option('string', raw);
    case 'opt-u8':
      return tx.pure.option('u8', raw);
    case 'opt-u16':
      return tx.pure.option('u16', raw);
    case 'opt-u32':
      return tx.pure.option('u32', raw);
    case 'opt-u64':
      return tx.pure.option('u64', raw);
    case 'opt-u128':
      return tx.pure.option('u128', raw);
    case 'opt-u256':
      return tx.pure.option('u256', raw);

    case 'num':
      return tx.pure.u64(raw); // fallback when width unknown
    case 'num-u8':
      return tx.pure.u8(raw);
    case 'num-u16':
      return tx.pure.u16(raw);
    case 'num-u32':
      return tx.pure.u32(raw);
    case 'num-u64':
      return tx.pure.u64(raw);
    case 'num-u128':
      return tx.pure.u128(raw);
    case 'num-u256':
      return tx.pure.u256(raw);

    case 'id':
      return tx.pure.id(raw);

    case 'bool': {
      return tx.pure.bool(raw);
    }

    case 'str':
      return tx.pure.string(raw);

    // Primitive vectors (element type is already fixed via ParamKind)
    case 'array-addr':
      return tx.pure.vector('address', raw);
    case 'array-bool':
      return tx.pure.vector('bool', raw);
    case 'array-id':
      return tx.pure.vector('id', raw);
    case 'array-str':
      return tx.pure.vector('string', raw);
    case 'array-u8':
      return tx.pure.vector('u8', raw);
    case 'array-u16':
      return tx.pure.vector('u16', raw);
    case 'array-u32':
      return tx.pure.vector('u32', raw);
    case 'array-u64':
      return tx.pure.vector('u64', raw);
    case 'array-u128':
      return tx.pure.vector('u128', raw);
    case 'array-u256':
      return tx.pure.vector('u256', raw);

    case 'other':
    default:
      // No pure; pass raw through as-is.
      return raw;
  }
}

// ==== Codegen renderer for moveCall.arguments (no probing) ===================

export function renderMoveArgCode(expr: string, kind: ParamKind): string {
  switch (kind) {
    case 'txarg':
      return expr;
    case 'addr':
      return `tx.pure.address(${expr})`;
    case 'opt-addr':
      return `tx.pure.option('address', ${expr})`;
    case 'opt-id':
      return `tx.pure.option('id', ${expr})`;
    case 'opt-bool':
      return `tx.pure.option('bool', ${expr})`;
    case 'opt-str':
      return `tx.pure.option('string', ${expr})`;
    case 'opt-u8':
      return `tx.pure.option('u8', ${expr})`;
    case 'opt-u16':
      return `tx.pure.option('u16', ${expr})`;
    case 'opt-u32':
      return `tx.pure.option('u32', ${expr})`;
    case 'opt-u64':
      return `tx.pure.option('u64', ${expr})`;
    case 'opt-u128':
      return `tx.pure.option('u128', ${expr})`;
    case 'opt-u256':
      return `tx.pure.option('u256', ${expr})`;
    case 'num':
      return `tx.pure.u64(${expr})`;
    case 'num-u8':
      return `tx.pure.u8(${expr})`;
    case 'num-u16':
      return `tx.pure.u16(${expr})`;
    case 'num-u32':
      return `tx.pure.u32(${expr})`;
    case 'num-u64':
      return `tx.pure.u64(${expr})`;
    case 'num-u128':
      return `tx.pure.u128(${expr})`;
    case 'num-u256':
      return `tx.pure.u256(${expr})`;
    case 'id':
      return `tx.pure.id(${expr})`;
    case 'bool':
      return `tx.pure.bool(${expr})`;
    case 'str':
      return `tx.pure.string(${expr})`;

    // vectors
    case 'array-addr':
      return `tx.pure.vector('address', ${expr})`;
    case 'array-bool':
      return `tx.pure.vector('bool', ${expr})`;
    case 'array-id':
      return `tx.pure.vector('id', ${expr})`;
    case 'array-str':
      return `tx.pure.vector('string', ${expr})`;
    case 'array-u8':
      return `tx.pure.vector('u8', ${expr})`;
    case 'array-u16':
      return `tx.pure.vector('u16', ${expr})`;
    case 'array-u32':
      return `tx.pure.vector('u32', ${expr})`;
    case 'array-u64':
      return `tx.pure.vector('u64', ${expr})`;
    case 'array-u128':
      return `tx.pure.vector('u128', ${expr})`;
    case 'array-u256':
      return `tx.pure.vector('u256', ${expr})`;

    case 'other':
    default:
      return expr; // raw
  }
}
