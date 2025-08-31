// src/ui/nodes/vars/inputs/MiniStepper.tsx
import React, { memo } from 'react';

type Props = {
  decDisabled?: boolean;
  incDisabled?: boolean;
  onDec: () => void;
  onInc: () => void;
};

/** Ultra-compact stepper for vector item count (+ / -). */
export const MiniStepper = memo(function MiniStepper({
  decDisabled,
  incDisabled,
  onDec,
  onInc,
}: Props) {
  const btnBase =
    'h-4 w-4 inline-flex items-center justify-center text-[10px] leading-none';
  const btnSkin =
    'bg-white text-gray-800 border border-gray-300 hover:bg-gray-100 ' +
    'dark:bg-stone-900 dark:text-gray-100 dark:border-stone-700 dark:hover:bg-stone-800';

  return (
    <div className="inline-flex" role="group" aria-label="vector item count">
      <button
        type="button"
        className={[
          btnBase,
          btnSkin,
          'rounded-l',
          decDisabled ? 'opacity-50 cursor-not-allowed' : '',
        ].join(' ')}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onDec}
        disabled={decDisabled}
        title="Decrease items"
      >
        −
      </button>
      <button
        type="button"
        className={[
          btnBase,
          btnSkin,
          'rounded-r -ml-px',
          incDisabled ? 'opacity-50 cursor-not-allowed' : '',
        ].join(' ')}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onInc}
        disabled={incDisabled}
        title="Increase items"
      >
        ＋
      </button>
    </div>
  );
});

export default MiniStepper;
