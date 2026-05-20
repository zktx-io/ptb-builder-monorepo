import React, { useCallback } from 'react';

import {
  type Connection,
  Handle,
  type HandleProps,
  type IsValidConnection,
  Position,
  useStoreApi,
} from '@xyflow/react';

import { findPortFromStore, hasConcreteEnds, isSelfEdge } from './handleUtils';

type PTBHandleTypeProps = Omit<HandleProps, 'type' | 'position' | 'id'> & {
  id: string;
  direction: 'in' | 'out';
  position: Position;
  label?: string;
};

function canConnectTypeEnds(
  sourcePort: ReturnType<typeof findPortFromStore>,
  targetPort: ReturnType<typeof findPortFromStore>,
): boolean {
  return (
    sourcePort?.role === 'type' &&
    sourcePort.direction === 'out' &&
    targetPort?.role === 'type' &&
    targetPort.direction === 'in'
  );
}

function PTBHandleTypeComponent({
  id,
  direction,
  position,
  label,
  className,
  style,
  ...rest
}: PTBHandleTypeProps) {
  const store = useStoreApi();
  const isLeft = position === Position.Left;

  const isValidConnection: IsValidConnection = useCallback(
    (edgeOrConn) => {
      const conn = edgeOrConn as Connection;
      if (!hasConcreteEnds(conn)) return false;
      if (isSelfEdge(conn)) return false;

      const state = store.getState() as {
        nodes?: unknown[];
      };
      const nodes = Array.isArray(state.nodes) ? state.nodes : [];
      const sourcePort = findPortFromStore(
        nodes as Parameters<typeof findPortFromStore>[0],
        conn.source!,
        conn.sourceHandle ?? undefined,
      );
      const targetPort = findPortFromStore(
        nodes as Parameters<typeof findPortFromStore>[0],
        conn.target!,
        conn.targetHandle ?? undefined,
      );

      return canConnectTypeEnds(sourcePort, targetPort);
    },
    [store],
  );

  return (
    <Handle
      {...rest}
      id={id}
      type={direction === 'in' ? 'target' : 'source'}
      position={position}
      className={[
        'ptb-handle',
        'ptb-handle--type',
        `ptb-handle--${direction === 'in' ? 'in' : 'out'}`,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        width: 12,
        height: 12,
        overflow: 'visible',
        ...(style || {}),
      }}
      title={label ?? id}
      aria-label={`type handle ${id}`}
      isValidConnection={isValidConnection}
    >
      {label ? (
        <div
          className={`ptb-handle-label absolute ${isLeft ? 'ptb-handle-label--left' : 'ptb-handle-label--right'} text-xxxs`}
          data-ptb-handle-label={id}
        >
          {label}
        </div>
      ) : undefined}
    </Handle>
  );
}

export const PTBHandleType = React.memo(PTBHandleTypeComponent);
export default PTBHandleType;
