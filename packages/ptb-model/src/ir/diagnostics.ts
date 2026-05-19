import type {
  DiagnosticBlocks,
  DiagnosticCategory,
} from '../diagnostics/metadata.js';
import {
  isDiagnosticBlocks,
  isDiagnosticCategory,
  isGraphDiagnosticCode,
} from '../diagnostics/metadata.js';
import { isDenseArray, NULL_VALUE } from '../utils.js';
export type { DiagnosticBlocks, DiagnosticCategory };

export interface TransactionDiagnostic {
  readonly code: string;
  readonly category: DiagnosticCategory;
  readonly message: string;
  readonly path?: string;
}

export interface GraphDiagnostic extends TransactionDiagnostic {
  readonly blocks: DiagnosticBlocks;
}

export class PTBModelError extends Error {
  readonly diagnostics: readonly TransactionDiagnostic[];

  constructor(message: string, diagnostics: readonly TransactionDiagnostic[]) {
    super(message);
    this.name = 'PTBModelError';
    this.diagnostics = freezeDiagnostics(diagnostics);
  }
}

export function errorDiagnostic(
  code: string,
  category: DiagnosticCategory,
  message: string,
  path?: string,
): TransactionDiagnostic {
  if (isGraphDiagnosticCode(code)) {
    throw new TypeError(
      'Graph diagnostics must be created with graphDiagnostic().',
    );
  }

  return createDiagnostic(code, category, message, path);
}

export function createDiagnostic(
  code: string,
  category: DiagnosticCategory,
  message: string,
  path?: string,
): TransactionDiagnostic {
  return Object.freeze(
    path === undefined
      ? { code, category, message }
      : { code, category, message, path },
  );
}

export function isGraphDiagnostic(
  diagnostic: unknown,
): diagnostic is GraphDiagnostic {
  if (!isCanonicalDiagnosticShape(diagnostic)) return false;
  return (
    isGraphDiagnosticCode(diagnostic.code) &&
    'blocks' in diagnostic &&
    isDiagnosticBlocks((diagnostic as { blocks?: unknown }).blocks)
  );
}

export function existingGraphDiagnostics(
  value: unknown,
): readonly GraphDiagnostic[] {
  if (
    typeof value !== 'object' ||
    value === NULL_VALUE ||
    Array.isArray(value)
  ) {
    return [];
  }

  const diagnostics = (value as { diagnostics?: unknown }).diagnostics;
  return isDenseArray(diagnostics) ? diagnostics.filter(isGraphDiagnostic) : [];
}

/**
 * Equivalent to diagnostics.length > 0; this model has no warning severity.
 */
export function hasErrors(
  diagnostics: readonly TransactionDiagnostic[],
): boolean {
  return diagnostics.length > 0;
}

export function assertNoErrors(
  message: string,
  diagnostics: readonly TransactionDiagnostic[],
): void {
  if (hasErrors(diagnostics)) {
    throw new PTBModelError(message, diagnostics);
  }
}

export function freezeDiagnostics(
  diagnostics: readonly TransactionDiagnostic[],
): readonly TransactionDiagnostic[] {
  if (!isDenseArray(diagnostics)) {
    throw new TypeError('Transaction diagnostics must be a dense array.');
  }

  if (
    Object.isFrozen(diagnostics) &&
    diagnostics.every((diagnostic) => isFrozenDiagnostic(diagnostic))
  ) {
    return diagnostics;
  }

  return Object.freeze(
    diagnostics.map((diagnostic, index) =>
      Object.freeze(canonicalDiagnostic(diagnostic, index)),
    ),
  );
}

function isFrozenDiagnostic(diagnostic: TransactionDiagnostic): boolean {
  return Object.isFrozen(diagnostic) && isCanonicalDiagnosticShape(diagnostic);
}

function canonicalDiagnostic(
  diagnostic: TransactionDiagnostic,
  index: number,
): TransactionDiagnostic {
  if (!isCanonicalDiagnosticShape(diagnostic)) {
    throw new TypeError(
      `Transaction diagnostic at index ${index} must have code, category, and message strings, an optional path string, graph blocks only for graph diagnostics, and no unsupported fields.`,
    );
  }

  const base =
    diagnostic.path === undefined
      ? {
          code: diagnostic.code,
          category: diagnostic.category,
          message: diagnostic.message,
        }
      : {
          code: diagnostic.code,
          category: diagnostic.category,
          message: diagnostic.message,
          path: diagnostic.path,
        };
  return isGraphDiagnostic(diagnostic)
    ? ({ ...base, blocks: diagnostic.blocks } as GraphDiagnostic)
    : base;
}

export function isCanonicalDiagnosticShape(
  value: unknown,
): value is TransactionDiagnostic {
  if (
    typeof value !== 'object' ||
    value === NULL_VALUE ||
    Array.isArray(value)
  ) {
    return false;
  }
  const diagnostic = value as Record<string, unknown>;
  if (typeof diagnostic.code !== 'string') return false;
  const isGraphCode = isGraphDiagnosticCode(diagnostic.code);
  const hasBlocks = Object.prototype.hasOwnProperty.call(diagnostic, 'blocks');
  return (
    isDiagnosticCategory(diagnostic.category) &&
    typeof diagnostic.message === 'string' &&
    (diagnostic.path === undefined || typeof diagnostic.path === 'string') &&
    (hasBlocks
      ? isGraphCode && isDiagnosticBlocks(diagnostic.blocks)
      : !isGraphCode) &&
    Object.keys(diagnostic).every(
      (key) =>
        key === 'code' ||
        key === 'category' ||
        key === 'message' ||
        key === 'path' ||
        key === 'blocks',
    )
  );
}
