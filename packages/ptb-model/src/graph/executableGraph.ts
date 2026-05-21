import { graphToTransactionIR } from './convert.js';
import {
  type ExecutablePTBGraph,
  markExecutablePTBGraph,
} from './executableGraphState.js';
import type { PTBGraph } from './shapes.js';
import { analyzePTBGraph, type ParseExecutableGraphOptions } from './types.js';
import { assertNoErrors } from '../ir/diagnostics.js';
import { normalizeMovePackageSignatureEvidenceOption } from '../move/evidence.js';
import { cloneJsonLike } from '../utils.js';

export function parseExecutableGraph(
  value: unknown,
  options: ParseExecutableGraphOptions = {},
): ExecutablePTBGraph {
  const moveSignatures = normalizeMovePackageSignatureEvidenceOption(
    options.moveSignatures,
  );
  const ir = graphToTransactionIR(value as PTBGraph, {
    path: options.path,
    moveSignatures,
  });

  assertNoErrors('PTB graph is not executable.', ir.diagnostics);

  const analysis = analyzePTBGraph(value, {
    ...options,
    moveSignatures,
  });
  const graph = cloneJsonLike(value) as PTBGraph;
  return markExecutablePTBGraph(graph, { analysis, moveSignatures });
}
