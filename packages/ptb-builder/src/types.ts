export type Network = 'devnet' | 'testnet' | 'mainnet';
export type Theme = 'light' | 'dark';
export type ToastVariant = 'info' | 'success' | 'error' | 'warning';
export type ToastMessage = {
  message: string;
  variant?: ToastVariant;
};
export type ToastAdapter = (msg: ToastMessage) => void;
