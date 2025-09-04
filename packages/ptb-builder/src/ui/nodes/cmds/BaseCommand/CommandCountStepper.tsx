// Ultra-compact count stepper (＋ / − only, no number readout).
// Policy:
// - Expansion toggles were removed. Count alone defines the number of ports.
// - The stepper renders for any command that exposes a countKey (e.g. amountsCount, sourcesCount).
// - The parent decides which commands have countKeys via countKeyOf(cmdKind).
// - No 'expanded' flag is touched anymore.

import React from 'react';

import clsx from 'clsx';

export type PatchUIPayload = (
  nodeId: string,
  patch: Record<string, unknown>,
) => void;

export interface CommandCountStepperProps {
  /** Command kind string (used by parent to decide presence of countKey). */
  cmdKind?: string;
  nodeId?: string;
  /** Raw UI object that contains the count field (e.g. { amountsCount: 3 }) */
  ui: Record<string, unknown>;
  /** (nodeId, patch) -> void */
  onPatchUI?: PatchUIPayload;
  /** Minimum count (inclusive). Defaults to 1. */
  min?: number;
  /** Optional maximum count (inclusive). */
  max?: number;
  className?: string;
  disabled?: boolean;
  /** The key of the counter field (already resolved by parent). */
  countKey?: string;
}

/** Clamp arbitrary value into an integer in [min, max]. */
function clampInt(v: unknown, min = 1, max?: number): number {
  const n =
    typeof v === 'number' ? Math.floor(v) : parseInt(String(v ?? ''), 10);
  const safe = Number.isFinite(n) && n >= min ? n : min;
  return typeof max === 'number' ? Math.min(safe, max) : safe;
}

export const CommandCountStepper: React.FC<CommandCountStepperProps> = ({
  nodeId,
  ui,
  onPatchUI,
  min = 1,
  max,
  className,
  disabled,
  countKey,
}) => {
  // If the command does not have a countKey, render nothing.
  if (!countKey) return <></>;

  const canPatch = Boolean(nodeId && onPatchUI);
  const count = clampInt(ui?.[countKey], min, max);

  const step = (delta: number) => {
    if (!canPatch) return;
    const next = clampInt(count + delta, min, max);
    if (next === count) return;
    onPatchUI!(nodeId!, { [countKey]: next });
  };

  const decDisabled = disabled || !canPatch || count <= min;
  const incDisabled =
    disabled || !canPatch || (typeof max === 'number' && count >= max);

  const wrapCls = clsx('inline-flex items-center', className);
  const btnBase =
    'h-4 w-4 inline-flex items-center justify-center text-[10px] leading-none';
  const btnSkin =
    'bg-white text-gray-800 border border-gray-300 hover:bg-gray-100 ' +
    'dark:bg-stone-900 dark:text-gray-100 dark:border-stone-700 dark:hover:bg-stone-800';

  return (
    <div className={wrapCls} role="group" aria-label="count stepper">
      <button
        type="button"
        className={clsx(
          btnBase,
          btnSkin,
          'rounded-l',
          decDisabled && 'opacity-50 cursor-not-allowed',
        )}
        onClick={() => step(-1)}
        disabled={decDisabled}
        aria-label="decrease count"
        title="Decrease"
      >
        −
      </button>

      <button
        type="button"
        className={clsx(
          btnBase,
          btnSkin,
          'rounded-r -ml-px',
          incDisabled && 'opacity-50 cursor-not-allowed',
        )}
        onClick={() => step(+1)}
        disabled={incDisabled}
        aria-label="increase count"
        title="Increase"
      >
        ＋
      </button>
    </div>
  );
};

export default CommandCountStepper;
