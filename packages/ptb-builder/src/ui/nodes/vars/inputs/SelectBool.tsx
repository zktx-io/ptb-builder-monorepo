// src/ui/nodes/vars/inputs/SelectBool.tsx
import { memo } from 'react';

/** Tiny boolean select for VarNode editors. */
export const SelectBool = memo(function SelectBool({
  value,
  onChange,
  onUnset,
  disabled,
  allowUnset = false,
}: {
  value?: boolean;
  onChange?: (v: boolean) => void;
  onUnset?: () => void;
  disabled?: boolean;
  allowUnset?: boolean;
}) {
  const selectValue =
    value === true
      ? 'true'
      : value === false
        ? 'false'
        : allowUnset
          ? 'unset'
          : 'true';

  return (
    <select
      className="w-full px-2 py-1 text-xs border rounded bg-white dark:bg-stone-900 
                 border-gray-300 dark:border-stone-700 text-gray-900 dark:text-gray-100"
      value={selectValue}
      onChange={(e) => {
        if (e.target.value === 'unset') {
          onUnset?.();
          return;
        }
        onChange?.(e.target.value === 'true');
      }}
      disabled={disabled}
    >
      {allowUnset && <option value="unset">unset</option>}
      <option value="true">true</option>
      <option value="false">false</option>
    </select>
  );
});

export default SelectBool;
