import { errorDiagnostic } from '../ir/diagnostics.js';
import type { TransactionDiagnostic } from '../ir/diagnostics.js';
import type {
  RawCallArg,
  RawFundsWithdrawalArg,
  RawObjectArg,
} from '../raw/types.js';
import {
  parseBase64Bytes,
  parseJsonU64,
  parseMoveTypeTag,
  parseObjectDigest,
  parseObjectId,
} from '../raw/types.js';
import { isRecord } from '../utils.js';

const RAW_INPUT_KEYS_BY_KIND = {
  Pure: ['kind', 'bytes'],
  Object: ['kind', 'object'],
  FundsWithdrawal: ['kind', 'value'],
} as const;
const RAW_OWNED_OBJECT_KEYS = [
  'kind',
  'objectId',
  'version',
  'digest',
] as const;
const RAW_SHARED_OBJECT_KEYS = [
  'kind',
  'objectId',
  'initialSharedVersion',
  'mutable',
] as const;
const RAW_FUNDS_WITHDRAWAL_KEYS = [
  'reservation',
  'typeArg',
  'withdrawFrom',
] as const;
const RAW_FUNDS_RESERVATION_KEYS = ['kind', 'amount'] as const;
const RAW_FUNDS_TYPE_ARG_KEYS = ['kind', 'type'] as const;
const RAW_FUNDS_WITHDRAW_FROM_KEYS = ['kind'] as const;

export function normalizeGraphRawInput(
  value: unknown,
  path: string,
  diagnostics: TransactionDiagnostic[],
): RawCallArg | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || typeof value.kind !== 'string') {
    diagnostics.push(
      errorDiagnostic(
        'graph.rawInput',
        'PTB graph rawInput must be a canonical raw input object.',
        path,
      ),
    );
    return undefined;
  }

  switch (value.kind) {
    case 'Pure': {
      if (
        !validateOnlyKeys(value, RAW_INPUT_KEYS_BY_KIND.Pure, path, diagnostics)
      ) {
        return undefined;
      }
      const bytes = parseBase64Bytes(value.bytes);
      if (bytes !== undefined && bytes === value.bytes) {
        return { kind: 'Pure', bytes };
      }
      diagnostics.push(
        errorDiagnostic(
          'graph.rawInput.pure',
          'PTB graph Pure rawInput bytes must be canonical base64.',
          `${path}.bytes`,
        ),
      );
      return undefined;
    }
    case 'Object': {
      if (
        !validateOnlyKeys(
          value,
          RAW_INPUT_KEYS_BY_KIND.Object,
          path,
          diagnostics,
        )
      ) {
        return undefined;
      }
      const object = normalizeGraphRawObject(
        value.object,
        `${path}.object`,
        diagnostics,
      );
      return object ? { kind: 'Object', object } : undefined;
    }
    case 'FundsWithdrawal': {
      if (
        !validateOnlyKeys(
          value,
          RAW_INPUT_KEYS_BY_KIND.FundsWithdrawal,
          path,
          diagnostics,
        )
      ) {
        return undefined;
      }
      const funds = normalizeGraphFundsWithdrawal(
        value.value,
        `${path}.value`,
        diagnostics,
      );
      return funds ? { kind: 'FundsWithdrawal', value: funds } : undefined;
    }
    default:
      diagnostics.push(
        errorDiagnostic(
          'graph.rawInput.kind',
          `Unsupported PTB graph rawInput kind ${value.kind}.`,
          `${path}.kind`,
        ),
      );
      return undefined;
  }
}

