import { inferGraphInputTypes } from './inputInference.js';
import type { GraphInputTypeInference } from './inputInference.js';
import { freezePTBGraph } from './types.js';
import type {
  AnalyzePTBGraphOptions,
  PTBGraph,
  PTBType,
  VariableNode,
} from './types.js';
import { decodeCanonicalPureBytesValue } from '../ir/pure.js';
import { cloneJsonLike } from '../utils.js';

export interface GraphInputValueMaterializationOptions
  extends Pick<AnalyzePTBGraphOptions, 'moveSignatures'> {}

export interface GraphInputValueMaterialization {
  nodeId: string;
  type: PTBType;
  value: unknown;
}

export interface GraphInputValueMaterializationResult {
  graph: PTBGraph;
  typeInferences: readonly GraphInputTypeInference[];
  valueMaterializations: readonly GraphInputValueMaterialization[];
}

/**
 * Prepare graph inputs for editing by first inferring unknown input types and
 * then converting canonical raw Pure bytes into typed values when the conversion
 * is lossless. Object, FundsWithdrawal, and unsupported inputs are preserved.
 */
export function materializeGraphInputValues(
  graph: PTBGraph,
  options: GraphInputValueMaterializationOptions = {},
): GraphInputValueMaterializationResult {
  const inferred = inferGraphInputTypes(graph, options);
  const valueMaterializations: GraphInputValueMaterialization[] = [];
  let changed = inferred.graph !== graph;

  const nodes = inferred.graph.nodes.map((node) => {
    if (node.kind !== 'Variable') return node;

    const materialized = materializeVariableInputValue(node);
    if (!materialized) return node;

    changed = true;
    valueMaterializations.push({
      nodeId: node.id,
      type: cloneJsonLike(node.varType),
      value: cloneJsonLike(materialized.value),
    });
    return materialized.node;
  });

  return {
    graph: changed
      ? freezePTBGraph({
          nodes: nodes.map((node) => cloneJsonLike(node)),
          edges: inferred.graph.edges.map((edge) => cloneJsonLike(edge)),
        })
      : inferred.graph,
    typeInferences: inferred.inferences,
    valueMaterializations,
  };
}

function materializeVariableInputValue(
  node: VariableNode,
): { node: VariableNode; value: unknown } | undefined {
  if (node.rawInput?.kind !== 'Pure') return undefined;
  if (Object.prototype.hasOwnProperty.call(node, 'value')) return undefined;
  if (node.varType.kind === 'unknown') return undefined;

  const decoded = decodeCanonicalPureBytesValue(
    node.varType,
    node.rawInput.bytes,
  );
  if (!decoded.ok) return undefined;

  const value = cloneJsonLike(decoded.value);
  const { rawInput: _rawInput, ...rest } = node;

  return {
    value,
    node: {
      ...rest,
      value,
      ports: node.ports.map((port) =>
        port.role === 'io' && port.direction === 'out'
          ? { ...port, dataType: node.varType }
          : port,
      ),
    },
  };
}
