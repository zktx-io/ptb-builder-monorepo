import type { PureTypeName } from '@mysten/sui/bcs';
import { Transaction } from '@mysten/sui/transactions';
import {
  hasErrors,
  parseObjectId,
  PTBModelError,
  transactionIRToTsSdkCode,
} from '@zktx.io/ptb-model';
import type {
  IRArgRef,
  IRCommand,
  IRInput,
  PTBType,
  TransactionDiagnostic,
  TransactionIR,
} from '@zktx.io/ptb-model';

export type RuntimeEnvelope = {
  sender?: string;
  gasBudget?: number;
};

type TxArg = ReturnType<Transaction['pure']>;
type TxResult = ReturnType<Transaction['splitCoins']>;

export function buildTransactionFromIR(
  ir: TransactionIR,
  envelope: RuntimeEnvelope = {},
): Transaction {
  assertRuntimeRenderableIR(ir);

  const tx = new Transaction();
  if (envelope.sender) tx.setSenderIfNotSet(envelope.sender);
  if (typeof envelope.gasBudget === 'number') {
    tx.setGasBudgetIfNotSet(envelope.gasBudget);
  }

  const inputs = ir.inputs.map((input, index) => buildInput(tx, input, index));
  const results: TxResult[] = [];

  ir.commands.forEach((command, index) => {
    results[index] = buildCommand(tx, command, inputs, results, index);
  });

  return tx;
}

function assertRuntimeRenderableIR(ir: TransactionIR): void {
  if (hasErrors(ir.diagnostics)) {
    throw new PTBModelError(
      'TransactionIR cannot be built as a runtime Transaction.',
      ir.diagnostics,
    );
  }

  for (const [index, input] of ir.inputs.entries()) {
    if (input.kind !== 'Pure') continue;
    if (input.bytes !== undefined) continue;
    const abstractNumberPath = findAbstractNumberTypePath(input.type);
    if (!abstractNumberPath) continue;
    const location =
      abstractNumberPath === 'type'
        ? ''
        : ` at ${abstractNumberPath.replace(/^type\./, '')}`;
    throwRuntimeError(
      'runtime.input.pure',
      `Pure input ${input.id} uses the abstract number placeholder${location}; choose a concrete Move integer width before building a runtime Transaction.`,
      `$.inputs[${index}].${abstractNumberPath}`,
    );
  }

  // Keep runtime support exactly aligned with the model TS SDK renderer.
  transactionIRToTsSdkCode(ir);
}

function buildInput(tx: Transaction, input: IRInput, index: number): TxArg {
  switch (input.kind) {
    case 'Pure':
      if (input.bytes !== undefined) {
        return tx.pure(fromBase64(input.bytes));
      }
      return buildTypedPureInput(tx, input, index);
    case 'Object':
      if (!input.object) {
        throwRuntimeError(
          'runtime.input.object',
          `Object input ${input.id} has no resolved object reference.`,
          `$.inputs[${index}].object`,
        );
      }
      switch (input.object.kind) {
        case 'ImmOrOwnedObject':
          return tx.objectRef({
            objectId: input.object.objectId,
            version: input.object.version,
            digest: input.object.digest,
          });
        case 'SharedObject':
          return tx.sharedObjectRef({
            objectId: input.object.objectId,
            initialSharedVersion: input.object.initialSharedVersion,
            mutable: input.object.mutable,
          });
        case 'Receiving':
          return tx.receivingRef({
            objectId: input.object.objectId,
            version: input.object.version,
            digest: input.object.digest,
          });
      }
      throwRuntimeError(
        'runtime.input.objectKind',
        `Object input ${input.id} has unsupported object kind ${String((input.object as { kind?: unknown }).kind)}.`,
        `$.inputs[${index}].object.kind`,
      );
    case 'FundsWithdrawal':
      if (input.value.withdrawFrom.kind !== 'Sender') {
        throwRuntimeError(
          'runtime.input.fundsWithdrawalSponsor',
          'Sponsor FundsWithdrawal cannot be built with @mysten/sui@2.16.2 Transaction public helpers.',
          `$.inputs[${index}].value.withdrawFrom`,
        );
      }
      return tx.withdrawal({
        amount: input.value.reservation.amount,
        type: input.value.typeArg.type,
      });
    case 'Unsupported':
      throwRuntimeError(
        'runtime.input.unsupported',
        `Unsupported input ${input.id} cannot be built as a runtime Transaction.`,
        `$.inputs[${index}]`,
      );
  }
}

