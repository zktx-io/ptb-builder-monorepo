import {
  assertNoErrors,
  errorDiagnostic,
  hasErrors,
  PTBModelError,
} from '../ir/diagnostics.js';
import type { TransactionDiagnostic } from '../ir/diagnostics.js';
import {
  isPureValueCompatible,
  normalizePureValueForRender,
  pureTypeName,
} from '../ir/pure.js';
import { isStructuralTransactionIR } from '../ir/structural.js';
import type {
  IRArgRef,
  IRCommand,
  IRInput,
  TransactionIR,
} from '../ir/types.js';
import { validateTransactionIR } from '../ir/validate.js';
import type { RawFundsWithdrawalArg } from '../raw/types.js';
import { jsonStringifyWithBigInt } from '../utils.js';

const TS_CODE_UNSAFE_LITERAL_CHAR =
  /[\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060\u2066-\u2069\ufeff]/g;

export function transactionIRToTsSdkCode(ir: TransactionIR): string {
  assertTsSdkRenderableIR(ir);

  const lines = [`import { Transaction } from '@mysten/sui/transactions';`, ''];

  if (
    ir.inputs.some(
      (input) => input.kind === 'Pure' && input.bytes !== undefined,
    )
  ) {
    lines.push(
      `const fromBase64 = (value: string): Uint8Array => {`,
      `  const atob = (globalThis as { atob?: (value: string) => string }).atob;`,
      `  if (!atob) throw new Error('No atob base64 decoder is available.');`,
      `  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));`,
      `};`,
      '',
    );
  }

  lines.push(
    'export function buildTransaction() {',
    '  const tx = new Transaction();',
  );

  ir.inputs.forEach((input, index) => {
    lines.push(renderInput(input, index));
  });

  ir.commands.forEach((command, index) => {
    renderCommand(command, index).forEach((line) => lines.push(line));
  });

  lines.push('  return tx;');
  lines.push('}');
  lines.push('');

  return lines.join('\n');
}

function renderInput(input: IRInput, index: number): string {
  const name = inputName(index);
  switch (input.kind) {
    case 'Pure':
      if (input.bytes !== undefined) {
        return `  const ${name} = tx.pure(fromBase64(${renderCodeString(input.bytes)}));`;
      }
      return renderTypedPureInput(name, input);
    case 'Object':
      if (!input.object) {
        throwTsSdkCodeError(
          'codegen.input.object',
          `Object input ${input.id} has no resolved object reference.`,
          `$.inputs[${index}].object`,
        );
      }
      switch (input.object.kind) {
        case 'ImmOrOwnedObject':
          return `  const ${name} = tx.objectRef(${renderCodeJson({
            objectId: input.object.objectId,
            version: input.object.version,
            digest: input.object.digest,
          })});`;
        case 'SharedObject':
          return `  const ${name} = tx.sharedObjectRef(${renderCodeJson({
            objectId: input.object.objectId,
            initialSharedVersion: input.object.initialSharedVersion,
            mutable: input.object.mutable,
          })});`;
        case 'Receiving':
          return `  const ${name} = tx.receivingRef(${renderCodeJson({
            objectId: input.object.objectId,
            version: input.object.version,
            digest: input.object.digest,
          })});`;
      }
      throwTsSdkCodeError(
        'codegen.input.objectKind',
        `Object input ${input.id} has unsupported object kind ${String((input.object as { kind?: unknown }).kind)}.`,
        `$.inputs[${index}].object.kind`,
      );
    case 'FundsWithdrawal':
      return `  const ${name} = tx.withdrawal(${renderFundsWithdrawal(
        input.value,
      )});`;
    case 'Unsupported':
      throwTsSdkCodeError(
        'codegen.input.unsupported',
        `Unsupported input ${input.id} cannot be rendered to TS SDK code.`,
        `$.inputs[${index}]`,
      );
  }
}

