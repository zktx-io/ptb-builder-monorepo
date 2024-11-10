import type { HTMLAttributes, ReactNode } from 'react';
import React from 'react';

import type { PanelPosition } from '@xyflow/system';

export type PanelProps = HTMLAttributes<HTMLDivElement> & {
  /** Set position of the panel
   * @example 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right'
   */
  position?: PanelPosition;
  children: ReactNode;
};

export const Panel = ({
  position = 'top-left',
  children,
  className,
  style,
  ...rest
}: PanelProps) => {
  const positionClasses = `${position}`.split('-');

  return (
    <div
      className="react-flow__panel top right"
      style={{ ...style, pointerEvents: 'none' }}
      {...rest}
    >
      {children}
    </div>
  );
};
