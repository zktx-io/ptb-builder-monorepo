import React from 'react';

export const IconCircle = ({ color }: { color: string }) => (
  <span
    className={`inline-block w-3 h-3 ${color} rounded-full`}
    style={{ pointerEvents: 'none' }}
  />
);
