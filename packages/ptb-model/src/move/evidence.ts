import { isNonNegativeSafeInteger } from '../ir/limits.js';
import {
  isRawOpenSignatureList,
  MAX_RAW_OPEN_SIGNATURE_DEPTH,
  parseMoveIdentifier,
  parseObjectId,
  type ObjectId,
  type RawOpenSignature,
  type RawOpenSignatureBody,
} from '../raw/types.js';
import { isPlainObject } from '../utils.js';
import { openSignatureContainsTxContext } from './signature.js';

const MOVE_FUNCTION_SIGNATURE_KEYS = [
  'typeParameterCount',
  'parameters',
  'returns',
] as const;
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
      !openSignatureContainsTxContext(signature) &&
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

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}