function normalizeGraphRawObject(
  value: unknown,
  path: string,
  diagnostics: TransactionDiagnostic[],
): RawObjectArg | undefined {
  if (!isRecord(value) || typeof value.kind !== 'string') {
    diagnostics.push(
      errorDiagnostic(
        'graph.rawInput.object',
        'PTB graph Object rawInput must contain a canonical raw object argument.',
        path,
      ),
    );
    return undefined;
  }

  switch (value.kind) {
    case 'ImmOrOwnedObject':
    case 'Receiving': {
      if (!validateOnlyKeys(value, RAW_OWNED_OBJECT_KEYS, path, diagnostics)) {
        return undefined;
      }
      const objectId = parseObjectId(value.objectId);
      const version = parseJsonU64(value.version);
      const digest = parseObjectDigest(value.digest);
      if (
        objectId !== undefined &&
        objectId === value.objectId &&
        version !== undefined &&
        version === value.version &&
        digest !== undefined &&
        digest === value.digest
      ) {
        return {
          kind: value.kind,
          objectId,
          version,
          digest,
        };
      }
      diagnostics.push(
        errorDiagnostic(
          'graph.rawInput.object',
          'PTB graph Object rawInput must contain a canonical raw object argument.',
          path,
        ),
      );
      return undefined;
    }
    case 'SharedObject': {
      if (!validateOnlyKeys(value, RAW_SHARED_OBJECT_KEYS, path, diagnostics)) {
        return undefined;
      }
      const objectId = parseObjectId(value.objectId);
      const initialSharedVersion = parseJsonU64(value.initialSharedVersion);
      if (
        objectId !== undefined &&
        objectId === value.objectId &&
        initialSharedVersion !== undefined &&
        initialSharedVersion === value.initialSharedVersion &&
        typeof value.mutable === 'boolean'
      ) {
        return {
          kind: 'SharedObject',
          objectId,
          initialSharedVersion,
          mutable: value.mutable,
        };
      }
      diagnostics.push(
        errorDiagnostic(
          'graph.rawInput.object',
          'PTB graph Object rawInput must contain a canonical raw object argument.',
          path,
        ),
      );
      return undefined;
    }
    default:
      diagnostics.push(
        errorDiagnostic(
          'graph.rawInput.objectKind',
          `Unsupported PTB graph raw object kind ${value.kind}.`,
          `${path}.kind`,
        ),
      );
      return undefined;
  }
}

function normalizeGraphFundsWithdrawal(
  value: unknown,
  path: string,
  diagnostics: TransactionDiagnostic[],
): RawFundsWithdrawalArg | undefined {
  if (!isRecord(value)) {
    diagnostics.push(
      errorDiagnostic(
        'graph.rawInput.fundsWithdrawal',
        'PTB graph FundsWithdrawal rawInput must contain a canonical funds withdrawal value.',
        path,
      ),
    );
    return undefined;
  }
  if (!validateOnlyKeys(value, RAW_FUNDS_WITHDRAWAL_KEYS, path, diagnostics)) {
    return undefined;
  }
  const reservation = isRecord(value.reservation)
    ? value.reservation
    : undefined;
  const typeArg = isRecord(value.typeArg) ? value.typeArg : undefined;
  const withdrawFrom = isRecord(value.withdrawFrom)
    ? value.withdrawFrom
    : undefined;

  const amount = parseJsonU64(reservation?.amount);
  const type = parseMoveTypeTag(typeArg?.type);
  if (
    !reservation ||
    !validateOnlyKeys(
      reservation,
      RAW_FUNDS_RESERVATION_KEYS,
      `${path}.reservation`,
      diagnostics,
    ) ||
    !typeArg ||
    !validateOnlyKeys(
      typeArg,
      RAW_FUNDS_TYPE_ARG_KEYS,
      `${path}.typeArg`,
      diagnostics,
    ) ||
    !withdrawFrom ||
    !validateOnlyKeys(
      withdrawFrom,
      RAW_FUNDS_WITHDRAW_FROM_KEYS,
      `${path}.withdrawFrom`,
      diagnostics,
    ) ||
    reservation?.kind !== 'MaxAmountU64' ||
    amount === undefined ||
    amount !== reservation.amount ||
    typeArg?.kind !== 'Balance' ||
    type === undefined ||
    type !== typeArg.type ||
    (withdrawFrom?.kind !== 'Sender' && withdrawFrom?.kind !== 'Sponsor')
  ) {
    diagnostics.push(
      errorDiagnostic(
        'graph.rawInput.fundsWithdrawal',
        'PTB graph FundsWithdrawal rawInput must contain a canonical funds withdrawal value.',
        path,
      ),
    );
    return undefined;
  }

  return {
    reservation: { kind: 'MaxAmountU64', amount },
    typeArg: { kind: 'Balance', type },
    withdrawFrom:
      withdrawFrom.kind === 'Sponsor'
        ? { kind: 'Sponsor' }
        : { kind: 'Sender' },
  };
}

function validateOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  path: string,
  diagnostics: TransactionDiagnostic[],
): boolean {
  const unknownKeys = Object.keys(value).filter(
    (key) => !allowedKeys.includes(key),
  );
  unknownKeys.forEach((key) => {
    diagnostics.push(
      errorDiagnostic(
        'graph.rawInput.unknownField',
        `PTB graph rawInput does not support field ${key}.`,
        `${path}.${key}`,
      ),
    );
  });
  return unknownKeys.length === 0;
}
