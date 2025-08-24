import React, { useMemo } from 'react';

import { BaseEdge, type EdgeProps, getBezierPath } from '@xyflow/react';

import { typeOf } from './utils';
import type { RFEdgeData } from '../../adapters/ptbAdapter';
import { ioCategoryOfSerialized } from '../../ptb/graph/typecheck';

function IoEdgeImpl(props: EdgeProps) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    selected,
  } = props;

  const [d] = useMemo(
    () =>
      getBezierPath({
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourcePosition,
        targetPosition,
      }),
    [sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition],
  );

  // v11 (sourceHandle/targetHandle) and v12 (sourceHandleId/targetHandleId)
  const srcH: string | undefined =
    (props as any).sourceHandleId ??
    // v11 fallback
    (props as any).sourceHandle ??
    undefined;

  const tgtH: string | undefined =
    (props as any).targetHandleId ??
    // v11 fallback
    (props as any).targetHandle ??
    undefined;

  // Narrow edge data to our payload shape
  const edgeData = props.data as RFEdgeData | undefined;

  // Prefer source handle's type; then target; then edge.data.dataType
  const serializedType = typeOf(srcH) ?? typeOf(tgtH) ?? edgeData?.dataType;

  const cat = ioCategoryOfSerialized(serializedType);

  return (
    <BaseEdge
      id={id}
      path={d}
      className={`ptb-io-edge ptb-io-edge--${cat}${selected ? ' is-selected' : ''}`}
      interactionWidth={20}
      style={{
        fill: 'none',
        vectorEffect: 'non-scaling-stroke',
        cursor: 'pointer',
      }}
    />
  );
}

export const IoEdge = React.memo(IoEdgeImpl);
export default IoEdge;
