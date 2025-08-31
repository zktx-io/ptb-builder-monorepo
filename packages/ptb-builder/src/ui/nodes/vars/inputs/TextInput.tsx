// src/ui/nodes/vars/inputs/TextInput.tsx
import React, { memo } from 'react';

/** Tiny styled text input for VarNode editors */
export const TextInput = memo(function TextInput(
  props: React.InputHTMLAttributes<HTMLInputElement>,
) {
  return (
    <input
      {...props}
      className={
        'w-full px-2 py-1 text-xs border rounded bg-white dark:bg-stone-900 ' +
        'border-gray-300 dark:border-stone-700 text-gray-900 dark:text-gray-100 ' +
        (props.className ?? '')
      }
    />
  );
});

export default TextInput;
