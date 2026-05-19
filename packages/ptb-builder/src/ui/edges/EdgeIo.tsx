// src/ui/edges/EdgeIo.tsx

/**
 * IO edge renderer
 * - Uses a Bezier path for smooth curvature.
 * - Derives a coarse IO category for CSS from the serialized type:
 *   props.data.dataType (preferred) → source/target handle suffix.
 */

import { memo, useMemo } from 'react';

import { BaseEdge, type EdgeProps, getBezierPath } from '@xyflow/react';

import { ioCategoryOfSerialized } from '../../ptb/graph/typecheck';
import { parseHandleTypeSuffix } from '../../ptb/graph/types';
import type { RFEdgeData } from '../../ptb/ptbAdapter';
import { extractHandles } from '../handles/handleUtils';

/**
 * IO edge renderer:
 * - Uses Bezier path for smooth curves
 * - Categorizes edge by serialized type for CSS styling
 * - Memoized to avoid re-render noise
 */
export const EdgeIo = memo(function EdgeIo(props: EdgeProps) {
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

  const { source: srcH, target: tgtH } = extractHandles(props);

  const edgeData = props.data as RFEdgeData | undefined;
  const diagnosticCount = edgeData?.editorDiagnostics?.length ?? 0;

  const srcType = parseHandleTypeSuffix(srcH).typeStr;
  const tgtType = parseHandleTypeSuffix(tgtH).typeStr;
  const serializedType = edgeData?.dataType ?? srcType ?? tgtType;
  const cat = ioCategoryOfSerialized(serializedType);

  return (
    <BaseEdge
      id={id}
      path={d}
      className={[
        'ptb-io-edge',
        `ptb-io-edge--${cat}`,
        selected ? 'is-selected' : '',
        diagnosticCount > 0 ? 'has-editor-diagnostics' : '',
      ].join(' ')}
      interactionWidth={20}
      style={{
        fill: 'none',
        vectorEffect: 'non-scaling-stroke',
        cursor: 'pointer',
      }}
      aria-label={
        diagnosticCount > 0
          ? `io-edge with ${diagnosticCount} diagnostics`
          : 'io-edge'
      }
      data-edge-id={id}
    />
  );
});

export default EdgeIo;
