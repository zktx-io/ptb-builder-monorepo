import { graphDiagnostic } from './diagnostics.js';
import {
  indexedHandleSuffix,
  indexedInputHandle,
  indexedInputHandleIndex,
  inputHandle,
  isIndexedInputHandle,
  isInputHandle,
  knownResultOutputHandles,
  nestedResultHandle,
  nestedResultHandleIndex,
  RESULT_HANDLE_ID,
  singleResultOutputHandles,
  unknownResultOutputHandles,
} from './handles.js';
import {
  graphCommandRuntimeParams,
  type GraphMoveCallEvidenceState,
  parseGraphMoveCallTarget,
} from './moveCallEvidence.js';
import { normalizeGraphRawInput } from './rawInput.js';
import {
  analyzePTBGraph,
  type AnalyzePTBGraphOptions,
  type ExecutablePTBGraph,
  executablePTBGraphFacts,
  freezePTBGraph,
  graphDocumentDiagnostics,
  isExecutablePTBGraph,
  type PTBGraphAnalysis,
} from './types.js';
import type {
  CommandNode,
  NumericWidth,
  Port,
  PTBEdge,
  PTBGraph,
  PTBNode,
  PTBType,
  VariableNode,
} from './types.js';
import {
  assertNoErrors,
  existingGraphDiagnostics,
  hasErrors,
} from '../ir/diagnostics.js';
import type { TransactionDiagnostic } from '../ir/diagnostics.js';
import {
  isNonNegativeSafeInteger,
  isU16Index,
  MAX_RESULT_COUNT,
} from '../ir/limits.js';
import {
  finalizeStructuralTransactionIR,
  isStructuralTransactionIR,
} from '../ir/structural.js';
import { createTransactionIR, irCommandArgRefs } from '../ir/types.js';
import type {
  IRArgRef,
  IRCommand,
  IRInput,
  IRPureValue,
  TransactionIR,
} from '../ir/types.js';
import { validateTransactionIR } from '../ir/validate.js';
import { normalizeMovePackageSignatureEvidenceOption } from '../move/evidence.js';
import type { RawCallArg } from '../raw/types.js';
import {
  parseBase64Bytes,
  parseJsonU64,
  parseMoveTypeTag,
  parseObjectDigest,
  parseObjectId,
} from '../raw/types.js';
import {
  cloneJsonLike,
  isDenseArray,
  isPlainObject,
  NULL_VALUE,
} from '../utils.js';

const GAS_NODE_ID = 'gas';
const GAS_HANDLE_ID = 'out';

export interface GraphToTransactionIROptions
  extends Pick<AnalyzePTBGraphOptions, 'moveSignatures'> {}

interface GraphConversionAnalysis {
  analysis: PTBGraphAnalysis;
  moveSignatures?: AnalyzePTBGraphOptions['moveSignatures'];
}

interface GraphArgRead {
  refs: IRArgRef[];
  invalid: boolean;
}

interface GraphSingleArgRead {
  ref?: IRArgRef;
  invalid: boolean;
}

interface IndexedGraphEdge {
  edge: PTBEdge;
  edgeIndex: number;
}

interface GraphConversionIndex {
  flowEdgeBySource: Map<string, PTBEdge>;
  incomingIoEdgesByTarget: Map<string, IndexedGraphEdge[]>;
  incomingTypeEdgesByTarget: Map<string, IndexedGraphEdge[]>;
}

interface GraphInputPlan {
  node: VariableNode;
  nodeIndex: number;
  referencedOutPorts: Port[];
}

interface GraphInputPlans {
  plans: GraphInputPlan[];
  reservedInputIds: Set<string>;
}

interface GraphInputConstraint {
  cast: NumericWidth;
  path: string;
}

const EMPTY_INDEXED_GRAPH_EDGES: readonly IndexedGraphEdge[] = [];
const EMPTY_TYPE_ARGUMENTS = new Map<number, string | undefined>();

export function graphToTransactionIR(graph: ExecutablePTBGraph): TransactionIR;
export function graphToTransactionIR(
  graph: PTBGraph,
  options?: GraphToTransactionIROptions,
): TransactionIR;
export function graphToTransactionIR(
  graph: PTBGraph,
  options: GraphToTransactionIROptions = {},
): TransactionIR {
  const { analysis: graphValidation, moveSignatures } = graphConversionAnalysis(
    graph,
    options,
  );
  const graphDiagnostics = graphValidation.diagnostics;
  if (hasErrors(graphDocumentDiagnostics(graphDiagnostics))) {
    return createTransactionIR([], [], graphDiagnostics);
  }

  const diagnostics: TransactionDiagnostic[] = [...graphDiagnostics];
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const nodeIndexesById = new Map(
    graph.nodes.map((node, index) => [node.id, index]),
  );
  const graphIndex = buildGraphConversionIndex(graph);
  const inputConstraints = collectGraphInputConstraints(
    graphIndex.incomingIoEdgesByTarget,
    nodesById,
  );
  const typeArgumentsByCommand = collectGraphTypeArguments(
    graphIndex.incomingTypeEdgesByTarget,
    nodesById,
  );
  const hasCommandNodes = graph.nodes.some((node) => node.kind === 'Command');
  const referencedInputKeys = hasCommandNodes
    ? referencedGraphInputKeys(graphIndex.incomingIoEdgesByTarget, nodesById)
    : new Set<string>();
  const inputRefs = new Map<string, IRArgRef>();
  const inputs: IRInput[] = [];
  const { plans: inputPlans, reservedInputIds } = collectGraphInputPlans(
    graph,
    hasCommandNodes,
    referencedInputKeys,
  );
  let nextGeneratedInputIndex = 0;

  inputPlans.forEach(({ node, nodeIndex, referencedOutPorts }) => {
    if (isGasVariable(node)) {
      referencedOutPorts.forEach((port) => {
        inputRefs.set(edgeKey(node.id, port.id), { kind: 'GasCoin' });
      });
      return;
    }

    if (!node.name) {
      while (reservedInputIds.has(`input_${nextGeneratedInputIndex}`)) {
        nextGeneratedInputIndex += 1;
      }
    }
    const resolvedInputId = node.name || `input_${nextGeneratedInputIndex}`;
    reservedInputIds.add(resolvedInputId);
    if (!node.name) nextGeneratedInputIndex += 1;

    const inputType = resolveGraphInputType(
      node,
      referencedOutPorts,
      inputConstraints,
      diagnostics,
    );
    const input = variableNodeToInput(
      node,
      resolvedInputId,
      `$.nodes[${nodeIndex}]`,
      diagnostics,
      inputType,
    );
    inputs.push(input);
    referencedOutPorts.forEach((port) => {
      inputRefs.set(edgeKey(node.id, port.id), {
        kind: 'Input',
        index: inputs.length - 1,
      });
    });
  });

  const commandNodes = orderCommandNodes(
    graph,
    nodesById,
    graphIndex.flowEdgeBySource,
  );
  const commandIndexes = new Map<string, number>();
  const commands: IRCommand[] = [];

  commandNodes.forEach((node) => {
    const commandIndex = commands.length;
    commandIndexes.set(node.id, commandIndex);
    const nodePath = `$.nodes[${nodeIndexesById.get(node.id)}]`;
    const command = commandNodeToIRCommand(
      node,
      nodePath,
      graphIndex.incomingIoEdgesByTarget.get(node.id) ??
        EMPTY_INDEXED_GRAPH_EDGES,
      typeArgumentsByCommand.get(node.id) ?? EMPTY_TYPE_ARGUMENTS,
      inputRefs,
      commandIndexes,
      graphValidation.moveCallEvidenceByNodeId.get(node.id),
      diagnostics,
    );
    commands.push(command);
  });

  const ir = createTransactionIR(inputs, commands, diagnostics);
  return finalizeStructuralTransactionIR(
    ir,
    validateTransactionIR(ir, {
      includeExistingDiagnostics: true,
      moveSignatures,
    }),
  );
}

