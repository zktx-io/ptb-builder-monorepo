import {
  assertNoErrors,
  freezeDiagnostics,
  isGraphDiagnostic,
  errorDiagnostic as modelDiagnostic,
} from './diagnostics.js';
import type { TransactionDiagnostic } from './diagnostics.js';
import type { TransactionIR } from './types.js';
import { validateTransactionIR } from './validate.js';
import {
  cloneJsonLike,
  deepFreezeJsonLike,
  findNonPlainData,
  NULL_VALUE,
} from '../utils.js';

function irDiagnostic(
  code: string,
  message: string,
  path?: string,
): TransactionDiagnostic {
  return modelDiagnostic(code, 'semantic', message, path);
}

declare const STRUCTURAL_TRANSACTION_IR_BRAND: unique symbol;

export type StructuralTransactionIR = TransactionIR & {
  readonly [STRUCTURAL_TRANSACTION_IR_BRAND]: true;
};

const structuralTransactionIRs = new WeakSet<object>();
const STRUCTURAL_IGNORED_DIAGNOSTIC_CODES = new Set([
  'ir.input.unsupported',
  'ir.command.unsupported',
]);
export const STRUCTURAL_IGNORED_RAW_SOURCE_DIAGNOSTIC_CODES = new Set([
  'raw.argument',
  'raw.argument.array',
  'raw.argument.input',
  'raw.argument.input.type',
  'raw.argument.nestedResult',
  'raw.argument.result',
  'raw.argument.unknownField',
  'raw.argument.unsupported',
  'raw.base64Bytes',
  'raw.command',
  'raw.command.emptyInput',
  'raw.command.intent',
  'raw.command.makeMoveVec.type',
  'raw.command.moveCall.argumentTypes',
  'raw.command.moveCall.unknownField',
  'raw.command.payload',
  'raw.command.unknownField',
  'raw.command.unsupported',
  'raw.command.upgrade.package',
  'raw.enum.conflict',
  'raw.funds',
  'raw.funds.payload',
  'raw.funds.reservation',
  'raw.funds.typeArg',
  'raw.funds.unknownField',
  'raw.funds.withdrawFrom',
  'raw.input',
  'raw.input.unknownField',
  'raw.input.unresolved',
  'raw.input.unsupported',
  'raw.moveIdentifier',
  'raw.moveTypeTag',
  'raw.moveTypeTagArray',
  'raw.object',
  'raw.object.payload',
  'raw.object.receiving',
  'raw.object.ref',
  'raw.object.shared',
  'raw.object.unknownField',
  'raw.object.unsupported',
  'raw.objectId',
  'raw.objectIdArray',
  'raw.transaction',
  'raw.transaction.unknownField',
  'raw.transaction.version',
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
    (diagnostic) => !isStructurallyIgnoredDiagnostic(diagnostic),
  );
}

function isStructurallyIgnoredDiagnostic(
  diagnostic: TransactionDiagnostic,
): boolean {
  if (isGraphDiagnostic(diagnostic)) return !diagnostic.blocks.document;
  const { code } = diagnostic;
  return (
    STRUCTURAL_IGNORED_DIAGNOSTIC_CODES.has(code) ||
    STRUCTURAL_IGNORED_RAW_SOURCE_DIAGNOSTIC_CODES.has(code)
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
    irDiagnostic(
      'ir.plainData',
      `TransactionIR must contain only plain model-owned data. ${issue.message}`,
      issue.path,
    ),
  ]);
}
