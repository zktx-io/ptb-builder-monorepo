import type { TransactionDiagnostic } from '@zktx.io/ptb-model';

import {
  displayModelDiagnostics,
  formatModelDiagnosticLine,
} from './modelDiagnostics';

type Props = {
  diagnostics?: readonly TransactionDiagnostic[];
};

export function EditorDiagnosticBadge({ diagnostics = [] }: Props) {
  const display = displayModelDiagnostics(diagnostics);
  if (display.length === 0) return undefined;

  const label =
    display.length === 1 ? '1 diagnostic' : `${display.length} diagnostics`;
  const text = display.length > 99 ? '99+' : String(display.length);

  return (
    <span
      className="ptb-diagnostic-badge"
      title={display.map(formatModelDiagnosticLine).join('\n')}
      aria-label={label}
    >
      {text}
    </span>
  );
}
