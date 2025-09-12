// src/codegen/argPolicy.ts
// -----------------------------------------------------------------------------
// Single source of truth for classification & serialization policy.
// Policy summary:
//   * ONLY moveCall.arguments are pure-serialized (u64/bool/address/array).
//   * splitCoins / mergeCoins / transferObjects / makeMoveVec never use pure.
//   * We accept explicit {kind:'undef'} at runtime/codegen and pass it through.
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

// ==== Runtime serializer for moveCall.arguments ==============================

/** Serialize a single argument according to ParamKind. */
export function serializeMoveArgRuntime(
  tx: any,
  raw: any,
  kind: ParamKind,
  my?: string,
) {
  // pass through explicit undefined
  if (typeof raw === 'undefined') return undefined;

  switch (kind) {
    case 'txarg':
      return raw; // handles/refs produced by tx API

    case 'addr': {
      if (typeof raw === 'string') {
        const inj = injectMySentinel(raw, my);
        if (isHexAddr(inj)) return tx.pure.address(inj);
        // non-hex strings pass through (likely invalid at execution time)
        return inj;
      }
      return raw;
    }

    case 'num': {
      if (typeof raw === 'number' || typeof raw === 'bigint')
        return tx.pure.u64(raw);
      if (typeof raw === 'string' && isDecString(raw)) return tx.pure.u64(raw);
      return raw; // pass-through for refs/others
    }

    case 'bool': {
      if (typeof raw === 'boolean') return tx.pure.bool(raw);
      return raw;
    }

    case 'array-prim': {
      if (Array.isArray(raw)) return tx.pure(raw);
      return raw;
    }

    case 'other':
    default:
      return raw;
  }
}

// ==== Codegen renderer for moveCall.arguments ================================

export function renderMoveArgCode(expr: string, kind: ParamKind): string {
  switch (kind) {
    case 'txarg':
      return expr;
    case 'addr':
      return `typeof ${expr} === 'string' ? tx.pure.address(${expr}) : ${expr}`;
    case 'num':
      return `typeof ${expr} === 'number' || typeof ${expr} === 'bigint' ? tx.pure.u64(${expr}) : (/^\\d+$/.test(String(${expr})) ? tx.pure.u64(${expr}) : ${expr})`;
    case 'bool':
      return `typeof ${expr} === 'boolean' ? tx.pure.bool(${expr}) : ${expr}`;
    case 'array-prim':
      return `Array.isArray(${expr}) ? tx.pure(${expr}) : ${expr}`;
    case 'other':
    default:
      return expr;
  }
}
