import { graphDiagnostic } from './diagnostics.js';
import type { TransactionDiagnostic } from '../ir/diagnostics.js';
import {
  type MovePackageSignatureEvidence,
  resolveMoveCallSignatureEvidence,
} from '../move/evidence.js';
import { parseMoveIdentifier, parseObjectId } from '../raw/types.js';
import { isPlainObject } from '../utils.js';

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
  resultArity: number;
  parameterCount: number;
  typeParameterCount: number;
  typeArgumentsComplete: boolean;
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

export function graphMoveCallEvidenceState(
  runtime: Record<string, unknown> | undefined,
  moveSignatures: MovePackageSignatureEvidence | undefined,
  typeArguments: readonly string[],
  nodePath?: string,
  diagnostics?: TransactionDiagnostic[],
): GraphMoveCallEvidenceState | undefined {
  if (runtime === undefined || moveSignatures === undefined) return undefined;

  const target = parseGraphMoveCallTarget(runtime.target).target;
  if (target === undefined) return undefined;

  const evidence = resolveMoveCallSignatureEvidence({
    packageId: target.packageId,
    moduleName: target.moduleName,
    functionName: target.functionName,
    moveSignatures,
    typeArguments,
    explicitResultCount: runtime.resultCount,
  });
  if (evidence === undefined) return undefined;

  if (!evidence.typeArgumentsComplete) {
    if (diagnostics !== undefined && nodePath !== undefined) {
      diagnostics.push(
        graphDiagnostic(
          'graph.command.moveCall.typeArgumentsCount',
          `PTB graph MoveCall typeArguments length must match signature typeParameterCount ${evidence.signature.typeParameterCount}.`,
          nodePath,
        ),
      );
    }
  }

  if (evidence.resultCountMismatch) {
    if (diagnostics !== undefined && nodePath !== undefined) {
      diagnostics.push(
        graphDiagnostic(
          GRAPH_MOVE_CALL_RESULT_COUNT_MISMATCH_DIAGNOSTIC,
          `PTB graph MoveCall resultCount ${String(runtime.resultCount)} does not match signature returns length ${evidence.resultArity}.`,
          `${nodePath}.params.runtime.resultCount`,
        ),
      );
    }
  }

  return {
    resultArity: evidence.resultArity,
    parameterCount: evidence.signature.parameters.length,
    typeParameterCount: evidence.signature.typeParameterCount,
    typeArgumentsComplete: evidence.typeArgumentsComplete,
  };
}
