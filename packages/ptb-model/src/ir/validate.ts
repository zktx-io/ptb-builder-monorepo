import {
  freezeDiagnostics,
  isCanonicalDiagnosticShape,
  isGraphDiagnostic,
  errorDiagnostic as modelDiagnostic,
} from './diagnostics.js';
import type { TransactionDiagnostic } from './diagnostics.js';
import {
  isNonNegativeSafeInteger,
  isU16Index,
  MAX_RESULT_COUNT,
} from './limits.js';
import { pureBytesTypeHintDiagnostic, pureValueDiagnostic } from './pure.js';
import { isIRArgRef } from './types.js';
import type { IRArgRef, IRCommand, IRInput, TransactionIR } from './types.js';
import {
  IR_ARG_REF_KEYS_BY_KIND,
  IR_COMMAND_KEYS_BY_KIND,
  IR_INPUT_KEYS_BY_KIND,
  IR_OBJECT_SOURCE_KEYS_BY_KIND,
  TRANSACTION_IR_KEYS,
} from './validationKeys.js';
import {
  commandInputSlotExpectation,
  irCommandInputUses,
  rawArgumentTypeForIRInput,
} from '../inputTypeEvidence.js';
import type { PTBInputArgumentKind } from '../inputTypeEvidence.js';
import {
  normalizeMovePackageSignatureEvidenceOption,
  resolveMoveCallSignatureEvidence,
} from '../move/evidence.js';
import type {
  MoveFunctionSignatureEvidence,
  MovePackageSignatureEvidence,
} from '../move/evidence.js';
import {
  toPTBTypeFromConcreteTypeArgument,
  toPTBTypeFromOpenSignature,
} from '../move/signature.js';
import {
  describePTBType,
  isPTBType,
  ptbTypesAreComparable,
  ptbTypeSatisfiesExpectation,
  ptbTypesExactlyMatch,
  validatePTBType,
} from '../ptbType.js';
import type { PTBType } from '../ptbType.js';
import {
  isRawFundsWithdrawalArg,
  isRawInputArgumentType,
  isRawMoveCallArgumentTypes,
  isRawObjectArg,
  parseBase64Bytes,
  parseMoveIdentifier,
  parseMoveTypeTag,
  parseObjectId,
} from '../raw/types.js';
import {
  findNonPlainData,
  isDenseArray,
  isRecord,
  jsonLikeEqual,
  NULL_VALUE,
} from '../utils.js';
import type { PlainDataIssue } from '../utils.js';

function irDiagnostic(
  code: string,
  message: string,
  path?: string,
): TransactionDiagnostic {
  return modelDiagnostic(code, 'semantic', message, path);
}

export interface ValidateTransactionIROptions {
  includeExistingDiagnostics?: boolean;
  includeUnsupportedDiagnostics?: boolean;
  moveSignatures?: MovePackageSignatureEvidence;
  requireKnownResultArity?: boolean;
}

interface MoveCallEvidenceState {
  resultArity: number;
  typeArgumentsComplete: boolean;
  signatureForType?: MoveFunctionSignatureEvidence;
}

type MoveCallEvidenceStateByCommandIndex = ReadonlyMap<
  number,
  MoveCallEvidenceState
>;

export function validateTransactionIR(
  value: unknown,
  options: ValidateTransactionIROptions = {},
): readonly TransactionDiagnostic[] {
  const includeExistingDiagnostics =
    options.includeExistingDiagnostics ?? false;
  const includeUnsupportedDiagnostics =
    options.includeUnsupportedDiagnostics ?? true;
  const moveSignatures = normalizeMovePackageSignatureEvidenceOption(
    options.moveSignatures,
  );
  const requireKnownResultArity = options.requireKnownResultArity ?? false;
  const diagnostics: TransactionDiagnostic[] = [];

  if (!isRecord(value)) {
    diagnostics.push(
      irDiagnostic('ir.invalid', 'TransactionIR must be an object.', '$'),
    );
    return freezeDiagnostics(diagnostics);
  }

  const plainDataIssue = findNonPlainData(value);
  if (plainDataIssue) {
    diagnostics.push(transactionIRPlainDataDiagnostic(plainDataIssue));
  }

  validateUnknownFields(
    value,
    TRANSACTION_IR_KEYS,
    'ir.unknownField',
    '$',
    'TransactionIR',
    diagnostics,
  );

  const existingDiagnostics = value.diagnostics;
  const diagnosticsAreDense = isDenseArray(existingDiagnostics);
  if (diagnosticsAreDense) {
    existingDiagnostics.forEach((diagnostic, index) => {
      if (isTransactionDiagnosticShape(diagnostic)) {
        if (includeExistingDiagnostics) {
          diagnostics.push(diagnostic);
        }
        return;
      }

      diagnostics.push(
        irDiagnostic(
          'ir.diagnostic',
          `TransactionIR diagnostic ${index} is malformed.`,
          `$.diagnostics[${index}]`,
        ),
      );
    });
  } else {
    diagnostics.push(
      irDiagnostic(
        'ir.diagnostics',
        'TransactionIR diagnostics must be a dense array.',
        '$.diagnostics',
      ),
    );
  }

  if (value.version !== 'transaction_ir_1') {
    diagnostics.push(
      irDiagnostic(
        'ir.version',
        'TransactionIR version must be transaction_ir_1.',
        '$.version',
      ),
    );
  }

  const inputValues = value.inputs;
  const commandValues = value.commands;
  const inputsAreDense = isDenseArray(inputValues);
  const commandsAreDense = isDenseArray(commandValues);

  if (!inputsAreDense) {
    diagnostics.push(
      irDiagnostic(
        'ir.inputs',
        'TransactionIR inputs must be a dense array.',
        '$.inputs',
      ),
    );
  }

  if (!commandsAreDense) {
    diagnostics.push(
      irDiagnostic(
        'ir.commands',
        'TransactionIR commands must be a dense array.',
        '$.commands',
      ),
    );
  }

  if (!inputsAreDense || !commandsAreDense) {
    return freezeDiagnostics(uniqueDiagnostics(diagnostics));
  }

  const ir = {
    version: value.version,
    inputs: inputValues,
    commands: commandValues,
    diagnostics,
  } as TransactionIR;

  validateUniqueIds(ir.inputs, 'input', '$.inputs', diagnostics);
  validateUniqueIds(ir.commands, 'command', '$.commands', diagnostics);

  ir.inputs.forEach((input, index) => {
    if (!isIRInputShape(input, index, diagnostics)) {
      return;
    }

    if (input.kind === 'Unsupported' && includeUnsupportedDiagnostics) {
      diagnostics.push(
        irDiagnostic(
          'ir.input.unsupported',
          `Input ${index} has unsupported source kind ${input.sourceKind}.`,
          `$.inputs[${index}]`,
        ),
      );
    }
  });

  const moveCallEvidenceByCommandIndex = new Map<
    number,
    MoveCallEvidenceState
  >();

  ir.commands.forEach((command, commandIndex) => {
    if (!isIRCommandShape(command, commandIndex, diagnostics)) {
      return;
    }

    validateCommandResultCount(command, commandIndex, diagnostics);
    const moveCallEvidence = moveCallEvidenceState(
      command,
      commandIndex,
      moveSignatures,
      diagnostics,
    );
    if (moveCallEvidence !== undefined) {
      moveCallEvidenceByCommandIndex.set(commandIndex, moveCallEvidence);
    }

    if (command.kind === 'Unsupported') {
      if (!includeUnsupportedDiagnostics) {
        return;
      }
      diagnostics.push(
        irDiagnostic(
          'ir.command.unsupported',
          `Command ${commandIndex} has unsupported source kind ${command.sourceKind}.`,
          `$.commands[${commandIndex}]`,
        ),
      );
      return;
    }

    irCommandInputUses(command, commandIndex, { moveSignatures }).forEach(
      ({ arg, path, expectation }) => {
        validateArgRef(
          ir,
          commandIndex,
          arg,
          path,
          diagnostics,
          moveCallEvidenceByCommandIndex,
          expectation?.inputKind,
          expectation?.ptbType,
          requireKnownResultArity,
        );
      },
    );
    validateMakeMoveVecElementTypes(
      ir,
      command,
      commandIndex,
      diagnostics,
      moveCallEvidenceByCommandIndex,
    );
  });

  return freezeDiagnostics(uniqueDiagnostics(diagnostics));
}

