import { TypeTagSerializer, type TypeTag } from '@mysten/sui/bcs';

import type { PTBType } from '../ptbType.js';
import {
  isRawOpenSignature,
  MAX_RAW_OPEN_SIGNATURE_DEPTH,
  parseMoveTypeTag,
  parseObjectId,
  type ObjectId,
  type RawOpenSignature,
  type RawOpenSignatureBody,
} from '../raw/types.js';
import { MAX_PTB_TYPE_DEPTH } from '../utils.js';

const MOVE_STDLIB_ADDRESS = parseObjectId('0x1') as ObjectId;
const SUI_FRAMEWORK_ADDRESS = parseObjectId('0x2') as ObjectId;
const STRING_MODULE = 'string';
const STRING_NAME = 'String';
const OBJECT_MODULE = 'object';
const OBJECT_ID_NAME = 'ID';
const OPTION_MODULE = 'option';
const OPTION_NAME = 'Option';
const TX_CONTEXT_MODULE = 'tx_context';
const TX_CONTEXT_NAME = 'TxContext';

interface MoveStructName {
  address: string;
  module: string;
  name: string;
}

/**
 * Returns true when the signature's top-level body is the Sui TxContext
 * datatype. Hosts commonly use this to filter SDK-returned function parameters
 * before constructing model Move signature evidence.
 */
export function isTxContextOpenSignature(signature: unknown): boolean {
  return (
    isRawOpenSignature(signature) &&
    isTxContextOpenSignatureBody(signature.body)
  );
}

/**
 * Returns true when a raw OpenSignature contains Sui TxContext anywhere in the
 * signature body tree. Evidence guards use this stricter check after hosts have
 * already removed top-level TxContext parameters.
 */
export function openSignatureContainsTxContext(
  signature: RawOpenSignature,
): boolean {
  return openSignatureBodyContainsTxContext(signature.body, 0);
}

export function toPTBTypeFromConcreteTypeArgument(
  value: string,
): PTBType | undefined {
  const canonical = parseMoveTypeTag(value);
  if (canonical === undefined) return undefined;

  try {
    return toPTBTypeFromTypeTag(
      TypeTagSerializer.parseFromStr(canonical, true),
      0,
    );
  } catch {
    return undefined;
  }
}

export function toPTBTypeFromOpenSignature(
  signature: RawOpenSignature,
  typeArguments: readonly string[] = [],
): PTBType {
  if (!openSignatureBodyWithinDepth(signature.body, 0)) {
    return exceededTypeDepth();
  }
  return toPTBTypeFromOpenSignatureBody(signature.body, typeArguments, 0);
}

// Concrete type-argument strings are already full Move type tags, so this path
// preserves concrete generic object tags such as Coin<SUI>. OpenSignature
// datatype bodies are open generic shapes, so generic structs intentionally
// collapse to a generic object PTBType even when runtime type arguments are
// supplied.
function toPTBTypeFromTypeTag(tag: TypeTag, depth: number): PTBType {
  if (depth > MAX_PTB_TYPE_DEPTH) return exceededTypeDepth();

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
      elem: toPTBTypeFromTypeTag(tag.vector, depth + 1),
    };
  }
  if ('struct' in tag) {
    const struct = tag.struct;
    if (
      isStructTag(struct, MOVE_STDLIB_ADDRESS, STRING_MODULE, STRING_NAME) &&
      struct.typeParams.length === 0
    ) {
      return { kind: 'scalar', name: 'string' };
    }
    if (
      isStructTag(struct, SUI_FRAMEWORK_ADDRESS, OBJECT_MODULE, OBJECT_ID_NAME) &&
      struct.typeParams.length === 0
    ) {
      return { kind: 'scalar', name: 'id' };
    }
    if (
      isStructTag(struct, MOVE_STDLIB_ADDRESS, OPTION_MODULE, OPTION_NAME) &&
      struct.typeParams.length === 1
    ) {
      return {
        kind: 'option',
        elem: toPTBTypeFromTypeTag(struct.typeParams[0]!, depth + 1),
      };
    }
    if (
      !struct.typeParams.every((typeParameter) =>
        typeTagWithinDepth(typeParameter, depth + 1),
      )
    ) {
      return exceededTypeDepth();
    }
    return {
      kind: 'object',
      typeTag: TypeTagSerializer.tagToString(tag),
    };
  }

  return { kind: 'unknown', debugInfo: 'unsupported Move type tag' };
}

