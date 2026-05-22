// src/ui/nodes/vars/inputs/OptionToggle.tsx
import { memo } from 'react';

import clsx from 'clsx';

export type OptionToggleProps = {
  /** true = Some, false = None */
  some: boolean;
  /** Disable interactions and dim the control */
  disabled?: boolean;
  /** Called with the next boolean state when toggled */
  onToggle?: (next: boolean) => void;
  /** Optional extra classes for wrapper button */
  className?: string;
  /** Optional title (tooltip). Defaults to "Some"/"None". */
  title?: string;
};

/**
 * Ultra-compact iOS-style toggle used for Option<T>.
 * - Height is 16px for dense vector/option controls.
 * - Small thumb (h-3 w-3) for dense UIs.
 * - Accessible: role="switch", aria-checked.
 */
export const OptionToggle = memo(function OptionToggle({
  some,
  disabled,
  onToggle,
  className,
  title,
}: OptionToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={some}
      aria-label={some ? 'Some' : 'None'}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()} // keep focus out of graph canvas drag
      onClick={() => {
        if (disabled) return;
        onToggle?.(!some);
      }}
      className={clsx(
        // compact 16px control height
        'relative inline-flex h-4 w-7 items-center rounded-full p-0.5 transition-colors',
        // skin
        disabled
          ? 'bg-gray-300 dark:bg-stone-700 cursor-not-allowed opacity-70'
          : some
            ? 'bg-emerald-500 hover:bg-emerald-600'
            : 'bg-gray-400 hover:bg-gray-500',
        // focus
        disabled
          ? ''
          : 'focus:outline-none focus:ring-2 focus:ring-emerald-400/60',
        className,
      )}
      title={title ?? (some ? 'Some' : 'None')}
    >
      <span
        className={clsx(
          'inline-block h-3 w-3 transform rounded-full bg-white transition-transform',
          some ? 'translate-x-3' : 'translate-x-0',
          disabled ? 'opacity-90' : '',
        )}
      />
    </button>
  );
});

export default OptionToggle;
