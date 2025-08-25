import React from 'react';

/** Tiny boolean select (true/false) for VarNode editors */
export function SelectBool({
  value,
  onChange,
  disabled,
}: {
  value?: boolean;
  onChange?: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <select
      className="w-full px-2 py-1 text-xs border rounded bg-white dark:bg-stone-900 
                 border-gray-300 dark:border-stone-700 text-gray-900 dark:text-gray-100"
      value={value === true ? 'true' : value === false ? 'false' : 'true'}
      onChange={(e) => onChange?.(e.target.value === 'true')}
      disabled={disabled}
    >
      <option value="true">true</option>
      <option value="false">false</option>
    </select>
  );
}

export default SelectBool;