export function assertTsSdkRenderableIR(ir: TransactionIR): void {
  assertNoErrors(
    'TransactionIR cannot be rendered to TS SDK code.',
    validateTsSdkRenderableIR(ir),
  );
}

export function validateTsSdkRenderableIR(
  ir: TransactionIR,
): TransactionDiagnostic[] {
  const diagnostics = [
    ...(isStructuralTransactionIR(ir)
      ? []
      : validateTransactionIR(ir, {
          includeExistingDiagnostics: false,
          includeUnsupportedDiagnostics: false,
        })),
  ];
  if (hasErrors(diagnostics)) {
    return diagnostics;
  }

  ir.inputs.forEach((input, index) => {
    switch (input.kind) {
      case 'Pure':
        return;
      case 'Object':
        if (!input.object) {
          diagnostics.push(
            errorDiagnostic(
              'codegen.input.object',
              `Object input ${input.id} requires a resolved object reference for TS SDK code generation.`,
              `$.inputs[${index}].object`,
            ),
          );
        }
        return;
      case 'FundsWithdrawal':
        if (input.value.withdrawFrom.kind !== 'Sender') {
          diagnostics.push(
            errorDiagnostic(
              'codegen.input.fundsWithdrawalSponsor',
              'Sponsor FundsWithdrawal cannot be rendered with the public @mysten/sui Transaction helper surface.',
              `$.inputs[${index}].value.withdrawFrom`,
            ),
          );
        }
        return;
      case 'Unsupported':
        diagnostics.push(
          errorDiagnostic(
            'codegen.input.unsupported',
            `Unsupported input ${input.id} cannot be rendered to TS SDK code.`,
            `$.inputs[${index}]`,
          ),
        );
        return;
    }
  });

  ir.commands.forEach((command, index) => {
    if (command.kind !== 'Unsupported') return;
    diagnostics.push(
      errorDiagnostic(
        'codegen.command.unsupported',
        `Unsupported command ${command.id} cannot be rendered to TS SDK code.`,
        `$.commands[${index}]`,
      ),
    );
  });

  return diagnostics;
}

function renderCommand(command: IRCommand, index: number): string[] {
  switch (command.kind) {
    case 'MoveCall':
      return [
        `  const ${resultName(index)} = tx.moveCall({`,
        `    package: ${renderCodeString(command.package)},`,
        `    module: ${renderCodeString(command.module)},`,
        `    function: ${renderCodeString(command.function)},`,
        `    typeArguments: ${renderCodeJson(command.typeArguments)},`,
        `    arguments: [${command.arguments.map(renderArg).join(', ')}],`,
        '  });',
      ];
    case 'TransferObjects':
      return [
        `  tx.transferObjects([${command.objects.map(renderArg).join(', ')}], ${renderArg(command.address)});`,
      ];
    case 'SplitCoins':
      return [
        `  const ${resultName(index)} = tx.splitCoins(${renderArg(command.coin)}, [${command.amounts
          .map(renderArg)
          .join(', ')}]);`,
      ];
    case 'MergeCoins':
      return [
        `  tx.mergeCoins(${renderArg(command.destination)}, [${command.sources
          .map(renderArg)
          .join(', ')}]);`,
      ];
    case 'Publish':
      return [
        `  const ${resultName(index)} = tx.publish({ modules: ${renderCodeJson(
          command.modules,
        )}, dependencies: ${renderCodeJson(command.dependencies)} });`,
      ];
    case 'MakeMoveVec':
      return [
        `  const ${resultName(index)} = tx.makeMoveVec({ type: ${renderNullableString(
          command.type,
        )}, elements: [${command.elements.map(renderArg).join(', ')}] });`,
      ];
    case 'Upgrade':
      return [
        `  const ${resultName(index)} = tx.upgrade({ modules: ${renderCodeJson(
          command.modules,
        )}, dependencies: ${renderCodeJson(command.dependencies)}, package: ${renderCodeString(
          command.package,
        )}, ticket: ${renderArg(command.ticket)} });`,
      ];
    case 'Unsupported':
      throwTsSdkCodeError(
        'codegen.command.unsupported',
        `Unsupported command ${command.id} cannot be rendered to TS SDK code.`,
        `$.commands[${index}]`,
      );
  }
}