function collectGraphInputPlans(
  graph: PTBGraph,
  hasCommandNodes: boolean,
  referencedInputKeys: Set<string>,
): GraphInputPlans {
  const plans: GraphInputPlan[] = [];
  const reservedInputIds = new Set<string>();

  graph.nodes.forEach((node, nodeIndex) => {
    if (node.kind !== 'Variable') return;
    const referencedOutPorts = referencedOutputPortsForVariable(
      node,
      hasCommandNodes,
      referencedInputKeys,
    );
    const preservesRawOrigin =
      node.rawInput !== undefined || node.semantic?.kind === 'UnsupportedInput';
    if (
      hasCommandNodes &&
      referencedOutPorts.length === 0 &&
      !preservesRawOrigin
    ) {
      return;
    }
    plans.push({ node, nodeIndex, referencedOutPorts });
    if (!isGasVariable(node) && node.name) {
      reservedInputIds.add(node.name);
    }
  });

  return { plans, reservedInputIds };
}

function referencedOutputPortsForVariable(
  node: VariableNode,
  hasCommandNodes: boolean,
  referencedInputKeys: Set<string>,
): Port[] {
  const outputPorts = node.ports.filter(
    (port) => port.role === 'io' && port.direction === 'out',
  );
  return hasCommandNodes
    ? outputPorts.filter((port) =>
        referencedInputKeys.has(edgeKey(node.id, port.id)),
      )
    : outputPorts;
}

function graphConversionAnalysis(
  graph: PTBGraph,
  options: GraphToTransactionIROptions,
): GraphConversionAnalysis {
  if (isExecutablePTBGraph(graph)) {
    if (options.moveSignatures !== undefined) {
      throw new TypeError(
        'graphToTransactionIR does not accept moveSignatures for an ExecutablePTBGraph.',
      );
    }
    const facts = executablePTBGraphFacts(graph);
    if (facts === undefined) {
      throw new TypeError('ExecutablePTBGraph is missing analysis facts.');
    }
    return {
      analysis: facts.analysis,
      moveSignatures: facts.moveSignatures,
    };
  }

  const moveSignatures = normalizeMovePackageSignatureEvidenceOption(
    options.moveSignatures,
  );
  return {
    analysis: analyzePTBGraph(graph, { moveSignatures }),
    moveSignatures,
  };
}

function buildGraphConversionIndex(graph: PTBGraph): GraphConversionIndex {
  const flowEdgeBySource = new Map<string, PTBEdge>();
  const incomingIoEdgesByTarget = new Map<string, IndexedGraphEdge[]>();
  const incomingTypeEdgesByTarget = new Map<string, IndexedGraphEdge[]>();

  graph.edges.forEach((edge, edgeIndex) => {
    if (edge.kind === 'flow') {
      if (!flowEdgeBySource.has(edge.source)) {
        flowEdgeBySource.set(edge.source, edge);
      }
      return;
    }

    const indexedEdge = { edge, edgeIndex };
    if (edge.kind === 'io') {
      const incomingEdges = incomingIoEdgesByTarget.get(edge.target);
      if (incomingEdges) {
        incomingEdges.push(indexedEdge);
      } else {
        incomingIoEdgesByTarget.set(edge.target, [indexedEdge]);
      }
      return;
    }

    const incomingEdges = incomingTypeEdgesByTarget.get(edge.target);
    if (incomingEdges) {
      incomingEdges.push(indexedEdge);
    } else {
      incomingTypeEdgesByTarget.set(edge.target, [indexedEdge]);
    }
  });

  return {
    flowEdgeBySource,
    incomingIoEdgesByTarget,
    incomingTypeEdgesByTarget,
  };
}

function referencedGraphInputKeys(
  incomingIoEdgesByTarget: Map<string, IndexedGraphEdge[]>,
  nodesById: Map<string, PTBNode>,
): Set<string> {
  const result = new Set<string>();
  incomingIoEdgesByTarget.forEach((incomingEdges) => {
    incomingEdges.forEach(({ edge }) => {
      const source = nodesById.get(edge.source);
      const target = nodesById.get(edge.target);
      if (source?.kind !== 'Variable' || target?.kind !== 'Command') return;
      result.add(edgeKey(edge.source, edge.sourceHandle));
    });
  });
  return result;
}

function collectGraphInputConstraints(
  incomingIoEdgesByTarget: Map<string, IndexedGraphEdge[]>,
  nodesById: Map<string, PTBNode>,
): Map<string, GraphInputConstraint[]> {
  const result = new Map<string, GraphInputConstraint[]>();

  incomingIoEdgesByTarget.forEach((incomingEdges, targetId) => {
    const target = nodesById.get(targetId);
    if (target?.kind !== 'Command') return;

    incomingEdges.forEach(({ edge, edgeIndex }) => {
      const source = nodesById.get(edge.source);
      if (source?.kind !== 'Variable') return;

      if (edge.cast === undefined) return;

      const key = edgeKey(edge.source, edge.sourceHandle);
      const constraints = result.get(key) ?? [];
      constraints.push({
        cast: edge.cast.to,
        path: `$.edges[${edgeIndex}]`,
      });
      result.set(key, constraints);
    });
  });

  return result;
}

