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
export { serializePTBType } from '@zktx.io/ptb-model';

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
