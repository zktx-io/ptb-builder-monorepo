import { PTBModelError, type TransactionDiagnostic } from '@zktx.io/ptb-model';

export interface CliErrorCause {
  kind: 'network' | 'sdk' | 'system';
  message: string;
}

interface CliErrorPayload {
  code: string;
  message: string;
  cause?: CliErrorCause;
  exitCode?: number;
  diagnostics?: readonly TransactionDiagnostic[];
}

export class PtbCliError extends Error {
  readonly code: string;
  readonly causeDetail: CliErrorCause | undefined;
  readonly diagnostics: readonly TransactionDiagnostic[] | undefined;
  readonly exitCode: number;

  constructor(payload: CliErrorPayload) {
    super(payload.message);
    this.name = 'PtbCliError';
    this.code = payload.code;
    this.causeDetail = payload.cause;
    this.exitCode = payload.exitCode ?? 1;
    this.diagnostics = payload.diagnostics;
  }
}

export function normalizeCliError(error: unknown): PtbCliError {
  if (error instanceof PtbCliError) return error;
  if (error instanceof PTBModelError) {
    return new PtbCliError({
      code: 'model.failed',
      message: error.message,
      diagnostics: error.diagnostics,
    });
  }
  if (error instanceof Error) {
    return new PtbCliError({
      cause: { kind: 'system', message: error.message },
      code: 'unexpected',
      message: 'Unexpected CLI error.',
    });
  }
  return new PtbCliError({
    code: 'unexpected',
    message: 'Unexpected CLI error.',
  });
}