function collectGraphTypeArguments(
  incomingTypeEdgesByTarget: Map<string, IndexedGraphEdge[]>,
  nodesById: Map<string, PTBNode>,
): Map<string, Map<number, string | undefined>> {
  const result = new Map<string, Map<number, string | undefined>>();

  incomingTypeEdgesByTarget.forEach((incomingEdges, targetId) => {
    const target = nodesById.get(targetId);
    if (target?.kind !== 'Command' || target.command !== 'moveCall') return;

    incomingEdges.forEach(({ edge }) => {
      const source = nodesById.get(edge.source);
      if (source?.kind !== 'TypeArgument') return;

      const index = indexedInputHandleIndex(edge.targetHandle, 'type');
      const typeArgument = parseMoveTypeTag(source.value);
      if (index === undefined) return;

      const typeArguments =
        result.get(targetId) ?? new Map<number, string | undefined>();
      typeArguments.set(index, typeArgument);
      result.set(targetId, typeArguments);
    });
  });

  return result;
}

function resolveGraphInputType(
  node: VariableNode,
  referencedOutPorts: readonly Port[],
  constraintsByInputKey: Map<string, GraphInputConstraint[]>,
  diagnostics: TransactionDiagnostic[],
): PTBType {
  let resolved = node.varType;

  referencedOutPorts.forEach((port) => {
    const constraints =
      constraintsByInputKey.get(edgeKey(node.id, port.id)) ?? [];
    constraints.forEach((constraint) => {
      resolved = applyGraphInputCast(node, resolved, constraint, diagnostics);
    });
  });

  return resolved;
}

function applyGraphInputCast(
  node: VariableNode,
  currentType: PTBType,
  constraint: GraphInputConstraint,
  diagnostics: TransactionDiagnostic[],
): PTBType {
  if (currentType.kind === 'scalar' && currentType.name === 'number') {
    return { kind: 'move_numeric', width: constraint.cast };
  }
  if (
    currentType.kind === 'move_numeric' &&
    currentType.width === constraint.cast
  ) {
    return currentType;
  }

  diagnostics.push(
    graphDiagnostic(
      'graph.edge.cast',
      `Edge cast on variable ${node.id} can only bind an abstract number input to a concrete Move integer width.`,
      constraint.path,
    ),
  );
  return currentType;
}

export function transactionIRToGraph(ir: TransactionIR): PTBGraph {
  assertGraphableTransactionIR(ir);

  const nodes: PTBNode[] = [
    {
      id: 'start',
      kind: 'Start',
      label: 'Start',
      ports: [{ id: 'out', direction: 'out', role: 'flow' }],
      position: { x: 0, y: 0 },
    },
    {
      id: 'end',
      kind: 'End',
      label: 'End',
      ports: [{ id: 'in', direction: 'in', role: 'flow' }],
      position: { x: 0, y: 120 * (ir.commands.length + 1) },
    },
  ];
  const edges: PTBEdge[] = [];
  const nestedResultHandles = nestedResultHandlesByCommand(ir.commands);
  const typeArgumentNodeIds = new Map<string, string>();

  if (ir.commands.some((command) => irCommandArgRefs(command).some(isGasArg))) {
    nodes.push({
      id: GAS_NODE_ID,
      kind: 'Variable',
      label: 'gas',
      name: 'gas',
      varType: { kind: 'object' },
      semantic: { kind: 'GasCoin' },
      ports: [
        {
          id: GAS_HANDLE_ID,
          direction: 'out',
          role: 'io',
          dataType: { kind: 'object' },
        },
      ],
      position: { x: -560, y: 0 },
    });
  }

  ir.inputs.forEach((input, index) => {
    const rawInput = rawInputFromIRInput(input);
    const semantic = inputSemantic(input);
    nodes.push({
      id: `var-${index}`,
      kind: 'Variable',
      label: input.id,
      name: input.id,
      varType: inputType(input),
      ...graphInputValueParam(input),
      ...(rawInput ? { rawInput } : {}),
      ...(semantic ? { semantic } : {}),
      ports: [{ id: 'out', direction: 'out', role: 'io' }],
      position: { x: -280, y: 120 * index },
    });
  });

  let previous = 'start';
  ir.commands.forEach((command, index) => {
    const node = irCommandToGraphCommand(
      command,
      index,
      nestedResultHandles.get(index) ?? [],
    );
    nodes.push(node);
    if (command.kind === 'MoveCall') {
      command.typeArguments.forEach((typeArgument, typeArgumentIndex) => {
        const typeNodeId = getOrCreateTypeArgumentNode(
          typeArgument,
          typeArgumentNodeIds,
          nodes,
        );
        edges.push({
          id: `type-${typeNodeId}-${node.id}-${typeArgumentIndex}`,
          kind: 'type',
          source: typeNodeId,
          sourceHandle: 'out_type',
          target: node.id,
          targetHandle: indexedInputHandle('type', typeArgumentIndex),
        });
      });
    }
    edges.push({
      id: `flow-${previous}-${node.id}`,
      kind: 'flow',
      source: previous,
      sourceHandle: 'out',
      target: node.id,
      targetHandle: 'in',
    });
    previous = node.id;

    commandArgEntries(command).forEach(({ arg, handle }, argIndex) => {
      const source = sourceForArg(arg);
      edges.push({
        id: `io-${source.node}-${node.id}-${argIndex}`,
        kind: 'io',
        source: source.node,
        sourceHandle: source.handle,
        target: node.id,
        targetHandle: handle,
      });
    });
  });

  edges.push({
    id: `flow-${previous}-end`,
    kind: 'flow',
    source: previous,
    sourceHandle: 'out',
    target: 'end',
    targetHandle: 'in',
  });

  return freezePTBGraph({ nodes, edges });
}

