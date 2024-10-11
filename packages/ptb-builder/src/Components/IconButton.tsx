import React from 'react';

interface IconButtonProps {
  onClick: () => void;
  children: React.ReactNode;
}

export const IconButton = ({ onClick, children }: IconButtonProps) => {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: 0,
        margin: 0,
      }}
      aria-label="close"
    >
      {children}
    </button>
  );
};