function isTransactionDiagnosticShape(
  value: unknown,
): value is TransactionDiagnostic {
  return isCanonicalDiagnosticShape(value);
}

function validateUniqueIds(
  items: readonly { id?: unknown }[],
  label: 'input' | 'command',
  path: string,
  diagnostics: TransactionDiagnostic[],
): void {
  const firstIndexById = new Map<string, number>();
  items.forEach((item, index) => {
    if (!isRecord(item)) return;
    if (typeof item.id !== 'string') return;
    const firstIndex = firstIndexById.get(item.id);
    if (firstIndex === undefined) {
      firstIndexById.set(item.id, index);
      return;
    }
    diagnostics.push(
      irDiagnostic(
        `ir.${label}.duplicateId`,
        `TransactionIR ${label} id ${item.id} is duplicated; first occurrence is at index ${firstIndex}.`,
        `${path}[${index}].id`,
      ),
    );
  });
}

function validateNonEmptyId(
  value: string,
  label: 'input' | 'command',
  index: number,
  path: string,
  diagnostics: TransactionDiagnostic[],
): boolean {
  if (value.length > 0) return true;

  diagnostics.push(
    irDiagnostic(
      `ir.${label}.id`,
      `TransactionIR ${label} ${index} requires a non-empty id string.`,
      path,
    ),
  );
  return false;
}

function validateCanonicalRawField(
  value: Record<string, unknown>,
  expected: unknown | undefined,
  label: 'input' | 'command',
  index: number,
  diagnostics: TransactionDiagnostic[],
): boolean {
  if (!Object.prototype.hasOwnProperty.call(value, 'canonicalRaw')) return true;
  if (value.canonicalRaw === undefined) return true;

  const plainDataIssue = findNonPlainData(
    value.canonicalRaw,
    `$${label === 'input' ? '.inputs' : '.commands'}[${index}].canonicalRaw`,
  );
  if (plainDataIssue) {
    diagnostics.push(
      irDiagnostic(
        `ir.${label}.canonicalRaw`,
        `TransactionIR ${label} ${index} canonicalRaw must be plain data owned by TransactionIR. ${plainDataIssue.message}`,
        plainDataIssue.path,
      ),
    );
    return false;
  }

  if (expected !== undefined && jsonLikeEqual(value.canonicalRaw, expected)) {
    return true;
  }

  diagnostics.push(
    irDiagnostic(
      `ir.${label}.canonicalRaw`,
      expected === undefined
        ? `TransactionIR ${label} ${index} cannot carry canonicalRaw because this ${label} does not represent a canonical raw PTB payload.`
        : `TransactionIR ${label} ${index} canonicalRaw must match the canonical raw PTB payload represented by this ${label}.`,
      `$${label === 'input' ? '.inputs' : '.commands'}[${index}].canonicalRaw`,
    ),
  );
  return false;
}

function validateIRObjectSource(
  value: Record<string, unknown>,
  inputIndex: number,
  diagnostics: TransactionDiagnostic[],
): boolean {
  const path = `$.inputs[${inputIndex}].source`;
  const source = value.source;
  if (!isRecord(source) || typeof source.kind !== 'string') {
    diagnostics.push(
      irDiagnostic(
        'ir.input.objectSource',
        `Object input ${inputIndex} requires an object source.`,
        path,
      ),
    );
    return false;
  }

  switch (source.kind) {
    case 'Unresolved': {
      validateUnknownFields(
        source,
        IR_OBJECT_SOURCE_KEYS_BY_KIND.Unresolved,
        'ir.input.objectSource.unknownField',
        path,
        'TransactionIR object source',
        diagnostics,
      );
      const objectId =
        typeof source.objectId === 'string'
          ? parseObjectId(source.objectId)
          : undefined;
      if (objectId === undefined || objectId !== source.objectId) {
        diagnostics.push(
          irDiagnostic(
            'ir.input.objectId',
            `Object input ${inputIndex} unresolved source requires a canonical object id.`,
            `${path}.objectId`,
          ),
        );
        return false;
      }
      return validateCanonicalRawField(
        value,
        undefined,
        'input',
        inputIndex,
        diagnostics,
      );
    }
    case 'Resolved':
      validateUnknownFields(
        source,
        IR_OBJECT_SOURCE_KEYS_BY_KIND.Resolved,
        'ir.input.objectSource.unknownField',
        path,
        'TransactionIR object source',
        diagnostics,
      );
      if (isRawObjectArg(source.object)) {
        return validateCanonicalRawField(
          value,
          { kind: 'Object', object: source.object },
          'input',
          inputIndex,
          diagnostics,
        );
      }
      diagnostics.push(
        irDiagnostic(
          'ir.input.object',
          `Object input ${inputIndex} resolved source requires a valid object argument.`,
          `${path}.object`,
        ),
      );
      return false;
    default:
      diagnostics.push(
        irDiagnostic(
          'ir.input.objectSource',
          `Object input ${inputIndex} has unsupported object source ${source.kind}.`,
          `${path}.kind`,
        ),
      );
      return false;
  }
}

