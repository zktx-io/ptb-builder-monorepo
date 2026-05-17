import type {
  RawArgument,
  RawCallArg,
  RawCommand,
  RawFundsWithdrawalArg,
  RawInputArgumentType,
  RawMoveCallArgumentTypes,
  RawObjectArg,
  RawProgrammableMoveCall,
  RawProgrammableTransaction,
} from './types.js';
import {
  isRawInputArgumentType,
  isRawMoveCallArgumentTypes,
  parseBase64Bytes,
  parseJsonU64,
  parseMoveIdentifier,
  parseMoveTypeTag,
  parseObjectDigest,
  parseObjectId,
} from './types.js';
import {
  assertNoErrors,
  errorDiagnostic,
  hasErrors,
  PTBModelError,
} from '../ir/diagnostics.js';
import type { TransactionDiagnostic } from '../ir/diagnostics.js';
import { createTransactionIR } from '../ir/types.js';
import type { IRCommand, IRInput, TransactionIR } from '../ir/types.js';
import { validateTransactionIR } from '../ir/validate.js';
import {
  asArray,
  asBoolean,
  asString,
  cloneJsonLike,
  isDenseArray,
  isRecord,
  NULL_VALUE,
} from '../utils.js';

interface EnumView {
  kind: string;
  payload: unknown;
  source: Record<string, unknown>;
  shape: 'kind' | '$kind' | 'singleKey';
}

const RAW_TRANSACTION_KEYS = [
  'version',
  'sender',
  'expiration',
  'gasData',
  'inputs',
  'commands',
] as const;
const RAW_FUNDS_WITHDRAWAL_KEYS = [
  'reservation',
  'typeArg',
  'withdrawFrom',
] as const;
const RAW_MOVE_CALL_KEYS = [
  'package',
  'module',
  'function',
  'typeArguments',
  'arguments',
  '_argumentTypes',
] as const;

export function rawTransactionToIR(value: unknown): TransactionIR {
  const diagnostics: TransactionDiagnostic[] = [];

  if (
    !isRecord(value) ||
    !isDenseArray(value.inputs) ||
    !isDenseArray(value.commands)
  ) {
    diagnostics.push(
      errorDiagnostic(
        'raw.transaction',
        'Raw programmable transaction must have dense inputs and commands arrays.',
        '$',
      ),
    );
    return createTransactionIR([], [], diagnostics);
  }
  validateOnlyKeys(
    value,
    RAW_TRANSACTION_KEYS,
    'raw.transaction.unknownField',
    '$',
    'Raw programmable transaction',
    diagnostics,
  );
  if ('version' in value && value.version !== 2) {
    diagnostics.push(
      errorDiagnostic(
        'raw.transaction.version',
        'SDK TransactionData envelope version must be 2 when present.',
        '$.version',
      ),
    );
  }

  const inputs = value.inputs.map((input, index): IRInput => {
    const raw = normalizeRawCallArg(input, `$.inputs[${index}]`, diagnostics);
    if (!raw) {
      return unsupportedInput(input, index);
    }
    return rawCallArgToIRInput(raw, index);
  });

  const commands = value.commands.map((command, index): IRCommand => {
    const raw = normalizeRawCommand(
      command,
      `$.commands[${index}]`,
      diagnostics,
    );
    if (!raw) {
      return unsupportedCommand(command, index);
    }
    return rawCommandToIRCommand(raw, index);
  });

  const ir = createTransactionIR(inputs, commands, diagnostics);
  return {
    ...ir,
    diagnostics: validateTransactionIR(ir),
  };
}

export function transactionIRToRaw(
  ir: TransactionIR,
): RawProgrammableTransaction {
  const diagnostics = validateRawConvertibleIR(ir);
  assertNoErrors('TransactionIR cannot be converted to raw PTB.', diagnostics);

  return {
    inputs: ir.inputs.map((input, index) => {
      switch (input.kind) {
        case 'Pure': {
          if (input.bytes === undefined) {
            throwRawConversionError(
              'raw.ir.pureBytes',
              `Pure input ${index} requires raw bytes for raw PTB conversion.`,
              `$.inputs[${index}].bytes`,
            );
          }
          return { kind: 'Pure', bytes: input.bytes };
        }
        case 'Object':
          if (!input.object) {
            throwRawConversionError(
              'raw.ir.object',
              `Object input ${index} requires a resolved object argument for raw PTB conversion.`,
              `$.inputs[${index}].object`,
            );
          }
          return { kind: 'Object', object: rawObjectArgFromIR(input.object) };
        case 'FundsWithdrawal':
          return { kind: 'FundsWithdrawal', value: cloneJsonLike(input.value) };
        case 'Unsupported':
          throwRawConversionError(
            'raw.ir.unsupportedInput',
            `Unsupported input ${index} cannot be converted to raw PTB.`,
            `$.inputs[${index}]`,
          );
      }
    }),
    commands: ir.commands.map((command, index) =>
      irCommandToRawCommand(command, index),
    ),
  };
}

