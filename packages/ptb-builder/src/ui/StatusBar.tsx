// src/ui/StatusBar.tsx
import { AlertTriangle, CheckCircle, X, XCircle } from 'lucide-react';

import {
  type EditorValidationState,
  editorValidationSummary,
} from './editorValidationState';
import {
  isMoveAbortTransaction,
  providerNoticeLabel,
  type ProviderUiState,
} from './providerUiState';

type Props = {
  transaction?: ProviderUiState['transaction'];
  notice?: ProviderUiState['notice'];
  editorValidation?: EditorValidationState;
  editorValidationUnavailable?: string;
  onDismissNotice?: () => void;
  onDismissEditorValidation?: () => void;
};

const statusItemClass = [
  'ptb-statusbar',
  'flex w-80 max-w-[calc(100vw-2rem)] items-start gap-2 text-xxs px-3 py-1.5',
  'rounded-md mx-1 my-1',
].join(' ');
const statusMessageClass =
  'min-w-0 flex-1 whitespace-pre-line break-words select-text';
const statusDismissClass =
  'ml-auto inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-transparent text-current transition-colors hover:bg-black/10 dark:hover:bg-white/10';

export function StatusBar({
  transaction,
  notice,
  editorValidation,
  editorValidationUnavailable,
  onDismissNotice,
  onDismissEditorValidation,
}: Props) {
  const status = transaction?.status;
  const error = transaction?.error;
  const isSuccess = status === 'success';
  const isAbort = isMoveAbortTransaction(transaction);

  // Pick CSS variable set per state
  const transactionVars = isSuccess
    ? { bg: 'var(--ptb-status-success-bg)', fg: 'var(--ptb-status-success-fg)' }
    : isAbort
      ? { bg: 'var(--ptb-status-abort-bg)', fg: 'var(--ptb-status-abort-fg)' }
      : {
          bg: 'var(--ptb-status-failure-bg)',
          fg: 'var(--ptb-status-failure-fg)',
        };
  const noticeVars = {
    bg: 'var(--ptb-status-failure-bg)',
    fg: 'var(--ptb-status-failure-fg)',
  };
  const warningVars = {
    bg: 'var(--ptb-status-abort-bg)',
    fg: 'var(--ptb-status-abort-fg)',
  };
  const validationSummary = editorValidation
    ? editorValidationSummary(editorValidation)
    : undefined;

  let icon = <XCircle size={12} />;
  let label = `Failed${error ? `: ${error}` : ''}`;

  if (isSuccess) {
    icon = <CheckCircle size={12} />;
    label = 'Success';
  } else if (isAbort) {
    icon = <AlertTriangle size={12} />;
    label = `Abort${error ? `: ${error}` : ''}`;
  }

  return (
    <div className="flex flex-col gap-1">
      {transaction && (
        <div
          role="status"
          aria-live="polite"
          className={statusItemClass}
          style={{
            backgroundColor: transactionVars.bg,
            color: transactionVars.fg,
          }}
        >
          {icon}
          <span className={statusMessageClass}>{label}</span>
        </div>
      )}
      {notice && (
        <div
          role="status"
          aria-live="polite"
          className={statusItemClass}
          style={{
            backgroundColor: noticeVars.bg,
            color: noticeVars.fg,
          }}
        >
          <XCircle size={12} />
          <span className={statusMessageClass}>
            {providerNoticeLabel(notice)}
          </span>
          {notice.dismissible && (
            <button
              type="button"
              className={statusDismissClass}
              onClick={onDismissNotice}
              aria-label="Dismiss notice"
            >
              <X size={16} strokeWidth={2.25} />
            </button>
          )}
        </div>
      )}
      {validationSummary && (
        <div
          role="status"
          aria-live="polite"
          className={statusItemClass}
          style={{
            backgroundColor: warningVars.bg,
            color: warningVars.fg,
          }}
        >
          <AlertTriangle size={12} />
          <span className={statusMessageClass}>{validationSummary}</span>
          {onDismissEditorValidation && (
            <button
              type="button"
              className={statusDismissClass}
              onClick={onDismissEditorValidation}
              aria-label="Dismiss graph diagnostic warning"
            >
              <X size={16} strokeWidth={2.25} />
            </button>
          )}
        </div>
      )}
      {editorValidationUnavailable && (
        <div
          role="status"
          aria-live="polite"
          className={statusItemClass}
          style={{
            backgroundColor: noticeVars.bg,
            color: noticeVars.fg,
          }}
        >
          <XCircle size={12} />
          <span className={statusMessageClass}>
            {editorValidationUnavailable}
          </span>
        </div>
      )}
    </div>
  );
}
