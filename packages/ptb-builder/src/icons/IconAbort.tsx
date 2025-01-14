import React from 'react';

export const IconAbort = ({
  className = 'w-6 h-6',
  ...props
}: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 100 100"
    className="w-6 h-6"
    {...props}
  >
    <circle cx="50" cy="50" r="45" fill="#7191FC" />
    <polyline
      points="30,50 45,65 70,35"
      fill="none"
      stroke="white"
      strokeWidth="12"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
