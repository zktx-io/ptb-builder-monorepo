// src/ptb/registry.ts
// -----------------------------------------------------------------------------
// Builder-side registry for command IO port rendering.
// The model package owns canonical handle conventions; this file uses its
// exported handle helpers and adds UI-only count/materialization policy.
// Flow ports are defined by PORTS.commandBase() and merged here.
// Policy notes:
// - No "expanded" toggle flag; multiplicity is controlled solely by count steppers.
// - MakeMoveVec: runtime.type is the persisted model value. UI count controls
//   only the number of element handles.
// - MoveCall signatures materialize only value arguments and return values as
//   ports. Resolved package, module, function, and type arguments live in
//   params.runtime.
// -----------------------------------------------------------------------------

import {
  indexedInputHandle,
  indexedInputHandleIndex,
  inputHandle,
  isNestedResultHandle,
  nestedResultHandle,
  RESULT_HANDLE_ID,
} from '@zktx.io/ptb-model';

import { M, O, S, V } from './graph/typeHelpers';
import {
  type CommandKind,
  type CommandRuntimeParams,
  type CommandUIParams,
  type Port,
  type PTBType,
  serializePTBType,
} from './graph/types';
import { toPTBTypeFromConcreteTypeArgument } from './move/toPTBType';
import { ioIn, ioOut, PORTS } from './portTemplates';

// -----------------------------------------------------------------------------
// Spec interface
// -----------------------------------------------------------------------------

export interface CommandSpec {
  /** Default human-friendly label for the node. */
  label: string;
  /** Build IO ports based on model runtime params and UI-only counts. */
  buildIO(ui?: CommandUIParams, runtime?: CommandRuntimeParams): Port[];
}

type CountCommandKind =
  | 'splitCoins'
  | 'mergeCoins'
  | 'transferObjects'
  | 'makeMoveVec';
type CountKey = 'amountsCount' | 'sourcesCount' | 'objectsCount' | 'elemsCount';

const COUNT_KEYS: Record<CountCommandKind, CountKey> = {
  splitCoins: 'amountsCount',
  mergeCoins: 'sourcesCount',
  transferObjects: 'objectsCount',
  makeMoveVec: 'elemsCount',
};

// -----------------------------------------------------------------------------
// Core commands
// -----------------------------------------------------------------------------

/** SplitCoins:
 *  inputs :
 *    - in_coin: object (single)
 *    - in_amount_0..N-1: u64 (expanded scalar, count = amountsCount, default 2)
 *  outputs:
 *    - out_result when count is 1; out_0..N-1 when count is greater than 1
 */
const splitCoinsSpec: CommandSpec = {
  label: 'SplitCoins',
  buildIO(ui) {
    const count = Math.max(1, Math.floor(ui?.amountsCount ?? 2));
    const ports: Port[] = [];

    const coinHandle = inputHandle('coin');
    ports.push(ioIn(coinHandle, { dataType: O(), label: coinHandle }));

    for (let i = 0; i < count; i++) {
      const id = indexedInputHandle('amount', i);
      ports.push(ioIn(id, { dataType: M('u64'), label: id }));
    }
    for (let i = 0; i < count; i++) {
      const id = count === 1 ? RESULT_HANDLE_ID : nestedResultHandle(i);
      ports.push(ioOut(id, { dataType: O(), label: id }));
    }
    return ports;
  },
};

/** MergeCoins:
 *  inputs :
 *    - in_destination: object (single)
 *    - in_source_0..N-1: object (expanded, count = sourcesCount, default 2)
 *  outputs: none
 */
const mergeCoinsSpec: CommandSpec = {
  label: 'MergeCoins',
  buildIO(ui) {
    const count = Math.max(1, Math.floor(ui?.sourcesCount ?? 2));
    const ports: Port[] = [];

    ports.push(
      ioIn(inputHandle('destination'), {
        dataType: O(),
        label: inputHandle('destination'),
      }),
    );
    for (let i = 0; i < count; i++) {
      const id = indexedInputHandle('source', i);
      ports.push(ioIn(id, { dataType: O(), label: id }));
    }
    return ports;
  },
};