function validateRawConvertibleIR(ir: TransactionIR): TransactionDiagnostic[] {
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
        if (input.bytes === undefined) {
          diagnostics.push(
            errorDiagnostic(
              'raw.ir.pureBytes',
              `Pure input ${index} requires raw bytes for raw PTB conversion.`,
              `$.inputs[${index}].bytes`,
            ),
          );
        }
        return;
      case 'Object':
        if (!input.object) {
          diagnostics.push(
            errorDiagnostic(
              'raw.ir.object',
              `Object input ${index} requires a resolved object argument for raw PTB conversion.`,
              `$.inputs[${index}].object`,
            ),
          );
        }
        return;
      case 'FundsWithdrawal':
      case 'Unsupported':
        return;
    }
  });

  return diagnostics;
}

function rawCallArgToIRInput(raw: RawCallArg, index: number): IRInput {
  const id = `input_${index}`;

  switch (raw.kind) {
    case 'Pure':
      return {
        id,
        kind: 'Pure',
        bytes: raw.bytes,
        canonicalRaw: cloneJsonLike(raw),
      };
    case 'Object':
      return {
        id,
        kind: 'Object',
        object: cloneJsonLike(raw.object),
        canonicalRaw: cloneJsonLike(raw),
      };
    case 'FundsWithdrawal':
      return {
        id,
        kind: 'FundsWithdrawal',
        value: cloneJsonLike(raw.value),
        canonicalRaw: cloneJsonLike(raw),
      };
  }
}

function rawCommandToIRCommand(raw: RawCommand, index: number): IRCommand {
  const id = `command_${index}`;

  switch (raw.kind) {
    case 'MoveCall':
      return {
        id,
        kind: 'MoveCall',
        package: raw.call.package,
        module: raw.call.module,
        function: raw.call.function,
        typeArguments: [...raw.call.typeArguments],
        arguments: cloneJsonLike(raw.call.arguments),
        ...('_argumentTypes' in raw.call
          ? { _argumentTypes: cloneJsonLike(raw.call._argumentTypes) }
          : {}),
        canonicalRaw: cloneJsonLike(raw),
      };
    case 'TransferObjects':
      return {
        id,
        kind: 'TransferObjects',
        objects: cloneJsonLike(raw.objects),
        address: cloneJsonLike(raw.address),
        resultCount: 0,
        canonicalRaw: cloneJsonLike(raw),
      };
    case 'SplitCoins':
      return {
        id,
        kind: 'SplitCoins',
        coin: cloneJsonLike(raw.coin),
        amounts: cloneJsonLike(raw.amounts),
        resultCount: raw.amounts.length,
        canonicalRaw: cloneJsonLike(raw),
      };
    case 'MergeCoins':
      return {
        id,
        kind: 'MergeCoins',
        destination: cloneJsonLike(raw.destination),
        sources: cloneJsonLike(raw.sources),
        resultCount: 0,
        canonicalRaw: cloneJsonLike(raw),
      };
    case 'Publish':
      return {
        id,
        kind: 'Publish',
        modules: [...raw.modules],
        dependencies: [...raw.dependencies],
        resultCount: 1,
        canonicalRaw: cloneJsonLike(raw),
      };
    case 'MakeMoveVec':
      return {
        id,
        kind: 'MakeMoveVec',
        type: raw.type,
        elements: cloneJsonLike(raw.elements),
        resultCount: 1,
        canonicalRaw: cloneJsonLike(raw),
      };
    case 'Upgrade':
      return {
        id,
        kind: 'Upgrade',
        modules: [...raw.modules],
        dependencies: [...raw.dependencies],
        package: raw.package,
        ticket: cloneJsonLike(raw.ticket),
        resultCount: 1,
        canonicalRaw: cloneJsonLike(raw),
      };
  }
}

function irCommandToRawCommand(command: IRCommand, index: number): RawCommand {
  switch (command.kind) {
    case 'MoveCall':
      return {
        kind: 'MoveCall',
        call: {
          package: command.package,
          module: command.module,
          function: command.function,
          typeArguments: [...command.typeArguments],
          arguments: cloneJsonLike(command.arguments),
          ...('_argumentTypes' in command
            ? { _argumentTypes: cloneJsonLike(command._argumentTypes) }
            : {}),
        },
      };
    case 'TransferObjects':
      return {
        kind: 'TransferObjects',
        objects: cloneJsonLike(command.objects),
        address: cloneJsonLike(command.address),
      };
    case 'SplitCoins':
      return {
        kind: 'SplitCoins',
        coin: cloneJsonLike(command.coin),
        amounts: cloneJsonLike(command.amounts),
      };
    case 'MergeCoins':
      return {
        kind: 'MergeCoins',
        destination: cloneJsonLike(command.destination),
        sources: cloneJsonLike(command.sources),
      };
    case 'Publish':
      return {
        kind: 'Publish',
        modules: [...command.modules],
        dependencies: [...command.dependencies],
      };
    case 'MakeMoveVec':
      return {
        kind: 'MakeMoveVec',
        type: command.type,
        elements: cloneJsonLike(command.elements),
      };
    case 'Upgrade':
      return {
        kind: 'Upgrade',
        modules: [...command.modules],
        dependencies: [...command.dependencies],
        package: command.package,
        ticket: cloneJsonLike(command.ticket),
      };
    case 'Unsupported':
      throwRawConversionError(
        'raw.ir.unsupportedCommand',
        `Unsupported command ${index} cannot be converted to raw PTB.`,
        `$.commands[${index}]`,
      );
  }
}

