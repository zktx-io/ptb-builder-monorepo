import type { Port, PTBGraph, PTBNode } from './types';
import { serializePTBType } from './types';

export const findNode = (g: PTBGraph, id: string) =>
  g.nodes.find((n) => n.id === id);

export const findPort = (node: PTBNode, portId: string) =>
  node.ports.find((p) => p.id === portId);

/**
 * Build a React Flow handle id with an inline serialized type hint.
 * Result examples:
 *   - "in_coin:object<0x2::coin::Coin<0x2::sui::SUI>>"
 *   - "in_amounts:vector<number>"
 *   - "out_vec:vector<object>"
 * For non-IO handles (flow: prev/next), returns plain id without suffix.
 */
export function buildHandleId(port: Port): string {
  if (port.role !== 'io') return port.id;

  const raw =
    (port as any).typeStr ??
    (port.dataType ? serializePTBType(port.dataType) : undefined);

  const typeStr =
    typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : undefined;

  return typeStr ? `${port.id}:${typeStr}` : port.id;
}
