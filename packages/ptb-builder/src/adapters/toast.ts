// src/adapters/toast.ts
// Single-file toast adapter: types + default console fallback.

import { ToastVariant } from '../types';

export type ToastMessage = {
  message: string;
  variant?: ToastVariant;
};

export type ToastAdapter = (msg: ToastMessage) => void;

/** Default: console fallback if no adapter is provided. */
export const consoleToast: ToastAdapter = ({ message, variant }) => {
  const tag =
    variant === 'error'
      ? '[ERROR]'
      : variant === 'success'
        ? '[SUCCESS]'
        : variant === 'warning'
          ? '[WARN]'
          : '[INFO]';
  // eslint-disable-next-line no-console
  console.log(`${tag} ${message}`);
};
