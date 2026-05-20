// src/ptb/graph/types.ts

export type {
  CommandKind,
  CommandNode,
  CommandRuntimeParams,
  CommandUIParams,
  EdgeKind,
  EndNode,
  NodeBase,
  NumericWidth,
  Port,
  PortDirection,
  PortRole,
  PTBEdge,
  PTBGraph,
  PTBNode,
  PTBScalar,
  PTBType,
  StartNode,
  TypeArgumentNode,
  VariableNode,
} from '@zktx.io/ptb-model';

import type { Port, PTBType } from '@zktx.io/ptb-model';

/** ------------------------------------------------------------------
 * Serialization helpers
 * - For 'option', emit `option<...>` even though the resolver may not output it now.
 * ----------------------------------------------------------------- */
export function serializePTBType(t: PTBType): string {
  switch (t.kind) {
    case 'scalar':
      return t.name;
    case 'move_numeric':
      return t.width;
    case 'vector':
      return `vector<${serializePTBType(t.elem)}>`;
    case 'option':
      return `option<${serializePTBType(t.elem)}>`;
    case 'object':
      return t.typeTag ? `object<${t.typeTag}>` : 'object';
    case 'tuple':
      return `(${t.elems.map(serializePTBType).join(',')})`;
    case 'unknown':
      return t.debugInfo ? `unknown (${t.debugInfo})` : 'unknown';
    default: {
      const _exhaustive: never = t;
      return String(_exhaustive);
    }
  }
}

/**
 * Build a stable React Flow handle id for IO ports using a coarse type suffix.
 *
 * Rationale:
 * - Keep IDs stable across ABI changes while still preventing obvious mis-wires.
 * - Use only broad categories so UI badges can be rich, but edges don’t break.
 *
 * Policy (suffix examples):
 * - Non-IO ports (flow) → return plain id.
 * - object<T> → `${id}:object`   (drop concrete typeTag)
 * - scalar(name) → `${id}:${name}`  where name ∈ { address | bool | string | number | id }
 * - move_numeric (u8..u256) → `${id}:number`
 * - vector<scalar|move_numeric|object> → `${id}:vector<...>` as above
 * - option<scalar|move_numeric|object> → `${id}:option<...>` as above
 * - Complex shapes (tuple/unknown/nested vectors/option<vector<...>> etc.) → use base id
 */
export function buildHandleId(port: Port): string {
  if (port.role !== 'io') return port.id;

  const t = port.dataType;
  if (!t) return port.id;

  const base = port.id;

  switch (t.kind) {
    case 'object':
      // Drop concrete type tags to avoid mismatches like object<0x2::…>
      return `${base}:object`;

    case 'scalar':
      // address | bool | string | number | id
      return `${base}:${t.name}`;

    case 'move_numeric':
      // Normalize all Move numerics to number
      return `${base}:number`;

    case 'vector': {
      const e = t.elem;
      if (e.kind === 'scalar') {
        return `${base}:vector<${e.name}>`; // e.g. vector<number>, vector<address>
      }
      if (e.kind === 'move_numeric') {
        return `${base}:vector<${e.width}>`;
      }
      // For nested/complex vectors, keep id stable without suffix
      return base;
    }

    case 'option': {
      const e = t.elem;
      if (e.kind === 'scalar') {
        return `${base}:option<${e.name}>`;
      }
      if (e.kind === 'move_numeric') {
        return `${base}:option<${e.width}>`;
      }
      return base;
    }

    // tuple/unknown → no suffix
    default:
      return base;
  }
}

/** Parse "handleId[:TypeString]" into base id and optional type string. */
export function parseHandleTypeSuffix(handleId?: string): {
  baseId?: string;
  typeStr?: string;
} {
  if (!handleId) return { baseId: undefined, typeStr: undefined };
  const raw = String(handleId);
  const idx = raw.indexOf(':');
  if (idx < 0) return { baseId: raw, typeStr: undefined };
  return { baseId: raw.slice(0, idx), typeStr: raw.slice(idx + 1) };
}
