// Ultra-compact count stepper (＋ / − only, no number readout).
// - Renders when: command supports expansion AND is expanded (even if patcher missing → disabled)
// - Nested vectors → not render (cannot expand)

import React, { useMemo } from 'react';

import clsx from 'clsx';

import { canExpandCommand, countKeyOf, expandedKeyOf } from '../registry';

export type PatchUIPayload = (
  nodeId: string,
  patch: Record<string, unknown>,
) => void;

export interface CommandCountStepperProps {
  cmdKind?: string;
  nodeId?: string;
  ui: Record<string, unknown>;
  onPatchUI?: PatchUIPayload;
  min?: number;
  max?: number;
  className?: string;
  disabled?: boolean;
}

function clampInt(v: unknown, min = 1, max?: number): number {
  const n =
    typeof v === 'number' ? Math.floor(v) : parseInt(String(v ?? ''), 10);
  const safe = Number.isFinite(n) && n >= min ? n : min;
  return typeof max === 'number' ? Math.min(safe, max) : safe;
}

export const CommandCountStepper: React.FC<CommandCountStepperProps> = ({
  cmdKind,
  nodeId,
  ui,
  onPatchUI,
  min = 1,
  max,
  className,
  disabled,
}) => {
  const expKey = useMemo(() => expandedKeyOf(cmdKind), [cmdKind]);
  const allowed = useMemo(
    () => canExpandCommand(cmdKind, ui as any),
    [cmdKind, ui],
  );
  const isExpanded = Boolean(expKey && ui?.[expKey]);

  // Only render if expanded AND allowed
  if (!expKey || !isExpanded || !allowed) return <></>;

  const countKey = countKeyOf(cmdKind);
  if (!countKey) return <></>;

  const canPatch = Boolean(nodeId && onPatchUI);
  const count = clampInt(ui?.[countKey], min, max);

  const step = (delta: number) => {
    if (!canPatch) return;
    const next = clampInt(count + delta, min, max);
    if (next !== count) onPatchUI!(nodeId!, { [countKey]: next });
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
