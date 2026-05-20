import { NULL_VALUE } from '../utils.js';

export const DIAGNOSTIC_CATEGORIES = [
  'shape',
  'reference',
  'semantic',
  'evidence',
] as const;

export type DiagnosticCategory = (typeof DIAGNOSTIC_CATEGORIES)[number];

export interface DiagnosticBlocks {
  readonly document: boolean;
  readonly execution: boolean;
}

type GraphDiagnosticMeta = {
  readonly category: DiagnosticCategory;
  readonly blocks: DiagnosticBlocks;
};

const BLOCKS_DOCUMENT_AND_EXECUTION = {
  document: true,
  execution: true,
} as const;
const BLOCKS_EXECUTION_ONLY = {
  document: false,
  execution: true,
} as const;

const SHAPE_DOCUMENT_CODES = [
  'graph.invalid',
  'graph.unknownField',
  'graph.nodes',
  'graph.edges',
  'graph.node',
  'graph.node.id',
  'graph.node.kind',
  'graph.node.label',
  'graph.node.ports',
  'graph.node.position',
  'graph.node.position.unknownField',
  'graph.node.unknownField',
  'graph.command.kind',
  'graph.command.inputPort.invalid',
  'graph.command.params',
  'graph.command.params.runtime',
  'graph.command.params.runtime.dependencies',
  'graph.command.params.runtime.field',
  'graph.command.params.runtime.modules',
  'graph.command.params.runtime.resultCount',
  'graph.command.params.runtime.sourceKind',
  'graph.command.params.runtime.target',
  'graph.command.params.runtime.type',
  'graph.command.params.runtime.unknownField',
  'graph.command.params.ui',
  'graph.command.params.ui.count',
  'graph.command.params.ui.unknownField',
  'graph.command.params.unknownField',
  'graph.command.makeMoveVec.type',
  'graph.typeArgument.port',
  'graph.typeArgument.value',
  'graph.command.base64BytesParam',
  'graph.command.objectIdArrayParam',
  'graph.command.objectIdParam',
  'graph.command.emptyInput',
  'graph.edge',
  'graph.edge.cast',
  'graph.edge.cast.unknownField',
  'graph.edge.endpoint',
  'graph.edge.id',
  'graph.edge.kind',
  'graph.edge.unknownField',
  'graph.input.object.invalidKind',
  'graph.input.object.unresolved',
  'graph.plainData',
  'graph.port',
  'graph.port.direction',
  'graph.port.field',
  'graph.port.id',
  'graph.port.role',
  'graph.port.unknownField',
  'graph.rawInput',
  'graph.rawInput.fundsWithdrawal',
  'graph.rawInput.kind',
  'graph.rawInput.object',
  'graph.rawInput.objectKind',
  'graph.rawInput.pure',
  'graph.rawInput.unknownField',
  'graph.type',
  'graph.type.depth',
  'graph.type.cycle',
  'graph.type.kind',
  'graph.type.scalar',
  'graph.type.numeric',
  'graph.type.tuple',
  'graph.type.object',
  'graph.type.unknown',
  'graph.type.unknownField',
  'graph.variable.name',
  'graph.variable.optionValue',
  'graph.variable.rawInputType',
  'graph.variable.rawInputValue',
  'graph.variable.semantic',
  'graph.variable.semantic.kind',
  'graph.variable.semantic.sourceKind',
  'graph.variable.semantic.unknownField',
  'graph.variable.sourceConflict',
] as const;

const REFERENCE_DOCUMENT_CODES = [
  'graph.arg.source',
  'graph.edge.direction',
  'graph.edge.duplicate',
  'graph.edge.duplicateFlowSource',
  'graph.edge.duplicateFlowTarget',
  'graph.edge.duplicateTarget',
  'graph.edge.flow',
  'graph.edge.handle',
  'graph.edge.io',
  'graph.edge.node',
  'graph.edge.role',
  'graph.edge.type',
  'graph.node.duplicate',
  'graph.port.duplicate',
] as const;

const SEMANTIC_EXECUTION_CODES = [
  'graph.command.inputMissing',
  'graph.command.moveCall.typeArgumentMissing',
  'graph.command.moveCall.targetMissing',
  'graph.command.outputPort.invalid',
  'graph.flow.cycle',
  'graph.flow.disconnected',
  'graph.flow.end',
  'graph.flow.path',
  'graph.flow.start',
  'graph.typeArgument.valueMissing',
  'graph.variable.duplicateName',
] as const;

const EVIDENCE_EXECUTION_CODES = [
  'graph.command.moveCall.resultCountMismatch',
  'graph.command.moveCall.typeArgumentsCount',
] as const;

const ALL_GRAPH_DIAGNOSTIC_CODES = [
  ...SHAPE_DOCUMENT_CODES,
  ...REFERENCE_DOCUMENT_CODES,
  ...SEMANTIC_EXECUTION_CODES,
  ...EVIDENCE_EXECUTION_CODES,
] as const;

export type GraphDiagnosticCode = (typeof ALL_GRAPH_DIAGNOSTIC_CODES)[number];

function meta(
  category: DiagnosticCategory,
  blocks: DiagnosticBlocks,
): GraphDiagnosticMeta {
  return { category, blocks };
}

function metaEntries<const Codes extends readonly string[]>(
  codes: Codes,
  category: DiagnosticCategory,
  blocks: DiagnosticBlocks,
): Record<Codes[number], GraphDiagnosticMeta> {
  return Object.fromEntries(
    codes.map((code) => [code, meta(category, blocks)]),
  ) as Record<Codes[number], GraphDiagnosticMeta>;
}

export const GRAPH_DIAGNOSTIC_META: Record<
  GraphDiagnosticCode,
  GraphDiagnosticMeta
> = {
  ...metaEntries(SHAPE_DOCUMENT_CODES, 'shape', BLOCKS_DOCUMENT_AND_EXECUTION),
  ...metaEntries(
    REFERENCE_DOCUMENT_CODES,
    'reference',
    BLOCKS_DOCUMENT_AND_EXECUTION,
  ),
  ...metaEntries(SEMANTIC_EXECUTION_CODES, 'semantic', BLOCKS_EXECUTION_ONLY),
  ...metaEntries(EVIDENCE_EXECUTION_CODES, 'evidence', BLOCKS_EXECUTION_ONLY),
};

export function isDiagnosticCategory(
  value: unknown,
): value is DiagnosticCategory {
  return (
    typeof value === 'string' &&
    (DIAGNOSTIC_CATEGORIES as readonly string[]).includes(value)
  );
}

export function isDiagnosticBlocks(value: unknown): value is DiagnosticBlocks {
  if (
    typeof value !== 'object' ||
    value === NULL_VALUE ||
    Array.isArray(value)
  ) {
    return false;
  }
  const blocks = value as Record<string, unknown>;
  return (
    typeof blocks.document === 'boolean' &&
    typeof blocks.execution === 'boolean' &&
    Object.keys(blocks).every(
      (key) => key === 'document' || key === 'execution',
    )
  );
}

export function isGraphDiagnosticCode(
  code: string,
): code is GraphDiagnosticCode {
  return Object.prototype.hasOwnProperty.call(GRAPH_DIAGNOSTIC_META, code);
}