function transactionIRPlainDataDiagnostic(
  issue: PlainDataIssue,
): TransactionDiagnostic {
  return irDiagnostic(
    'ir.plainData',
    `TransactionIR must contain only plain model-owned data. ${issue.message}`,
    issue.path,
  );
}

function isIRInputShape(
  value: unknown,
  inputIndex: number,
  diagnostics: TransactionDiagnostic[],
): value is IRInput {
  const path = `$.inputs[${inputIndex}]`;
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.kind !== 'string'
  ) {
    diagnostics.push(
      irDiagnostic(
        'ir.input',
        `Input ${inputIndex} is not a supported TransactionIR input.`,
        path,
      ),
    );
    return false;
  }
  if (
    !validateNonEmptyId(
      value.id,
      'input',
      inputIndex,
      `${path}.id`,
      diagnostics,
    )
  ) {
    return false;
  }

  switch (value.kind) {
    case 'Pure':
      validateIRInputUnknownFields(value, 'Pure', path, diagnostics);
      {
        const inputType = value.type;
        if (
          !validateOptionalInputType(inputType, `${path}.type`, diagnostics)
        ) {
          return false;
        }
        if ('bytes' in value && value.bytes !== undefined) {
          const bytes = value.bytes;
          if (Object.prototype.hasOwnProperty.call(value, 'value')) {
            diagnostics.push(
              irDiagnostic(
                'ir.input.pureRedundant',
                `Pure input ${inputIndex} must choose raw bytes or a typed pure value, not both.`,
                path,
              ),
            );
            return false;
          }
          if (typeof bytes === 'string' && parseBase64Bytes(bytes) === bytes) {
            if (inputType !== undefined) {
              const diagnostic = pureBytesTypeHintDiagnostic(
                value.id,
                inputType,
                bytes,
                `${path}.bytes`,
              );
              if (diagnostic) {
                diagnostics.push(diagnostic);
                return false;
              }
            }
            return validateCanonicalRawField(
              value,
              { kind: 'Pure', bytes },
              'input',
              inputIndex,
              diagnostics,
            );
          }
          diagnostics.push(
            irDiagnostic(
              'ir.input.pure',
              `Pure input ${inputIndex} bytes must be base64-decodable base64 bytes when provided.`,
              `${path}.bytes`,
            ),
          );
          return false;
        }
        if (!Object.prototype.hasOwnProperty.call(value, 'value')) {
          diagnostics.push(
            irDiagnostic(
              'ir.input.pureValue',
              `Pure input ${inputIndex} requires an explicit typed value when raw bytes are absent.`,
              path,
            ),
          );
          return false;
        }
        if (value.value === undefined) {
          diagnostics.push(
            irDiagnostic(
              'ir.input.pureValue',
              `Pure input ${inputIndex} must use null for None values; undefined is not canonical.`,
              `${path}.value`,
            ),
          );
          return false;
        }
        if (inputType === undefined) {
          diagnostics.push(
            irDiagnostic(
              'ir.input.pureType',
              `Pure input ${inputIndex} requires an explicit type when raw bytes are absent.`,
              `${path}.type`,
            ),
          );
          return false;
        }
        const diagnostic = pureValueDiagnostic(
          value.id,
          inputType,
          value.value,
          `${path}.value`,
          `${path}.type`,
        );
        if (diagnostic) {
          diagnostics.push(diagnostic);
          return false;
        }
      }
      return validateCanonicalRawField(
        value,
        undefined,
        'input',
        inputIndex,
        diagnostics,
      );
    case 'Object':
      validateIRInputUnknownFields(value, 'Object', path, diagnostics);
      if (!validateOptionalInputType(value.type, `${path}.type`, diagnostics)) {
        return false;
      }
      if (
        value.type !== undefined &&
        (!isRecord(value.type) || value.type.kind !== 'object')
      ) {
        diagnostics.push(
          irDiagnostic(
            'ir.input.objectType',
            `Object input ${inputIndex} type hint must be an object PTB type when present.`,
            `${path}.type`,
          ),
        );
        return false;
      }
      return validateIRObjectSource(value, inputIndex, diagnostics);
    case 'FundsWithdrawal':
      validateIRInputUnknownFields(value, 'FundsWithdrawal', path, diagnostics);
      if (isRawFundsWithdrawalArg(value.value)) {
        return validateCanonicalRawField(
          value,
          { kind: 'FundsWithdrawal', value: value.value },
          'input',
          inputIndex,
          diagnostics,
        );
      }
      diagnostics.push(
        irDiagnostic(
          'ir.input.fundsWithdrawal',
          `FundsWithdrawal input ${inputIndex} has an invalid value payload.`,
          `${path}.value`,
        ),
      );
      return false;
    case 'Unsupported':
      validateIRInputUnknownFields(value, 'Unsupported', path, diagnostics);
      if (typeof value.sourceKind === 'string') {
        validateUnsupportedPayload(
          value,
          `${path}.value`,
          'input',
          inputIndex,
          diagnostics,
        );
        return true;
      }
      diagnostics.push(
        irDiagnostic(
          'ir.input.unsupportedShape',
          `Unsupported input ${inputIndex} requires a sourceKind string.`,
          `${path}.sourceKind`,
        ),
      );
      return false;
    default:
      diagnostics.push(
        irDiagnostic(
          'ir.input.kind',
          `Unsupported TransactionIR input kind ${value.kind}.`,
          `${path}.kind`,
        ),
      );
      return false;
  }
}

function validateOptionalInputType(
  value: unknown,
  path: string,
  diagnostics: TransactionDiagnostic[],
): value is PTBType | undefined {
  if (value === undefined) return true;

  const typeDiagnostics = validatePTBType(value, path);
  diagnostics.push(...typeDiagnostics);
  return typeDiagnostics.length === 0;
}

function validateUnsupportedPayload(
  value: { value?: unknown },
  path: string,
  ownerKind: 'input' | 'command',
  ownerIndex: number,
  diagnostics: TransactionDiagnostic[],
) {
  if (!Object.prototype.hasOwnProperty.call(value, 'value')) return;
  const issue = findNonPlainData(value.value, path);
  if (!issue) return;

  diagnostics.push(
    irDiagnostic(
      `ir.${ownerKind}.unsupportedValue`,
      `Unsupported ${ownerKind} ${ownerIndex} value must be plain data owned by TransactionIR. ${issue.message}`,
      issue.path,
    ),
  );
}

