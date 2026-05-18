import type { Port, PTBNode } from './graph/types';

/** Return all "io/in" ports in declaration order. */
export function inputIoPorts(node?: PTBNode): Port[] {
  const ports = node?.ports;
  if (!ports) return [];
  return ports.filter((p) => p.role === 'io' && p.direction === 'in');
}

/** Return all ports whose id starts with a prefix. */
export function outPortsWithPrefix(
  node: PTBNode | undefined,
  prefix: string,
): Port[] {
  const ports = node?.ports;
  if (!ports) return [];
  return ports.filter((p) => p.id.startsWith(prefix));
}
