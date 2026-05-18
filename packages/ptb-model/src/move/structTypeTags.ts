import { type ObjectId, parseObjectId } from '../raw/types.js';

// Shared Sui framework struct-tag facts used by signature conversion and
// PTB object type-tag candidate validation. These helpers are shape checks;
// they do not prove package existence, abilities, or live object availability.
export const MOVE_STDLIB_ADDRESS = parseObjectId('0x1') as ObjectId;
export const SUI_FRAMEWORK_ADDRESS = parseObjectId('0x2') as ObjectId;
export const STRING_MODULE = 'string';
export const STRING_NAME = 'String';
export const OBJECT_MODULE = 'object';
export const OBJECT_ID_NAME = 'ID';
const OBJECT_UID_NAME = 'UID';
export const OPTION_MODULE = 'option';
export const OPTION_NAME = 'Option';
const TX_CONTEXT_MODULE = 'tx_context';
const TX_CONTEXT_NAME = 'TxContext';

interface MoveStructName {
  address: string;
  module: string;
  name: string;
}

/**
 * Parses an address::module::name datatype base. The input may use short or
 * canonical address form, but must not include type arguments.
 */
export function parseDatatypeName(
  typeName: string,
): MoveStructName | undefined {
  const parts = typeName.split('::');
  if (parts.length !== 3) return undefined;
  return { address: parts[0]!, module: parts[1]!, name: parts[2]! };
}

/** Matches a parsed struct name against a canonical address and exact module/name. */
export function isStructTag(
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

/**
 * Returns the canonical address::module::name base for a struct type tag. The
 * input may be short-address or canonical and may include outer type arguments.
 */
export function canonicalStructTypeTagBase(
  typeTag: string,
): string | undefined {
  const parsed = parseStructTypeTagBase(typeTag);
  if (parsed === undefined) return undefined;
  const address = parseObjectId(parsed.address);
  if (address === undefined) return undefined;
  return `${address}::${parsed.module}::${parsed.name}`;
}

/** Returns true for struct families that are known not to be Sui object types. */
export function isKnownNonObjectStructTag(value: MoveStructName): boolean {
  return (
    isStructTag(value, MOVE_STDLIB_ADDRESS, STRING_MODULE, STRING_NAME) ||
    isStructTag(value, SUI_FRAMEWORK_ADDRESS, OBJECT_MODULE, OBJECT_ID_NAME) ||
    isStructTag(value, SUI_FRAMEWORK_ADDRESS, OBJECT_MODULE, OBJECT_UID_NAME) ||
    isStructTag(value, MOVE_STDLIB_ADDRESS, OPTION_MODULE, OPTION_NAME) ||
    isTxContextStructTag(value)
  );
}

/**
 * Returns true when a full or base struct type tag belongs to a model-known
 * non-object family. The input may be short-address or canonical and may include
 * outer type arguments.
 */
export function isKnownNonObjectStructTypeTag(typeTag: string): boolean {
  const parsed = parseStructTypeTagBase(typeTag);
  return parsed !== undefined && isKnownNonObjectStructTag(parsed);
}

/**
 * Returns true when a full or base struct type tag is Sui TxContext. The input
 * may be short-address or canonical and may include outer type arguments.
 */
export function isTxContextStructTypeTag(typeTag: string): boolean {
  const parsed = parseStructTypeTagBase(typeTag);
  return parsed !== undefined && isTxContextStructTag(parsed);
}

function isTxContextStructTag(value: MoveStructName): boolean {
  return isStructTag(
    value,
    SUI_FRAMEWORK_ADDRESS,
    TX_CONTEXT_MODULE,
    TX_CONTEXT_NAME,
  );
}

function parseStructTypeTagBase(typeTag: string): MoveStructName | undefined {
  const genericStart = typeTag.indexOf('<');
  return parseDatatypeName(
    genericStart < 0 ? typeTag : typeTag.slice(0, genericStart),
  );
}