function isIRCommandShape(
  value: unknown,
  commandIndex: number,
  diagnostics: TransactionDiagnostic[],
): value is IRCommand {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.kind !== 'string'
  ) {
    diagnostics.push(
      irDiagnostic(
        'ir.command',
        `Command ${commandIndex} is not a supported TransactionIR command.`,
        `$.commands[${commandIndex}]`,
      ),
    );
    return false;
  }
  if (
    !validateNonEmptyId(
      value.id,
      'command',
      commandIndex,
      `$.commands[${commandIndex}].id`,
      diagnostics,
    )
  ) {
    return false;
  }

  switch (value.kind) {
    case 'MoveCall':
      validateIRCommandUnknownFields(
        value,
        'MoveCall',
        commandIndex,
        diagnostics,
      );
      return (
        requireObjectId(value.package, commandIndex, 'package', diagnostics) &&
        requireMoveIdentifier(
          value.module,
          commandIndex,
          'module',
          diagnostics,
        ) &&
        requireMoveIdentifier(
          value.function,
          commandIndex,
          'function',
          diagnostics,
        ) &&
        requireMoveTypeTagArray(
          value.typeArguments,
          commandIndex,
          'typeArguments',
          diagnostics,
        ) &&
        requireArgArray(
          value.arguments,
          commandIndex,
          'arguments',
          diagnostics,
        ) &&
        requireOptionalMoveCallArgumentTypes(
          value._argumentTypes,
          commandIndex,
          '_argumentTypes',
          diagnostics,
        ) &&
        validateMoveCallArgumentTypesLength(
          value._argumentTypes,
          value.arguments,
          commandIndex,
          diagnostics,
        ) &&
        validateCanonicalRawField(
          value,
          {
            kind: 'MoveCall',
            call: {
              package: value.package,
              module: value.module,
              function: value.function,
              typeArguments: value.typeArguments,
              arguments: value.arguments,
              ...(value._argumentTypes !== undefined
                ? { _argumentTypes: value._argumentTypes }
                : {}),
            },
          },
          'command',
          commandIndex,
          diagnostics,
        )
      );
    case 'TransferObjects':
      validateIRCommandUnknownFields(
        value,
        'TransferObjects',
        commandIndex,
        diagnostics,
      );
      return (
        requireNonEmptyArgArray(
          value.objects,
          commandIndex,
          'objects',
          diagnostics,
        ) &&
        requireArgRef(value.address, commandIndex, 'address', diagnostics) &&
        validateCanonicalRawField(
          value,
          {
            kind: 'TransferObjects',
            objects: value.objects,
            address: value.address,
          },
          'command',
          commandIndex,
          diagnostics,
        )
      );
    case 'SplitCoins':
      validateIRCommandUnknownFields(
        value,
        'SplitCoins',
        commandIndex,
        diagnostics,
      );
      return (
        requireArgRef(value.coin, commandIndex, 'coin', diagnostics) &&
        requireNonEmptyArgArray(
          value.amounts,
          commandIndex,
          'amounts',
          diagnostics,
        ) &&
        validateCanonicalRawField(
          value,
          { kind: 'SplitCoins', coin: value.coin, amounts: value.amounts },
          'command',
          commandIndex,
          diagnostics,
        )
      );
    case 'MergeCoins':
      validateIRCommandUnknownFields(
        value,
        'MergeCoins',
        commandIndex,
        diagnostics,
      );
      return (
        requireArgRef(
          value.destination,
          commandIndex,
          'destination',
          diagnostics,
        ) &&
        requireNonEmptyArgArray(
          value.sources,
          commandIndex,
          'sources',
          diagnostics,
        ) &&
        validateCanonicalRawField(
          value,
          {
            kind: 'MergeCoins',
            destination: value.destination,
            sources: value.sources,
          },
          'command',
          commandIndex,
          diagnostics,
        )
      );
    case 'Publish':
      validateIRCommandUnknownFields(
        value,
        'Publish',
        commandIndex,
        diagnostics,
      );
      return (
        requireNonEmptyBase64StringArray(
          value.modules,
          commandIndex,
          'modules',
          diagnostics,
        ) &&
        requireObjectIdArray(
          value.dependencies,
          commandIndex,
          'dependencies',
          diagnostics,
        ) &&
        validateCanonicalRawField(
          value,
          {
            kind: 'Publish',
            modules: value.modules,
            dependencies: value.dependencies,
          },
          'command',
          commandIndex,
          diagnostics,
        )
      );
    case 'MakeMoveVec':
      validateIRCommandUnknownFields(
        value,
        'MakeMoveVec',
        commandIndex,
        diagnostics,
      );
      if (
        !(
          requireNullableMoveTypeTag(
            value.type,
            commandIndex,
            'type',
            diagnostics,
          ) &&
          requireArgArray(value.elements, commandIndex, 'elements', diagnostics)
        )
      ) {
        return false;
      }
      if (
        value.type === NULL_VALUE &&
        isDenseArray(value.elements) &&
        value.elements.length === 0
      ) {
        diagnostics.push(
          irDiagnostic(
            'ir.command.emptyInput',
            `Command ${commandIndex} MakeMoveVec elements must not be empty when type is null.`,
            `$.commands[${commandIndex}].elements`,
          ),
        );
        return false;
      }
      return validateCanonicalRawField(
        value,
        { kind: 'MakeMoveVec', type: value.type, elements: value.elements },
        'command',
        commandIndex,
        diagnostics,
      );
    case 'Upgrade':
      validateIRCommandUnknownFields(
        value,
        'Upgrade',
        commandIndex,
        diagnostics,
      );
      return (
        requireNonEmptyBase64StringArray(
          value.modules,
          commandIndex,
          'modules',
          diagnostics,
        ) &&
        requireObjectIdArray(
          value.dependencies,
          commandIndex,
          'dependencies',
          diagnostics,
        ) &&
        requireObjectId(value.package, commandIndex, 'package', diagnostics) &&
        requireArgRef(value.ticket, commandIndex, 'ticket', diagnostics) &&
        validateCanonicalRawField(
          value,
          {
            kind: 'Upgrade',
            modules: value.modules,
            dependencies: value.dependencies,
            package: value.package,
            ticket: value.ticket,
          },
          'command',
          commandIndex,
          diagnostics,
        )
      );
    case 'Unsupported':
      validateIRCommandUnknownFields(
        value,
        'Unsupported',
        commandIndex,
        diagnostics,
      );
      if (
        !requireString(
          value.sourceKind,
          commandIndex,
          'sourceKind',
          diagnostics,
        )
      ) {
        return false;
      }
      validateUnsupportedPayload(
        value,
        `$.commands[${commandIndex}].value`,
        'command',
        commandIndex,
        diagnostics,
      );
      return true;
    default:
      diagnostics.push(
        irDiagnostic(
          'ir.command.kind',
          `Unsupported TransactionIR command kind ${value.kind}.`,
          `$.commands[${commandIndex}].kind`,
        ),
      );
      return false;
  }
}

