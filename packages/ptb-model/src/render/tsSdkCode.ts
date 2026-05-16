import { isPTBType } from '../graph/types.js';
import type { PTBType } from '../graph/types.js';
import {
  assertNoErrors,
  errorDiagnostic,
  hasErrors,
  PTBModelError,
} from '../ir/diagnostics.js';
import type { TransactionDiagnostic } from '../ir/diagnostics.js';
import type {
  IRArgRef,
  IRCommand,
  IRInput,
  TransactionIR,
} from '../ir/types.js';
import { validateTransactionIR } from '../ir/validate.js';
import { parseObjectId } from '../raw/types.js';
import type { RawFundsWithdrawalArg } from '../raw/types.js';
import {
  isDenseArray,
  jsonStringifyWithBigInt,
  NULL_VALUE,
  quote,
} from '../utils.js';

const U64_MAX = 2n ** 64n - 1n;
const U128_MAX = 2n ** 128n - 1n;
const U256_MAX = 2n ** 256n - 1n;

export function transactionIRToTsSdkCode(ir: TransactionIR): string {
  const diagnostics = validateTsSdkRenderableIR(ir);
  assertNoErrors(
    'TransactionIR cannot be rendered to TS SDK code.',
    diagnostics,
  );

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
        return `  const ${name} = tx.pure(fromBase64(${quote(input.bytes)}));`;
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
          return `  const ${name} = tx.objectRef(${jsonStringifyWithBigInt({
            objectId: input.object.objectId,
            version: input.object.version,
            digest: input.object.digest,
          })});`;
        case 'SharedObject':
          return `  const ${name} = tx.sharedObjectRef(${jsonStringifyWithBigInt(
            {
              objectId: input.object.objectId,
              initialSharedVersion: input.object.initialSharedVersion,
              mutable: input.object.mutable,
            },
          )});`;
        case 'Receiving':
          return `  const ${name} = tx.receivingRef(${jsonStringifyWithBigInt({
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

function validateTsSdkRenderableIR(ir: TransactionIR): TransactionDiagnostic[] {
  const diagnostics = [
    ...validateTransactionIR(ir, {
      includeExistingDiagnostics: false,
    }),
  ];
  if (hasErrors(diagnostics)) {
    return diagnostics;
  }

  ir.inputs.forEach((input, index) => {
    switch (input.kind) {
      case 'Pure':
        if (input.bytes === undefined && !canRenderTypedPureInput(input)) {
          const specific = pureValueRenderDiagnostic(input, index);
          diagnostics.push(
            errorDiagnostic(
              'codegen.input.pure',
              specific?.message ??
                `Pure input ${input.id} requires raw bytes or a supported SDK pure type/value pair for TS SDK code generation.`,
              specific?.path ?? `$.inputs[${index}]`,
            ),
          );
        }
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
              'Sponsor FundsWithdrawal cannot be rendered with @mysten/sui@2.16.2 Transaction public helpers.',
              `$.inputs[${index}].value.withdrawFrom`,
            ),
          );
        }
        return;
      case 'Unsupported':
        return;
    }
  });

  return diagnostics;
}

function renderCommand(command: IRCommand, index: number): string[] {
  switch (command.kind) {
    case 'MoveCall':
      return [
        `  const ${resultName(index)} = tx.moveCall({`,
        `    package: ${quote(command.package)},`,
        `    module: ${quote(command.module)},`,
        `    function: ${quote(command.function)},`,
        `    typeArguments: ${jsonStringifyWithBigInt(command.typeArguments)},`,
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
        `  const ${resultName(index)} = tx.publish({ modules: ${jsonStringifyWithBigInt(
          command.modules,
        )}, dependencies: ${jsonStringifyWithBigInt(command.dependencies)} });`,
      ];
    case 'MakeMoveVec':
      return [
        `  const ${resultName(index)} = tx.makeMoveVec({ type: ${renderNullableString(
          command.type,
        )}, elements: [${command.elements.map(renderArg).join(', ')}] });`,
      ];
    case 'Upgrade':
      return [
        `  const ${resultName(index)} = tx.upgrade({ modules: ${jsonStringifyWithBigInt(
          command.modules,
        )}, dependencies: ${jsonStringifyWithBigInt(command.dependencies)}, package: ${quote(
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
  return jsonStringifyWithBigInt(value);
}

function renderNullableString(value: string | null): string {
  return typeof value === 'string' ? quote(value) : 'undefined';
}

function renderFundsWithdrawal(value: RawFundsWithdrawalArg): string {
  if (value.withdrawFrom.kind !== 'Sender') {
    throwTsSdkCodeError(
      'codegen.input.fundsWithdrawalSponsor',
      'Sponsor FundsWithdrawal cannot be rendered with @mysten/sui@2.16.2 Transaction public helpers.',
      '$.inputs[].value.withdrawFrom',
    );
  }

  return jsonStringifyWithBigInt({
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

function canRenderTypedPureInput(
  input: Extract<IRInput, { kind: 'Pure' }>,
): boolean {
  return (
    input.type !== undefined &&
    isPTBType(input.type) &&
    pureTypeName(input.type) !== undefined &&
    hasPureValue(input) &&
    isPureValueCompatible(input.type, input.value)
  );
}

function renderPureInputExpression(
  type: PTBType,
  value: unknown,
): string | undefined {
  if (!isPTBType(type) || !isPureValueCompatible(type, value)) {
    return undefined;
  }

  if (type.kind === 'option') {
    const elemTypeName = pureTypeName(type.elem);
    return elemTypeName
      ? `tx.pure.option(${quote(elemTypeName)}, ${renderUnknownValue(
          normalizePureValueForRender(type, value),
        )})`
      : undefined;
  }

  const typeName = pureTypeName(type);
  return typeName
    ? `tx.pure(${quote(typeName)}, ${renderUnknownValue(
        normalizePureValueForRender(type, value),
      )})`
    : undefined;
}

function hasPureValue(input: Extract<IRInput, { kind: 'Pure' }>): boolean {
  return Object.prototype.hasOwnProperty.call(input, 'value');
}

function pureTypeName(type: PTBType | undefined): string | undefined {
  if (!isPTBType(type)) return undefined;

  switch (type.kind) {
    case 'move_numeric':
      return type.width;
    case 'scalar':
      return type.name === 'number' ? undefined : type.name;
    case 'vector': {
      const elem = pureTypeName(type.elem);
      return elem ? `vector<${elem}>` : undefined;
    }
    case 'option': {
      const elem = pureTypeName(type.elem);
      return elem ? `option<${elem}>` : undefined;
    }
    case 'object':
    case 'tuple':
    case 'unknown':
      return undefined;
  }
}

function normalizePureValueForRender(type: PTBType, value: unknown): unknown {
  switch (type.kind) {
    case 'scalar':
      return type.name === 'address' || type.name === 'id'
        ? (parseObjectId(value) ?? value)
        : value;
    case 'vector':
      return isDenseArray(value)
        ? value.map((item) => normalizePureValueForRender(type.elem, item))
        : value;
    case 'option':
      return value === NULL_VALUE
        ? value
        : normalizePureValueForRender(type.elem, value);
    case 'move_numeric':
    case 'object':
    case 'tuple':
    case 'unknown':
      return value;
  }
}

function isPureValueCompatible(type: PTBType, value: unknown): boolean {
  switch (type.kind) {
    case 'move_numeric':
      return isNumericPureValue(type.width, value);
    case 'scalar':
      switch (type.name) {
        case 'bool':
          return typeof value === 'boolean';
        case 'string':
          return typeof value === 'string';
        case 'address':
        case 'id':
          return parseObjectId(value) !== undefined;
        case 'number':
          return false;
      }
      return false;
    case 'vector':
      return (
        isDenseArray(value) &&
        value.every((item) => isPureValueCompatible(type.elem, item))
      );
    case 'option':
      return value === NULL_VALUE || isPureValueCompatible(type.elem, value);
    case 'object':
    case 'tuple':
    case 'unknown':
      return false;
  }
}

function pureValueRenderDiagnostic(
  input: Extract<IRInput, { kind: 'Pure' }>,
  index: number,
): { message: string; path: string } | undefined {
  if (!input.type || !isPTBType(input.type) || !hasPureValue(input)) {
    return undefined;
  }
  return describePureValueIssue(
    input.id,
    input.type,
    input.value,
    `$.inputs[${index}].value`,
  );
}

function describePureValueIssue(
  inputId: string,
  type: PTBType,
  value: unknown,
  path: string,
): { message: string; path: string } | undefined {
  switch (type.kind) {
    case 'move_numeric':
      return isNumericPureValue(type.width, value)
        ? undefined
        : {
            message:
              value === ''
                ? `Pure input ${inputId} requires a non-empty integer string for ${type.width}.`
                : `Pure input ${inputId} requires a ${type.width} value within the supported unsigned integer range.`,
            path,
          };
    case 'scalar':
      switch (type.name) {
        case 'address':
        case 'id':
          return parseObjectId(value) !== undefined
            ? undefined
            : {
                message:
                  typeof value === 'string' &&
                  value.replace(/^0x/i, '').length === 0
                    ? `Pure input ${inputId} requires a non-empty Sui ${type.name === 'id' ? 'object ID' : 'address'}.`
                    : `Pure input ${inputId} requires a valid Sui ${type.name === 'id' ? 'object ID' : 'address'}.`,
                path,
              };
        case 'bool':
          return typeof value === 'boolean'
            ? undefined
            : {
                message: `Pure input ${inputId} requires a boolean value.`,
                path,
              };
        case 'string':
          return typeof value === 'string'
            ? undefined
            : {
                message: `Pure input ${inputId} requires a string value.`,
                path,
              };
        case 'number':
          return {
            message: `Pure input ${inputId} uses the abstract number placeholder; choose a concrete Move integer width before rendering TS SDK code.`,
            path,
          };
      }
      return undefined;
    case 'vector':
      if (!isDenseArray(value)) {
        return {
          message: `Pure input ${inputId} requires an array value for vector pure input.`,
          path,
        };
      }
      for (let index = 0; index < value.length; index += 1) {
        const issue = describePureValueIssue(
          inputId,
          type.elem,
          value[index],
          `${path}[${index}]`,
        );
        if (issue) return issue;
      }
      return undefined;
    case 'option':
      return value === NULL_VALUE
        ? undefined
        : describePureValueIssue(inputId, type.elem, value, path);
    case 'object':
    case 'tuple':
    case 'unknown':
      return undefined;
  }
}

function isNumericPureValue(
  width: Extract<PTBType, { kind: 'move_numeric' }>['width'],
  value: unknown,
): boolean {
  switch (width) {
    case 'u8':
      return isIntegerInRange(value, 0, 255);
    case 'u16':
      return isIntegerInRange(value, 0, 65_535);
    case 'u32':
      return isIntegerInRange(value, 0, 4_294_967_295);
    case 'u64':
      return isBigUnsignedIntegerInRange(value, U64_MAX);
    case 'u128':
      return isBigUnsignedIntegerInRange(value, U128_MAX);
    case 'u256':
      return isBigUnsignedIntegerInRange(value, U256_MAX);
  }
}

function isIntegerInRange(
  value: unknown,
  min: number,
  max: number,
): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= min &&
    value <= max
  );
}

function isNonNegativeIntegerString(value: unknown): value is string {
  return typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value);
}

function isBigUnsignedIntegerInRange(value: unknown, max: bigint): boolean {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 && BigInt(value) <= max;
  }
  if (typeof value === 'bigint') {
    return value >= 0n && value <= max;
  }
  if (!isNonNegativeIntegerString(value)) {
    return false;
  }
  return BigInt(value) <= max;
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
