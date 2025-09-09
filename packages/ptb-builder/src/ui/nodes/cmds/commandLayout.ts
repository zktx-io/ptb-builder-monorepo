// src/ui/nodes/cmds/commandLayout.ts
// -----------------------------------------------------------------------------
// Command-node–specific layout helpers
// - Port utilities used by BaseCommand / MoveCallCommand renderers
// - Kept separate from generic node layout constants
// -----------------------------------------------------------------------------

import { useMemo } from 'react';

import type { Port, PTBNode } from '../../../ptb/graph/types';
import { ROW_SPACING, TITLE_TO_IO_GAP } from '../nodeLayout';

/** Human-friendly label fallback for a Port. */
export function labelOf(p: Port): string {
  return (p as any).label ?? p.id ?? '';
}

/** Split all ports into IO buckets (left=in, right=out). */
export function splitIO(ports: Port[]) {
  const inIO = ports.filter((p) => p.role === 'io' && p.direction === 'in');
  const outIO = ports.filter((p) => p.role === 'io' && p.direction === 'out');
  return { inIO, outIO };
}

/** Hook: extract & bucket a node's ports for command renderers. */
export function useCommandPorts(node?: PTBNode) {
  const ports: Port[] = useMemo(() => {
    const raw = (node as any)?.ports;
    return Array.isArray(raw) ? (raw as Port[]) : [];
  }, [node]);

  const { inIO, outIO } = useMemo(() => splitIO(ports), [ports]);
  return { ports, inIO, outIO };
}

/** Re-exported for convenience in command UIs that compute heights. */
export { ROW_SPACING, TITLE_TO_IO_GAP };
