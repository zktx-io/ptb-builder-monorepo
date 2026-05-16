// src/ui/StatusBar.tsx
import { AlertTriangle, CheckCircle, X, XCircle } from 'lucide-react';

import { providerNoticeLabel, type ProviderUiState } from './providerUiState';

type Props = {
  transaction?: ProviderUiState['transaction'];
  notice?: ProviderUiState['notice'];
  onDismissNotice?: () => void;
};

export function StatusBar({ transaction, notice, onDismissNotice }: Props) {
  const status = transaction?.status;
  const error = transaction?.error;
  const isSuccess = status === 'success';
  const isAbort = !isSuccess && error?.startsWith('MoveAbort');

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
          className={[
            'ptb-statusbar',
            'inline-flex items-start gap-2 text-xxs px-3 py-1.5',
            'rounded-md mx-1 my-1',
          ].join(' ')}
          style={{
            backgroundColor: transactionVars.bg,
            color: transactionVars.fg,
          }}
        >
          {icon}
          <span className="whitespace-pre-line break-words max-w-xs select-text">
            {label}
          </span>
        </div>
      )}
      {notice && (
        <div
          className={[
            'ptb-statusbar',
            'inline-flex items-start gap-2 text-xxs px-3 py-1.5',
            'rounded-md mx-1 my-1',
          ].join(' ')}
          style={{
            backgroundColor: noticeVars.bg,
            color: noticeVars.fg,
          }}
        >
          <AlertTriangle size={12} />
          <span className="whitespace-pre-line break-words max-w-xs select-text">
            {providerNoticeLabel(notice)}
          </span>
          {notice.dismissible && (
            <button
              type="button"
              className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded"
              onClick={onDismissNotice}
              aria-label="Dismiss notice"
            >
              <X size={11} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