function rawObjectArgFromIR(object: RawObjectArg): RawObjectArg {
  switch (object.kind) {
    case 'ImmOrOwnedObject':
    case 'Receiving':
      return {
        kind: object.kind,
        objectId: object.objectId,
        version: object.version,
        digest: object.digest,
      };
    case 'SharedObject':
      return {
        kind: 'SharedObject',
        objectId: object.objectId,
        initialSharedVersion: object.initialSharedVersion,
        mutable: object.mutable,
      };
  }
}

function throwRawConversionError(
  code: string,
  message: string,
  path: string,
): never {
  throw new PTBModelError('TransactionIR cannot be converted to raw PTB.', [
    errorDiagnostic(code, message, path),
  ]);
}

function normalizeRawCallArg(
  value: unknown,
  path: string,
  diagnostics: TransactionDiagnostic[],
): RawCallArg | undefined {
  const view = enumView(value, diagnostics, path);
  if (!view) {
    diagnostics.push(
      errorDiagnostic('raw.input', 'Input must be an enum object.', path),
    );
    return undefined;
  }

  switch (view.kind) {
    case 'Pure': {
      if (
        !validateRawEnumKeys(
          view,
          'raw.input.unknownField',
          path,
          'Raw Pure input',
          ['bytes'],
          diagnostics,
        )
      ) {
        return undefined;
      }
      const payload = isRecord(view.payload) ? view.payload : value;
      const bytes = parseBase64Bytes(
        isRecord(payload) ? payload.bytes : undefined,
      );
      if (bytes === undefined) {
        diagnostics.push(
          errorDiagnostic(
            'raw.base64Bytes',
            'Pure input requires base64-decodable base64 bytes.',
            `${path}.bytes`,
          ),
        );
        return undefined;
      }
      return { kind: 'Pure', bytes };
    }
    case 'Object': {
      if (
        !(view.shape === 'kind'
          ? validateRawEnumKeys(
              view,
              'raw.input.unknownField',
              path,
              'Raw Object input',
              ['object'],
              diagnostics,
            )
          : validateRawEnumEnvelopeKeys(
              view,
              'raw.input.unknownField',
              path,
              'Raw Object input',
              diagnostics,
            ))
      ) {
        return undefined;
      }
      const payload =
        isRecord(view.payload) && 'object' in view.payload
          ? view.payload.object
          : view.payload;
      const object = normalizeRawObjectArg(
        payload,
        `${path}.Object`,
        diagnostics,
      );
      return object ? { kind: 'Object', object } : undefined;
    }
    case 'FundsWithdrawal': {
      if (
        !(view.shape === 'kind'
          ? validateRawEnumKeys(
              view,
              'raw.input.unknownField',
              path,
              'Raw FundsWithdrawal input',
              ['value'],
              diagnostics,
            )
          : validateRawEnumEnvelopeKeys(
              view,
              'raw.input.unknownField',
              path,
              'Raw FundsWithdrawal input',
              diagnostics,
            ))
      ) {
        return undefined;
      }
      const payload =
        isRecord(view.payload) && 'value' in view.payload
          ? view.payload.value
          : view.payload;
      const funds = normalizeFundsWithdrawal(
        payload,
        `${path}.FundsWithdrawal`,
        diagnostics,
      );
      return funds ? { kind: 'FundsWithdrawal', value: funds } : undefined;
    }
    case 'UnresolvedPure':
    case 'UnresolvedObject':
      diagnostics.push(
        errorDiagnostic(
          'raw.input.unresolved',
          `${view.kind} is an SDK builder convenience and is not canonical raw PTB.`,
          path,
        ),
      );
      return undefined;
    default:
      diagnostics.push(
        errorDiagnostic(
          'raw.input.unsupported',
          `Unsupported input kind ${view.kind}.`,
          path,
        ),
      );
      return undefined;
  }
}

function normalizeRawObjectArg(
  value: unknown,
  path: string,
  diagnostics: TransactionDiagnostic[],
): RawObjectArg | undefined {
  const view = enumView(value, diagnostics, path);
  if (!view) {
    diagnostics.push(
      errorDiagnostic(
        'raw.object',
        'Object input must be an enum object.',
        path,
      ),
    );
    return undefined;
  }

  if (!isRecord(view.payload)) {
    diagnostics.push(
      errorDiagnostic(
        'raw.object.payload',
        'Object payload must be an object.',
        path,
      ),
    );
    return undefined;
  }

  switch (view.kind) {
    case 'ImmOrOwnedObject': {
      if (
        !validateRawEnumKeys(
          view,
          'raw.object.unknownField',
          path,
          'Raw owned object input',
          ['objectId', 'version', 'digest'],
          diagnostics,
        )
      ) {
        return undefined;
      }
      const objectId = parseObjectId(view.payload.objectId);
      const version = parseJsonU64(view.payload.version);
      const digest = parseObjectDigest(view.payload.digest);
      if (!objectId || !version || !digest) {
        diagnostics.push(
          errorDiagnostic(
            'raw.object.ref',
            'Owned object requires objectId, version, and digest.',
            path,
          ),
        );
        return undefined;
      }
      return { kind: 'ImmOrOwnedObject', objectId, version, digest };
    }
    case 'SharedObject': {
      if (
        !validateRawEnumKeys(
          view,
          'raw.object.unknownField',
          path,
          'Raw shared object input',
          ['objectId', 'initialSharedVersion', 'mutable'],
          diagnostics,
        )
      ) {
        return undefined;
      }
      const objectId = parseObjectId(view.payload.objectId);
      const initialSharedVersion = parseJsonU64(
        view.payload.initialSharedVersion,
      );
      const mutable = asBoolean(view.payload.mutable);
      if (!objectId || !initialSharedVersion || mutable === undefined) {
        diagnostics.push(
          errorDiagnostic(
            'raw.object.shared',
            'Shared object requires objectId, initialSharedVersion, and mutable.',
            path,
          ),
        );
        return undefined;
      }
      return { kind: 'SharedObject', objectId, initialSharedVersion, mutable };
    }
    case 'Receiving': {
      if (
        !validateRawEnumKeys(
          view,
          'raw.object.unknownField',
          path,
          'Raw receiving object input',
          ['objectId', 'version', 'digest'],
          diagnostics,
        )
      ) {
        return undefined;
      }
      const objectId = parseObjectId(view.payload.objectId);
      const version = parseJsonU64(view.payload.version);
      const digest = parseObjectDigest(view.payload.digest);
      if (!objectId || !version || !digest) {
        diagnostics.push(
          errorDiagnostic(
            'raw.object.receiving',
            'Receiving object requires objectId, version, and digest.',
            path,
          ),
        );
        return undefined;
      }
      return { kind: 'Receiving', objectId, version, digest };
    }
    default:
      diagnostics.push(
        errorDiagnostic(
          'raw.object.unsupported',
          `Unsupported object kind ${view.kind}.`,
          path,
        ),
      );
      return undefined;
  }
}