function requireString(
  value: unknown,
  commandIndex: number,
  key: string,
  diagnostics: TransactionDiagnostic[],
): boolean {
  if (typeof value === 'string') return true;

  diagnostics.push(
    irDiagnostic(
      'ir.command.field',
      `Command ${commandIndex} requires string field ${key}.`,
      `$.commands[${commandIndex}].${key}`,
    ),
  );
  return false;
}

function requireMoveIdentifier(
  value: unknown,
  commandIndex: number,
  key: string,
  diagnostics: TransactionDiagnostic[],
): boolean {
  if (typeof value === 'string' && parseMoveIdentifier(value) === value) {
    return true;
  }

  diagnostics.push(
    irDiagnostic(
      'ir.command.moveIdentifier',
      `Command ${commandIndex} field ${key} must be a valid Move identifier.`,
      `$.commands[${commandIndex}].${key}`,
    ),
  );
  return false;
}

function requireObjectId(
  value: unknown,
  commandIndex: number,
  key: string,
  diagnostics: TransactionDiagnostic[],
): boolean {
  if (typeof value === 'string' && parseObjectId(value) === value) {
    return true;
  }

  diagnostics.push(
    irDiagnostic(
      'ir.command.objectId',
      `Command ${commandIndex} field ${key} must be a normalized Sui object ID.`,
      `$.commands[${commandIndex}].${key}`,
    ),
  );
  return false;
}

function requireMoveTypeTagArray(
  value: unknown,
  commandIndex: number,
  key: string,
  diagnostics: TransactionDiagnostic[],
): boolean {
  if (!isDenseArray(value)) {
    diagnostics.push(
      irDiagnostic(
        'ir.command.moveTypeTagArray',
        `Command ${commandIndex} requires Move type tag array field ${key}.`,
        `$.commands[${commandIndex}].${key}`,
      ),
    );
    return false;
  }

  let valid = true;
  value.forEach((item, index) => {
    if (typeof item === 'string' && parseMoveTypeTag(item) === item) return;
    valid = false;
    diagnostics.push(
      irDiagnostic(
        'ir.command.moveTypeTag',
        `Command ${commandIndex} field ${key} item ${index} must be a canonical Move type tag string.`,
        `$.commands[${commandIndex}].${key}[${index}]`,
      ),
    );
  });
  return valid;
}

function requireOptionalMoveCallArgumentTypes(
  value: unknown,
  commandIndex: number,
  key: string,
  diagnostics: TransactionDiagnostic[],
): boolean {
  if (value === undefined || isRawMoveCallArgumentTypes(value)) {
    return true;
  }

  diagnostics.push(
    irDiagnostic(
      'ir.command.argumentTypes',
      `Command ${commandIndex} field ${key} must match the SDK OpenSignature array schema or null when provided.`,
      `$.commands[${commandIndex}].${key}`,
    ),
  );
  return false;
}

function validateMoveCallArgumentTypesLength(
  argumentTypes: unknown,
  args: unknown,
  commandIndex: number,
  diagnostics: TransactionDiagnostic[],
): boolean {
  if (argumentTypes === undefined || argumentTypes === NULL_VALUE) return true;
  if (!isDenseArray(argumentTypes) || !isDenseArray(args)) return true;
  if (argumentTypes.length === args.length) return true;

  diagnostics.push(
    irDiagnostic(
      'ir.command.argumentTypesLength',
      `Command ${commandIndex} _argumentTypes length must match arguments length.`,
      `$.commands[${commandIndex}]._argumentTypes`,
    ),
  );
  return false;
}

function moveCallEvidenceState(
  command: IRCommand,
  commandIndex: number,
  moveSignatures: MovePackageSignatureEvidence | undefined,
  diagnostics: TransactionDiagnostic[],
): MoveCallEvidenceState | undefined {
  if (command.kind !== 'MoveCall') return undefined;

  const evidence = resolveMoveCallSignatureEvidence({
    packageId: command.package,
    moduleName: command.module,
    functionName: command.function,
    moveSignatures,
    typeArguments: command.typeArguments,
    explicitResultCount: command.resultCount,
  });
  if (evidence === undefined) return undefined;

  if (!evidence.typeArgumentsComplete) {
    diagnostics.push(
      irDiagnostic(
        'ir.command.moveCall.typeArgumentsCount',
        `MoveCall command ${commandIndex} typeArguments length must match signature typeParameterCount ${evidence.signature.typeParameterCount}.`,
        `$.commands[${commandIndex}].typeArguments`,
      ),
    );
  }

  if (evidence.resultCountMismatch) {
    diagnostics.push(
      irDiagnostic(
        'ir.command.moveCall.resultCountMismatch',
        `MoveCall command ${commandIndex} resultCount ${command.resultCount} does not match signature returns length ${evidence.resultArity}.`,
        `$.commands[${commandIndex}].resultCount`,
      ),
    );
  }

  if (command.arguments.length !== evidence.signature.parameters.length) {
    diagnostics.push(
      irDiagnostic(
        'ir.command.moveCall.argumentsLength',
        `MoveCall command ${commandIndex} arguments length must match signature parameters length ${evidence.signature.parameters.length}.`,
        `$.commands[${commandIndex}].arguments`,
      ),
    );
  }

  return {
    resultArity: evidence.resultArity,
    typeArgumentsComplete: evidence.typeArgumentsComplete,
    ...(evidence.typeArgumentsComplete
      ? { signatureForType: evidence.signature }
      : {}),
  };
}

function requireObjectIdArray(
  value: unknown,
  commandIndex: number,
  key: string,
  diagnostics: TransactionDiagnostic[],
): boolean {
  if (!isDenseArray(value)) {
    diagnostics.push(
      irDiagnostic(
        'ir.command.field',
        `Command ${commandIndex} requires Sui object ID array field ${key}.`,
        `$.commands[${commandIndex}].${key}`,
      ),
    );
    return false;
  }

  let valid = true;
  value.forEach((item, index) => {
    if (typeof item === 'string' && parseObjectId(item) === item) return;
    valid = false;
    diagnostics.push(
      irDiagnostic(
        'ir.command.objectId',
        `Command ${commandIndex} field ${key} item ${index} must be a normalized Sui object ID.`,
        `$.commands[${commandIndex}].${key}[${index}]`,
      ),
    );
  });

  return valid;
}