function getOrCreateTypeArgumentNode(
  typeArgument: string,
  typeArgumentNodeIds: Map<string, string>,
  nodes: PTBNode[],
): string {
  const existing = typeArgumentNodeIds.get(typeArgument);
  if (existing !== undefined) return existing;

  const index = typeArgumentNodeIds.size;
  const nodeId = `type-arg-${index}`;
  typeArgumentNodeIds.set(typeArgument, nodeId);
  nodes.push({
    id: nodeId,
    kind: 'TypeArgument',
    label: typeArgument,
    value: typeArgument,
    ports: [{ id: 'out_type', direction: 'out', role: 'type' }],
    position: { x: -560, y: 120 * index },
  });
  return nodeId;
}

function inputType(input: IRInput) {
  switch (input.kind) {
    case 'Pure':
      return input.type ?? { kind: 'unknown' as const, debugInfo: input.kind };
    case 'Object':
      return input.type ?? { kind: 'object' as const };
    case 'FundsWithdrawal':
      return { kind: 'unknown' as const, debugInfo: input.kind };
    case 'Unsupported':
      return { kind: 'unknown' as const, debugInfo: input.kind };
  }
}

function variableNodeToInput(
  node: VariableNode,
  id: string,
  nodePath: string,
  diagnostics: TransactionDiagnostic[],
  inputType: PTBType = node.varType,
): IRInput {
  const hasRawInput = node.rawInput !== undefined;
  // analyzePTBGraph checks rawInput diagnostics for document validation;
  // conversion parses again here because it needs the normalized value.
  const rawInput = normalizeGraphRawInput(
    node.rawInput,
    `${nodePath}.rawInput`,
    diagnostics,
  );

  if (rawInput) {
    return rawInputToIRInput(id, rawInput, inputType);
  }

  if (hasRawInput) {
    return {
      id,
      kind: 'Unsupported',
      sourceKind: 'InvalidRawInput',
      value: cloneJsonLike(node.rawInput),
    };
  }

  if (node.semantic?.kind === 'UnsupportedInput') {
    const hasValue =
      Object.prototype.hasOwnProperty.call(node, 'value') &&
      node.value !== undefined;
    return {
      id,
      kind: 'Unsupported',
      sourceKind: node.semantic.sourceKind,
      ...(hasValue ? { value: cloneJsonLike(node.value) } : {}),
    };
  }

  if (inputType.kind === 'object') {
    const object = isPlainObject(node.value) ? node.value : undefined;
    const objectKind = object?.kind;
    if (objectKind !== undefined && objectKind !== 'ImmOrOwnedObject') {
      diagnostics.push(
        graphDiagnostic(
          'graph.input.object.invalidKind',
          `Object variable ${node.id} cannot use value.kind ${String(objectKind)} without rawInput; use rawInput for SharedObject, Receiving, or other raw PTB object inputs.`,
          `${nodePath}.value.kind`,
        ),
      );
      return {
        id,
        kind: 'Object',
        type: inputType,
      };
    }

    const objectId = canonicalObjectId(object?.objectId);
    const version = canonicalJsonU64(object?.version);
    const digest = parseObjectDigest(object?.digest);
    if (
      object &&
      objectId !== undefined &&
      version !== undefined &&
      digest !== undefined &&
      digest === object.digest
    ) {
      return {
        id,
        kind: 'Object',
        object: {
          kind: 'ImmOrOwnedObject',
          objectId,
          version,
          digest,
        },
        type: inputType,
      };
    }

    diagnostics.push(
      graphDiagnostic(
        'graph.input.object.unresolved',
        `Object variable ${node.id} requires canonical objectId, canonical decimal JsonU64 version, and digest to become raw PTB.`,
        nodePath,
      ),
    );
    return {
      id,
      kind: 'Object',
      type: inputType,
    };
  }

  const pureInput: Extract<IRInput, { kind: 'Pure' }> = {
    id,
    kind: 'Pure',
    type: inputType,
  };
  return Object.prototype.hasOwnProperty.call(node, 'value')
    ? {
        ...pureInput,
        value: cloneJsonLike(node.value) as IRPureValue,
      }
    : pureInput;
}

function graphInputValueParam(input: IRInput): { value: unknown } | {} {
  switch (input.kind) {
    case 'Pure':
      return Object.prototype.hasOwnProperty.call(input, 'value') &&
        input.value !== undefined
        ? { value: cloneJsonLike(input.value) }
        : {};
    case 'Object':
      return input.object !== undefined
        ? { value: cloneJsonLike(input.object) }
        : {};
    case 'FundsWithdrawal':
      return { value: cloneJsonLike(input.value) };
    case 'Unsupported':
      return Object.prototype.hasOwnProperty.call(input, 'value') &&
        input.value !== undefined
        ? { value: cloneJsonLike(input.value) }
        : {};
  }
}

function rawInputFromIRInput(input: IRInput): RawCallArg | undefined {
  switch (input.kind) {
    case 'Pure':
      return input.bytes !== undefined
        ? { kind: 'Pure', bytes: input.bytes }
        : undefined;
    case 'Object':
      return input.object
        ? { kind: 'Object', object: cloneJsonLike(input.object) }
        : undefined;
    case 'FundsWithdrawal':
      return { kind: 'FundsWithdrawal', value: cloneJsonLike(input.value) };
    case 'Unsupported':
      return undefined;
  }
}

function inputSemantic(input: IRInput): VariableNode['semantic'] | undefined {
  if (input.kind !== 'Unsupported') return undefined;

  return {
    kind: 'UnsupportedInput',
    sourceKind: input.sourceKind,
  };
}

function assertGraphableTransactionIR(ir: TransactionIR): void {
  const diagnostics = [
    ...existingGraphDiagnostics(ir),
    ...(isStructuralTransactionIR(ir)
      ? []
      : validateTransactionIR(ir, {
          includeExistingDiagnostics: false,
          includeUnsupportedDiagnostics: false,
        })),
  ];
  assertNoErrors('TransactionIR cannot be converted to PTBGraph.', diagnostics);
}

function rawInputToIRInput(
  id: string,
  rawInput: RawCallArg,
  type: VariableNode['varType'],
): IRInput {
  switch (rawInput.kind) {
    case 'Pure': {
      const canonicalRaw = cloneJsonLike(rawInput);
      return {
        id,
        kind: 'Pure',
        bytes: canonicalRaw.bytes,
        ...(type.kind === 'unknown' ? {} : { type }),
        canonicalRaw,
      };
    }
    case 'Object': {
      const canonicalRaw = cloneJsonLike(rawInput);
      return {
        id,
        kind: 'Object',
        object: canonicalRaw.object,
        ...(type.kind === 'object' && type.typeTag === undefined
          ? {}
          : { type }),
        canonicalRaw,
      };
    }
    case 'FundsWithdrawal': {
      const canonicalRaw = cloneJsonLike(rawInput);
      return {
        id,
        kind: 'FundsWithdrawal',
        value: canonicalRaw.value,
        canonicalRaw,
      };
    }
  }
}

