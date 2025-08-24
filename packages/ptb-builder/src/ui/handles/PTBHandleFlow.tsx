// src/ui/nodes/handles/PTBHandleFlow.tsx
import React from 'react';

import {
  type Connection,
  Handle,
  type HandleProps,
  type IsValidConnection,
  Position,
} from '@xyflow/react';

import { hasConcreteEnds, isFlowDirectionOK, isSameNode } from './handleUtils';
import { FLOW_NEXT, FLOW_PREV } from '../../ptb/portTemplates';

/** Stable, module-scoped validator for flow edges (next -> prev only). */
const isFlowConnectionValid: IsValidConnection = (edgeOrConn) => {
  const c = edgeOrConn as Connection;
  if (!hasConcreteEnds(c)) return false;
  if (isSameNode(c)) return false;
  return isFlowDirectionOK(c);
};

export function PTBHandleFlow({
  type, // 'source' | 'target'
  className,
  style,
  ...rest
}: Omit<HandleProps, 'type' | 'position' | 'id'> & {
  type: 'source' | 'target';
}) {
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
      style={{
        width: 18,
        height: 10,
        borderRadius: 0,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        ...style,
      }}
      isValidConnection={isFlowConnectionValid}
    >
      <span
        className="text-base text-gray-600 dark:text-gray-400"
        style={{ position: 'absolute', fontSize: '8px', pointerEvents: 'none' }}
      >
        {type === 'source' ? 'SRC' : 'TGT'}
      </span>
    </Handle>
  );
}

export default React.memo(PTBHandleFlow);
