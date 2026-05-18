import type { TransactionDiagnostic } from '@zktx.io/ptb-model';

type DiagnosticLike = Pick<TransactionDiagnostic, 'code' | 'message'> & {
  path?: string;
};

const MOVE_INTEGER_WIDTHS = 'u8, u16, u32, u64, u128, or u256';

export function formatModelDiagnostic(diagnostic: DiagnosticLike): string {
  if (diagnostic.message.includes('abstract number placeholder')) {
    return `Choose a concrete Move integer width (${MOVE_INTEGER_WIDTHS}) for this number before rendering or executing the PTB.`;
  }

  switch (diagnostic.code) {
    case 'graph.edge.cast':
      return 'This edge cast is invalid. Use casts only to bind an abstract number variable to a concrete Move integer input, or update the variable type.';
    case 'graph.edge.cast.unknownField':
      return 'This edge cast has unsupported fields. Remove the extra cast fields and reconnect the edge.';
    case 'ir.arg.pureType':
      return 'This command argument has the wrong pure type for the command. Match the value type to the command input port.';
    case 'ir.input.unsupportedValue':
      return 'This unsupported input contains a value that is not JSON-compatible. Replace it with a plain JSON value before using generated code.';
    case 'ir.command.unsupportedValue':
      return 'This unsupported command contains a value that is not JSON-compatible. Replace it with a plain JSON value before using generated code.';
    case 'ir.input.unsupported':
    case 'codegen.input.unsupported':
    case 'raw.ir.unsupportedInput':
      return 'This transaction contains an unsupported input. It can be inspected, but it cannot be rendered as executable SDK code.';
    case 'ir.command.unsupported':
    case 'codegen.command.unsupported':
    case 'raw.ir.unsupportedCommand':
      return 'This transaction contains an unsupported command. It can be inspected, but it cannot be rendered as executable SDK code.';
    default:
      return diagnostic.message;
  }
}

export function formatModelDiagnosticLine(diagnostic: DiagnosticLike): string {
  const path = diagnostic.path ? `${diagnostic.path}: ` : '';
  return `[${diagnostic.code}] ${path}${formatModelDiagnostic(diagnostic)}`;
}

export function formatModelDiagnostics(
  diagnostics: readonly DiagnosticLike[],
): string {
  return diagnostics.map(formatModelDiagnostic).join(' ');
}

export function formatModelErrorMessage(
  error: unknown,
  fallback: string,
): string {
  const diagnostics = (error as { diagnostics?: unknown } | undefined)
    ?.diagnostics;
  if (Array.isArray(diagnostics) && diagnostics.length > 0) {
    return formatModelDiagnostics(diagnostics as DiagnosticLike[]);
  }
  return (error as { message?: string } | undefined)?.message || fallback;
}