function isGasVariable(node: VariableNode): boolean {
  return node.semantic?.kind === 'GasCoin';
}

function canonicalObjectId(value: unknown): string | undefined {
  const objectId = parseObjectId(value);
  return objectId !== undefined && objectId === value ? objectId : undefined;
}

function canonicalJsonU64(value: unknown): string | undefined {
  const jsonU64 = parseJsonU64(value);
  return jsonU64 !== undefined && jsonU64 === value ? jsonU64 : undefined;
}

function commandNodeToIRCommand(
  node: CommandNode,
  nodePath: string,
  incomingEdges: readonly IndexedGraphEdge[],
  typeArgumentsByIndex: ReadonlyMap<number, string | undefined>,
  inputRefs: Map<string, IRArgRef>,
  commandIndexes: Map<string, number>,
  moveCallEvidence: GraphMoveCallEvidenceState | undefined,
  diagnostics: TransactionDiagnostic[],
): IRCommand {
  const arg = (handle: string) =>
    readIncomingArg(
      incomingEdges,
      inputRefs,
      commandIndexes,
      handle,
      diagnostics,
    );
  const args = (match: (handle: string) => boolean) =>
    readIncomingArgs(
      incomingEdges,
      inputRefs,
      commandIndexes,
      match,
      diagnostics,
    );

  switch (node.command) {
    case 'splitCoins': {
      const amounts = args((handle) => isIndexedInputHandle(handle, 'amount'));
      const coin = arg('coin');
      if (coin.invalid || amounts.invalid || !coin.ref) {
        return invalidGraphCommand(node, 'GraphCommandInvalidInput');
      }
      if (
        !requireNonEmptyGraphArgs(
          node,
          nodePath,
          'amounts',
          amounts.refs,
          diagnostics,
        )
      ) {
        return invalidGraphCommand(node, 'GraphCommandInvalidInput');
      }
      return {
        id: node.id,
        kind: 'SplitCoins',
        coin: coin.ref,
        amounts: amounts.refs,
        resultCount: amounts.refs.length,
      };
    }
    case 'mergeCoins': {
      const destination = arg('destination');
      const sources = args((handle) => isIndexedInputHandle(handle, 'source'));
      if (destination.invalid || sources.invalid || !destination.ref) {
        return invalidGraphCommand(node, 'GraphCommandInvalidInput');
      }
      if (
        !requireNonEmptyGraphArgs(
          node,
          nodePath,
          'sources',
          sources.refs,
          diagnostics,
        )
      ) {
        return invalidGraphCommand(node, 'GraphCommandInvalidInput');
      }
      return {
        id: node.id,
        kind: 'MergeCoins',
        destination: destination.ref,
        sources: sources.refs,
        resultCount: 0,
      };
    }
    case 'transferObjects': {
      const objects = args((handle) => isIndexedInputHandle(handle, 'object'));
      const address = arg('recipient');
      if (objects.invalid || address.invalid || !address.ref) {
        return invalidGraphCommand(node, 'GraphCommandInvalidInput');
      }
      if (
        !requireNonEmptyGraphArgs(
          node,
          nodePath,
          'objects',
          objects.refs,
          diagnostics,
        )
      ) {
        return invalidGraphCommand(node, 'GraphCommandInvalidInput');
      }
      return {
        id: node.id,
        kind: 'TransferObjects',
        objects: objects.refs,
        address: address.ref,
        resultCount: 0,
      };
    }
    case 'makeMoveVec': {
      const elements = args((handle) => isIndexedInputHandle(handle, 'elem'));
      if (elements.invalid) {
        return invalidGraphCommand(node, 'GraphCommandInvalidInput');
      }
      const type = typeTagFromNode(node, nodePath, diagnostics);
      if (type === undefined) {
        return invalidGraphCommand(node, 'InvalidMakeMoveVecType');
      }
      if (type === NULL_VALUE && elements.refs.length === 0) {
        diagnostics.push(
          graphDiagnostic(
            'graph.command.emptyInput',
            `MakeMoveVec ${node.id} elements must not be empty when type is null.`,
            nodePath,
          ),
        );
        return invalidGraphCommand(node, 'GraphCommandInvalidInput');
      }
      return {
        id: node.id,
        kind: 'MakeMoveVec',
        type,
        elements: elements.refs,
        resultCount: 1,
      };
    }
    case 'moveCall': {
      const target = moveCallTarget(node);
      const parsedTarget = parseGraphMoveCallTarget(target);
      if (!target || parsedTarget.issue === 'missing') {
        diagnostics.push(
          graphDiagnostic(
            'graph.command.moveCall.targetMissing',
            `MoveCall ${node.id} requires package::module::function target.`,
            nodePath,
          ),
        );
        return invalidGraphCommand(node, 'InvalidMoveCallTarget');
      }
      if (!parsedTarget.target) {
        throw new TypeError(
          `MoveCall ${node.id} reached graph conversion with a non-canonical target.`,
        );
      }
      const { packageId, moduleName, functionName } = parsedTarget.target;
      const moveArgs = args((handle) => isIndexedInputHandle(handle, 'arg'));
      if (moveArgs.invalid) {
        return invalidGraphCommand(node, 'GraphCommandInvalidInput');
      }
      const typeArguments = moveCallTypeArguments(
        node,
        typeArgumentsByIndex,
        nodePath,
        diagnostics,
      );
      if (!typeArguments) {
        return invalidGraphCommand(node, 'InvalidMoveCallTypeArguments');
      }
      return {
        id: node.id,
        kind: 'MoveCall',
        package: packageId,
        module: moduleName,
        function: functionName,
        typeArguments,
        arguments: moveArgs.refs,
        ...moveCallResultCountParam(node, moveCallEvidence),
      };
    }
    case 'publish': {
      const modules = nonEmptyBase64BytesArrayParam(
        node,
        nodePath,
        'modules',
        diagnostics,
      );
      const dependencies = objectIdArrayParam(
        node,
        nodePath,
        'dependencies',
        diagnostics,
      );
      if (!modules || !dependencies) {
        return invalidGraphCommand(node, 'InvalidPublishParams');
      }
      return {
        id: node.id,
        kind: 'Publish',
        modules,
        dependencies,
        resultCount: 1,
      };
    }
    case 'upgrade': {
      const modules = nonEmptyBase64BytesArrayParam(
        node,
        nodePath,
        'modules',
        diagnostics,
      );
      const dependencies = objectIdArrayParam(
        node,
        nodePath,
        'dependencies',
        diagnostics,
      );
      const packageId = objectIdParam(node, nodePath, 'package', diagnostics);
      const ticket = arg('upgradeCap');
      if (
        !modules ||
        !dependencies ||
        !packageId ||
        ticket.invalid ||
        !ticket.ref
      ) {
        return invalidGraphCommand(node, 'InvalidUpgradeParams');
      }
      return {
        id: node.id,
        kind: 'Upgrade',
        modules,
        dependencies,
        package: packageId,
        ticket: ticket.ref,
        resultCount: 1,
      };
    }
    case 'unsupported':
      return unsupportedGraphCommand(node);
  }
}

