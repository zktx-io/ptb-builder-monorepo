// src/ui/edges/EdgeFlow.tsx

/**
 * Flow edge renderer
 * - Memoizes Bezier path to avoid unnecessary recalculation.
 * - Wide interactionWidth improves hit testing.
 * - Styling driven by CSS classes (selected state appended).
 */

import { memo, useMemo } from 'react';

import { BaseEdge, type EdgeProps, getBezierPath } from '@xyflow/react';

import type { RFEdgeData } from '../../ptb/ptbAdapter';

export const EdgeFlow = memo(function EdgeFlow(props: EdgeProps) {
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
  const edgeData = props.data as RFEdgeData | undefined;
  const diagnosticCount = edgeData?.editorDiagnostics?.length ?? 0;

  return (
    <BaseEdge
      id={id}
      path={d}
      className={[
        'ptb-flow-edge',
        selected ? 'is-selected' : '',
        diagnosticCount > 0 ? 'has-editor-diagnostics' : '',
      ].join(' ')}
      interactionWidth={24}
      style={{
        fill: 'none',
        vectorEffect: 'non-scaling-stroke',
        cursor: 'pointer',
      }}
      aria-label={
        diagnosticCount > 0
          ? `flow-edge with ${diagnosticCount} diagnostics`
          : 'flow-edge'
      }
      data-edge-id={id}
    />
  );
});

export default EdgeFlow;
