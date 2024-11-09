import type { HTMLAttributes, ReactNode } from 'react';
import React from 'react';

import type { PanelPosition } from '@xyflow/system';
import cc from 'classcat';

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
      className={cc(['react-flow__panel', className, ...positionClasses])}
      style={{ ...style, pointerEvents: 'none' }}
      {...rest}
    >
      {children}
    </div>
  );
};
