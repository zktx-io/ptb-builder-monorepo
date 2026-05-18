import { describe, expect, it } from 'vitest';

import {
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