function requireNonEmptyGraphArgs(
  node: CommandNode,
  nodePath: string,
  key: string,
  refs: IRArgRef[],
  diagnostics: TransactionDiagnostic[],
): boolean {
  if (refs.length > 0) return true;
  diagnostics.push(
    graphDiagnostic(
      'graph.command.emptyInput',
      `Command ${node.id} requires at least one ${key} input.`,
      nodePath,
    ),
  );
  return false;
}

function readIncomingArg(
  incomingEdges: readonly IndexedGraphEdge[],
  inputRefs: Map<string, IRArgRef>,
  commandIndexes: Map<string, number>,
  handleNeedle: string,
  diagnostics: TransactionDiagnostic[],
): GraphSingleArgRead {
  const result = readIncomingArgs(
    incomingEdges,
    inputRefs,
    commandIndexes,
    (handle) => isInputHandle(handle, handleNeedle),
    diagnostics,
  );
  if (result.refs[0]) {
    return {
      ref: result.refs[0],
      invalid: result.invalid,
    };
  }

  return {
    invalid: true,
  };
}

function readIncomingArgs(
  incomingEdges: readonly IndexedGraphEdge[],
  inputRefs: Map<string, IRArgRef>,
  commandIndexes: Map<string, number>,
  match: (handle: string) => boolean,
  diagnostics: TransactionDiagnostic[],
): GraphArgRead {
  const refs: IRArgRef[] = [];
  let invalid = false;

  incomingEdges
    .filter(({ edge }) => match(edge.targetHandle))
    .sort((a, b) => compareHandles(a.edge.targetHandle, b.edge.targetHandle))
    .map(({ edge, edgeIndex }): IRArgRef | undefined => {
      const directInput = inputRefs.get(
        edgeKey(edge.source, edge.sourceHandle),
      );
      if (directInput) return directInput;

      const commandIndex = commandIndexes.get(edge.source);
      if (commandIndex === undefined) {
        diagnostics.push(
          graphDiagnostic(
            'graph.arg.source',
            `Edge ${edge.id} references a source that is not an input or previously ordered command.`,
            `$.edges[${edgeIndex}]`,
          ),
        );
        invalid = true;
        return undefined;
      }

      const resultIndex = nestedResultHandleIndex(edge.sourceHandle);
      return resultIndex === undefined
        ? { kind: 'Result', commandIndex }
        : { kind: 'NestedResult', commandIndex, resultIndex };
    })
    .forEach((ref) => {
      if (ref) refs.push(ref);
    });

  return { refs, invalid };
}

function orderCommandNodes(
  graph: PTBGraph,
  nodesById: Map<string, PTBNode>,
  flowEdgeBySource: Map<string, PTBEdge>,
): CommandNode[] {
  const start = graph.nodes.find((node) => node.kind === 'Start');
  if (!start) {
    return graph.nodes.filter(
      (node): node is CommandNode => node.kind === 'Command',
    );
  }

  const ordered: CommandNode[] = [];
  const visited = new Set<string>();
  let current = start.id;

  while (!visited.has(current)) {
    visited.add(current);
    const next = flowEdgeBySource.get(current);
    if (!next) break;
    const node = nodesById.get(next.target);
    if (!node) break;
    if (node.kind === 'Command') ordered.push(node);
    current = node.id;
  }

  const orderedIds = new Set(ordered.map((node) => node.id));
  graph.nodes.forEach((node) => {
    if (node.kind === 'Command' && !orderedIds.has(node.id)) {
      ordered.push(node);
    }
  });

  return ordered;
}

function irCommandToGraphCommand(
  command: IRCommand,
  index: number,
  referencedNestedResultIndexes: readonly number[] = [],
): CommandNode {
  return {
    id: `cmd-${index}`,
    kind: 'Command',
    label: command.kind,
    command: graphCommandKind(command),
    params: graphCommandParams(command),
    ports: commandPorts(command, referencedNestedResultIndexes),
    position: { x: 0, y: 120 * index },
  };
}

function commandPorts(
  command: IRCommand,
  referencedNestedResultIndexes: readonly number[] = [],
): Port[] {
  const ports: Port[] = [
    { id: 'in', direction: 'in', role: 'flow' },
    { id: 'out', direction: 'out', role: 'flow' },
  ];

  commandArgEntries(command).forEach(({ handle }) => {
    ports.push({ id: handle, direction: 'in', role: 'io' });
  });
  if (command.kind === 'MoveCall') {
    command.typeArguments.forEach((_typeArgument, index) => {
      ports.push({
        id: indexedInputHandle('type', index),
        direction: 'in',
        role: 'type',
      });
    });
  }

  commandOutputHandles(command, referencedNestedResultIndexes).forEach(
    (handle) => {
      ports.push({ id: handle, direction: 'out', role: 'io' });
    },
  );

  return ports;
}

function commandOutputHandles(
  command: IRCommand,
  referencedNestedResultIndexes: readonly number[] = [],
): string[] {
  switch (command.kind) {
    case 'TransferObjects':
    case 'MergeCoins':
    case 'Unsupported':
      return [];
    case 'Publish':
    case 'MakeMoveVec':
    case 'Upgrade':
      return singleResultOutputHandles(referencedNestedResultIndexes);
    case 'MoveCall':
      return moveCallOutputHandles(command, referencedNestedResultIndexes);
    case 'SplitCoins':
      return knownResultOutputHandles(
        command.resultCount,
        referencedNestedResultIndexes,
      );
  }
}

