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
 * - For non-IO handles (flow: prev/next), returns plain id without suffix.
 * - We intentionally ignore `port.typeStr` here; it is for UI badges only.
 *   This keeps handle types stable for compatibility and coloring.
 *   (e.g., type-parameter ports display "T0" via `typeStr`, but their handle
 *    type is serialized from `dataType` = "string".)
 */
export function buildHandleId(port: Port): string {
  if (port.role !== 'io') return port.id;

  // Always derive the handle type from the structured PTBType.
  const raw = port.dataType ? serializePTBType(port.dataType) : undefined;

  const typeStr =
    typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : undefined;

  return typeStr ? `${port.id}:${typeStr}` : port.id;
}