function toPTBTypeFromOpenSignatureBody(
  body: RawOpenSignatureBody,
  typeArguments: readonly string[],
  depth: number,
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
        elem: toPTBTypeFromOpenSignatureBody(
          body.vector,
          typeArguments,
          depth + 1,
        ),
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
      const typeParameters = body.datatype.typeParameters;
      const canonicalTypeTag = parseMoveTypeTag(body.datatype.typeName);
      if (parsed === undefined || canonicalTypeTag === undefined) {
        return {
          kind: 'unknown',
          debugInfo: `unrecognized datatype: ${body.datatype.typeName}`,
        };
      }

      if (
        isStructTag(parsed, MOVE_STDLIB_ADDRESS, STRING_MODULE, STRING_NAME) &&
        typeParameters.length === 0
      ) {
        return { kind: 'scalar', name: 'string' };
      }
      if (
        isStructTag(
          parsed,
          SUI_FRAMEWORK_ADDRESS,
          OBJECT_MODULE,
          OBJECT_ID_NAME,
        ) &&
        typeParameters.length === 0
      ) {
        return { kind: 'scalar', name: 'id' };
      }
      if (
        isStructTag(parsed, MOVE_STDLIB_ADDRESS, OPTION_MODULE, OPTION_NAME) &&
        typeParameters.length === 1
      ) {
        return {
          kind: 'option',
          elem: toPTBTypeFromOpenSignatureBody(
            typeParameters[0]!,
            typeArguments,
            depth + 1,
          ),
        };
      }
      if (typeParameters.length > 0) return { kind: 'object' };

      return { kind: 'object', typeTag: canonicalTypeTag };
    }
    default: {
      const _exhaustive: never = body;
      return { kind: 'unknown', debugInfo: String(_exhaustive) };
    }
  }
}

function isTxContextOpenSignatureBody(body: RawOpenSignatureBody): boolean {
  return (
    body.$kind === 'datatype' &&
    isTxContextTypeName(body.datatype.typeName)
  );
}

function openSignatureBodyContainsTxContext(
  body: RawOpenSignatureBody,
  depth: number,
): boolean {
  if (depth > MAX_RAW_OPEN_SIGNATURE_DEPTH) return false;

  switch (body.$kind) {
    case 'vector':
      return openSignatureBodyContainsTxContext(body.vector, depth + 1);
    case 'datatype':
      return (
        isTxContextTypeName(body.datatype.typeName) ||
        body.datatype.typeParameters.some((typeParameter) =>
          openSignatureBodyContainsTxContext(typeParameter, depth + 1),
        )
      );
    default:
      return false;
  }
}

function openSignatureBodyWithinDepth(
  body: RawOpenSignatureBody,
  depth: number,
): boolean {
  if (depth > MAX_RAW_OPEN_SIGNATURE_DEPTH) return false;

  switch (body.$kind) {
    case 'vector':
      return openSignatureBodyWithinDepth(body.vector, depth + 1);
    case 'datatype':
      return body.datatype.typeParameters.every((typeParameter) =>
        openSignatureBodyWithinDepth(typeParameter, depth + 1),
      );
    default:
      return true;
  }
}

function typeTagWithinDepth(tag: TypeTag, depth: number): boolean {
  if (depth > MAX_PTB_TYPE_DEPTH) return false;
  if ('vector' in tag) return typeTagWithinDepth(tag.vector, depth + 1);
  if ('struct' in tag) {
    return tag.struct.typeParams.every((typeParameter) =>
      typeTagWithinDepth(typeParameter, depth + 1),
    );
  }
  return true;
}

function isTxContextTypeName(typeName: string): boolean {
  const parsed = parseDatatypeName(typeName);
  return (
    parsed !== undefined &&
    isStructTag(parsed, SUI_FRAMEWORK_ADDRESS, TX_CONTEXT_MODULE, TX_CONTEXT_NAME)
  );
}

function parseDatatypeName(typeName: string): MoveStructName | undefined {
  const parts = typeName.split('::');
  if (parts.length !== 3) return undefined;
  return { address: parts[0]!, module: parts[1]!, name: parts[2]! };
}

function isStructTag(
  value: MoveStructName,
  address: ObjectId,
  moduleName: string,
  name: string,
): boolean {
  return (
    parseObjectId(value.address) === address &&
    value.module === moduleName &&
    value.name === name
  );
}

function exceededTypeDepth(): PTBType {
  return { kind: 'unknown', debugInfo: 'exceeded type depth' };
}