function normalizeFundsWithdrawal(
  value: unknown,
  path: string,
  diagnostics: TransactionDiagnostic[],
): RawFundsWithdrawalArg | undefined {
  if (!isRecord(value)) {
    diagnostics.push(
      errorDiagnostic(
        'raw.funds',
        'FundsWithdrawal payload must be an object.',
        path,
      ),
    );
    return undefined;
  }

  const reservation = enumView(
    value.reservation,
    diagnostics,
    `${path}.reservation`,
  );
  const typeArg = enumView(value.typeArg, diagnostics, `${path}.typeArg`);
  const withdrawFrom = enumView(
    value.withdrawFrom,
    diagnostics,
    `${path}.withdrawFrom`,
  );
  if (
    !validateOnlyKeys(
      value,
      RAW_FUNDS_WITHDRAWAL_KEYS,
      'raw.funds.unknownField',
      path,
      'Raw FundsWithdrawal payload',
      diagnostics,
    )
  ) {
    return undefined;
  }

  if (reservation?.kind !== 'MaxAmountU64') {
    diagnostics.push(
      errorDiagnostic(
        'raw.funds.reservation',
        'FundsWithdrawal reservation must be MaxAmountU64.',
        path,
      ),
    );
    return undefined;
  }
  if (
    !validateRawEnumKeys(
      reservation,
      'raw.funds.unknownField',
      `${path}.reservation`,
      'Raw FundsWithdrawal reservation',
      ['amount'],
      diagnostics,
    )
  ) {
    return undefined;
  }

  if (typeArg?.kind !== 'Balance') {
    diagnostics.push(
      errorDiagnostic(
        'raw.funds.typeArg',
        'FundsWithdrawal typeArg must be Balance.',
        path,
      ),
    );
    return undefined;
  }
  if (
    !validateRawEnumKeys(
      typeArg,
      'raw.funds.unknownField',
      `${path}.typeArg`,
      'Raw FundsWithdrawal typeArg',
      ['type'],
      diagnostics,
    )
  ) {
    return undefined;
  }

  if (withdrawFrom?.kind !== 'Sender' && withdrawFrom?.kind !== 'Sponsor') {
    diagnostics.push(
      errorDiagnostic(
        'raw.funds.withdrawFrom',
        'FundsWithdrawal withdrawFrom must be Sender or Sponsor.',
        path,
      ),
    );
    return undefined;
  }
  if (
    !validateRawEnumKeys(
      withdrawFrom,
      'raw.funds.unknownField',
      `${path}.withdrawFrom`,
      'Raw FundsWithdrawal withdrawFrom',
      [],
      diagnostics,
    )
  ) {
    return undefined;
  }

  const amount = parseJsonU64(
    isRecord(reservation.payload)
      ? reservation.payload.amount
      : reservation.payload,
  );
  const type = parseMoveTypeTag(
    isRecord(typeArg.payload) ? typeArg.payload.type : typeArg.payload,
  );
  if (!amount || !type) {
    diagnostics.push(
      errorDiagnostic(
        'raw.funds.payload',
        'FundsWithdrawal amount and Balance type are required.',
        path,
      ),
    );
    return undefined;
  }

  return {
    reservation: { kind: 'MaxAmountU64', amount },
    typeArg: { kind: 'Balance', type },
    withdrawFrom: { kind: withdrawFrom.kind },
  };
}

