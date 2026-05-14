import { isDenseArray } from '../utils.js';

export interface TransactionDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly path?: string;
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
  message: string,
  path?: string,
): TransactionDiagnostic {
  return Object.freeze(
    path === undefined ? { code, message } : { code, message, path },
  );
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
      `Transaction diagnostic at index ${index} must have code and message strings, an optional path string, and no unsupported fields.`,
    );
  }

  return diagnostic.path === undefined
    ? {
        code: diagnostic.code,
        message: diagnostic.message,
      }
    : {
        code: diagnostic.code,
        message: diagnostic.message,
        path: diagnostic.path,
      };
}

function isCanonicalDiagnosticShape(
  value: unknown,
): value is TransactionDiagnostic {
  if (typeof value !== 'object' || value == undefined || Array.isArray(value)) {
    return false;
  }
  const diagnostic = value as Record<string, unknown>;
  return (
    typeof diagnostic.code === 'string' &&
    typeof diagnostic.message === 'string' &&
    (diagnostic.path === undefined || typeof diagnostic.path === 'string') &&
    Object.keys(diagnostic).every(
      (key) => key === 'code' || key === 'message' || key === 'path',
    )
  );
}
