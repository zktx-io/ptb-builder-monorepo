// src/ptb/move/toPTBType.ts

// -----------------------------------------------------------------------------
// Normalize SDK Core open signatures into PTBType.
// Policy:
// - No generic placeholders inside PTBType (no 'typeparam' variant).
//   Generics are handled by model graph runtime typeArguments.
// - Known structs are mapped when they have a canonical PTB form:
//     0x1::string::String     → scalar('string')
//     0x2::object::ID         → scalar('id')
//     0x1::option::Option<T>  → option<...>
// - Structs with type arguments → generic objects (no concrete typeTag).
// - The model allows option<vector<...>> and vector<object>; UI-level creation
//   of object inside vector/option is disallowed.
// -----------------------------------------------------------------------------

import type {
  RawOpenSignature,
  RawOpenSignatureBody,
} from '@zktx.io/ptb-model';

import type { PTBType } from '../graph/types';

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

function parseDatatypeName(typeName: string):
  | {
      address: string;
      module: string;
      name: string;
    }
  | undefined {
  const parts = typeName.split('::');
  if (parts.length !== 3) return undefined;
  return { address: parts[0]!, module: parts[1]!, name: parts[2]! };
}

function isOpenSignatureBodyStruct(
  body: RawOpenSignatureBody,
  addr: string,
  module: string,
  name: string,
): boolean {
  if (body.$kind !== 'datatype') return false;
  const parsed = parseDatatypeName(body.datatype.typeName);
  return (
    !!parsed &&
    isStructTag(parsed, addr, module, name) &&
    body.datatype.typeParameters.length === 0
  );
}

export function isTxContextOpenSignature(sig: RawOpenSignature): boolean {
  return isOpenSignatureBodyStruct(sig.body, '0x2', 'tx_context', 'TxContext');
}

function toPTBTypeFromOpenSignatureBody(body: RawOpenSignatureBody): PTBType {
  switch (body.$kind) {
    case 'bool':
      return { kind: 'scalar', name: 'bool' };
    case 'address':
      return { kind: 'scalar', name: 'address' };
    case 'u8':
    case 'u16':
    case 'u32':
    case 'u64':
    case 'u128':
    case 'u256':
      return { kind: 'move_numeric', width: body.$kind };
    case 'unknown':
      return { kind: 'unknown' };
    case 'vector':
      return {
        kind: 'vector',
        elem: toPTBTypeFromOpenSignatureBody(body.vector),
      };
    case 'typeParameter':
      return {
        kind: 'unknown',
        debugInfo: `generic TypeParameter ${body.index}`,
      };
    case 'datatype': {
      const parsed = parseDatatypeName(body.datatype.typeName);
      const args = body.datatype.typeParameters ?? [];
      if (!parsed) {
        return {
          kind: 'unknown',
          debugInfo: `unrecognized datatype: ${body.datatype.typeName}`,
        };
      }

      if (isStructTag(parsed, '0x1', 'string', 'String') && args.length === 0) {
        return { kind: 'scalar', name: 'string' };
      }

      if (isStructTag(parsed, '0x2', 'object', 'ID') && args.length === 0) {
        return { kind: 'scalar', name: 'id' };
      }

      if (isStructTag(parsed, '0x1', 'option', 'Option') && args.length === 1) {
        return {
          kind: 'option',
          elem: toPTBTypeFromOpenSignatureBody(args[0]!),
        };
      }

      if (args.length > 0) return { kind: 'object' };

      return { kind: 'object', typeTag: body.datatype.typeName };
    }
    default: {
      const _exhaustive: never = body;
      return { kind: 'unknown', debugInfo: String(_exhaustive) };
    }
  }
}

export function toPTBTypeFromOpenSignature(sig: RawOpenSignature): PTBType {
  return toPTBTypeFromOpenSignatureBody(sig.body);
}
