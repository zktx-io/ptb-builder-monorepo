// src/ptb/graph/helpers.ts
import type { Port, PTBGraph, PTBNode } from './types';
import { serializePTBType } from './types';

export const findNode = (g: PTBGraph, id: string) =>
  g.nodes.find((n) => n.id === id);

export const findPort = (node: PTBNode, portId: string) =>
  node.ports.find((p) => p.id === portId);

/**
 * Build a React Flow handle id with an inline serialized type hint.
 * Examples:
 *   - "in_coin:object<0x2::coin::Coin<0x2::sui::SUI>>"
 *   - "in_amounts:vector<number>"
 *   - "out_vec:vector<object>"
 *
 * Notes:
 * - For non-IO handles (flow: prev/next), returns the plain id without suffix.
 * - We intentionally ignore `port.typeStr` here; it's only for UI badges.
 * - If `dataType.kind === 'typeparam'`, the handle suffix will be that name
 *   (e.g., "T0"). For coloring/grouping, typenames like "T0" are mapped to
 *   'unknown' downstream (see ioCategoryOf/ioCategoryOfSerialized).
 */
export function buildHandleId(port: Port): string {
  if (port.role !== 'io') return port.id;

  // Always derive the handle type from the structured PTBType.
  const raw = port.dataType ? serializePTBType(port.dataType) : undefined;

  const typeStr =
    typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : undefined;

  return typeStr ? `${port.id}:${typeStr}` : port.id;
}
