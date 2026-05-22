// src/ptb/graph/types.ts

import type {
  CommandKind,
  CommandRuntimeParams,
  EdgeKind,
  EndNode,
  CommandNode as ModelCommandNode,
  PTBGraph as ModelPTBGraph,
  PTBNode as ModelPTBNode,
  NodeBase,
  NumericWidth,
  Port,
  PortDirection,
  PortRole,
  PTBEdge,
  PTBScalar,
  PTBType,
  StartNode,
  TypeArgumentNode,
  VariableNode,
} from '@zktx.io/ptb-model';

export type {
  CommandKind,
  CommandRuntimeParams,
  EdgeKind,
  EndNode,
  NodeBase,
  NumericWidth,
  Port,
  PortDirection,
  PortRole,
  PTBEdge,
  PTBScalar,
  PTBType,
  StartNode,
  TypeArgumentNode,
  VariableNode,
};
export { serializePTBType } from '@zktx.io/ptb-model';

export type CommandUIParams = Partial<
  Record<
    'amountsCount' | 'sourcesCount' | 'objectsCount' | 'elemsCount',
    number
  >
>;

export type CanonicalPTBGraph = ModelPTBGraph;
export type CanonicalPTBNode = ModelPTBNode;

export interface CommandNode extends Omit<ModelCommandNode, 'params'> {
  params?: {
    ui?: CommandUIParams;
    runtime?: CommandRuntimeParams;
  };
}

export type PTBNode =
  | StartNode
  | EndNode
  | CommandNode
  | VariableNode
  | TypeArgumentNode;

export interface PTBGraph {
  nodes: PTBNode[];
  edges: PTBEdge[];
}

export function toModelPTBGraph(graph: PTBGraph): ModelPTBGraph {
  return {
    nodes: graph.nodes.map(toModelPTBNode),
    edges: graph.edges.map((edge) => omitUndefinedFields(edge)),
  };
}

function toModelPTBNode(node: PTBNode): ModelPTBNode {
  const ports = node.ports.map((port) => omitUndefinedFields(port));
  const position = node.position ? { ...node.position } : undefined;
  if (node.kind !== 'Command') {
    return omitUndefinedFields({
      ...node,
      ports,
      ...(position !== undefined ? { position } : {}),
    }) as ModelPTBNode;
  }
  const { params: _params, ...rest } = node;
  const runtime = node.params?.runtime;
  const cleanRuntime =
    runtime !== undefined ? omitUndefinedFields(runtime) : undefined;
  return omitUndefinedFields({
    ...rest,
    ports,
    ...(position !== undefined ? { position } : {}),
    ...(cleanRuntime !== undefined
      ? { params: { runtime: cleanRuntime } }
      : {}),
  }) as ModelPTBNode;
}

function omitUndefinedFields<T extends object>(value: T): T {
  const entries = Object.entries(value).filter(
    ([, item]) => item !== undefined,
  );
  return Object.fromEntries(entries) as T;
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