function requireBase64StringArray(
  value: unknown,
  commandIndex: number,
  key: string,
  diagnostics: TransactionDiagnostic[],
): boolean {
  if (!isDenseArray(value)) {
    diagnostics.push(
      irDiagnostic(
        'ir.command.field',
        `Command ${commandIndex} requires base64-decodable base64 string array field ${key}.`,
        `$.commands[${commandIndex}].${key}`,
      ),
    );
    return false;
  }

  let valid = true;
  value.forEach((item, index) => {
    if (typeof item === 'string' && parseBase64Bytes(item) === item) return;
    valid = false;
    diagnostics.push(
      irDiagnostic(
        'ir.command.base64Bytes',
        `Command ${commandIndex} field ${key} item ${index} must be base64-decodable base64 bytes.`,
        `$.commands[${commandIndex}].${key}[${index}]`,
      ),
    );
  });

  return valid;
}

function requireNonEmptyBase64StringArray(
  value: unknown,
  commandIndex: number,
  key: string,
  diagnostics: TransactionDiagnostic[],
): boolean {
  if (!requireBase64StringArray(value, commandIndex, key, diagnostics)) {
    return false;
  }
  if (!isDenseArray(value)) return false;
  if (value.length > 0) return true;

  diagnostics.push(
    irDiagnostic(
      'ir.command.emptyInput',
      `Command ${commandIndex} field ${key} must not be empty.`,
      `$.commands[${commandIndex}].${key}`,
    ),
  );
  return false;
}

function requireNullableMoveTypeTag(
  value: unknown,
  commandIndex: number,
  key: string,
  diagnostics: TransactionDiagnostic[],
): boolean {
  if (value === NULL_VALUE) return true;
  if (typeof value === 'string' && parseMoveTypeTag(value) === value) {
    return true;
  }

  diagnostics.push(
    irDiagnostic(
      'ir.command.moveTypeTag',
      `Command ${commandIndex} field ${key} must be a canonical Move type tag string or null.`,
      `$.commands[${commandIndex}].${key}`,
    ),
  );
  return false;
}

function requireArgArray(
  value: unknown,
  commandIndex: number,
  key: string,
  diagnostics: TransactionDiagnostic[],
): boolean {
  if (!isDenseArray(value)) {
    diagnostics.push(
      irDiagnostic(
        'ir.command.field',
        `Command ${commandIndex} requires argument array field ${key}.`,
        `$.commands[${commandIndex}].${key}`,
      ),
    );
    return false;
  }

  let valid = true;
  value.forEach((item, index) => {
    if (
      !validateArgRefShape(
        item,
        `$.commands[${commandIndex}].${key}[${index}]`,
        diagnostics,
      )
    ) {
      valid = false;
    }
  });
  return valid;
}

function requireNonEmptyArgArray(
  value: unknown,
  commandIndex: number,
  key: string,
  diagnostics: TransactionDiagnostic[],
): boolean {
  if (!requireArgArray(value, commandIndex, key, diagnostics)) return false;
  if (!isDenseArray(value)) return false;
  if (value.length > 0) return true;

  diagnostics.push(
    irDiagnostic(
      'ir.command.emptyInput',
      `Command ${commandIndex} field ${key} must not be empty.`,
      `$.commands[${commandIndex}].${key}`,
    ),
  );
  return false;
}

function requireArgRef(
  value: unknown,
  commandIndex: number,
  key: string,
  diagnostics: TransactionDiagnostic[],
): boolean {
  if (
    validateArgRefShape(
      value,
      `$.commands[${commandIndex}].${key}`,
      diagnostics,
    )
  ) {
    return true;
  }

  diagnostics.push(
    irDiagnostic(
      'ir.command.field',
      `Command ${commandIndex} requires argument field ${key}.`,
      `$.commands[${commandIndex}].${key}`,
    ),
  );
  return false;
}

function validateMakeMoveVecElementTypes(
  ir: TransactionIR,
  command: IRCommand,
  commandIndex: number,
  diagnostics: TransactionDiagnostic[],
  moveCallEvidenceByCommandIndex: MoveCallEvidenceStateByCommandIndex,
): void {
  if (command.kind !== 'MakeMoveVec' || typeof command.type !== 'string')
    return;

  const expectedType = toPTBTypeFromConcreteTypeArgument(command.type);
  if (expectedType === undefined) return;

  command.elements.forEach((arg, index) => {
    if (shouldSkipPrimitiveInputMakeMoveVecCheck(command, arg)) return;

    const actualType = makeMoveVecElementType(
      ir,
      commandIndex,
      arg,
      moveCallEvidenceByCommandIndex,
    );
    if (actualType === undefined) return;
    if (!ptbTypesAreComparable(actualType, expectedType)) return;
    if (ptbTypesExactlyMatch(actualType, expectedType)) return;

    diagnostics.push(
      irDiagnostic(
        'ir.command.makeMoveVec.elementTypeMismatch',
        `Command ${commandIndex} MakeMoveVec element ${index} type ${describePTBType(actualType)} must match explicit element type ${describePTBType(expectedType)}.`,
        `$.commands[${commandIndex}].elements[${index}]`,
      ),
    );
  });
}

function shouldSkipPrimitiveInputMakeMoveVecCheck(
  command: Extract<IRCommand, { kind: 'MakeMoveVec' }>,
  arg: IRArgRef,
): boolean {
  const expectation =
    typeof command.type === 'string' || command.type === NULL_VALUE
      ? commandInputSlotExpectation({
          commandKind: 'MakeMoveVec',
          field: 'element',
          index: 0,
          type: command.type,
        })
      : undefined;
  return (
    arg.kind === 'Input' &&
    expectation?.inputKind === 'pure' &&
    expectation.ptbType !== undefined
  );
}

function makeMoveVecElementType(
  ir: TransactionIR,
  currentCommandIndex: number,
  arg: IRArgRef,
  moveCallEvidenceByCommandIndex: MoveCallEvidenceStateByCommandIndex,
): PTBType | undefined {
  switch (arg.kind) {
    case 'GasCoin':
      return undefined;
    case 'Input': {
      if (!isU16Index(arg.index) || arg.index >= ir.inputs.length) {
        return undefined;
      }
      const input = ir.inputs[arg.index];
      if (
        (input?.kind === 'Pure' || input?.kind === 'Object') &&
        input.type !== undefined &&
        isPTBType(input.type)
      ) {
        return input.type;
      }
      return undefined;
    }
    case 'Result':
      return moveCallResultType(
        ir,
        currentCommandIndex,
        arg.commandIndex,
        undefined,
        moveCallEvidenceByCommandIndex,
      );
    case 'NestedResult':
      return moveCallResultType(
        ir,
        currentCommandIndex,
        arg.commandIndex,
        arg.resultIndex,
        moveCallEvidenceByCommandIndex,
      );
  }
}

