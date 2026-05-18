import {
  graphToTransactionIR,
  hasErrors,
  PTBModelError,
  transactionIRToTsSdkCode,
} from '@zktx.io/ptb-model';
import type {
  GraphToTransactionIROptions,
  PTBGraph,
  TransactionDiagnostic,
} from '@zktx.io/ptb-model';

import { normalizeRuntimeEnvelope } from '../ptb/runtimeEnvelope';
import type {
  NormalizedRuntimeEnvelope,
  RuntimeEnvelope,
} from '../ptb/runtimeEnvelope';
import type { Chain } from '../types';
import {
  displayModelDiagnostics,
  formatModelDiagnosticLine,
} from './modelDiagnostics';

export type CodePreviewResult = {
  code: string;
  ok: boolean;
  modelCode?: string;
};

export function renderCodePreview(
  graph: PTBGraph,
  opts: {
    chain?: Chain;
    envelope?: RuntimeEnvelope;
    moveSignatures?: GraphToTransactionIROptions['moveSignatures'];
    previousModelCode?: string;
  },
): CodePreviewResult {
  let envelope: NormalizedRuntimeEnvelope | undefined;
  let envelopeError: string | undefined;
  try {
    envelope = normalizeRuntimeEnvelope(opts.envelope);
  } catch (error) {
    envelopeError =
      error instanceof Error
        ? error.message
        : 'Runtime envelope metadata is invalid.';
  }

  const metadata = previewMetadata(opts.chain, envelope, envelopeError);

  try {
    const ir = graphToTransactionIR(graph, {
      moveSignatures: opts.moveSignatures,
    });
    if (hasErrors(ir.diagnostics)) {
      return diagnosticPreview(
        metadata,
        ir.diagnostics,
        opts.previousModelCode,
      );
    }

    const modelCode = transactionIRToTsSdkCode(ir);
    return {
      code: [metadata, modelCode].filter(Boolean).join('\n'),
      ok: true,
      modelCode,
    };
  } catch (error) {
    if (error instanceof PTBModelError) {
      return diagnosticPreview(
        metadata,
        error.diagnostics,
        opts.previousModelCode,
      );
    }
    return diagnosticPreview(
      metadata,
      [
        {
          code: 'preview.unexpected',
          message:
            error instanceof Error
              ? error.message
              : 'Code preview generation failed.',
        },
      ],
      opts.previousModelCode,
    );
  }
}

function diagnosticPreview(
  metadata: string,
  diagnostics: readonly TransactionDiagnostic[],
  previousModelCode?: string,
): CodePreviewResult {
  const lines = [
    metadata,
    '// Code preview is stale because the current graph cannot be rendered.',
    ...displayModelDiagnostics(diagnostics).map(
      (diagnostic) => `// ${formatModelDiagnosticLine(diagnostic)}`,
    ),
    previousModelCode ? `\n${previousModelCode}` : '',
  ].filter(Boolean);

  return {
    code: lines.join('\n'),
    ok: false,
  };
}

function previewMetadata(
  chain?: Chain,
  envelope?: NormalizedRuntimeEnvelope,
  envelopeError?: string,
): string {
  const lines = [
    '// Preview metadata only. Wallet, signing, simulation, and execution stay with the host app.',
    chain ? `// chain: ${chain}` : undefined,
    envelopeError ? `// envelope: invalid (${envelopeError})` : undefined,
    envelope?.sender ? `// sender: ${envelope.sender}` : undefined,
    envelope?.gasBudget !== undefined
      ? `// gasBudget: ${envelope.gasBudget}`
      : undefined,
  ].filter(Boolean);

  return lines.join('\n');
}