function moveCallOutputHandles(
  command: Extract<IRCommand, { kind: 'MoveCall' }>,
  referencedNestedResultIndexes: readonly number[],
): string[] {
  if (command.resultCount === 0) return [];
  if (command.resultCount === undefined) {
    return unknownResultOutputHandles(referencedNestedResultIndexes);
  }

  return knownResultOutputHandles(
    command.resultCount,
    referencedNestedResultIndexes,
  );
}

function nestedResultHandlesByCommand(
  commands: IRCommand[],
): Map<number, number[]> {
  const indexes = new Map<number, Set<number>>();

  commands.forEach((command) => {
    irCommandArgRefs(command).forEach((arg) => {
      if (arg.kind !== 'NestedResult') return;
      if (!isU16Index(arg.resultIndex)) return;
      const currentIndexes = indexes.get(arg.commandIndex) ?? new Set<number>();
      currentIndexes.add(arg.resultIndex);
      indexes.set(arg.commandIndex, currentIndexes);
    });
  });

  const handlesByCommand = new Map<number, number[]>();
  indexes.forEach((commandIndexes, commandIndex) => {
    handlesByCommand.set(
      commandIndex,
      [...commandIndexes].sort((left, right) => left - right),
    );
  });

  return handlesByCommand;
}

function graphCommandParams(command: IRCommand): CommandNode['params'] {
  switch (command.kind) {
    case 'MoveCall':
      return {
        runtime: {
          target: `${command.package}::${command.module}::${command.function}`,
          ...(command.resultCount !== undefined
            ? { resultCount: command.resultCount }
            : {}),
        },
      };
    case 'Publish':
      return {
        runtime: {
          modules: [...command.modules],
          dependencies: [...command.dependencies],
        },
      };
    case 'Upgrade':
      return {
        runtime: {
          modules: [...command.modules],
          dependencies: [...command.dependencies],
          package: command.package,
        },
      };
    case 'MakeMoveVec':
      return {
        runtime: {
          type: command.type,
        },
      };
    case 'Unsupported': {
      const hasValue =
        Object.prototype.hasOwnProperty.call(command, 'value') &&
        command.value !== undefined;
      return {
        runtime: {
          sourceKind: command.sourceKind,
          ...(hasValue ? { value: cloneJsonLike(command.value) } : {}),
        },
      };
    }
    default:
      return undefined;
  }
}

function graphCommandKind(command: IRCommand): CommandNode['command'] {
  switch (command.kind) {
    case 'MoveCall':
      return 'moveCall';
    case 'TransferObjects':
      return 'transferObjects';
    case 'SplitCoins':
      return 'splitCoins';
    case 'MergeCoins':
      return 'mergeCoins';
    case 'Publish':
      return 'publish';
    case 'MakeMoveVec':
      return 'makeMoveVec';
    case 'Upgrade':
      return 'upgrade';
    case 'Unsupported':
      return 'unsupported';
  }
}

function commandArgEntries(
  command: IRCommand,
): { arg: IRArgRef; handle: string }[] {
  switch (command.kind) {
    case 'MoveCall':
      return command.arguments.map((arg, index) => ({
        arg,
        handle: indexedInputHandle('arg', index),
      }));
    case 'TransferObjects':
      return [
        ...command.objects.map((arg, index) => ({
          arg,
          handle: indexedInputHandle('object', index),
        })),
        { arg: command.address, handle: inputHandle('recipient') },
      ];
    case 'SplitCoins':
      return [
        { arg: command.coin, handle: inputHandle('coin') },
        ...command.amounts.map((arg, index) => ({
          arg,
          handle: indexedInputHandle('amount', index),
        })),
      ];
    case 'MergeCoins':
      return [
        { arg: command.destination, handle: inputHandle('destination') },
        ...command.sources.map((arg, index) => ({
          arg,
          handle: indexedInputHandle('source', index),
        })),
      ];
    case 'MakeMoveVec':
      return command.elements.map((arg, index) => ({
        arg,
        handle: indexedInputHandle('elem', index),
      }));
    case 'Upgrade':
      return [{ arg: command.ticket, handle: inputHandle('upgradeCap') }];
    case 'Publish':
    case 'Unsupported':
      return [];
  }
}

function sourceForArg(arg: IRArgRef): { node: string; handle: string } {
  switch (arg.kind) {
    case 'Input':
      return { node: `var-${arg.index}`, handle: 'out' };
    case 'Result':
      return { node: `cmd-${arg.commandIndex}`, handle: RESULT_HANDLE_ID };
    case 'NestedResult':
      return {
        node: `cmd-${arg.commandIndex}`,
        handle: nestedResultHandle(arg.resultIndex),
      };
    case 'GasCoin':
      return { node: GAS_NODE_ID, handle: GAS_HANDLE_ID };
  }
}

function isGasArg(arg: IRArgRef): boolean {
  return arg.kind === 'GasCoin';
}

function unsupportedGraphCommand(node: CommandNode): IRCommand {
  const runtime = graphCommandRuntimeParams(node) ?? {};
  const sourceKind =
    typeof runtime.sourceKind === 'string'
      ? runtime.sourceKind
      : 'UnsupportedGraphCommand';
  const hasValue = 'value' in runtime && runtime.value !== undefined;

  return {
    id: node.id,
    kind: 'Unsupported',
    sourceKind,
    ...(hasValue ? { value: cloneJsonLike(runtime.value) } : {}),
    resultCount: 0,
  };
}

function invalidGraphCommand(node: CommandNode, sourceKind: string): IRCommand {
  return {
    id: node.id,
    kind: 'Unsupported',
    sourceKind,
    value: {
      command: node.command,
      params: cloneJsonLike(node.params),
    },
    resultCount: 0,
  };
}

function moveCallTarget(node: CommandNode): string | undefined {
  const runtime = graphCommandRuntimeParams(node);

  if (typeof runtime?.target === 'string') return runtime.target;
  return undefined;
}

function moveCallResultCountParam(
  node: CommandNode,
  evidenceState?: GraphMoveCallEvidenceState,
): { resultCount: number } | undefined {
  const runtime = graphCommandRuntimeParams(node);
  const resultCount = runtime?.resultCount;
  return isNonNegativeSafeInteger(resultCount) &&
    resultCount <= MAX_RESULT_COUNT
    ? { resultCount }
    : evidenceState?.effectiveResultCount !== undefined
      ? { resultCount: evidenceState.effectiveResultCount }
      : undefined;
}