function normalizeRawCommand(
  value: unknown,
  path: string,
  diagnostics: TransactionDiagnostic[],
): RawCommand | undefined {
  const view = enumView(value, diagnostics, path);
  if (!view) {
    diagnostics.push(
      errorDiagnostic('raw.command', 'Command must be an enum object.', path),
    );
    return undefined;
  }

  if (view.kind === '$Intent') {
    diagnostics.push(
      errorDiagnostic(
        'raw.command.intent',
        '$Intent is an SDK builder convenience and is not canonical raw PTB.',
        path,
      ),
    );
    return undefined;
  }

  const payload = isRecord(view.payload)
    ? view.payload
    : isRecord(value)
      ? value
      : undefined;
  if (!payload) {
    diagnostics.push(
      errorDiagnostic(
        'raw.command.payload',
        'Command payload must be an object.',
        path,
      ),
    );
    return undefined;
  }

  switch (view.kind) {
    case 'MoveCall': {
      if (
        !validateRawCommandKeys(
          view,
          path,
          isRecord(payload.call) ? ['call'] : RAW_MOVE_CALL_KEYS,
          diagnostics,
        )
      ) {
        return undefined;
      }
      const callPayload = isRecord(payload.call) ? payload.call : payload;
      const call = normalizeMoveCall(callPayload, path, diagnostics);
      return call ? { kind: 'MoveCall', call } : undefined;
    }
    case 'TransferObjects': {
      if (
        !validateRawCommandKeys(view, path, ['objects', 'address'], diagnostics)
      ) {
        return undefined;
      }
      const objects = normalizeNonEmptyArgumentArray(
        payload.objects,
        `${path}.objects`,
        'TransferObjects objects',
        diagnostics,
      );
      const address = normalizeRawArgument(
        payload.address,
        `${path}.address`,
        diagnostics,
      );
      return objects && address
        ? { kind: 'TransferObjects', objects, address }
        : undefined;
    }
    case 'SplitCoins': {
      if (
        !validateRawCommandKeys(view, path, ['coin', 'amounts'], diagnostics)
      ) {
        return undefined;
      }
      const coin = normalizeRawArgument(
        payload.coin,
        `${path}.coin`,
        diagnostics,
      );
      const amounts = normalizeNonEmptyArgumentArray(
        payload.amounts,
        `${path}.amounts`,
        'SplitCoins amounts',
        diagnostics,
      );
      return coin && amounts
        ? { kind: 'SplitCoins', coin, amounts }
        : undefined;
    }
    case 'MergeCoins': {
      if (
        !validateRawCommandKeys(
          view,
          path,
          ['destination', 'sources'],
          diagnostics,
        )
      ) {
        return undefined;
      }
      const destination = normalizeRawArgument(
        payload.destination,
        `${path}.destination`,
        diagnostics,
      );
      const sources = normalizeNonEmptyArgumentArray(
        payload.sources,
        `${path}.sources`,
        'MergeCoins sources',
        diagnostics,
      );
      return destination && sources
        ? { kind: 'MergeCoins', destination, sources }
        : undefined;
    }
    case 'Publish': {
      if (
        !validateRawCommandKeys(
          view,
          path,
          ['modules', 'dependencies'],
          diagnostics,
        )
      ) {
        return undefined;
      }
      const modules = nonEmptyBase64BytesArray(
        payload.modules,
        `${path}.modules`,
        'Publish modules',
        diagnostics,
      );
      const dependencies = objectIdArray(
        payload.dependencies,
        `${path}.dependencies`,
        'Publish dependencies',
        diagnostics,
      );
      return modules && dependencies
        ? { kind: 'Publish', modules, dependencies }
        : undefined;
    }
    case 'MakeMoveVec': {
      if (
        !validateRawCommandKeys(view, path, ['type', 'elements'], diagnostics)
      ) {
        return undefined;
      }
      const elements = normalizeArgumentArray(
        payload.elements,
        `${path}.elements`,
        diagnostics,
      );
      const hasType = Object.prototype.hasOwnProperty.call(payload, 'type');
      let type: string | null | undefined;
      if (hasType) {
        type =
          payload.type === NULL_VALUE
            ? NULL_VALUE
            : parseMoveTypeTag(payload.type);
      }
      if (type === undefined) {
        diagnostics.push(
          errorDiagnostic(
            'raw.command.makeMoveVec.type',
            'MakeMoveVec type must be a string or null.',
            `${path}.type`,
          ),
        );
      }
      if (type === NULL_VALUE && elements?.length === 0) {
        diagnostics.push(
          errorDiagnostic(
            'raw.command.emptyInput',
            'MakeMoveVec elements must not be empty when type is null.',
            `${path}.elements`,
          ),
        );
      }
      return elements &&
        type !== undefined &&
        !(type === NULL_VALUE && elements.length === 0)
        ? { kind: 'MakeMoveVec', type, elements }
        : undefined;
    }
    case 'Upgrade': {
      if (
        !validateRawCommandKeys(
          view,
          path,
          ['modules', 'dependencies', 'package', 'ticket'],
          diagnostics,
        )
      ) {
        return undefined;
      }
      const modules = nonEmptyBase64BytesArray(
        payload.modules,
        `${path}.modules`,
        'Upgrade modules',
        diagnostics,
      );
      const dependencies = objectIdArray(
        payload.dependencies,
        `${path}.dependencies`,
        'Upgrade dependencies',
        diagnostics,
      );
      const packageId = parseObjectId(payload.package);
      if (!packageId) {
        diagnostics.push(
          errorDiagnostic(
            'raw.command.upgrade.package',
            'Upgrade requires package.',
            `${path}.package`,
          ),
        );
      }
      const ticket = normalizeRawArgument(
        payload.ticket,
        `${path}.ticket`,
        diagnostics,
      );
      return modules && dependencies && packageId && ticket
        ? { kind: 'Upgrade', modules, dependencies, package: packageId, ticket }
        : undefined;
    }
    default:
      diagnostics.push(
        errorDiagnostic(
          'raw.command.unsupported',
          `Unsupported command kind ${view.kind}.`,
          path,
        ),
      );
      return undefined;
  }
}

