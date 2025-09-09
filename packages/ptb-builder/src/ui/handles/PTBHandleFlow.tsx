// src/ui/handles/PTBHandleFlow.tsx

/** Flow handle component.
 *  - Uses fixed ids: source = FLOW_NEXT, target = FLOW_PREV.
 *  - Validates direction (next→prev), forbids self-edges, requires concrete ends.
 *  - Relies on @xyflow/react to provide v11/v12-compatible handle props.
 */

import React, { memo } from 'react';

import {
  type Connection,
  Handle,
  type HandleProps,
  type IsValidConnection,
  Position,
} from '@xyflow/react';

import { hasConcreteEnds, isFlowDirectionOK, isSelfEdge } from './handleUtils';
import { FLOW_NEXT, FLOW_PREV } from '../../ptb/portTemplates';

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

  const isValidConnection: IsValidConnection = (edgeOrConn) => {
    const c = edgeOrConn as Connection;
    if (!hasConcreteEnds(c)) return false;
    if (!isFlowDirectionOK(c)) return false;
    if (isSelfEdge(c)) return false;
    return true;
  };

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
      isValidConnection={isValidConnection}
    />
  );
});

export default PTBHandleFlow;