function moveCallTypeArguments(
  node: CommandNode,
  typeArgumentsByIndex: ReadonlyMap<number, string | undefined>,
  nodePath: string,
  diagnostics: TransactionDiagnostic[],
): string[] | undefined {
  const slots = node.ports
    .map((port) => ({
      id: port.id,
      index:
        port.role === 'type' && port.direction === 'in'
          ? indexedInputHandleIndex(port.id, 'type')
          : undefined,
    }))
    .filter(
      (slot): slot is { id: string; index: number } => slot.index !== undefined,
    )
    .sort((left, right) => left.index - right.index);

  const typeArguments: string[] = [];
  for (const slot of slots) {
    if (!typeArgumentsByIndex.has(slot.index)) {
      diagnostics.push(
        graphDiagnostic(
          'graph.command.moveCall.typeArgumentMissing',
          `MoveCall ${node.id} requires a type edge into ${slot.id}.`,
          nodePath,
        ),
      );
      return undefined;
    }
    const typeArgument = typeArgumentsByIndex.get(slot.index);
    if (typeArgument === undefined) return undefined;
    typeArguments.push(typeArgument);
  }

  return typeArguments;
}

function objectIdParam(
  node: CommandNode,
  nodePath: string,
  key: string,
  diagnostics: TransactionDiagnostic[],
): string | undefined {
  const runtime = graphCommandRuntimeParams(node);
  const objectId = canonicalObjectId(runtime?.[key]);
  if (objectId) return objectId;

  diagnostics.push(
    graphDiagnostic(
      'graph.command.objectIdParam',
      `Command ${node.id} requires canonical Sui object ID runtime param ${key}.`,
      `${nodePath}.params.runtime.${key}`,
    ),
  );
  return undefined;
}

function objectIdArrayParam(
  node: CommandNode,
  nodePath: string,
  key: string,
  diagnostics: TransactionDiagnostic[],
): string[] | undefined {
  const runtime = graphCommandRuntimeParams(node);
  const value = runtime?.[key];
  const path = `${nodePath}.params.runtime.${key}`;
  if (!isDenseArray(value)) {
    diagnostics.push(
      graphDiagnostic(
        'graph.command.objectIdArrayParam',
        `Command ${node.id} requires Sui object ID array runtime param ${key}.`,
        path,
      ),
    );
    return undefined;
  }

  const items = value.map((item, index) => {
    const objectId = canonicalObjectId(item);
    if (objectId === undefined) {
      diagnostics.push(
        graphDiagnostic(
          'graph.command.objectIdParam',
          `Command ${node.id} runtime param ${key} item ${index} must be a canonical Sui object ID.`,
          `${path}[${index}]`,
        ),
      );
    }
    return objectId;
  });

  return items.every((item): item is string => item !== undefined)
    ? items
    : undefined;
}

function base64BytesArrayParam(
  node: CommandNode,
  nodePath: string,
  key: string,
  diagnostics: TransactionDiagnostic[],
): string[] | undefined {
  const runtime = graphCommandRuntimeParams(node);
  const value = runtime?.[key];
  const path = `${nodePath}.params.runtime.${key}`;
  if (!isDenseArray(value)) {
    diagnostics.push(
      graphDiagnostic(
        'graph.command.base64BytesParam',
        `Command ${node.id} requires a canonical base64-decodable base64 byte array runtime param ${key}.`,
        path,
      ),
    );
    return undefined;
  }

  const items = value.map((item, index) => {
    const bytes = parseBase64Bytes(item);
    if (bytes === undefined || bytes !== item) {
      diagnostics.push(
        graphDiagnostic(
          'graph.command.base64BytesParam',
          `Command ${node.id} runtime param ${key} item ${index} must be canonical base64-decodable base64 bytes.`,
          `${path}[${index}]`,
        ),
      );
      return undefined;
    }
    return bytes;
  });

  return items.every((item): item is string => item !== undefined)
    ? items
    : undefined;
}

function nonEmptyBase64BytesArrayParam(
  node: CommandNode,
  nodePath: string,
  key: string,
  diagnostics: TransactionDiagnostic[],
): string[] | undefined {
  const items = base64BytesArrayParam(node, nodePath, key, diagnostics);
  if (!items) return undefined;
  if (items.length > 0) return items;

  diagnostics.push(
    graphDiagnostic(
      'graph.command.emptyInput',
      `Command ${node.id} runtime param ${key} must not be empty.`,
      `${nodePath}.params.runtime.${key}`,
    ),
  );
  return undefined;
}

function typeTagFromNode(
  node: CommandNode,
  nodePath: string,
  diagnostics: TransactionDiagnostic[],
): string | null | undefined {
  const runtime = graphCommandRuntimeParams(node);
  if (runtime === undefined || runtime.type === undefined) return NULL_VALUE;
  if (runtime.type === NULL_VALUE) {
    return runtime.type;
  }
  if (typeof runtime.type === 'string') {
    const type = parseMoveTypeTag(runtime.type);
    if (type) return type;
  }

  diagnostics.push(
    graphDiagnostic(
      'graph.command.makeMoveVec.type',
      `MakeMoveVec ${node.id} runtime type must be a valid Move type tag or null when present.`,
      `${nodePath}.params.runtime.type`,
    ),
  );
  return undefined;
}

function edgeKey(nodeId: string, handleId: string): string {
  return `${nodeId}:${handleId}`;
}

function compareHandles(left: string, right: string): number {
  const leftKey = handleSortKey(left);
  const rightKey = handleSortKey(right);

  if (leftKey.prefix === rightKey.prefix) {
    if (leftKey.index !== undefined && rightKey.index !== undefined) {
      return leftKey.index - rightKey.index;
    }
    if (leftKey.index !== undefined) return -1;
    if (rightKey.index !== undefined) return 1;
  }

  return leftKey.raw.localeCompare(rightKey.raw);
}

function handleSortKey(value: string): {
  raw: string;
  prefix: string;
  index?: number;
} {
  const suffix = indexedHandleSuffix(value);
  return suffix
    ? { raw: value, prefix: suffix.prefix, index: suffix.index }
    : { raw: value, prefix: value };
}
