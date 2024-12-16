import React from 'react';

export const IconTriangle = ({ color }: { color: string }) => {
  const baseClasses =
    'inline-block w-0 h-0 border-l-[0.375rem] border-l-transparent border-b-[0.75rem] border-b-current border-r-[0.375rem] border-r-transparent ';
  return (
    <span
      className={`${baseClasses} ${color}`}
      style={{ pointerEvents: 'none' }}
    />
  );
};
