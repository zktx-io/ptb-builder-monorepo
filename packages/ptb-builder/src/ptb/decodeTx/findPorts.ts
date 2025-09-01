// Small helpers for discovering IO ports on a node.

import type { Port, PTBNode, PTBType } from '../graph/types';

/** Return all "io/in" ports in declaration order. */
export function firstInPorts(node?: PTBNode): Port[] {
  const ports = (node as any)?.ports as Port[] | undefined;
  if (!ports) return [];
  return ports.filter((p) => p.role === 'io' && p.direction === 'in');
}

/** Return all ports whose id starts with a prefix (no role/direction filter). */
export function outPortsWithPrefix(
  node: PTBNode | undefined,
  prefix: string,
): Port[] {
  const ports = (node as any)?.ports as Port[] | undefined;
  if (!ports) return [];
  return ports.filter((p) => p.id.startsWith(prefix));
}

/**
 * Try to find a specific "io/in" port; if missing, fall back by prefix, then by simple type predicate,
 * and finally by the first input port.
 */
export function findInPortWithFallback(
  node: PTBNode | undefined,
  preferredId: string,
  fallbackPrefix?: string,
  index?: number,
  typePredicate?: (t?: PTBType) => boolean,
): Port | undefined {
  const ports = (node as any)?.ports as Port[] | undefined;
  if (!ports?.length) return undefined;

  const exact = ports.find((p) => p.id === preferredId);
  if (exact) return exact;

  if (fallbackPrefix) {
    const prefixed = ports
      .filter(
        (p) =>
          p.role === 'io' &&
          p.direction === 'in' &&
          p.id.startsWith(fallbackPrefix),
      )
      .sort((a, b) => a.id.localeCompare(b.id));
    if (prefixed.length)
      return typeof index === 'number' ? prefixed[index] : prefixed[0];
  }

  if (typePredicate) {
    const typed = ports.filter(
      (p) =>
        p.role === 'io' && p.direction === 'in' && typePredicate(p.dataType),
    );
    if (typed.length)
      return typeof index === 'number' ? typed[index] : typed[0];
  }

  // Last resort: first input port
  const ins = firstInPorts(node);
  return ins[typeof index === 'number' ? index : 0];
}
