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
  return typeof s === 'string' && /^0x[0-9a-fA-F]+$/.test(s);
}

/** Decimal string like "123" */
export function isDecString(s: unknown): s is string {
  return typeof s === 'string' && /^\d+$/.test(s);
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
  if (typeof raw === 'undefined') return undefined;

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

    case 'num': {
      // Always serialize to u64; input may be number/bigint/decimal string.
      return tx.pure.u64(raw);
    }

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
    case 'num':
      return `tx.pure.u64(${expr})`;
    case 'bool':
      return `tx.pure.bool(${expr})`;
    case 'str':
      return `tx.pure.string(${expr})`;

    // vectors
    case 'array-addr':
      return `tx.pure.vector('address', ${expr})`;
    case 'array-bool':
      return `tx.pure.vector('bool', ${expr})`;
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
