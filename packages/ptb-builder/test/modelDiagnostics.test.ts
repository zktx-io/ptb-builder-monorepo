import { describe, expect, it } from 'vitest';

import {
  displayModelDiagnostics,
  formatModelDiagnostic,
  formatModelDiagnosticLine,
  formatModelErrorMessage,
} from '../src/ui/modelDiagnostics';

describe('model diagnostic presentation', () => {
  it('maps known model diagnostics to user-facing builder messages', () => {
    expect(
      formatModelDiagnostic({
        code: 'graph.edge.cast',
        message: 'model detail',
      }),
    ).toContain('edge cast is invalid');

    expect(
      formatModelDiagnostic({
        code: 'ir.arg.pureType',
        message: 'model detail',
      }),
    ).toContain('wrong pure type');

    expect(
      formatModelDiagnostic({
        code: 'ir.input.unsupportedValue',
        message: 'model detail',
      }),
    ).toContain('not JSON-compatible');
  });

  it('uses abstract-number guidance before the original model text', () => {
    expect(
      formatModelDiagnostic({
        code: 'ir.input.pureValue',
        message:
          'Pure input amount uses the abstract number placeholder; choose a concrete Move integer width.',
      }),
    ).toContain('Choose a concrete Move integer width');
  });

  it('maps Move signature evidence diagnostics to metadata-specific guidance', () => {
    expect(
      formatModelDiagnostic({
        code: 'graph.command.moveCall.typeArgumentsCount',
        message: 'model detail',
      }),
    ).toContain('verified Move signature metadata');

    expect(
      formatModelDiagnostic({
        code: 'ir.command.moveCall.resultCountMismatch',
        message: 'model detail',
      }),
    ).toContain('result count');

    expect(
      formatModelDiagnostic({
        code: 'ir.command.makeMoveVec.elementTypeMismatch',
        message: 'model detail',
      }),
    ).toContain('MakeMoveVec element type');
  });

  it('hides IR MoveCall evidence diagnostics up to the matching graph diagnostic count', () => {
    const diagnostics = [
      {
        code: 'graph.command.moveCall.resultCountMismatch',
        message: 'graph detail',
      },
      {
        code: 'ir.command.moveCall.resultCountMismatch',
        message: 'first ir detail',
      },
      {
        code: 'ir.command.moveCall.resultCountMismatch',
        message: 'second ir detail',
      },
      {
        code: 'ir.command.makeMoveVec.elementTypeMismatch',
        message: 'vec detail',
      },
    ];
    const display = displayModelDiagnostics(diagnostics);

    expect(display.map((diagnostic) => diagnostic.code)).toEqual([
      'graph.command.moveCall.resultCountMismatch',
      'ir.command.moveCall.resultCountMismatch',
      'ir.command.makeMoveVec.elementTypeMismatch',
    ]);
    expect(display.map((diagnostic) => diagnostic.message)).toEqual([
      'graph detail',
      'second ir detail',
      'vec detail',
    ]);
    const message = formatModelErrorMessage({ diagnostics }, 'fallback');
    expect(message.match(/MoveCall result count/g)).toHaveLength(1);
    expect(message).toContain('2 more diagnostics.');
    expect(message).not.toContain('MakeMoveVec element type');
  });

  it('applies count-limited duplicate hiding to MoveCall type argument diagnostics', () => {
    const display = displayModelDiagnostics([
      {
        code: 'graph.command.moveCall.typeArgumentsCount',
        message: 'graph detail',
      },
      {
        code: 'ir.command.moveCall.typeArgumentsCount',
        message: 'first ir detail',
      },
      {
        code: 'ir.command.moveCall.typeArgumentsCount',
        message: 'second ir detail',
      },
    ]);

    expect(display.map((diagnostic) => diagnostic.code)).toEqual([
      'graph.command.moveCall.typeArgumentsCount',
      'ir.command.moveCall.typeArgumentsCount',
    ]);
    expect(display.map((diagnostic) => diagnostic.message)).toEqual([
      'graph detail',
      'second ir detail',
    ]);
  });

  it('preserves code and path while falling back unknown diagnostics to model text', () => {
    expect(
      formatModelDiagnosticLine({
        code: 'custom.diagnostic',
        path: '$.inputs[0]',
        message: 'Original model message.',
      }),
    ).toBe('[custom.diagnostic] $.inputs[0]: Original model message.');
  });

  it('formats PTBModelError-like diagnostics for toast messages', () => {
    expect(
      formatModelErrorMessage(
        {
          diagnostics: [
            {
              code: 'ir.command.unsupported',
              message: 'Unsupported command.',
            },
          ],
        },
        'fallback',
      ),
    ).toContain('unsupported command');
  });
});
