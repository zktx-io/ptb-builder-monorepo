// src/ui/nodes/cmds/commandLayout.ts
// -----------------------------------------------------------------------------
// Command-node–specific layout helpers
// - Port utilities used by BaseCommand / MoveCallCommand renderers
// - Kept separate from generic node layout constants
// -----------------------------------------------------------------------------

import { useMemo } from 'react';

import type { Port, PTBNode } from '../../../ptb/graph/types';

/** Human-friendly label fallback for a Port. */
export function labelOf(p: Port): string {
  return p.label ?? p.id ?? '';
}

/** Split ports into renderer buckets. */
function splitPorts(ports: Port[]) {
  const inIO = ports.filter((p) => p.role === 'io' && p.direction === 'in');
  const outIO = ports.filter((p) => p.role === 'io' && p.direction === 'out');
  const inType = ports.filter((p) => p.role === 'type' && p.direction === 'in');
  return { inIO, outIO, inType };
}

/** Hook: extract & bucket a node's ports for command renderers. */
export function useCommandPorts(node?: PTBNode) {
  const ports: Port[] = useMemo(() => {
    const raw = node?.ports;
    return Array.isArray(raw) ? raw : [];
  }, [node]);

  const { inIO, outIO, inType } = useMemo(() => splitPorts(ports), [ports]);
  return { inIO, outIO, inType };
}
