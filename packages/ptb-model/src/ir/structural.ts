import {
  assertNoErrors,
  errorDiagnostic,
  freezeDiagnostics,
} from './diagnostics.js';
import type { TransactionDiagnostic } from './diagnostics.js';
import type { TransactionIR } from './types.js';
import { validateTransactionIR } from './validate.js';
import {
  cloneJsonLike,
  findNonPlainData,
  isPlainObject,
  NULL_VALUE,
} from '../utils.js';

declare const STRUCTURAL_TRANSACTION_IR_BRAND: unique symbol;

export type StructuralTransactionIR = TransactionIR & {
  readonly [STRUCTURAL_TRANSACTION_IR_BRAND]: true;
};

const structuralTransactionIRs = new WeakSet<object>();
const STRUCTURAL_IGNORED_DIAGNOSTIC_CODES = new Set([
  'ir.input.unsupported',
  'ir.command.unsupported',
]);

export function isStructuralTransactionIR(
  value: unknown,
): value is StructuralTransactionIR {
  return (
    typeof value === 'object' &&
    value !== NULL_VALUE &&
    Object.isFrozen(value) &&
    structuralTransactionIRs.has(value)
  );
}

export function parseStructuralTransactionIR(
  value: unknown,
): StructuralTransactionIR {
  const validationDiagnostics = validateTransactionIR(value, {
    includeExistingDiagnostics: false,
  });
  const cloned = cloneJsonLike(value) as TransactionIR;
  const candidate = { ...cloned, diagnostics: validationDiagnostics };
  const diagnostics = withPlainDataDiagnostics(
    candidate,
    validationDiagnostics,
  );
  const structuralDiagnostics = structuralTransactionIRDiagnostics(diagnostics);
  assertNoErrors(
    'TransactionIR is not structurally valid.',
    structuralDiagnostics,
  );

  return markStructuralTransactionIR({ ...cloned, diagnostics });
}

export function finalizeStructuralTransactionIR(
  ir: TransactionIR,
  diagnostics: readonly TransactionDiagnostic[],
): TransactionIR {
  const result = { ...ir, diagnostics: freezeDiagnostics(diagnostics) };
  const checkedDiagnostics = withPlainDataDiagnostics(
    result,
    result.diagnostics,
  );
  if (checkedDiagnostics !== result.diagnostics) {
    result.diagnostics = checkedDiagnostics;
  }
  return structuralTransactionIRDiagnostics(result.diagnostics).length === 0
    ? markStructuralTransactionIR(result)
    : result;
}

export function structuralTransactionIRDiagnostics(
  diagnostics: readonly TransactionDiagnostic[],
): readonly TransactionDiagnostic[] {
  return diagnostics.filter(
    (diagnostic) => !isStructurallyIgnoredDiagnostic(diagnostic.code),
  );
}

function isStructurallyIgnoredDiagnostic(code: string): boolean {
  return (
    STRUCTURAL_IGNORED_DIAGNOSTIC_CODES.has(code) ||
    code.startsWith('graph.') ||
    (code.startsWith('raw.') && !code.startsWith('raw.ir.'))
  );
}

function markStructuralTransactionIR<T extends TransactionIR>(
  ir: T,
): T & StructuralTransactionIR {
  const plainDataIssue = findNonPlainData(ir);
  if (plainDataIssue) {
    throw new TypeError(
      `StructuralTransactionIR cannot contain non-plain data at ${plainDataIssue.path}.`,
    );
  }
  deepFreezeJsonLike(ir);
  structuralTransactionIRs.add(ir);
  return ir as T & StructuralTransactionIR;
}

function withPlainDataDiagnostics(
  value: unknown,
  diagnostics: readonly TransactionDiagnostic[],
): readonly TransactionDiagnostic[] {
  const issue = findNonPlainData(value);
  if (!issue) return freezeDiagnostics(diagnostics);
  if (
    diagnostics.some(
      (diagnostic) =>
        diagnostic.code === 'ir.plainData' && diagnostic.path === issue.path,
    )
  ) {
    return freezeDiagnostics(diagnostics);
  }

  return freezeDiagnostics([
    ...diagnostics,
    errorDiagnostic(
      'ir.plainData',
      `TransactionIR must contain only plain model-owned data. ${issue.message}`,
      issue.path,
    ),
  ]);
}

function deepFreezeJsonLike(value: unknown): void {
  const stack: unknown[] = [value];
  const seen = new WeakSet<object>();

  while (stack.length > 0) {
    const item = stack.pop();
    if (!Array.isArray(item) && !isPlainObject(item)) continue;
    if (seen.has(item)) continue;
    seen.add(item);

    if (Array.isArray(item)) {
      item.forEach((child) => stack.push(child));
    } else {
      Object.values(item).forEach((child) => stack.push(child));
    }
    Object.freeze(item);
  }
}
