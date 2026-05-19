import type { TransactionDiagnostic } from '@zktx.io/ptb-model';

type DiagnosticLike = Pick<TransactionDiagnostic, 'code' | 'message'> & {
  path?: string;
};

const MOVE_INTEGER_WIDTHS = 'u8, u16, u32, u64, u128, or u256';
const GRAPH_MOVE_CALL_TYPE_ARGUMENTS_COUNT =
  'graph.command.moveCall.typeArgumentsCount';
const GRAPH_MOVE_CALL_RESULT_COUNT_MISMATCH =
  'graph.command.moveCall.resultCountMismatch';
const IR_MOVE_CALL_TYPE_ARGUMENTS_COUNT =
  'ir.command.moveCall.typeArgumentsCount';
const IR_MOVE_CALL_RESULT_COUNT_MISMATCH =
  'ir.command.moveCall.resultCountMismatch';

export function displayModelDiagnostics<T extends DiagnosticLike>(
  diagnostics: readonly T[],
): T[] {
  const hiddenIrQuotas = new Map<string, number>([
    [
      IR_MOVE_CALL_TYPE_ARGUMENTS_COUNT,
      diagnostics.filter(
        (diagnostic) =>
          diagnostic.code === GRAPH_MOVE_CALL_TYPE_ARGUMENTS_COUNT,
      ).length,
    ],
    [
      IR_MOVE_CALL_RESULT_COUNT_MISMATCH,
      diagnostics.filter(
        (diagnostic) =>
          diagnostic.code === GRAPH_MOVE_CALL_RESULT_COUNT_MISMATCH,
      ).length,
    ],
  ]);

  const display: T[] = [];
  for (const diagnostic of diagnostics) {
    // Graph diagnostics do not expose an IR command mapping, so duplicate IR
    // evidence diagnostics are suppressed by category in input order.
    const quota = hiddenIrQuotas.get(diagnostic.code) ?? 0;
    if (quota > 0) {
      hiddenIrQuotas.set(diagnostic.code, quota - 1);
      continue;
    }
    display.push(diagnostic);
  }

  return display;
}

export function formatModelDiagnostic(diagnostic: DiagnosticLike): string {
  if (diagnostic.message.includes('abstract number placeholder')) {
    return `Choose a concrete Move integer width (${MOVE_INTEGER_WIDTHS}) for this number before rendering or executing the PTB.`;
  }

  switch (diagnostic.code) {
    case 'graph.edge.cast':
      return 'This edge cast is invalid. Use casts only to bind an abstract number variable to a concrete Move integer input, or update the variable type.';
    case 'graph.edge.cast.unknownField':
      return 'This edge cast has unsupported fields. Remove the extra cast fields and reconnect the edge.';
    case GRAPH_MOVE_CALL_TYPE_ARGUMENTS_COUNT:
    case IR_MOVE_CALL_TYPE_ARGUMENTS_COUNT:
      return 'This MoveCall type argument count does not match verified Move signature metadata. Update the type arguments or refresh the function metadata.';
    case GRAPH_MOVE_CALL_RESULT_COUNT_MISMATCH:
    case IR_MOVE_CALL_RESULT_COUNT_MISMATCH:
      return 'This MoveCall result count does not match verified Move signature metadata. Update the result count or refresh the function metadata.';
    case 'ir.arg.pureType':
      return 'This command argument has the wrong pure type for the command. Match the value type to the command input port.';
    case 'ir.command.makeMoveVec.elementTypeMismatch':
      return 'This MakeMoveVec element type does not match verified Move signature metadata. Update the vector type or the connected values.';
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

function formatModelDiagnostics(
  diagnostics: readonly DiagnosticLike[],
): string {
  const display = displayModelDiagnostics(diagnostics);
  const first = display[0];
  if (!first) return '';

  const message = formatModelDiagnostic(first);
  const remaining = display.length - 1;
  if (remaining <= 0) return message;

  const suffix =
    remaining === 1 ? '1 more diagnostic.' : `${remaining} more diagnostics.`;
  return `${message} ${suffix}`;
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
