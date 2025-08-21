// src/ui/nodes/cmds/BaseCommand/BaseCommand.tsx
import React, { useMemo } from 'react';

import type { Node, NodeProps, Position } from '@xyflow/react';
import { Position as RFPos } from '@xyflow/react';

import type { Port, PTBNode } from '../../../../ptb/graph/types';
import { PTBHandleFlow } from '../../../handles/PTBHandleFlow';
import { PTBHandleIO } from '../../../handles/PTBHandleIO';

export type BaseCmdData = {
  label?: string;
  ptbNode?: PTBNode;
};
export type BaseCmdRFNode = Node<BaseCmdData, 'ptb-cmd'>;

/** Per-row vertical spacing for IO handles (in px). */
const ROW_SPACING = 24;
/** Top offset where IO rows start (below title). */
const IO_TOP_OFFSET = 40;
/** Horizontal gap between handle circle and its label (in px). */
const LABEL_GAP = 8;

/** Returns a friendly label for a port */
function labelOf(p: Port): string {
  return (p.label as string) || (p as any).name || p.id || '';
}

/**
 * Render a command node:
 * - Input handles pinned on the left; output handles on the right.
 * - Each handle gets a side label aligned vertically with the handle.
 * - Node height auto-grows to fit the larger of input/output counts.
 * - Flow handles are always present and visually pinned near top by their own components.
 */
export function BaseCommand({ data }: NodeProps<BaseCmdRFNode>) {
  const node = data?.ptbNode as PTBNode | undefined;

  // Memoize ports to avoid changing deps of in/out filtering on every render.
  const ports: Port[] = useMemo(() => {
    const raw = (node as any)?.ports;
    return Array.isArray(raw) ? (raw as Port[]) : [];
  }, [node]);

  const inIO = useMemo(
    () => ports.filter((p) => p.role === 'io' && p.direction === 'in'),
    [ports],
  );
  const outIO = useMemo(
    () => ports.filter((p) => p.role === 'io' && p.direction === 'out'),
    [ports],
  );

  // Compute dynamic height from the larger of input/output counts.
  const rowCount = Math.max(inIO.length, outIO.length);
  const dynamicHeight =
    IO_TOP_OFFSET + (rowCount > 0 ? rowCount * ROW_SPACING : 0) + 16; // bottom padding

  // Helper to compute the vertical "top" per row index.
  const topForRow = (idx: number) => IO_TOP_OFFSET + idx * ROW_SPACING;

  return (
    <div className="ptb-node--command">
      {/* The shell is relative; children (handles/labels) can be absolutely positioned */}
      <div
        className="ptb-node-shell rounded-lg w-[280px] px-2 py-2 border-2 shadow relative"
        style={{ minHeight: dynamicHeight }}
      >
        {/* Title */}
        <p className="text-sm text-center text-gray-800 dark:text-gray-200 select-none">
          {data?.label ?? (node as any)?.label ?? 'Command'}
        </p>

        {/* Flow handles: previous (target) + next (source).
            These components should render near the top by their own internal positioning. */}
        <PTBHandleFlow type="target" />
        <PTBHandleFlow type="source" />

        {/* ---- INPUT IO (left) ---- */}
        {inIO.map((port, idx) => {
          const top = topForRow(idx);
          return (
            <PTBHandleIO
              key={port.id}
              port={port}
              position={RFPos.Left as Position}
              style={{ top }}
              label={labelOf(port)}
            />
          );
        })}

        {/* ---- OUTPUT IO (right) ---- */}
        {outIO.map((port, idx) => {
          const top = topForRow(idx);
          return (
            <PTBHandleIO
              key={port.id}
              port={port}
              position={RFPos.Right as Position}
              style={{ top }}
              label={labelOf(port)}
            />
          );
        })}
      </div>
    </div>
  );
}

export default React.memo(BaseCommand);
