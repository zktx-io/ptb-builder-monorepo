// src/ui/StatusBar.tsx
import React from 'react';

import { CheckCircle, XCircle } from 'lucide-react';

type Props = {
  status: 'success' | 'failure';
  error?: string;
};

export function StatusBar({ status, error }: Props) {
  const isSuccess = status === 'success';
  return (
    <div
      className={[
        'inline-flex items-center gap-2 text-white text-xxs px-3 py-1.5',
        'rounded-md shadow-sm',
        'mx-1 my-1',
        isSuccess ? 'bg-green-600' : 'bg-red-600',
      ].join(' ')}
    >
      {isSuccess ? <CheckCircle size={12} /> : <XCircle size={12} />}
      <span className="whitespace-pre">
        {isSuccess ? 'Success' : `Failed${error ? `: ${error}` : ''}`}
      </span>
    </div>
  );
}
