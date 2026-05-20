import {
  indexedInputHandleIndex,
  isIndexedInputHandle,
  isInputHandle,
} from './handles.js';
import {
  graphCommandRuntimeParams,
  parseGraphMoveCallTarget,
} from './moveCallEvidence.js';
import {
  type AnalyzePTBGraphOptions,
  type CommandNode,
  freezePTBGraph,
  isPureGraphType,
  type Port,
  type PTBGraph,
  type PTBNode,
  type PTBType,
  type VariableNode,
} from './types.js';
import {
  lookupMoveSignatureEvidence,
  normalizeMovePackageSignatureEvidenceOption,
} from '../move/evidence.js';
import {
  toPTBTypeFromConcreteTypeArgument,
  toPTBTypeFromOpenSignature,
} from '../move/signature.js';
import { parseMoveTypeTag } from '../raw/types.js';
import { cloneJsonLike, NULL_VALUE } from '../utils.js';

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
  const declared = declaredInputPortType(node, targetHandle);
  if (declared && declared.kind !== 'unknown') return declared;

  switch (node.command) {
    case 'splitCoins':
      if (isInputHandle(targetHandle, 'coin')) return objectType();
      if (isIndexedInputHandle(targetHandle, 'amount'))
        return numericType('u64');
      return undefined;
    case 'mergeCoins':
      if (
        isInputHandle(targetHandle, 'destination') ||
        isIndexedInputHandle(targetHandle, 'source')
      ) {
        return objectType();
      }
      return undefined;
    case 'transferObjects':
      if (isInputHandle(targetHandle, 'recipient'))
        return scalarType('address');
      if (isIndexedInputHandle(targetHandle, 'object')) return objectType();
      return undefined;
    case 'makeMoveVec':
      if (!isIndexedInputHandle(targetHandle, 'elem')) return undefined;
      return makeMoveVecElementType(node);
    case 'upgrade':
      return isInputHandle(targetHandle, 'upgradeCap')
        ? objectType()
        : undefined;
    case 'moveCall':
      return moveCallArgumentType(
        node,
        targetHandle,
        typeArgumentsByIndex,
        moveSignatures,
      );
    case 'publish':
    case 'unsupported':
      return undefined;
  }
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

function makeMoveVecElementType(node: CommandNode): PTBType | undefined {
  const runtime = graphCommandRuntimeParams(node);
  if (runtime?.type === undefined || runtime.type === NULL_VALUE) {
    return objectType();
  }
  if (typeof runtime.type !== 'string') return undefined;
  return toPTBTypeFromConcreteTypeArgument(runtime.type);
}

function moveCallArgumentType(
  node: CommandNode,
  targetHandle: string,
  typeArgumentsByIndex: ReadonlyMap<number, string> | undefined,
  moveSignatures: AnalyzePTBGraphOptions['moveSignatures'],
): PTBType | undefined {
  const argumentIndex = indexedInputHandleIndex(targetHandle, 'arg');
  if (argumentIndex === undefined) return undefined;

  const runtime = graphCommandRuntimeParams(node);
  const target = parseGraphMoveCallTarget(runtime?.target).target;
  if (!target) return undefined;

  const signature = lookupMoveSignatureEvidence(
    target.packageId,
    target.moduleName,
    target.functionName,
    moveSignatures,
  );
  const parameter = signature?.parameters[argumentIndex];
  if (!parameter) return undefined;

  const typeArguments = typeArgumentsForInference(
    signature.typeParameterCount,
    typeArgumentsByIndex,
  );
  return toPTBTypeFromOpenSignature(parameter, typeArguments);
}

function typeArgumentsForInference(
  count: number,
  byIndex: ReadonlyMap<number, string> | undefined,
): string[] {
  if (count === 0) return [];
  const typeArguments: string[] = [];
  for (let index = 0; index < count; index += 1) {
    typeArguments.push(byIndex?.get(index) ?? '');
  }
  return typeArguments;
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
      return isPureGraphType(type);
    case 'Object':
      return type.kind === 'object';
    case 'FundsWithdrawal':
      return type.kind === 'unknown';
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

function ptbTypesEqual(left: PTBType, right: PTBType): boolean {
  if (left.kind !== right.kind) return false;
  switch (left.kind) {
    case 'scalar':
      return left.name === (right as Extract<PTBType, { kind: 'scalar' }>).name;
    case 'move_numeric':
      return (
        left.width ===
        (right as Extract<PTBType, { kind: 'move_numeric' }>).width
      );
    case 'object':
      return (
        left.typeTag === (right as Extract<PTBType, { kind: 'object' }>).typeTag
      );
    case 'vector':
      return ptbTypesEqual(
        left.elem,
        (right as Extract<PTBType, { kind: 'vector' }>).elem,
      );
    case 'option':
      return ptbTypesEqual(
        left.elem,
        (right as Extract<PTBType, { kind: 'option' }>).elem,
      );
    case 'tuple': {
      const rightElems = (right as Extract<PTBType, { kind: 'tuple' }>).elems;
      return (
        left.elems.length === rightElems.length &&
        left.elems.every((elem, index) =>
          ptbTypesEqual(elem, rightElems[index]!),
        )
      );
    }
    case 'unknown':
      return true;
  }
}

function scalarType(name: 'address'): PTBType {
  return { kind: 'scalar', name };
}

function numericType(width: 'u64'): PTBType {
  return { kind: 'move_numeric', width };
}

function objectType(): PTBType {
  return { kind: 'object' };
}
