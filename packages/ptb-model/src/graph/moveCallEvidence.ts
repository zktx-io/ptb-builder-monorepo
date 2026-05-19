import { graphDiagnostic } from './diagnostics.js';
import type { TransactionDiagnostic } from '../ir/diagnostics.js';
import { isNonNegativeSafeInteger, MAX_RESULT_COUNT } from '../ir/limits.js';
import {
  lookupMoveSignatureEvidence,
  type MovePackageSignatureEvidence,
} from '../move/evidence.js';
import {
  parseMoveIdentifier,
  parseMoveTypeTag,
  parseObjectId,
} from '../raw/types.js';
import { isDenseArray, isPlainObject } from '../utils.js';

export const GRAPH_MOVE_CALL_TYPE_ARGUMENTS_COUNT_DIAGNOSTIC =
  'graph.command.moveCall.typeArgumentsCount';
export const GRAPH_MOVE_CALL_RESULT_COUNT_MISMATCH_DIAGNOSTIC =
  'graph.command.moveCall.resultCountMismatch';

export interface GraphMoveCallTarget {
  packageId: string;
  moduleName: string;
  functionName: string;
}

export type GraphMoveCallTargetIssue = 'missing' | 'format' | 'canonical';

export interface GraphMoveCallTargetParseResult {
  target?: GraphMoveCallTarget;
  issue?: GraphMoveCallTargetIssue;
}

export interface GraphMoveCallEvidenceState {
  effectiveResultCount: number;
}

export function graphCommandRuntimeParams(node: {
  params?: unknown;
}): Record<string, unknown> | undefined {
  if (!isPlainObject(node.params)) return undefined;
  return isPlainObject(node.params.runtime) ? node.params.runtime : undefined;
}

export function parseGraphMoveCallTarget(
  value: unknown,
): GraphMoveCallTargetParseResult {
  if (typeof value !== 'string') return { issue: 'missing' };

  const parts = value.split('::');
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
    return { issue: 'format' };
  }

  const [packageIdInput, moduleNameInput, functionNameInput] = parts as [
    string,
    string,
    string,
  ];
  const packageId = parseObjectId(packageIdInput);
  const moduleName = parseMoveIdentifier(moduleNameInput);
  const functionName = parseMoveIdentifier(functionNameInput);
  if (packageId !== packageIdInput || !moduleName || !functionName) {
    return { issue: 'canonical' };
  }

  return {
    target: {
      packageId,
      moduleName,
      functionName,
    },
  };
}

export function parseGraphMoveCallTypeArguments(
  value: unknown,
): string[] | undefined {
  if (value === undefined) return [];
  if (!isDenseArray(value)) return undefined;

  const parsedTypeArguments: string[] = [];
  for (const item of value) {
    const parsed = parseMoveTypeTag(item);
    if (parsed === undefined) return undefined;
    parsedTypeArguments.push(parsed);
  }
  return parsedTypeArguments;
}

export function graphMoveCallEvidenceState(
  runtime: Record<string, unknown> | undefined,
  moveSignatures: MovePackageSignatureEvidence | undefined,
  nodePath?: string,
  diagnostics?: TransactionDiagnostic[],
): GraphMoveCallEvidenceState | undefined {
  if (runtime === undefined || moveSignatures === undefined) return undefined;

  const target = parseGraphMoveCallTarget(runtime.target).target;
  if (target === undefined) return undefined;

  const typeArguments = parseGraphMoveCallTypeArguments(runtime.typeArguments);
  if (typeArguments === undefined) return undefined;

  const hasExplicitResultCount =
    Object.prototype.hasOwnProperty.call(runtime, 'resultCount') &&
    runtime.resultCount !== undefined;
  const explicitResultCount = hasExplicitResultCount
    ? runtime.resultCount
    : undefined;
  if (
    explicitResultCount !== undefined &&
    (!isNonNegativeSafeInteger(explicitResultCount) ||
      explicitResultCount > MAX_RESULT_COUNT)
  ) {
    return undefined;
  }

  const signature = lookupMoveSignatureEvidence(
    target.packageId,
    target.moduleName,
    target.functionName,
    moveSignatures,
  );
  if (signature === undefined) return undefined;

  if (typeArguments.length !== signature.typeParameterCount) {
    if (diagnostics !== undefined && nodePath !== undefined) {
      diagnostics.push(
        graphDiagnostic(
          GRAPH_MOVE_CALL_TYPE_ARGUMENTS_COUNT_DIAGNOSTIC,
          `PTB graph MoveCall typeArguments length must match signature typeParameterCount ${signature.typeParameterCount}.`,
          `${nodePath}.params.runtime.typeArguments`,
        ),
      );
    }
    return undefined;
  }

  const evidenceResultCount = signature.returns.length;
  if (evidenceResultCount > MAX_RESULT_COUNT) return undefined;

  if (typeof explicitResultCount === 'number') {
    if (explicitResultCount !== evidenceResultCount) {
      if (diagnostics !== undefined && nodePath !== undefined) {
        diagnostics.push(
          graphDiagnostic(
            GRAPH_MOVE_CALL_RESULT_COUNT_MISMATCH_DIAGNOSTIC,
            `PTB graph MoveCall resultCount ${explicitResultCount} does not match signature returns length ${evidenceResultCount}.`,
            `${nodePath}.params.runtime.resultCount`,
          ),
        );
      }
      return { effectiveResultCount: explicitResultCount };
    }
    return {
      effectiveResultCount: explicitResultCount,
    };
  }

  return {
    effectiveResultCount: evidenceResultCount,
  };
}
