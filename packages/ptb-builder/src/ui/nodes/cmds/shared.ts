import { useMemo } from 'react';

import { Port, PTBNode } from '../../../ptb/graph/types';

export const FLOW_TOP = 16;
export const ROW_SPACING = 24;
export const TITLE_TO_IO_GAP = 40;
export const BOTTOM_PADDING = 16;

export function labelOf(p: Port): string {
  return (p as any).label ?? p.id ?? '';
}

export const ioTopForIndex = (idx: number, offset?: number) =>
  TITLE_TO_IO_GAP + (offset ?? 0) + idx * ROW_SPACING;

export function splitIO(ports: Port[]) {
  const inIO = ports.filter((p) => p.role === 'io' && p.direction === 'in');
  const outIO = ports.filter((p) => p.role === 'io' && p.direction === 'out');
  return { inIO, outIO };
}

export function minHeightFor(inCount: number, outCount: number, extraGap = 0) {
  const rowCount = Math.max(inCount, outCount);
  return (
    TITLE_TO_IO_GAP +
    extraGap +
    (rowCount > 0 ? rowCount * ROW_SPACING : 0) +
    BOTTOM_PADDING
  );
}

export function useCommandPorts(node?: PTBNode) {
  const ports: Port[] = useMemo(() => {
    const raw = (node as any)?.ports;
    return Array.isArray(raw) ? (raw as Port[]) : [];
  }, [node]);

  const { inIO, outIO } = useMemo(() => splitIO(ports), [ports]);
  return { ports, inIO, outIO };
}
