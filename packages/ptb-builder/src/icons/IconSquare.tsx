import React from 'react';

export const IconSquare = ({ color }: { color: string }) => (
  <span
    className={`inline-block w-3 h-3 ${color}`}
    style={{ pointerEvents: 'none' }}
  />
);