function buildTypedPureInput(
  tx: Transaction,
  input: Extract<IRInput, { kind: 'Pure' }>,
  index: number,
): TxArg {
  const typeName = pureTypeName(input.type);
  if (
    typeName === undefined ||
    !Object.prototype.hasOwnProperty.call(input, 'value')
  ) {
    throwRuntimeError(
      'runtime.input.pure',
      `Pure input ${input.id} requires a supported SDK pure type/value pair.`,
      `$.inputs[${index}]`,
    );
  }
  return tx.pure(
    typeName as PureTypeName,
    normalizePureValue(input.type!, input.value) as never,
  );
}

function buildCommand(
  tx: Transaction,
  command: IRCommand,
  inputs: readonly TxArg[],
  results: readonly TxResult[],
  index: number,
): TxResult {
  const arg = (ref: IRArgRef) => resolveArg(tx, ref, inputs, results);
  switch (command.kind) {
    case 'MoveCall':
      return tx.moveCall({
        package: command.package,
        module: command.module,
        function: command.function,
        typeArguments: command.typeArguments,
        arguments: command.arguments.map(arg),
      }) as TxResult;
    case 'TransferObjects':
      tx.transferObjects(command.objects.map(arg), arg(command.address));
      return [] as unknown as TxResult;
    case 'SplitCoins':
      return tx.splitCoins(arg(command.coin), command.amounts.map(arg));
    case 'MergeCoins':
      tx.mergeCoins(arg(command.destination), command.sources.map(arg));
      return [] as unknown as TxResult;
    case 'Publish':
      return tx.publish({
        modules: command.modules,
        dependencies: command.dependencies,
      }) as TxResult;
    case 'MakeMoveVec':
      return tx.makeMoveVec({
        type: command.type ?? undefined,
        elements: command.elements.map(arg),
      }) as TxResult;
    case 'Upgrade':
      return tx.upgrade({
        modules: command.modules,
        dependencies: command.dependencies,
        package: command.package,
        ticket: arg(command.ticket),
      }) as TxResult;
    case 'Unsupported':
      throwRuntimeError(
        'runtime.command.unsupported',
        `Unsupported command ${command.id} cannot be built as a runtime Transaction.`,
        `$.commands[${index}]`,
      );
  }
}

function resolveArg(
  tx: Transaction,
  ref: IRArgRef,
  inputs: readonly TxArg[],
  results: readonly TxResult[],
): TxArg {
  switch (ref.kind) {
    case 'GasCoin':
      return tx.gas as TxArg;
    case 'Input':
      return inputs[ref.index]!;
    case 'Result':
      return results[ref.commandIndex] as unknown as TxArg;
    case 'NestedResult':
      return (results[ref.commandIndex] as unknown as TxArg[])[
        ref.resultIndex
      ]!;
  }
}

function pureTypeName(type: PTBType | undefined): string | undefined {
  if (!type) return undefined;
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

function findAbstractNumberTypePath(
  type: PTBType | undefined,
  path = 'type',
): string | undefined {
  if (!type) return undefined;
  switch (type.kind) {
    case 'scalar':
      return type.name === 'number' ? path : undefined;
    case 'vector':
    case 'option':
      return findAbstractNumberTypePath(type.elem, `${path}.elem`);
    case 'move_numeric':
    case 'object':
    case 'tuple':
    case 'unknown':
      return undefined;
  }
}

function normalizePureValue(type: PTBType, value: unknown): unknown {
  switch (type.kind) {
    case 'scalar':
      return type.name === 'address' || type.name === 'id'
        ? (parseObjectId(value) ?? value)
        : value;
    case 'vector':
      return Array.isArray(value)
        ? value.map((item) => normalizePureValue(type.elem, item))
        : value;
    case 'option':
      return value === undefined ? value : normalizePureValue(type.elem, value);
    case 'move_numeric':
    case 'object':
    case 'tuple':
    case 'unknown':
      return value;
  }
}

function fromBase64(value: string): Uint8Array {
  const decoder = globalThis.atob;
  if (!decoder) {
    throw new Error('No atob base64 decoder is available.');
  }
  return Uint8Array.from(decoder(value), (char) => char.charCodeAt(0));
}

function throwRuntimeError(code: string, message: string, path: string): never {
  const diagnostic: TransactionDiagnostic = { code, message, path };
  throw new PTBModelError(
    'TransactionIR cannot be built as a runtime Transaction.',
    [diagnostic],
  );
}
