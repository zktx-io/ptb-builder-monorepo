// Compact, command-specific expand switch (vector <-> expanded).
// - Always renders if the command supports expansion; disabled when patcher is missing.
// - Inside labels: "V" (left) / "E" (right)

import React, { useCallback } from 'react';

import clsx from 'clsx';

import { expandedKeyOf } from './registry';

export type PatchUIPayload = (
  nodeId: string,
  patch: Record<string, unknown>,
) => void;

type SwitchSize = 'xxs';
type SizeMetrics = {
  track: string;
  knob: string;
  font: string;
  pad: string;
  labelPadLeftCls: string;
  labelPadRightCls: string;
};

const SIZE_MAP: Record<SwitchSize, SizeMetrics> = {
  xxs: {
    track: 'w-[30px] h-[14px]',
    knob: 'w-[12px] h-[12px]',
    font: 'text-[9px]',
    pad: '3px',
    labelPadLeftCls: 'pl-[5px]',
    labelPadRightCls: 'pr-[5px]',
  },
};

function MiniSwitch({
  checked,
  onChange,
  size = 'xxs',
  labels = { off: 'V', on: 'E' },
  disabled = false,
  className,
  'data-testid': testid,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  size?: SwitchSize;
  labels?: { off: string; on: string };
  disabled?: boolean;
  className?: string;
  ['data-testid']?: string;
}) {
  const m = SIZE_MAP[size];

  const handleToggle = useCallback(() => {
    if (disabled) return;
    onChange(!checked);
  }, [checked, disabled, onChange]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (disabled) return;
      if (e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter') {
        e.preventDefault();
        onChange(!checked);
      }
    },
    [checked, disabled, onChange],
  );

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled}
      disabled={disabled}
      onClick={handleToggle}
      onKeyDown={onKeyDown}
      data-testid={testid}
      title={`${labels.off} / ${labels.on}`}
      className={clsx(
        'relative inline-flex items-center justify-center rounded-full transition-colors outline-none',
        'focus-visible:ring-2 focus-visible:ring-blue-500 dark:focus-visible:ring-blue-400',
        'focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-stone-900',
        m.track,
        checked
          ? 'bg-blue-600 dark:bg-blue-500'
          : 'bg-gray-300 dark:bg-stone-600',
        disabled && 'opacity-60 cursor-not-allowed',
        className,
      )}
    >
      <span
        className={clsx(
          'pointer-events-none select-none absolute inset-y-0 left-0 flex items-center',
          m.font,
          m.labelPadLeftCls,
          checked
            ? 'text-white/60 dark:text-stone-100/60'
            : 'text-gray-900 dark:text-gray-100',
        )}
        aria-hidden="true"
      >
        {labels.off}
      </span>
      <span
        className={clsx(
          'pointer-events-none select-none absolute inset-y-0 right-0 flex items-center',
          m.font,
          m.labelPadRightCls,
          checked
            ? 'text-white dark:text-stone-100'
            : 'text-gray-900/60 dark:text-gray-100/60',
        )}
        aria-hidden="true"
      >
        {labels.on}
      </span>

      <span
        className={clsx(
          'absolute top-1/2 -translate-y-1/2 rounded-full bg-white dark:bg-stone-100 shadow transition-[left,right]',
          SIZE_MAP[size].knob,
        )}
        style={
          checked ? { right: SIZE_MAP[size].pad } : { left: SIZE_MAP[size].pad }
        }
      />
    </button>
  );
}

export function CommandExpandSwitch({
  cmdKind,
  ui,
  nodeId,
  onPatchUI,
  size = 'xxs',
  labels = { off: 'V', on: 'E' },
  disabled = false,
  className,
}: {
  cmdKind?: string;
  ui: Record<string, unknown>;
  nodeId?: string;
  onPatchUI?: PatchUIPayload;
  size?: SwitchSize;
  labels?: { off: string; on: string };
  disabled?: boolean;
  className?: string;
}) {
  if (!cmdKind) return <></>;
  const expKey = expandedKeyOf(cmdKind);
  if (!expKey) return <></>;

  const checked = Boolean(ui?.[expKey]);
  const canToggle = Boolean(nodeId && onPatchUI);

  const handleChange = (v: boolean) => {
    if (!canToggle) return;
    onPatchUI!(nodeId!, { [expKey]: v });
  };

  return (
    <MiniSwitch
      checked={checked}
      onChange={handleChange}
      size={size}
      labels={labels}
      disabled={disabled || !canToggle}
      className={className}
      data-testid="cmd-expand-switch"
    />
  );
}

export default CommandExpandSwitch;
