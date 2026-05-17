import { assertNoErrors } from './diagnostics.js';
import type { TransactionDiagnostic } from './diagnostics.js';
import type { TransactionIR } from './types.js';
import { validateTransactionIR } from './validate.js';
import { cloneJsonLike, isRecord, NULL_VALUE } from '../utils.js';

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
  const diagnostics = validateTransactionIR(value, {
    includeExistingDiagnostics: false,
  });
  const structuralDiagnostics = structuralTransactionIRDiagnostics(diagnostics);
  assertNoErrors(
    'TransactionIR is not structurally valid.',
    structuralDiagnostics,
  );

  const cloned = cloneJsonLike(value) as TransactionIR;
  return markStructuralTransactionIR({ ...cloned, diagnostics });
}

export function finalizeStructuralTransactionIR(
  ir: TransactionIR,
  diagnostics: readonly TransactionDiagnostic[],
): TransactionIR {
  const result = { ...ir, diagnostics };
  return structuralTransactionIRDiagnostics(diagnostics).length === 0
    ? markStructuralTransactionIR(result)
    : result;
}

export function structuralTransactionIRDiagnostics(
  diagnostics: readonly TransactionDiagnostic[],
): readonly TransactionDiagnostic[] {
  return diagnostics.filter(
    (diagnostic) => !STRUCTURAL_IGNORED_DIAGNOSTIC_CODES.has(diagnostic.code),
  );
}

function markStructuralTransactionIR<T extends TransactionIR>(
  ir: T,
): T & StructuralTransactionIR {
  deepFreezeJsonLike(ir);
  structuralTransactionIRs.add(ir);
  return ir as T & StructuralTransactionIR;
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype == undefined;
}