function renderArg(arg: IRArgRef): string {
  switch (arg.kind) {
    case 'GasCoin':
      return 'tx.gas';
    case 'Input':
      return inputName(arg.index);
    case 'Result':
      return resultName(arg.commandIndex);
    case 'NestedResult':
      return `${resultName(arg.commandIndex)}[${arg.resultIndex}]`;
  }
}

function renderUnknownValue(value: unknown): string {
  if (typeof value === 'undefined') return 'undefined';
  return renderCodeJson(value);
}

function renderNullableString(value: string | null): string {
  return typeof value === 'string' ? renderCodeString(value) : 'undefined';
}

function renderFundsWithdrawal(value: RawFundsWithdrawalArg): string {
  if (value.withdrawFrom.kind !== 'Sender') {
    throwTsSdkCodeError(
      'codegen.input.fundsWithdrawalSponsor',
      'Sponsor FundsWithdrawal cannot be rendered with the public @mysten/sui Transaction helper surface.',
      '$.inputs[].value.withdrawFrom',
    );
  }

  return renderCodeJson({
    amount: value.reservation.amount,
    type: value.typeArg.type,
  });
}

function renderTypedPureInput(
  name: string,
  input: Extract<IRInput, { kind: 'Pure' }>,
): string {
  const expression =
    input.type && hasPureValue(input)
      ? renderPureInputExpression(input.type, input.value)
      : undefined;
  if (!expression) {
    throwTsSdkCodeError(
      'codegen.input.pure',
      `Pure input ${input.id} requires raw bytes or a supported pure type and value for TS SDK code generation.`,
      '$.inputs[].value',
    );
  }

  return `  const ${name} = ${expression};`;
}

function renderPureInputExpression(
  type: NonNullable<Extract<IRInput, { kind: 'Pure' }>['type']>,
  value: unknown,
): string | undefined {
  if (!isPureValueCompatible(type, value)) {
    return undefined;
  }

  if (type.kind === 'option') {
    const elemTypeName = pureTypeName(type.elem);
    return elemTypeName
      ? `tx.pure.option(${renderCodeString(elemTypeName)}, ${renderUnknownValue(
          normalizePureValueForRender(type, value),
        )})`
      : undefined;
  }

  const typeName = pureTypeName(type);
  return typeName
    ? `tx.pure(${renderCodeString(typeName)}, ${renderUnknownValue(
        normalizePureValueForRender(type, value),
      )})`
    : undefined;
}

function renderCodeString(value: string): string {
  return escapeTsCodeLiteral(JSON.stringify(value));
}

function renderCodeJson(value: unknown): string {
  return escapeTsCodeLiteral(jsonStringifyWithBigInt(value));
}

function escapeTsCodeLiteral(value: string): string {
  return value.replace(TS_CODE_UNSAFE_LITERAL_CHAR, (char) => {
    const codePoint = char.codePointAt(0) ?? 0;
    return `\\u${codePoint.toString(16).toUpperCase().padStart(4, '0')}`;
  });
}

function hasPureValue(input: Extract<IRInput, { kind: 'Pure' }>): boolean {
  return Object.prototype.hasOwnProperty.call(input, 'value');
}

function throwTsSdkCodeError(
  code: string,
  message: string,
  path: string,
): never {
  throw new PTBModelError('TransactionIR cannot be rendered to TS SDK code.', [
    errorDiagnostic(code, message, path),
  ]);
}

function inputName(index: number): string {
  return `input${index}`;
}

function resultName(index: number): string {
  return `result${index}`;
}
