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
// - Open-signature structs with type arguments → generic objects. Concrete
//   type arguments parsed from runtime typeArguments may carry typeTag.
// - The model allows option<vector<...>> and vector<object>; UI-level creation
//   of object inside vector/option is disallowed.
// -----------------------------------------------------------------------------

import { type TypeTag, TypeTagSerializer } from '@mysten/sui/bcs';
import {
  parseMoveTypeTag,
  parseObjectId,
  type RawOpenSignature,
  type RawOpenSignatureBody,
} from '@zktx.io/ptb-model';

import type { PTBType } from '../graph/types';

/** Struct tag equality (address/module/name) with normalized address. */
function isStructTag(
  s: { address: string; module: string; name: string },
  addr: string,
  module: string,
  name: string,
): boolean {
  const left = parseObjectId(s.address);
  const right = parseObjectId(addr);
  return (
    left !== undefined &&
    right !== undefined &&
    left === right &&
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

function toPTBTypeFromTypeTag(tag: TypeTag): PTBType {
  if ('bool' in tag) return { kind: 'scalar', name: 'bool' };
  if ('address' in tag) return { kind: 'scalar', name: 'address' };
  if ('u8' in tag) return { kind: 'move_numeric', width: 'u8' };
  if ('u16' in tag) return { kind: 'move_numeric', width: 'u16' };
  if ('u32' in tag) return { kind: 'move_numeric', width: 'u32' };
  if ('u64' in tag) return { kind: 'move_numeric', width: 'u64' };
  if ('u128' in tag) return { kind: 'move_numeric', width: 'u128' };
  if ('u256' in tag) return { kind: 'move_numeric', width: 'u256' };
  if ('vector' in tag) {
    return {
      kind: 'vector',
      elem: toPTBTypeFromTypeTag(tag.vector),
    };
  }
  if ('struct' in tag) {
    const struct = tag.struct;
    if (
      isStructTag(struct, '0x1', 'string', 'String') &&
      struct.typeParams.length === 0
    ) {
      return { kind: 'scalar', name: 'string' };
    }
    if (
      isStructTag(struct, '0x2', 'object', 'ID') &&
      struct.typeParams.length === 0
    ) {
      return { kind: 'scalar', name: 'id' };
    }
    if (
      isStructTag(struct, '0x1', 'option', 'Option') &&
      struct.typeParams.length === 1
    ) {
      return {
        kind: 'option',
        elem: toPTBTypeFromTypeTag(struct.typeParams[0]!),
      };
    }
    return {
      kind: 'object',
      typeTag: TypeTagSerializer.tagToString(tag),
    };
  }
  return { kind: 'unknown', debugInfo: 'unsupported Move type tag' };
}

export function toPTBTypeFromConcreteTypeArgument(
  value: string,
): PTBType | undefined {
  const canonical = parseMoveTypeTag(value);
  if (!canonical) return undefined;
  try {
    return toPTBTypeFromTypeTag(
      TypeTagSerializer.parseFromStr(canonical, true),
    );
  } catch {
    return undefined;
  }
}

function toPTBTypeFromOpenSignatureBody(
  body: RawOpenSignatureBody,
  typeArguments: readonly string[] = [],
): PTBType {
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
        elem: toPTBTypeFromOpenSignatureBody(body.vector, typeArguments),
      };
    case 'typeParameter':
      return (
        toPTBTypeFromConcreteTypeArgument(typeArguments[body.index] ?? '') ?? {
          kind: 'unknown',
          debugInfo: `generic TypeParameter ${body.index}`,
        }
      );
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
          elem: toPTBTypeFromOpenSignatureBody(args[0]!, typeArguments),
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

export function toPTBTypeFromOpenSignature(
  sig: RawOpenSignature,
  typeArguments: readonly string[] = [],
): PTBType {
  return toPTBTypeFromOpenSignatureBody(sig.body, typeArguments);
}
