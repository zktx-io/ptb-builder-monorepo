import { useRef } from 'react';

export const DEBOUNCE = 200;
export const useDebounce = (
  callback: (...args: any[]) => void,
  delay: number,
) => {
  // eslint-disable-next-line no-restricted-syntax
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const debouncedFunction = (...args: any[]) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      callback(...args);
    }, delay);
  };

  const cancel = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  };

  return { debouncedFunction, cancel };
};