function normalizeMoveCall(
  value: Record<string, unknown>,
  path: string,
  diagnostics: TransactionDiagnostic[],
): RawProgrammableMoveCall | undefined {
  if (
    !validateOnlyKeys(
      value,
      RAW_MOVE_CALL_KEYS,
      'raw.command.moveCall.unknownField',
      path,
      'Raw MoveCall payload',
      diagnostics,
    )
  ) {
    return undefined;
  }
  const packageId = parseObjectId(value.package);
  const module = parseMoveIdentifier(value.module);
  const fn = parseMoveIdentifier(value.function);
  const typeArguments = moveTypeTagArray(
    value.typeArguments,
    `${path}.typeArguments`,
    'MoveCall typeArguments',
    diagnostics,
  );
  const args = normalizeArgumentArray(
    value.arguments,
    `${path}.arguments`,
    diagnostics,
  );
  const argumentTypes = normalizeMoveCallArgumentTypes(
    value._argumentTypes,
    `${path}._argumentTypes`,
    diagnostics,
  );

  if (!packageId) {
    diagnostics.push(
      errorDiagnostic(
        'raw.objectId',
        'MoveCall package must be a Sui object ID.',
        `${path}.package`,
      ),
    );
  }
  if (!module) {
    diagnostics.push(
      errorDiagnostic(
        'raw.moveIdentifier',
        'MoveCall module must be a Move identifier.',
        `${path}.module`,
      ),
    );
  }
  if (!fn) {
    diagnostics.push(
      errorDiagnostic(
        'raw.moveIdentifier',
        'MoveCall function must be a Move identifier.',
        `${path}.function`,
      ),
    );
  }
  if (!packageId || !module || !fn) {
    return undefined;
  }

  if (!typeArguments || !args || argumentTypes.invalid) return undefined;

  return {
    package: packageId,
    module,
    function: fn,
    typeArguments,
    arguments: args,
    ...(argumentTypes.present ? { _argumentTypes: argumentTypes.value } : {}),
  };
}

function normalizeMoveCallArgumentTypes(
  value: unknown,
  path: string,
  diagnostics: TransactionDiagnostic[],
):
  | { present: false; invalid: false }
  | {
      present: true;
      invalid: false;
      value: RawMoveCallArgumentTypes;
    }
  | { present: true; invalid: true } {
  if (value === undefined) return { present: false, invalid: false };
  if (value === NULL_VALUE) {
    return { present: true, invalid: false, value: NULL_VALUE };
  }
  if (isRawMoveCallArgumentTypes(value)) {
    return { present: true, invalid: false, value: cloneJsonLike(value) };
  }

  diagnostics.push(
    errorDiagnostic(
      'raw.command.moveCall.argumentTypes',
      'MoveCall _argumentTypes must match the SDK OpenSignature array schema or null when provided.',
      path,
    ),
  );
  return { present: true, invalid: true };
}

function normalizeArgumentArray(
  value: unknown,
  path: string,
  diagnostics: TransactionDiagnostic[],
): RawArgument[] | undefined {
  if (!isDenseArray(value)) {
    diagnostics.push(
      errorDiagnostic(
        'raw.argument.array',
        'Argument list must be an array.',
        path,
      ),
    );
    return undefined;
  }

  const args = value.map((arg, index) =>
    normalizeRawArgument(arg, `${path}[${index}]`, diagnostics),
  );
  return args.every((arg): arg is RawArgument => arg !== undefined)
    ? args
    : undefined;
}

function normalizeNonEmptyArgumentArray(
  value: unknown,
  path: string,
  label: string,
  diagnostics: TransactionDiagnostic[],
): RawArgument[] | undefined {
  const args = normalizeArgumentArray(value, path, diagnostics);
  if (!args) return undefined;
  if (args.length > 0) return args;

  diagnostics.push(
    errorDiagnostic(
      'raw.command.emptyInput',
      `${label} must not be empty.`,
      path,
    ),
  );
  return undefined;
}

