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

import type { PTBType } from '@zktx.io/ptb-model';

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
