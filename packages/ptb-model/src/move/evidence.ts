import { isNonNegativeSafeInteger, MAX_RESULT_COUNT } from '../ir/limits.js';
import {
  isRawOpenSignatureList,
  MAX_RAW_OPEN_SIGNATURE_DEPTH,
  type ObjectId,
  parseMoveIdentifier,
  parseObjectId,
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
  if (value.returns.length > MAX_RESULT_COUNT) return false;

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

export function normalizeMovePackageSignatureEvidenceOption(
  value: unknown,
): MovePackageSignatureEvidence | undefined {
  if (value === undefined) return undefined;
  if (isMovePackageSignatureEvidence(value)) return value;
  throw new TypeError(
    'moveSignatures must be Move package signature evidence.',
  );
}

/**
 * Looks up a function signature by already-normalized MoveCall coordinates.
 * This helper does not normalize package, module, or function keys.
 */
function lookupMoveSignatureEvidence(
  packageId: string,
  moduleName: string,
  functionName: string,
  evidence: MovePackageSignatureEvidence | undefined,
): MoveFunctionSignatureEvidence | undefined {
  return evidence?.[packageId]?.[moduleName]?.[functionName];
}

export interface MoveCallSignatureEvidenceResolution {
  signature: MoveFunctionSignatureEvidence;
  resultArity: number;
  typeArgumentsComplete: boolean;
  resultCountMismatch: boolean;
}

export interface ResolveMoveCallSignatureEvidenceOptions {
  packageId: string;
  moduleName: string;
  functionName: string;
  moveSignatures: MovePackageSignatureEvidence | undefined;
  typeArguments?: readonly string[];
  explicitResultCount?: unknown;
}

export function resolveMoveCallSignatureEvidence({
  packageId,
  moduleName,
  functionName,
  moveSignatures,
  typeArguments = [],
  explicitResultCount,
}: ResolveMoveCallSignatureEvidenceOptions):
  | MoveCallSignatureEvidenceResolution
  | undefined {
  const signature = lookupMoveSignatureEvidence(
    packageId,
    moduleName,
    functionName,
    moveSignatures,
  );
  if (signature === undefined) return undefined;

  const explicitResultCountPresent = explicitResultCount !== undefined;
  const explicitResultCountValid =
    !explicitResultCountPresent ||
    (isNonNegativeSafeInteger(explicitResultCount) &&
      explicitResultCount <= MAX_RESULT_COUNT);

  return {
    signature,
    resultArity: signature.returns.length,
    typeArgumentsComplete:
      typeArguments.length === signature.typeParameterCount,
    resultCountMismatch:
      explicitResultCountValid &&
      typeof explicitResultCount === 'number' &&
      explicitResultCount !== signature.returns.length,
  };
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
