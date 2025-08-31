// src/ui/components/SmallSelect.tsx
import React, { memo } from 'react';

type SmallSelectProps = Omit<
  React.SelectHTMLAttributes<HTMLSelectElement>,
  'onChange' | 'value'
> & {
  value?: string;
  options?: string[];
  placeholderOption?: string; // shown when options are empty
  onChange?: (v: string) => void;
};

/** Tiny styled select for compact node UIs */
export const SmallSelect = memo(function SmallSelect({
  value,
  options = [],
  placeholderOption = 'n/a',
  onChange,
  className,
  disabled,
  ...rest
}: SmallSelectProps) {
  // Normalize options
  const baseOptions = Array.isArray(options) ? options.filter(Boolean) : [];

  // Ensure the current value is renderable to avoid React warnings
  const hasValue = typeof value === 'string' && value.length > 0;
  const needsInject = hasValue && !baseOptions.includes(value as string);
  const renderOptions = needsInject
    ? [value as string, ...baseOptions]
    : baseOptions;

  // Deduplicate while preserving order (defensive)
  const seen = new Set<string>();
  const optionsUnique = renderOptions.filter((o) => {
    if (seen.has(o)) return false;
    seen.add(o);
    return true;
  });

  // Compute a safe controlled value (no non-null assertions)
  const controlledValue = optionsUnique.length
    ? hasValue
      ? (value as string)
      : optionsUnique[0]
    : '';

  return (
    <select
      {...rest}
      value={optionsUnique.length ? controlledValue : ''}
      onChange={(e) => onChange?.(e.target.value)}
      disabled={disabled}
      className={
        'w-full px-2 py-1 text-xs border rounded bg-white dark:bg-stone-900 ' +
        'border-gray-300 dark:border-stone-700 text-gray-900 dark:text-gray-100 ' +
        (className ?? '')
      }
    >
      {optionsUnique.length === 0 ? (
        <option value="" disabled>
          {placeholderOption}
        </option>
      ) : (
        optionsUnique.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))
      )}
    </select>
  );
});

export default SmallSelect;