function moveCallResultType(
  ir: TransactionIR,
  currentCommandIndex: number,
  targetCommandIndex: number,
  nestedResultIndex: number | undefined,
  moveCallEvidenceByCommandIndex: MoveCallEvidenceStateByCommandIndex,
): PTBType | undefined {
  if (
    !isU16Index(targetCommandIndex) ||
    targetCommandIndex >= ir.commands.length ||
    targetCommandIndex >= currentCommandIndex
  ) {
    return undefined;
  }

  const command = ir.commands[targetCommandIndex];
  if (command?.kind !== 'MoveCall') return undefined;

  const signature =
    moveCallEvidenceByCommandIndex.get(targetCommandIndex)?.signatureForType;
  if (signature === undefined) return undefined;

  if (nestedResultIndex === undefined) {
    if (signature.returns.length !== 1) return undefined;
    return toPTBTypeFromOpenSignature(
      signature.returns[0]!,
      command.typeArguments,
    );
  }

  if (
    !isU16Index(nestedResultIndex) ||
    nestedResultIndex >= signature.returns.length
  ) {
    return undefined;
  }
  return toPTBTypeFromOpenSignature(
    signature.returns[nestedResultIndex]!,
    command.typeArguments,
  );
}

function validateArgRefShape(
  value: unknown,
  path: string,
  diagnostics: TransactionDiagnostic[],
): value is IRArgRef {
  if (!isRecord(value) || typeof value.kind !== 'string') {
    diagnostics.push(
      irDiagnostic(
        'ir.arg',
        'TransactionIR argument reference must be an object with a kind.',
        path,
      ),
    );
    return false;
  }

  switch (value.kind) {
    case 'GasCoin':
    case 'Input':
    case 'Result':
    case 'NestedResult':
      validateUnknownFields(
        value,
        IR_ARG_REF_KEYS_BY_KIND[value.kind],
        'ir.arg.unknownField',
        path,
        'TransactionIR argument reference',
        diagnostics,
      );
      break;
    default:
      diagnostics.push(
        irDiagnostic(
          'ir.arg.kind',
          `Unsupported TransactionIR argument reference kind ${value.kind}.`,
          `${path}.kind`,
        ),
      );
      return false;
  }

  if (!isIRArgRef(value)) {
    diagnostics.push(
      irDiagnostic(
        'ir.arg',
        'TransactionIR argument reference has an invalid shape.',
        path,
      ),
    );
    return false;
  }

  if (
    value.kind === 'Input' &&
    value.type !== undefined &&
    !isRawInputArgumentType(value.type)
  ) {
    diagnostics.push(
      irDiagnostic(
        'ir.arg.type',
        'TransactionIR Input argument type metadata must be pure, object, or withdrawal when present.',
        `${path}.type`,
      ),
    );
    return false;
  }

  return true;
}

function validateArgRef(
  ir: TransactionIR,
  currentCommandIndex: number,
  arg: IRArgRef,
  path: string,
  diagnostics: TransactionDiagnostic[],
  moveCallEvidenceByCommandIndex: MoveCallEvidenceStateByCommandIndex,
  expectedInputType?: PTBInputArgumentKind,
  expectedPTBType?: PTBType,
  requireKnownResultArity = false,
) {
  switch (arg.kind) {
    case 'GasCoin':
      return;
    case 'Input':
      if (!isU16Index(arg.index) || arg.index >= ir.inputs.length) {
        diagnostics.push(
          irDiagnostic(
            'ir.arg.input',
            `Input reference ${arg.index} must be a u16 index within the input list.`,
            path,
          ),
        );
        return;
      }

      if (arg.type !== undefined) {
        const actual = rawArgumentTypeForIRInput(ir.inputs[arg.index]);
        if (actual === undefined || arg.type !== actual) {
          diagnostics.push(
            irDiagnostic(
              'ir.arg.typeMismatch',
              `Input reference ${arg.index} type metadata ${arg.type} does not match the referenced ${ir.inputs[arg.index]?.kind ?? 'unknown'} input.`,
              `${path}.type`,
            ),
          );
        }
      }
      if (expectedInputType !== undefined) {
        const actual = rawArgumentTypeForIRInput(ir.inputs[arg.index]);
        if (actual === undefined || actual !== expectedInputType) {
          diagnostics.push(
            irDiagnostic(
              'ir.arg.semanticType',
              `Input reference ${arg.index} must refer to a ${expectedInputType} input for this command argument.`,
              path,
            ),
          );
        }
      }
      if (expectedPTBType !== undefined) {
        const input = ir.inputs[arg.index];
        if (input?.kind === 'Pure' && input.type !== undefined) {
          const isUntypedRawByteHint =
            input.bytes !== undefined && input.type.kind === 'unknown';
          if (
            !isUntypedRawByteHint &&
            !ptbTypeSatisfiesExpectation(input.type, expectedPTBType)
          ) {
            diagnostics.push(
              irDiagnostic(
                'ir.arg.pureType',
                `Input reference ${arg.index} must use ${describePTBType(expectedPTBType)} for this command argument.`,
                path,
              ),
            );
          }
        }
      }
      return;
    case 'Result':
      validateResultRef(
        ir,
        currentCommandIndex,
        arg.commandIndex,
        undefined,
        path,
        diagnostics,
        moveCallEvidenceByCommandIndex,
        requireKnownResultArity,
      );
      return;
    case 'NestedResult':
      validateResultRef(
        ir,
        currentCommandIndex,
        arg.commandIndex,
        arg.resultIndex,
        path,
        diagnostics,
        moveCallEvidenceByCommandIndex,
        requireKnownResultArity,
      );
      return;
  }
}

