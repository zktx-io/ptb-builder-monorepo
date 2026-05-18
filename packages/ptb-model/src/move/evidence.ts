import { isNonNegativeSafeInteger } from '../ir/limits.js';
import {
  isRawOpenSignature,
  isRawOpenSignatureList,
  MAX_RAW_OPEN_SIGNATURE_DEPTH,
  parseMoveIdentifier,
  parseObjectId,
  type ObjectId,
  type RawOpenSignature,
  type RawOpenSignatureBody,
} from '../raw/types.js';
import { isPlainObject } from '../utils.js';

const MOVE_FUNCTION_SIGNATURE_KEYS = [
  'typeParameterCount',
  'parameters',
  'returns',
] as const;
const SUI_FRAMEWORK_ADDRESS = parseObjectId('0x2') as ObjectId;
const TX_CONTEXT_MODULE = 'tx_context';
const TX_CONTEXT_NAME = 'TxContext';

export interface MoveFunctionSignatureEvidence {
  typeParameterCount: number;
  parameters: RawOpenSignature[];
  returns: RawOpenSignature[];
}

export type MoveModuleSignatureEvidence = Record<
  string,
  MoveFunctionSignatureEvidence
>;

export type MovePackageSignatureEvidence = Record<
  ObjectId,
  Record<string, MoveModuleSignatureEvidence>
>;

export function isMoveFunctionSignatureEvidence(
  value: unknown,
): value is MoveFunctionSignatureEvidence {
  if (!isPlainObject(value)) return false;
  if (!hasOnlyKeys(value, MOVE_FUNCTION_SIGNATURE_KEYS)) return false;
  const typeParameterCount = value.typeParameterCount;
  if (!isNonNegativeSafeInteger(typeParameterCount)) return false;
  if (!isRawOpenSignatureList(value.parameters)) return false;
  if (!isRawOpenSignatureList(value.returns)) return false;

  return [...value.parameters, ...value.returns].every(
    (signature) =>
      !isTxContextOpenSignature(signature) &&
      openSignatureTypeParametersWithinBound(signature, typeParameterCount),
  );
}

export function isMoveModuleSignatureEvidence(
  value: unknown,
): value is MoveModuleSignatureEvidence {
  return (
    isPlainObject(value) &&
    Object.entries(value).every(
      ([functionName, signature]) =>
        parseMoveIdentifier(functionName) === functionName &&
        isMoveFunctionSignatureEvidence(signature),
    )
  );
}

export function isMovePackageSignatureEvidence(
  value: unknown,
): value is MovePackageSignatureEvidence {
  return (
    isPlainObject(value) &&
    Object.entries(value).every(
      ([packageId, modules]) =>
        parseObjectId(packageId) === packageId &&
        isPlainObject(modules) &&
        Object.entries(modules).every(
          ([moduleName, moduleEvidence]) =>
            parseMoveIdentifier(moduleName) === moduleName &&
            isMoveModuleSignatureEvidence(moduleEvidence),
        ),
    )
  );
}

/**
 * Returns true when a raw OpenSignature contains Sui TxContext anywhere in the
 * signature body tree. Hosts should remove those signatures before constructing
 * model Move signature evidence.
 */
export function isTxContextOpenSignature(signature: unknown): boolean {
  if (!isRawOpenSignature(signature)) return false;
  return containsTxContext(signature.body, 0);
}

function openSignatureTypeParametersWithinBound(
  signature: RawOpenSignature,
  bound: number,
): boolean {
  return typeParameterIndicesWithinBound(signature.body, bound, 0);
}

function typeParameterIndicesWithinBound(
  body: RawOpenSignatureBody,
  bound: number,
  depth: number,
): boolean {
  if (depth > MAX_RAW_OPEN_SIGNATURE_DEPTH) return false;

  switch (body.$kind) {
    case 'vector':
      return typeParameterIndicesWithinBound(body.vector, bound, depth + 1);
    case 'datatype':
      return body.datatype.typeParameters.every((typeParameter) =>
        typeParameterIndicesWithinBound(typeParameter, bound, depth + 1),
      );
    case 'typeParameter':
      return body.index < bound;
    default:
      return true;
  }
}

function containsTxContext(
  body: RawOpenSignatureBody,
  depth: number,
): boolean {
  if (depth > MAX_RAW_OPEN_SIGNATURE_DEPTH) return false;

  switch (body.$kind) {
    case 'vector':
      return containsTxContext(body.vector, depth + 1);
    case 'datatype':
      return (
        isTxContextTypeName(body.datatype.typeName) ||
        body.datatype.typeParameters.some((typeParameter) =>
          containsTxContext(typeParameter, depth + 1),
        )
      );
    default:
      return false;
  }
}

function isTxContextTypeName(typeName: string): boolean {
  const [address, moduleName, name, ...extra] = typeName.split('::');
  if (extra.length > 0 || name === undefined) return false;
  return (
    parseObjectId(address) === SUI_FRAMEWORK_ADDRESS &&
    moduleName === TX_CONTEXT_MODULE &&
    name === TX_CONTEXT_NAME
  );
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}
