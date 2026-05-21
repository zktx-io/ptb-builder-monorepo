import { graphCommandInputSlot } from './commandSemantics.js';
import { indexedInputHandleIndex } from './handles.js';
import { graphCommandRuntimeParams } from './moveCallEvidence.js';
import {
  type AnalyzePTBGraphOptions,
  type CommandNode,
  freezePTBGraph,
  type Port,
  type PTBGraph,
  type PTBNode,
  type PTBType,
  type VariableNode,
} from './types.js';
import {
  commandInputSlotExpectation,
  inputArgumentKindCanCarryType,
} from '../inputTypeEvidence.js';
import { normalizeMovePackageSignatureEvidenceOption } from '../move/evidence.js';
import { ptbTypesEqual } from '../ptbType.js';
import { parseMoveTypeTag } from '../raw/types.js';
import { cloneJsonLike } from '../utils.js';

export interface GraphInputTypeInferenceOptions
  extends Pick<AnalyzePTBGraphOptions, 'moveSignatures'> {}

export interface GraphInputTypeInference {
  nodeId: string;
  from: PTBType;
  to: PTBType;
}

export interface GraphInputTypeInferenceResult {
  graph: PTBGraph;
  inferences: readonly GraphInputTypeInference[];
}

type InferenceCandidate = {
  type: PTBType;
};

/**
 * Infers only graph input node types from concrete consumer-side command
 * information. It does not synthesize values, rawInput payloads, command ports,
 * edges, or React Flow display state.
 */
export function inferGraphInputTypes(
  graph: PTBGraph,
  options: GraphInputTypeInferenceOptions = {},
): GraphInputTypeInferenceResult {
  const moveSignatures = normalizeMovePackageSignatureEvidenceOption(
    options.moveSignatures,
  );
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const typeArgumentsByMoveCall = collectTypeArgumentsByMoveCall(
    graph,
    nodesById,
  );
  const candidatesByVariable = new Map<string, InferenceCandidate[]>();

  graph.edges.forEach((edge) => {
    if (edge.kind !== 'io') return;
    const source = nodesById.get(edge.source);
    const target = nodesById.get(edge.target);
    if (source?.kind !== 'Variable' || target?.kind !== 'Command') return;

    const targetType = commandInputType(
      target,
      edge.targetHandle,
      typeArgumentsByMoveCall.get(target.id),
      moveSignatures,
    );
    if (!targetType || targetType.kind === 'unknown') return;
    if (!variableSourceCanCarryType(source, targetType)) return;

    const candidates = candidatesByVariable.get(source.id) ?? [];
    candidates.push({ type: targetType });
    candidatesByVariable.set(source.id, candidates);
  });

  const inferredByVariable = new Map<string, PTBType>();
  candidatesByVariable.forEach((candidates, nodeId) => {
    const first = candidates[0]?.type;
    if (!first) return;
    if (
      !candidates.every((candidate) => ptbTypesEqual(candidate.type, first))
    ) {
      return;
    }
    inferredByVariable.set(nodeId, first);
  });

  const inferences: GraphInputTypeInference[] = [];
  const nextNodes = graph.nodes.map((node) => {
    if (node.kind !== 'Variable') return node;
    if (node.varType.kind !== 'unknown') return node;
    const inferred = inferredByVariable.get(node.id);
    if (!inferred) return node;

    inferences.push({
      nodeId: node.id,
      from: node.varType,
      to: inferred,
    });
    return variableNodeWithType(node, inferred);
  });

  if (inferences.length === 0) {
    return { graph, inferences };
  }

  return {
    graph: freezePTBGraph({
      nodes: nextNodes.map((node) => cloneJsonLike(node)),
      edges: graph.edges.map((edge) => cloneJsonLike(edge)),
    }),
    inferences,
  };
}

function collectTypeArgumentsByMoveCall(
  graph: PTBGraph,
  nodesById: ReadonlyMap<string, PTBNode>,
): Map<string, Map<number, string>> {
  const result = new Map<string, Map<number, string>>();

  graph.edges.forEach((edge) => {
    if (edge.kind !== 'type') return;
    const source = nodesById.get(edge.source);
    const target = nodesById.get(edge.target);
    if (source?.kind !== 'TypeArgument') return;
    if (target?.kind !== 'Command' || target.command !== 'moveCall') return;

    const index = indexedInputHandleIndex(edge.targetHandle, 'type');
    const typeArgument = parseMoveTypeTag(source.value);
    if (index === undefined || typeArgument === undefined) return;

    const typeArguments = result.get(target.id) ?? new Map<number, string>();
    typeArguments.set(index, typeArgument);
    result.set(target.id, typeArguments);
  });

  return result;
}

function commandInputType(
  node: CommandNode,
  targetHandle: string,
  typeArgumentsByIndex: ReadonlyMap<number, string> | undefined,
  moveSignatures: AnalyzePTBGraphOptions['moveSignatures'],
): PTBType | undefined {
  const resolution = graphCommandInputSlot(node.command, targetHandle, {
    moveSignatures,
    runtime: graphCommandRuntimeParams(node),
    typeArgumentsByIndex,
  });
  if (resolution?.kind === 'blocked') return undefined;
  const slot = resolution?.slot;
  const semantic = slot
    ? commandInputSlotExpectation(slot)?.ptbType
    : undefined;
  if (semantic && semantic.kind !== 'unknown') return semantic;
  if (slot) return undefined;

  const declared = declaredInputPortType(node, targetHandle);
  if (declared && declared.kind !== 'unknown') return declared;

  return undefined;
}

function declaredInputPortType(
  node: CommandNode,
  targetHandle: string,
): PTBType | undefined {
  return node.ports.find(
    (port) =>
      port.id === targetHandle && port.role === 'io' && port.direction === 'in',
  )?.dataType;
}

function variableSourceCanCarryType(
  node: VariableNode,
  type: PTBType,
): boolean {
  if (node.semantic?.kind === 'GasCoin') return false;
  if (node.semantic?.kind === 'UnsupportedInput') return false;
  if (!node.rawInput) return true;

  switch (node.rawInput.kind) {
    case 'Pure':
      return inputArgumentKindCanCarryType('pure', type);
    case 'Object':
      return inputArgumentKindCanCarryType('object', type);
    case 'FundsWithdrawal':
      return inputArgumentKindCanCarryType('withdrawal', type);
  }
}

function variableNodeWithType(node: VariableNode, type: PTBType): VariableNode {
  return {
    ...node,
    varType: type,
    ports: node.ports.map((port) =>
      port.role === 'io' && port.direction === 'out'
        ? portWithType(port, type)
        : port,
    ),
  };
}

function portWithType(port: Port, type: PTBType): Port {
  return {
    ...port,
    dataType: type,
  };
}
