// src/types.ts

export const SUI_CHAINS = ['sui:devnet', 'sui:testnet', 'sui:mainnet'] as const;
export type Chain = (typeof SUI_CHAINS)[number];

export function isSuiChain(value: unknown): value is Chain {
  return (
    typeof value === 'string' &&
    (SUI_CHAINS as readonly string[]).includes(value)
  );
}

export type ToastVariant = 'info' | 'success' | 'error' | 'warning';
export type ToastMessage = {
  message: string;
  variant?: ToastVariant;
};
export type ToastAdapter = (msg: ToastMessage) => void;

/** Extended theme set */
export type Theme =
  | 'light'
  | 'cream'
  | 'mint-breeze'
  | 'dark'
  | 'cobalt2'
  | 'tokyo-night';

export const THEMES: Theme[] = [
  'light',
  'cream',
  'mint-breeze',
  'dark',
  'cobalt2',
  'tokyo-night',
];

/**
 * Convert extended Theme → ReactFlow colorMode
 * (ReactFlow only accepts 'light' or 'dark')
 */
export function toColorMode(theme: Theme): 'light' | 'dark' {
  switch (theme) {
    case 'light':
    case 'cream':
    case 'mint-breeze':
      return 'light';
    case 'dark':
    case 'cobalt2':
    case 'tokyo-night':
      return 'dark';
    default:
      return 'light';
  }
}
