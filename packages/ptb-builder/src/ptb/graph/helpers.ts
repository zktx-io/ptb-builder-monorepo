// helpers.ts
import type { Port, PTBGraph, PTBNode } from './types';
import { serializePTBType } from './types';

export const findNode = (g: PTBGraph, id: string) =>
  g.nodes.find((n) => n.id === id);

export const findPort = (node: PTBNode, portId: string) =>
  node.ports.find((p) => p.id === portId);

/** Build handle id string with type hint, e.g. "in_coin:object<...>" */
export const buildHandleId = (port: Port): string => {
  const typeStr = port.dataType ? serializePTBType(port.dataType) : '';
  return `${port.id}${typeStr ? `:${typeStr}` : ''}`;
};