function validateResultRef(
  ir: TransactionIR,
  currentCommandIndex: number,
  targetCommandIndex: unknown,
  nestedResultIndex: unknown,
  path: string,
  diagnostics: TransactionDiagnostic[],
  moveCallEvidenceByCommandIndex: MoveCallEvidenceStateByCommandIndex,
  requireKnownResultArity: boolean,
) {
  if (
    !isU16Index(targetCommandIndex) ||
    targetCommandIndex >= ir.commands.length
  ) {
    diagnostics.push(
      irDiagnostic(
        'ir.arg.result',
        `Result reference ${targetCommandIndex} must be a u16 index within the command list.`,
        path,
      ),
    );
    return;
  }

  if (targetCommandIndex >= currentCommandIndex) {
    diagnostics.push(
      irDiagnostic(
        'ir.arg.futureResult',
        `Result reference ${targetCommandIndex} is not available before command ${currentCommandIndex}.`,
        path,
      ),
    );
    return;
  }

  const normalizedNestedResultIndex =
    nestedResultIndex === undefined
      ? undefined
      : isU16Index(nestedResultIndex)
        ? nestedResultIndex
        : undefined;

  if (
    nestedResultIndex !== undefined &&
    normalizedNestedResultIndex === undefined
  ) {
    diagnostics.push(
      irDiagnostic(
        'ir.arg.nestedResult',
        `Nested result ${String(nestedResultIndex)} must be a u16 index.`,
        path,
      ),
    );
    return;
  }

  const command = ir.commands[targetCommandIndex];
  const resultCount =
    moveCallEvidenceByCommandIndex.get(targetCommandIndex)?.resultArity ??
    command.resultCount;

  if (typeof resultCount !== 'number') {
    if (!requireKnownResultArity) return;
    diagnostics.push(
      irDiagnostic(
        'ir.arg.resultArity',
        `Result reference ${targetCommandIndex} requires known command result arity; provide resultCount or Move signature evidence.`,
        path,
      ),
    );
    return;
  }

  if (
    !isNonNegativeSafeInteger(resultCount) ||
    resultCount > MAX_RESULT_COUNT
  ) {
    diagnostics.push(
      irDiagnostic(
        'ir.command.resultCount',
        `Command ${targetCommandIndex} resultCount must be a non-negative safe integer no greater than ${MAX_RESULT_COUNT}.`,
        `$.commands[${targetCommandIndex}].resultCount`,
      ),
    );
    return;
  }

  if (resultCount <= 0) {
    diagnostics.push(
      irDiagnostic(
        'ir.arg.noResult',
        `Command ${targetCommandIndex} does not produce a usable result.`,
        path,
      ),
    );
    return;
  }

  if (normalizedNestedResultIndex === undefined && resultCount !== 1) {
    diagnostics.push(
      irDiagnostic(
        'ir.arg.resultArity',
        `Result reference ${targetCommandIndex} requires a command with exactly one result; use NestedResult for ${resultCount} results.`,
        path,
      ),
    );
    return;
  }

  if (
    normalizedNestedResultIndex !== undefined &&
    normalizedNestedResultIndex >= resultCount
  ) {
    diagnostics.push(
      irDiagnostic(
        'ir.arg.nestedResult',
        `Nested result ${normalizedNestedResultIndex} must be within command ${targetCommandIndex} results.`,
        path,
      ),
    );
  }
}

function validateCommandResultCount(
  command: IRCommand,
  commandIndex: number,
  diagnostics: TransactionDiagnostic[],
): void {
  const commandKind: string = command.kind;
  const resultCount = command.resultCount;
  if (resultCount === undefined) {
    if (command.kind === 'MoveCall') return;

    diagnostics.push(
      irDiagnostic(
        'ir.command.resultCount',
        `Command ${commandIndex} resultCount is required for ${commandKind}.`,
        `$.commands[${commandIndex}].resultCount`,
      ),
    );
    return;
  }

  if (
    !isNonNegativeSafeInteger(resultCount) ||
    resultCount > MAX_RESULT_COUNT
  ) {
    diagnostics.push(
      irDiagnostic(
        'ir.command.resultCount',
        `Command ${commandIndex} resultCount must be a non-negative safe integer no greater than ${MAX_RESULT_COUNT}.`,
        `$.commands[${commandIndex}].resultCount`,
      ),
    );
    return;
  }

  const expectedResultCount = requiredResultCount(command);
  if (
    expectedResultCount === undefined ||
    resultCount === expectedResultCount
  ) {
    return;
  }

  diagnostics.push(
    irDiagnostic(
      'ir.command.resultCount',
      `Command ${commandIndex} resultCount must be ${expectedResultCount} for ${command.kind}.`,
      `$.commands[${commandIndex}].resultCount`,
    ),
  );
}

function requiredResultCount(command: IRCommand): number | undefined {
  switch (command.kind) {
    case 'MoveCall':
      return undefined;
    case 'SplitCoins':
      return command.amounts.length;
    case 'TransferObjects':
    case 'MergeCoins':
    case 'Unsupported':
      return 0;
    case 'Publish':
    case 'MakeMoveVec':
    case 'Upgrade':
      return 1;
  }
}

function uniqueDiagnostics(
  diagnostics: readonly TransactionDiagnostic[],
): TransactionDiagnostic[] {
  const seen = new Set<string>();
  const unique: TransactionDiagnostic[] = [];

  diagnostics.forEach((diagnostic) => {
    const key = [
      diagnostic.code,
      diagnostic.category,
      diagnostic.path ?? '',
      diagnostic.message,
      isGraphDiagnostic(diagnostic)
        ? `${diagnostic.blocks.document}:${diagnostic.blocks.execution}`
        : '',
    ].join('\u0000');
    if (seen.has(key)) return;
    seen.add(key);
    unique.push(diagnostic);
  });

  return unique;
}

function validateIRInputUnknownFields(
  value: Record<string, unknown>,
  kind: IRInput['kind'],
  path: string,
  diagnostics: TransactionDiagnostic[],
): void {
  validateUnknownFields(
    value,
    IR_INPUT_KEYS_BY_KIND[kind],
    'ir.input.unknownField',
    path,
    'TransactionIR input',
    diagnostics,
  );
}

function validateIRCommandUnknownFields(
  value: Record<string, unknown>,
  kind: IRCommand['kind'],
  commandIndex: number,
  diagnostics: TransactionDiagnostic[],
): void {
  validateUnknownFields(
    value,
    IR_COMMAND_KEYS_BY_KIND[kind],
    'ir.command.unknownField',
    `$.commands[${commandIndex}]`,
    'TransactionIR command',
    diagnostics,
  );
}

function validateUnknownFields(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  code: string,
  path: string,
  label: string,
  diagnostics: TransactionDiagnostic[],
): void {
  Object.keys(value)
    .filter((key) => !allowedKeys.includes(key))
    .forEach((key) => {
      diagnostics.push(
        irDiagnostic(
          code,
          `${label} does not support field ${key}.`,
          `${path}.${key}`,
        ),
      );
    });
}
