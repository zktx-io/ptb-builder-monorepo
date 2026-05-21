import { describe, expect, it } from 'vitest';

import { GRAPH_DIAGNOSTIC_META } from './diagnostics/metadata.js';

describe('graph diagnostic metadata', () => {
  it('locks graph diagnostic category and blocking metadata', () => {
    const documentAndExecution = { document: true, execution: true } as const;
    const executionOnly = { document: false, execution: true } as const;
    const expectedShapeDocumentCodes = [
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
      'graph.command.params.unknownField',
      'graph.command.makeMoveVec.type',
      'graph.edge',
      'graph.edge.cast',
      'graph.edge.cast.unknownField',
      'graph.edge.endpoint',
      'graph.edge.id',
      'graph.edge.kind',
      'graph.edge.unknownField',
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
      'graph.typeArgument.port',
      'graph.typeArgument.value',
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
    const expectedShapeExecutionCodes = [
      'graph.command.base64BytesParam',
      'graph.command.objectIdArrayParam',
      'graph.command.objectIdParam',
      'graph.command.emptyInput',
      'graph.input.object.invalidKind',
      'graph.input.object.unresolved',
    ] as const;
    const expectedReferenceDocumentCodes = [
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
    const expectedReferenceExecutionCodes = ['graph.arg.source'] as const;
    const expectedSemanticExecutionCodes = [
      'graph.command.inputMissing',
      'graph.command.moveCall.typeArgumentMissing',
      'graph.command.moveCall.targetMissing',
      'graph.edge.castApplicability',
      'graph.flow.cycle',
      'graph.flow.disconnected',
      'graph.flow.end',
      'graph.flow.path',
      'graph.flow.start',
      'graph.typeArgument.valueMissing',
      'graph.variable.duplicateName',
    ] as const;
    const expectedSemanticDocumentCodes = [
      'graph.command.outputPort.invalid',
    ] as const;
    const expectedEvidenceExecutionCodes = [
      'graph.ir.resultArity',
      'graph.command.moveCall.resultCountMismatch',
      'graph.command.moveCall.typeArgumentsCount',
    ] as const;
    const entries = [
      ...expectedShapeDocumentCodes.map((code) => [
        code,
        { category: 'shape', blocks: documentAndExecution },
      ]),
      ...expectedShapeExecutionCodes.map((code) => [
        code,
        { category: 'shape', blocks: executionOnly },
      ]),
      ...expectedReferenceDocumentCodes.map((code) => [
        code,
        { category: 'reference', blocks: documentAndExecution },
      ]),
      ...expectedReferenceExecutionCodes.map((code) => [
        code,
        { category: 'reference', blocks: executionOnly },
      ]),
      ...expectedSemanticDocumentCodes.map((code) => [
        code,
        { category: 'semantic', blocks: documentAndExecution },
      ]),
      ...expectedSemanticExecutionCodes.map((code) => [
        code,
        { category: 'semantic', blocks: executionOnly },
      ]),
      ...expectedEvidenceExecutionCodes.map((code) => [
        code,
        { category: 'evidence', blocks: executionOnly },
      ]),
    ] as const;
    const expected = Object.fromEntries(entries);

    expect(new Set(entries.map(([code]) => code)).size).toBe(entries.length);
    expect([...Object.keys(expected)].sort()).toEqual(
      [...Object.keys(GRAPH_DIAGNOSTIC_META)].sort(),
    );
    expect(GRAPH_DIAGNOSTIC_META).toEqual(expected);
  });
});
