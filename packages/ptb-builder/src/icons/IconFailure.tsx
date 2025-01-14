import React from 'react';

export const IconFailure = ({
  className = 'w-6 h-6',
  ...props
}: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 100 100"
    className="w-6 h-6"
    {...props}
  >
    <circle cx="50" cy="50" r="45" fill="#E56767" />
    <line
      x1="50"
      y1="30"
      x2="50"
      y2="60"
      stroke="white"
      strokeWidth="12"
      strokeLinecap="round"
    />
    <circle cx="50" cy="75" r="6" fill="white" />
  </svg>
);
