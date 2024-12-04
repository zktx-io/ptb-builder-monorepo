export type ToastVariant = 'error' | 'info' | 'success' | 'warning';
export type EnqueueToast = (
  message: string,
  options: { variant: ToastVariant },
) => void;

let globalEnqueueToast: EnqueueToast | undefined;

export const setToast = (enqueueToast: EnqueueToast) => {
  globalEnqueueToast = enqueueToast;
};

export const enqueueToast = (
  message: string,
  options: { variant: ToastVariant },
) => {
  globalEnqueueToast && globalEnqueueToast(message, options);
};
