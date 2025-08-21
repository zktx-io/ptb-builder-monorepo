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

/** Layout constants */
const FLOW_TOP = 16; // px: flow handles vertical position (fixed)
const ROW_SPACING = 24; // px: per-row spacing for IO handles
const TITLE_TO_IO_GAP = 40; // px: title area + gap before first IO row
const BOTTOM_PADDING = 16; // px: extra bottom pad

/** Label helper */
function labelOf(p: Port): string {
  return (p as any).label || (p as any).name || p.id || '';
}

/** Ordering: order -> label -> id (stable, locale-aware for label) */
function sortPorts(a: Port, b: Port) {
  const ao = (a as any).order as number | undefined;
  const bo = (b as any).order as number | undefined;
  if (typeof ao === 'number' || typeof bo === 'number') {
    if (typeof ao !== 'number') return 1;
    if (typeof bo !== 'number') return -1;
    if (ao !== bo) return ao - bo;
  }
  const al = labelOf(a);
  const bl = labelOf(b);
  if (al && bl && al !== bl) return al.localeCompare(bl);
  return a.id.localeCompare(b.id);
}

/** First IO row top offset (below title, independent of flow handles) */
const ioTopForIndex = (idx: number) => TITLE_TO_IO_GAP + idx * ROW_SPACING;

export function BaseCommand({ data }: NodeProps<BaseCmdRFNode>) {
  const node = data?.ptbNode as PTBNode | undefined;

  // Ports memo
  const ports: Port[] = useMemo(() => {
    const raw = (node as any)?.ports;
    return Array.isArray(raw) ? (raw as Port[]) : [];
  }, [node]);

  // Split + sort
  const inIO = useMemo(
    () =>
      ports
        .filter((p) => p.role === 'io' && p.direction === 'in')
        .sort(sortPorts),
    [ports],
  );
  const outIO = useMemo(
    () =>
      ports
        .filter((p) => p.role === 'io' && p.direction === 'out')
        .sort(sortPorts),
    [ports],
  );

  // Dynamic height
  const rowCount = Math.max(inIO.length, outIO.length);
  const minHeight =
    TITLE_TO_IO_GAP +
    (rowCount > 0 ? rowCount * ROW_SPACING : 0) +
    BOTTOM_PADDING;

  return (
    <div className="ptb-node--command">
      <div
        className="ptb-node-shell rounded-lg w-[200px] px-2 py-2 border-2 shadow relative"
        style={{ minHeight }}
      >
        {/* Title */}
        <p className="text-sm text-center text-gray-800 dark:text-gray-200 select-none">
          {data?.label ?? (node as any)?.label ?? 'Command'}
        </p>

        {/* Flow handles – fixed top position */}
        <PTBHandleFlow type="target" style={{ top: FLOW_TOP }} />
        <PTBHandleFlow type="source" style={{ top: FLOW_TOP }} />

        {/* INPUT IO (left) */}
        {inIO.map((port, idx) => (
          <PTBHandleIO
            key={port.id}
            port={port}
            position={RFPos.Left as Position}
            style={{ top: ioTopForIndex(idx) }}
            label={labelOf(port)}
          />
        ))}

        {/* OUTPUT IO (right) */}
        {outIO.map((port, idx) => (
          <PTBHandleIO
            key={port.id}
            port={port}
            position={RFPos.Right as Position}
            style={{ top: ioTopForIndex(idx) }}
            label={labelOf(port)}
          />
        ))}
      </div>
    </div>
  );
}

export default React.memo(BaseCommand);
