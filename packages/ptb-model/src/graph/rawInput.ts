import { errorDiagnostic } from '../ir/diagnostics.js';
import type { TransactionDiagnostic } from '../ir/diagnostics.js';
import type {
  RawCallArg,
  RawFundsWithdrawalArg,
  RawObjectArg,
} from '../raw/types.js';
import { parseBase64Bytes, parseJsonU64, parseObjectId } from '../raw/types.js';
import { isRecord } from '../utils.js';

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
      const object = normalizeGraphRawObject(
        value.object,
        `${path}.object`,
        diagnostics,
      );
      return object ? { kind: 'Object', object } : undefined;
    }
    case 'FundsWithdrawal': {
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
      const objectId = parseObjectId(value.objectId);
      const version = parseJsonU64(value.version);
      if (
        objectId !== undefined &&
        objectId === value.objectId &&
        version !== undefined &&
        version === value.version &&
        typeof value.digest === 'string'
      ) {
        return {
          kind: value.kind,
          objectId,
          version,
          digest: value.digest,
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
  const reservation = isRecord(value.reservation)
    ? value.reservation
    : undefined;
  const typeArg = isRecord(value.typeArg) ? value.typeArg : undefined;
  const withdrawFrom = isRecord(value.withdrawFrom)
    ? value.withdrawFrom
    : undefined;

  const amount = parseJsonU64(reservation?.amount);
  if (
    reservation?.kind !== 'MaxAmountU64' ||
    amount === undefined ||
    amount !== reservation.amount ||
    typeArg?.kind !== 'Balance' ||
    typeof typeArg.type !== 'string' ||
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
    typeArg: { kind: 'Balance', type: typeArg.type },
    withdrawFrom:
      withdrawFrom.kind === 'Sponsor'
        ? { kind: 'Sponsor' }
        : { kind: 'Sender' },
  };
}
