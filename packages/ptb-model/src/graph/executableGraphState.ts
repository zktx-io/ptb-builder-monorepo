import type { GraphMoveCallEvidenceState } from './moveCallEvidence.js';
import type { PTBGraph } from './shapes.js';
import {
  freezeDiagnostics,
  type TransactionDiagnostic,
} from '../ir/diagnostics.js';
import type { MovePackageSignatureEvidence } from '../move/evidence.js';
import {
  cloneJsonLike,
  deepFreezeJsonLike,
  findNonPlainData,
  NULL_VALUE,
} from '../utils.js';

declare const EXECUTABLE_PTB_GRAPH_BRAND: unique symbol;

export type ExecutablePTBGraph = PTBGraph & {
  readonly [EXECUTABLE_PTB_GRAPH_BRAND]: true;
};

export interface ExecutablePTBGraphFacts {
  analysis: {
    diagnostics: readonly TransactionDiagnostic[];
    moveCallEvidenceByNodeId: ReadonlyMap<string, GraphMoveCallEvidenceState>;
  };
  moveSignatures?: MovePackageSignatureEvidence;
}

const executableGraphs = new WeakSet<object>();
const executableGraphFacts = new WeakMap<object, ExecutablePTBGraphFacts>();

export function markExecutablePTBGraph(
  graph: PTBGraph,
  facts: ExecutablePTBGraphFacts,
): ExecutablePTBGraph {
  const plainDataIssue = findNonPlainData(graph);
  if (plainDataIssue) {
    throw new TypeError(
      `ExecutablePTBGraph cannot contain non-plain data at ${plainDataIssue.path}.`,
    );
  }
  freezePTBGraph(graph);
  executableGraphs.add(graph);
  executableGraphFacts.set(graph, snapshotExecutablePTBGraphFacts(facts));
  return graph as ExecutablePTBGraph;
}

export function isExecutablePTBGraph(
  value: unknown,
): value is ExecutablePTBGraph {
  return (
    typeof value === 'object' &&
    value !== NULL_VALUE &&
    Object.isFrozen(value) &&
    executableGraphs.has(value)
  );
}

export function executablePTBGraphFacts(
  graph: ExecutablePTBGraph,
): ExecutablePTBGraphFacts | undefined {
  const facts = executableGraphFacts.get(graph);
  return facts ? snapshotExecutablePTBGraphFacts(facts) : undefined;
}

export function freezePTBGraph<T extends PTBGraph>(graph: T): T {
  deepFreezeJsonLike(graph);
  return graph;
}

function snapshotExecutablePTBGraphFacts(
  facts: ExecutablePTBGraphFacts,
): ExecutablePTBGraphFacts {
  const moveCallEvidenceByNodeId = new Map<
    string,
    GraphMoveCallEvidenceState
  >();
  facts.analysis.moveCallEvidenceByNodeId.forEach((state, nodeId) => {
    const clonedState = cloneJsonLike(state);
    deepFreezeJsonLike(clonedState);
    moveCallEvidenceByNodeId.set(nodeId, clonedState);
  });

  const moveSignatures =
    facts.moveSignatures === undefined
      ? undefined
      : cloneJsonLike(facts.moveSignatures);
  if (moveSignatures !== undefined) {
    deepFreezeJsonLike(moveSignatures);
  }

  return Object.freeze({
    analysis: Object.freeze({
      diagnostics: freezeDiagnostics(facts.analysis.diagnostics),
      moveCallEvidenceByNodeId,
    }),
    ...(moveSignatures !== undefined ? { moveSignatures } : {}),
  });
}
