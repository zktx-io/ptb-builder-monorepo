// src/ui/StatusBar.tsx
import React from 'react';

import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

type Props = {
  status: 'success' | 'failure';
  error?: string;
};

export function StatusBar({ status, error }: Props) {
  const isSuccess = status === 'success';
  const isAbort = !isSuccess && error?.startsWith('MoveAbort');

  // Pick CSS variable set per state
  const stateVars = isSuccess
    ? { bg: 'var(--ptb-status-success-bg)', fg: 'var(--ptb-status-success-fg)' }
    : isAbort
      ? { bg: 'var(--ptb-status-abort-bg)', fg: 'var(--ptb-status-abort-fg)' }
      : {
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
    <div
      className={[
        'ptb-statusbar',
        'inline-flex items-start gap-2 text-xxs px-3 py-1.5',
        'rounded-md mx-1 my-1',
      ].join(' ')}
      style={{
        backgroundColor: stateVars.bg,
        color: stateVars.fg,
      }}
    >
      {icon}
      <span className="whitespace-pre-line break-words max-w-xs select-text">
        {label}
      </span>
    </div>
  );
}