/** TransferObjects:
 *  inputs :
 *    - in_recipient: address (single)
 *    - in_object_0..N-1: object (expanded, count = objectsCount, default 2)
 *  outputs: none
 */
const transferObjectsSpec: CommandSpec = {
  label: 'TransferObjects',
  buildIO(ui) {
    const count = Math.max(1, Math.floor(ui?.objectsCount ?? 2));
    const ports: Port[] = [];

    // Recipient first (UX)
    const recipientHandle = inputHandle('recipient');
    ports.push(
      ioIn(recipientHandle, { dataType: S('address'), label: recipientHandle }),
    );
    for (let i = 0; i < count; i++) {
      const id = indexedInputHandle('object', i);
      ports.push(ioIn(id, { dataType: O(), label: id }));
    }
    return ports;
  },
};

/** MakeMoveVec:
 *  inputs : in_elem_0..N-1 (T, expanded; T = runtime.type or unknown)
 *  outputs: out_result (vector<T>, single)
 */
const makeMoveVecSpec: CommandSpec = {
  label: 'MakeMoveVec',
  buildIO(ui, runtime) {
    const count = normalizeCount(
      ui?.elemsCount,
      countMinOf('makeMoveVec', runtime) ?? 1,
      2,
    );
    const runtimeType =
      typeof runtime?.type === 'string' ? runtime.type : undefined;
    const elemT: PTBType = runtimeType
      ? (toPTBTypeFromConcreteTypeArgument(runtimeType) ?? {
          kind: 'unknown',
          debugInfo: runtimeType,
        })
      : O();
    const ports: Port[] = [];
    for (let i = 0; i < count; i++) {
      const id = indexedInputHandle('elem', i);
      ports.push(
        ioIn(id, {
          dataType: elemT,
          typeStr: runtimeType,
          label: id,
        }),
      );
    }
    ports.push(
      ioOut(RESULT_HANDLE_ID, {
        dataType: V(elemT),
        typeStr: runtimeType ? `vector<${runtimeType}>` : undefined,
        label: RESULT_HANDLE_ID,
      }),
    );
    return ports;
  },
};

const moveCallSpec: CommandSpec = {
  label: 'MoveCall',
  buildIO() {
    return [];
  },
};

export function buildMoveCallPorts(
  inputs: readonly PTBType[],
  outputs: readonly PTBType[],
): Port[] {
  const ports: Port[] = [];
  inputs.forEach((t, index) => {
    const id = indexedInputHandle('arg', index);
    ports.push({
      id,
      role: 'io',
      direction: 'in',
      dataType: t,
      typeStr: serializePTBType(t),
      label: `arg${index}`,
    });
  });
  outputs.forEach((t, index) => {
    const id =
      outputs.length === 1 ? RESULT_HANDLE_ID : nestedResultHandle(index);
    ports.push({
      id,
      role: 'io',
      direction: 'out',
      dataType: t,
      typeStr: serializePTBType(t),
      label: id,
    });
  });
  return ports;
}

function isMoveCallValuePort(port: Port): boolean {
  if (port.role !== 'io') return false;
  if (port.direction === 'in')
    return indexedInputHandleIndex(port.id, 'arg') !== undefined;
  if (port.direction === 'out')
    return port.id === RESULT_HANDLE_ID || isNestedResultHandle(port.id);
  return false;
}

// -----------------------------------------------------------------------------
// Runtime-param commands.
// -----------------------------------------------------------------------------

/** Publish runtime params hold modules/dependencies. The single result uses the model handle. */
const publishSpec: CommandSpec = {
  label: 'Publish',
  buildIO() {
    return [ioOut(RESULT_HANDLE_ID, { label: RESULT_HANDLE_ID })];
  },
};

/** Upgrade runtime params hold package/modules/dependencies; only the ticket is an IO arg. */
const upgradeSpec: CommandSpec = {
  label: 'Upgrade',
  buildIO() {
    const upgradeCapHandle = inputHandle('upgradeCap');
    return [
      ioIn(upgradeCapHandle, {
        dataType: O('0x2::package::UpgradeCap'),
        label: 'upgradeCap',
      }),
      ioOut(RESULT_HANDLE_ID, { label: RESULT_HANDLE_ID }),
    ];
  },
};

