import React from 'react';

import {
  type Connection,
  Handle,
  type HandleProps,
  type IsValidConnection,
  Position,
} from '@xyflow/react';

/** Strip optional ":type" suffix from a handle id. */
const base = (h: string | null | undefined) => String(h ?? '').split(':')[0];

/**
 * Module-scoped validator so its reference is stable across renders.
 * No hook needed; avoids re-creating the function each render.
 */
const isFlowConnectionValid: IsValidConnection = (edgeOrConn) => {
  const c = edgeOrConn as Connection;
  const sh = base((c as any).sourceHandle);
  const th = base((c as any).targetHandle);
  const src = c.source ?? undefined;
  const tgt = c.target ?? undefined;

  if (!src || !tgt) return false;
  if (src === tgt) return false;

  // Flow must connect next -> prev
  return sh === 'next' && th === 'prev';
};

export function PTBHandleFlow({
  type, // 'source' | 'target'
  className,
  style,
  ...rest
}: Omit<HandleProps, 'type' | 'position' | 'id'> & {
  type: 'source' | 'target';
}) {
  // These are trivial computations; memoization is unnecessary.
  const id = type === 'source' ? 'next' : 'prev';
  const position = type === 'source' ? Position.Right : Position.Left;

  return (
    <Handle
      {...rest}
      type={type}
      id={id}
      position={position}
      className={['ptb-handle', 'ptb-handle--flow', className]
        .filter(Boolean)
        .join(' ')}
      style={{
        // Small inline style object; recreating each render is fine.
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
        style={{
          // Decorative label; doesn't intercept pointer events.
          position: 'absolute',
          fontSize: '8px',
          pointerEvents: 'none',
        }}
      >
        {type === 'source' ? 'SRC' : 'TGT'}
      </span>
    </Handle>
  );
}

export default React.memo(PTBHandleFlow);