function normalizeRawArgument(
  value: unknown,
  path: string,
  diagnostics: TransactionDiagnostic[],
): RawArgument | undefined {
  const view = enumView(value, diagnostics, path);
  if (!view) {
    diagnostics.push(
      errorDiagnostic('raw.argument', 'Argument must be an enum object.', path),
    );
    return undefined;
  }

  switch (view.kind) {
    case 'GasCoin':
      if (!validateRawArgumentKeys(view, path, [], diagnostics)) {
        return undefined;
      }
      return { kind: 'GasCoin' };
    case 'Input': {
      if (
        !validateRawArgumentKeys(view, path, ['index', 'type'], diagnostics)
      ) {
        return undefined;
      }
      const index = isRecord(view.payload)
        ? u16Index(view.payload.index)
        : u16Index(view.payload);
      const inputType = normalizeRawInputArgumentType(
        value,
        view.payload,
        `${path}.type`,
        diagnostics,
      );
      if (index === undefined) {
        diagnostics.push(
          errorDiagnostic(
            'raw.argument.input',
            'Input argument requires a u16 index.',
            path,
          ),
        );
        return undefined;
      }
      if (inputType.invalid) return undefined;
      return inputType.type === undefined
        ? { kind: 'Input', index }
        : { kind: 'Input', index, type: inputType.type };
    }
    case 'Result': {
      if (!validateRawArgumentKeys(view, path, ['commandIndex'], diagnostics)) {
        return undefined;
      }
      const commandIndex = isRecord(view.payload)
        ? u16Index(view.payload.commandIndex)
        : u16Index(view.payload);
      if (commandIndex === undefined) {
        diagnostics.push(
          errorDiagnostic(
            'raw.argument.result',
            'Result argument requires a u16 command index.',
            path,
          ),
        );
        return undefined;
      }
      return { kind: 'Result', commandIndex };
    }
    case 'NestedResult': {
      if (
        !validateRawArgumentKeys(
          view,
          path,
          ['commandIndex', 'resultIndex'],
          diagnostics,
        )
      ) {
        return undefined;
      }
      const tuple = asArray(view.payload);
      const commandIndex = isRecord(view.payload)
        ? u16Index(view.payload.commandIndex)
        : u16Index(tuple[0]);
      const resultIndex = isRecord(view.payload)
        ? u16Index(view.payload.resultIndex)
        : u16Index(tuple[1]);
      if (commandIndex === undefined || resultIndex === undefined) {
        diagnostics.push(
          errorDiagnostic(
            'raw.argument.nestedResult',
            'NestedResult requires u16 command and result indexes.',
            path,
          ),
        );
        return undefined;
      }
      return { kind: 'NestedResult', commandIndex, resultIndex };
    }
    default:
      diagnostics.push(
        errorDiagnostic(
          'raw.argument.unsupported',
          `Unsupported argument kind ${view.kind}.`,
          path,
        ),
      );
      return undefined;
  }
}

function normalizeRawInputArgumentType(
  value: unknown,
  payload: unknown,
  path: string,
  diagnostics: TransactionDiagnostic[],
):
  | { invalid: false; type?: RawInputArgumentType }
  | {
      invalid: true;
    } {
  const source =
    isRecord(payload) && 'type' in payload
      ? payload
      : isRecord(value)
        ? value
        : isRecord(payload)
          ? payload
          : undefined;
  if (!source || !('type' in source) || source.type === undefined) {
    return { invalid: false };
  }
  if (isRawInputArgumentType(source.type)) {
    return { invalid: false, type: source.type };
  }

  diagnostics.push(
    errorDiagnostic(
      'raw.argument.input.type',
      'Input argument type metadata must be pure, object, or withdrawal when provided.',
      path,
    ),
  );
  return { invalid: true };
}

function unsupportedInput(value: unknown, index: number): IRInput {
  const view = enumView(value);
  return {
    id: `input_${index}`,
    kind: 'Unsupported',
    sourceKind: view?.kind ?? 'Unknown',
    value: cloneJsonLike(value),
  };
}

function unsupportedCommand(value: unknown, index: number): IRCommand {
  const view = enumView(value);
  return {
    id: `command_${index}`,
    kind: 'Unsupported',
    sourceKind: view?.kind ?? 'Unknown',
    value: cloneJsonLike(value),
    resultCount: 0,
  };
}

function enumView(
  value: unknown,
  diagnostics?: TransactionDiagnostic[],
  path = '$',
): EnumView | undefined {
  if (!isRecord(value)) return undefined;

  const modelKind = typeof value.kind === 'string' ? value.kind : undefined;
  const sdkKind = typeof value.$kind === 'string' ? value.$kind : undefined;

  if (modelKind && sdkKind && modelKind !== sdkKind) {
    diagnostics?.push(
      errorDiagnostic(
        'raw.enum.conflict',
        `Raw enum object has conflicting kind ${modelKind} and $kind ${sdkKind}.`,
        path,
      ),
    );
    return undefined;
  }

  if (modelKind) {
    return { kind: modelKind, payload: value, source: value, shape: 'kind' };
  }

  if (sdkKind) {
    return {
      kind: sdkKind,
      payload: value[sdkKind],
      source: value,
      shape: '$kind',
    };
  }

  // SDK Argument.Input may carry optional `type` metadata next to the variant
  // key; ignore it when detecting single-key enum objects.
  const keys = Object.keys(value).filter((key) => key !== 'type');
  if (keys.length === 1) {
    return {
      kind: keys[0],
      payload: value[keys[0]],
      source: value,
      shape: 'singleKey',
    };
  }

  return undefined;
}

function validateRawEnumKeys(
  view: EnumView,
  code: string,
  path: string,
  label: string,
  payloadKeys: readonly string[],
  diagnostics: TransactionDiagnostic[],
): boolean {
  if (view.shape === 'kind') {
    return validateOnlyKeys(
      view.source,
      ['kind', ...payloadKeys],
      code,
      path,
      label,
      diagnostics,
    );
  }

  const envelopeKeys =
    view.shape === '$kind' ? ['$kind', view.kind] : [view.kind];
  const envelopeIsValid = validateOnlyKeys(
    view.source,
    envelopeKeys,
    code,
    path,
    label,
    diagnostics,
  );
  const payloadIsValid =
    payloadKeys.length === 0 || !isRecord(view.payload)
      ? true
      : validateOnlyKeys(
          view.payload,
          payloadKeys,
          code,
          `${path}.${view.kind}`,
          `${label} payload`,
          diagnostics,
        );
  return envelopeIsValid && payloadIsValid;
}

