import React from 'react';

export const IconBan = ({
  className = 'w-6 h-6 text-gray-800 dark:text-white',
  ...props
}: React.SVGProps<SVGSVGElement>) => (
  <svg
    className={className}
    aria-hidden="true"
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      stroke="currentColor"
      stroke-linecap="round"
      stroke-width="2"
      d="m6 6 12 12m3-6a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
    />
  </svg>
);
