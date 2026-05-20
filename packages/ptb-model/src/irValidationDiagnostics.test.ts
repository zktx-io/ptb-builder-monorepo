import { describe, expect, it } from 'vitest';

import { validateTransactionIR } from './index.js';

describe('TransactionIR validation diagnostics', () => {
  it('keeps unsupported input kinds on the diagnostic path', () => {
    expect(
      validateTransactionIR({
        version: 'transaction_ir_1',
        inputs: [{ id: 'input', kind: 'UnknownInput' }],
        commands: [],
        diagnostics: [],
      }),
    ).toContainEqual(
      expect.objectContaining({
        code: 'ir.input.kind',
        category: 'semantic',
        path: '$.inputs[0].kind',
      }),
    );
  });

  it('keeps unsupported command kinds on the diagnostic path', () => {
    expect(
      validateTransactionIR({
        version: 'transaction_ir_1',
        inputs: [],
        commands: [{ id: 'command', kind: 'UnknownCommand' }],
        diagnostics: [],
      }),
    ).toContainEqual(
      expect.objectContaining({
        code: 'ir.command.kind',
        category: 'semantic',
        path: '$.commands[0].kind',
      }),
    );
  });

  it('keeps unsupported argument reference kinds on the diagnostic path', () => {
    expect(
      validateTransactionIR({
        version: 'transaction_ir_1',
        inputs: [],
        commands: [
          {
            id: 'command',
            kind: 'MoveCall',
            package:
              '0x0000000000000000000000000000000000000000000000000000000000000002',
            module: 'm',
            function: 'f',
            typeArguments: [],
            arguments: [{ kind: 'UnknownArg' }],
            resultCount: 0,
          },
        ],
        diagnostics: [],
      }),
    ).toContainEqual(
      expect.objectContaining({
        code: 'ir.arg.kind',
        category: 'semantic',
        path: '$.commands[0].arguments[0].kind',
      }),
    );
  });

  it('keeps malformed stored diagnostics on the diagnostic path', () => {
    expect(
      validateTransactionIR({
        version: 'transaction_ir_1',
        inputs: [],
        commands: [],
        diagnostics: [{ code: 7 }],
      }),
    ).toContainEqual(
      expect.objectContaining({
        code: 'ir.diagnostic',
        category: 'semantic',
        path: '$.diagnostics[0]',
      }),
    );
  });
});
