// src/ui/components/SmallSelect.tsx
import React from 'react';

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
export function SmallSelect({
  value,
  options = [],
  placeholderOption = 'n/a',
  onChange,
  className,
  disabled,
  ...rest
}: SmallSelectProps) {
  // Ensure the current value is always renderable to avoid React warnings
  const hasValue = typeof value === 'string' && value.length > 0;
  const baseOptions = Array.isArray(options) ? options : [];
  const needsInject = hasValue && !baseOptions.includes(value!);
  const renderOptions = needsInject
    ? [value as string, ...baseOptions]
    : baseOptions;

  // Compute a safe controlled value
  const controlledValue = hasValue
    ? (value as string)
    : (renderOptions[0] ?? '');

  return (
    <select
      {...rest}
      value={renderOptions.length > 0 ? controlledValue : ''}
      onChange={(e) => onChange?.(e.target.value)}
      disabled={disabled}
      className={
        'w-full px-2 py-1 text-xs border rounded bg-white dark:bg-stone-900 ' +
        'border-gray-300 dark:border-stone-700 text-gray-900 dark:text-gray-100 ' +
        (className ?? '')
      }
    >
      {renderOptions.length === 0 ? (
        <option value="" disabled>
          {placeholderOption}
        </option>
      ) : (
        renderOptions.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))
      )}
    </select>
  );
}

export default SmallSelect;