function validateRawEnumEnvelopeKeys(
  view: EnumView,
  code: string,
  path: string,
  label: string,
  diagnostics: TransactionDiagnostic[],
): boolean {
  if (view.shape === 'kind') {
    return validateOnlyKeys(
      view.source,
      ['kind'],
      code,
      path,
      label,
      diagnostics,
    );
  }
  const envelopeKeys =
    view.shape === '$kind' ? ['$kind', view.kind] : [view.kind];
  return validateOnlyKeys(
    view.source,
    envelopeKeys,
    code,
    path,
    label,
    diagnostics,
  );
}

function validateRawCommandKeys(
  view: EnumView,
  path: string,
  payloadKeys: readonly string[],
  diagnostics: TransactionDiagnostic[],
): boolean {
  return validateRawEnumKeys(
    view,
    'raw.command.unknownField',
    path,
    `Raw ${view.kind} command`,
    payloadKeys,
    diagnostics,
  );
}

function validateRawArgumentKeys(
  view: EnumView,
  path: string,
  payloadKeys: readonly string[],
  diagnostics: TransactionDiagnostic[],
): boolean {
  if (view.kind === 'Input' && view.shape !== 'kind') {
    const envelopeKeys =
      view.shape === '$kind' ? ['$kind', 'Input', 'type'] : ['Input', 'type'];
    return validateOnlyKeys(
      view.source,
      envelopeKeys,
      'raw.argument.unknownField',
      path,
      'Raw Input argument',
      diagnostics,
    );
  }
  return validateRawEnumKeys(
    view,
    'raw.argument.unknownField',
    path,
    `Raw ${view.kind} argument`,
    payloadKeys,
    diagnostics,
  );
}

function validateOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  code: string,
  path: string,
  label: string,
  diagnostics: TransactionDiagnostic[],
): boolean {
  let valid = true;
  Object.keys(value)
    .filter((key) => !allowedKeys.includes(key))
    .forEach((key) => {
      valid = false;
      diagnostics.push(
        errorDiagnostic(
          code,
          `${label} does not support field ${key}.`,
          `${path}.${key}`,
        ),
      );
    });
  return valid;
}

function u16Index(value: unknown): number | undefined {
  return typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= 65_535
    ? value
    : undefined;
}

function base64BytesArray(
  value: unknown,
  path: string,
  label: string,
  diagnostics: TransactionDiagnostic[],
): string[] | undefined {
  if (!isDenseArray(value)) {
    diagnostics.push(
      errorDiagnostic(
        'raw.base64Bytes',
        `${label} must be an array of base64-decodable base64 byte strings.`,
        path,
      ),
    );
    return undefined;
  }

  const items = value.map((item, index) => {
    const bytes = parseBase64Bytes(item);
    if (bytes === undefined) {
      diagnostics.push(
        errorDiagnostic(
          'raw.base64Bytes',
          `${label} item ${index} must be base64-decodable base64 bytes.`,
          `${path}[${index}]`,
        ),
      );
    }
    return bytes;
  });

  return items.every((item): item is string => item !== undefined)
    ? items
    : undefined;
}

function nonEmptyBase64BytesArray(
  value: unknown,
  path: string,
  label: string,
  diagnostics: TransactionDiagnostic[],
): string[] | undefined {
  const items = base64BytesArray(value, path, label, diagnostics);
  if (!items) return undefined;
  if (items.length > 0) return items;

  diagnostics.push(
    errorDiagnostic(
      'raw.command.emptyInput',
      `${label} must not be empty.`,
      path,
    ),
  );
  return undefined;
}

function objectIdArray(
  value: unknown,
  path: string,
  label: string,
  diagnostics: TransactionDiagnostic[],
): string[] | undefined {
  if (!isDenseArray(value)) {
    diagnostics.push(
      errorDiagnostic(
        'raw.objectIdArray',
        `${label} must be an array of Sui object IDs.`,
        path,
      ),
    );
    return undefined;
  }

  const items = value.map((item, index) => {
    const objectId = parseObjectId(item);
    if (objectId === undefined) {
      diagnostics.push(
        errorDiagnostic(
          'raw.objectId',
          `${label} item ${index} must be a Sui object ID.`,
          `${path}[${index}]`,
        ),
      );
    }
    return objectId;
  });

  return items.every((item): item is string => item !== undefined)
    ? items
    : undefined;
}

function moveTypeTagArray(
  value: unknown,
  path: string,
  label: string,
  diagnostics: TransactionDiagnostic[],
): string[] | undefined {
  if (!isDenseArray(value)) {
    diagnostics.push(
      errorDiagnostic(
        'raw.moveTypeTagArray',
        `${label} must be an array of Move type tag strings.`,
        path,
      ),
    );
    return undefined;
  }

  const items = value.map((item, index) => {
    const typeTag = parseMoveTypeTag(item);
    if (typeTag === undefined) {
      diagnostics.push(
        errorDiagnostic(
          'raw.moveTypeTag',
          `${label} item ${index} must be a valid Move type tag string.`,
          `${path}[${index}]`,
        ),
      );
    }
    return typeTag;
  });

  return items.every((item): item is string => item !== undefined)
    ? items
    : undefined;
}
