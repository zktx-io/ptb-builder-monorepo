import React from 'react';

export const IconDice = ({
  className = 'w-6 h-6 text-gray-800 dark:text-white',
  isDarkMode = false,
  ...props
}: React.SVGProps<SVGSVGElement> & { isDarkMode?: boolean }) => {
  const eyeColor = isDarkMode ? 'black' : 'white';

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      className={className}
      {...props}
    >
      <path
        d="
        M10,10 h68 
        a12,12 0 0,1 12,12 
        v56 
        a12,12 0 0,1 -12,12 
        h-56 
        a12,12 0 0,1 -12,-12 
        v-56 
        a12,12 0 0,1 12,-12 
        z
        M18,30 a10,10 0 1,1 20,0 a10,10 0 1,1 -20,0
        M41,50 a10,10 0 1,1 20,0 a10,10 0 1,1 -20,0
        M63,30 a10,10 0 1,1 20,0 a10,10 0 1,1 -20,0
        M18,70 a10,10 0 1,1 20,0 a10,10 0 1,1 -20,0
        M63,70 a10,10 0 1,1 20,0 a10,10 0 1,1 -20,0
      "
        fill-rule="evenodd"
        fill="currentColor"
      />
    </svg>
  );
};
