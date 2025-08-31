// src/ui/handles/PTBHandleFlow.tsx
import React, { memo } from 'react';

import {
  type Connection,
  Handle,
  type HandleProps,
  type IsValidConnection,
  Position,
} from '@xyflow/react';

import { hasConcreteEnds, isFlowDirectionOK, isSameNode } from './handleUtils';
import { FLOW_NEXT, FLOW_PREV } from '../../ptb/portTemplates';

/** Module-scoped validator for flow edges (next -> prev only). */
const isFlowConnectionValid: IsValidConnection = (edgeOrConn) => {
  const c = edgeOrConn as Connection;
  if (!hasConcreteEnds(c)) return false;
  if (isSameNode(c)) return false;
  return isFlowDirectionOK(c);
};

type PTBHandleFlowProps = Omit<HandleProps, 'type' | 'position' | 'id'> & {
  type: 'source' | 'target';
};

/** Flow handle — relies on XYFlow generating handle ids for source/target. */
export const PTBHandleFlow = memo(function PTBHandleFlow({
  type, // 'source' | 'target'
  className,
  style,
  ...rest
}: PTBHandleFlowProps) {
  const id = type === 'source' ? FLOW_NEXT : FLOW_PREV;
  const position = type === 'source' ? Position.Right : Position.Left;

  return (
    <Handle
      {...rest}
      aria-label={type === 'source' ? 'flow source' : 'flow target'}
      type={type}
      id={id}
      position={position}
      className={['ptb-handle', 'ptb-handle--flow', className]
        .filter(Boolean)
        .join(' ')}
      style={style}
      isValidConnection={isFlowConnectionValid}
    />
  );
});

export default PTBHandleFlow;