const unsupportedSpec: CommandSpec = {
  label: 'Unsupported',
  buildIO() {
    return [];
  },
};

// -----------------------------------------------------------------------------
// Registry
// -----------------------------------------------------------------------------

const REGISTRY: Record<CommandKind, CommandSpec> = {
  splitCoins: splitCoinsSpec,
  mergeCoins: mergeCoinsSpec,
  transferObjects: transferObjectsSpec,
  moveCall: moveCallSpec,
  makeMoveVec: makeMoveVecSpec,
  publish: publishSpec,
  upgrade: upgradeSpec,
  unsupported: unsupportedSpec,
};

/** Returns the default label for a command. */
export function defaultLabelOf(kind: CommandKind): string {
  return REGISTRY[kind]?.label ?? kind;
}

/** Build complete port list for a command (flow + IO). */
export function buildCommandPorts(
  kind: CommandKind,
  ui?: CommandUIParams,
  runtime?: CommandRuntimeParams,
  existingPorts?: readonly Port[],
): Port[] {
  const flow = PORTS.commandBase();
  if (kind === 'moveCall' && existingPorts?.length) {
    const io = existingPorts.filter(isMoveCallValuePort);
    return [...flow, ...io.map((port) => ({ ...port }))];
  }
  const io = REGISTRY[kind]?.buildIO(ui, runtime) ?? [];
  return [...flow, ...io];
}

/** Command → UI params count key (for BaseCommand stepper) */
export function countKeyOf(cmdKind?: string): string | undefined {
  return isCountCommandKind(cmdKind) ? COUNT_KEYS[cmdKind] : undefined;
}

/** Command → Default count (must match registry defaults) */
export function countDefaultOf(cmdKind?: string): number | undefined {
  return isCountCommandKind(cmdKind) ? 2 : undefined;
}

export function countMinOf(
  cmdKind?: string,
  runtime?: CommandRuntimeParams,
): number | undefined {
  if (!isCountCommandKind(cmdKind)) return undefined;
  return cmdKind === 'makeMoveVec' && typeof runtime?.type === 'string' ? 0 : 1;
}

export function sanitizeCommandUIParams(
  cmdKind: CommandKind,
  ui: Record<string, unknown> | CommandUIParams | undefined,
  runtime?: CommandRuntimeParams,
): CommandUIParams | undefined {
  const key = countKeyOf(cmdKind) as CountKey | undefined;
  if (!key) return undefined;
  const count = normalizeOptionalCount(
    ui?.[key],
    countMinOf(cmdKind, runtime) ?? 1,
  );
  return count === undefined
    ? undefined
    : ({ [key]: count } as CommandUIParams);
}

export function patchCommandUIParams(
  cmdKind: CommandKind,
  current: CommandUIParams | undefined,
  patch: Record<string, unknown>,
  runtime?: CommandRuntimeParams,
): CommandUIParams | undefined {
  const key = countKeyOf(cmdKind) as CountKey | undefined;
  if (!key) return undefined;
  if (!Object.prototype.hasOwnProperty.call(patch, key)) {
    return sanitizeCommandUIParams(cmdKind, current, runtime);
  }
  if (patch[key] === undefined) return undefined;
  const count = normalizeOptionalCount(
    patch[key],
    countMinOf(cmdKind, runtime) ?? 1,
  );
  return count === undefined
    ? undefined
    : ({ [key]: count } as CommandUIParams);
}

function isCountCommandKind(value: unknown): value is CountCommandKind {
  return (
    value === 'splitCoins' ||
    value === 'mergeCoins' ||
    value === 'transferObjects' ||
    value === 'makeMoveVec'
  );
}

function normalizeOptionalCount(
  value: unknown,
  min: number,
): number | undefined {
  if (value === undefined) return undefined;
  return normalizeCount(value, min, min);
}

function normalizeCount(value: unknown, min: number, fallback: number): number {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : fallback;
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.floor(numeric));
}
