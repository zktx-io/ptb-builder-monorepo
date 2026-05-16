// src/ptb/registry.ts

// src/ptb/registry.ts
// -----------------------------------------------------------------------------
// Single source of truth for command IO port specifications (IO only).
// Flow ports are defined by PORTS.commandBase() and merged here.
// Policy notes:
// - No "expanded" toggle flag; multiplicity is controlled solely by count steppers.
// - MakeMoveVec: runtime.type is the persisted model value. UI count controls
//   only the number of element handles.
// - MoveCall signatures materialize only value arguments and return values as
//   ports. Resolved package, module, function, and type arguments live in
//   params.runtime.
// -----------------------------------------------------------------------------

import { M, O, S, V } from './graph/typeHelpers';
import {
  type CommandKind,
  type CommandRuntimeParams,
  type CommandUIParams,
  type Port,
  type PTBType,
  serializePTBType,
} from './graph/types';
import { ioIn, ioOut, PORTS } from './portTemplates';

// Helpers for graph-only commands
const VEC_VEC_U8: PTBType = V(V(M('u8')));
const VEC_ADDR: PTBType = V(S('address'));

// -----------------------------------------------------------------------------
// Spec interface
// -----------------------------------------------------------------------------

export interface CommandSpec {
  /** Default human-friendly label for the node. */
  label: string;
  /** Build IO ports based on model runtime params and UI-only counts. */
  buildIO(ui?: CommandUIParams, runtime?: CommandRuntimeParams): Port[];
  /** True if this command is graph-only (for decode/visualization). */
  graphOnly?: boolean;
}

// -----------------------------------------------------------------------------
// Core commands
// -----------------------------------------------------------------------------

/** SplitCoins:
 *  inputs :
 *    - in_coin: object (single)
 *    - in_amount_0..N-1: u64 (expanded scalar, count = amountsCount, default 2)
 *  outputs:
 *    - out_coin_0..N-1: object (expanded, count = amountsCount)
 */
const splitCoinsSpec: CommandSpec = {
  label: 'SplitCoins',
  buildIO(ui) {
    const count = Math.max(1, Math.floor(ui?.amountsCount ?? 2));
    const ports: Port[] = [];

    ports.push(ioIn('in_coin', { dataType: O(), label: 'in_coin' }));

    for (let i = 0; i < count; i++) {
      ports.push(
        ioIn(`in_amount_${i}`, { dataType: M('u64'), label: `in_amount_${i}` }),
      );
    }
    for (let i = 0; i < count; i++) {
      ports.push(
        ioOut(`out_coin_${i}`, { dataType: O(), label: `out_coin_${i}` }),
      );
    }
    return ports;
  },
};

/** MergeCoins:
 *  inputs :
 *    - in_dest: object (single)
 *    - in_source_0..N-1: object (expanded, count = sourcesCount, default 2)
 *  outputs: none
 */
const mergeCoinsSpec: CommandSpec = {
  label: 'MergeCoins',
  buildIO(ui) {
    const count = Math.max(1, Math.floor(ui?.sourcesCount ?? 2));
    const ports: Port[] = [];

    ports.push(ioIn('in_dest', { dataType: O(), label: 'in_dest' }));
    for (let i = 0; i < count; i++) {
      ports.push(
        ioIn(`in_source_${i}`, { dataType: O(), label: `in_source_${i}` }),
      );
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
    ports.push(
      ioIn('in_recipient', { dataType: S('address'), label: 'in_recipient' }),
    );
    for (let i = 0; i < count; i++) {
      ports.push(
        ioIn(`in_object_${i}`, { dataType: O(), label: `in_object_${i}` }),
      );
    }
    return ports;
  },
};

/** MakeMoveVec:
 *  inputs : in_elem_0..N-1 (T, expanded; T = runtime.type or unknown)
 *  outputs: out_vec (vector<T>, single)
 */
const makeMoveVecSpec: CommandSpec = {
  label: 'MakeMoveVec',
  buildIO(ui, runtime) {
    const count = Math.max(1, Math.floor(ui?.elemsCount ?? 2));
    const runtimeType =
      typeof runtime?.type === 'string' ? runtime.type : undefined;
    const elemT: PTBType = runtimeType
      ? { kind: 'unknown', debugInfo: runtimeType }
      : O();
    const ports: Port[] = [];
    for (let i = 0; i < count; i++) {
      ports.push(
        ioIn(`in_elem_${i}`, {
          dataType: elemT,
          typeStr: runtimeType,
          label: `in_elem_${i}`,
        }),
      );
    }
    ports.push(
      ioOut('out_vec', {
        dataType: V(elemT),
        typeStr: runtimeType ? `vector<${runtimeType}>` : undefined,
        label: 'out_vec',
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
    ports.push({
      id: `in_arg_${index}`,
      role: 'io',
      direction: 'in',
      dataType: t,
      typeStr: serializePTBType(t),
      label: `arg${index}`,
    });
  });
  outputs.forEach((t, index) => {
    ports.push({
      id: `out_ret_${index}`,
      role: 'io',
      direction: 'out',
      dataType: t,
      typeStr: serializePTBType(t),
      label: `ret${index}`,
    });
  });
  return ports;
}

function isMoveCallValuePort(port: Port): boolean {
  if (port.role !== 'io') return false;
  if (port.direction === 'in') return /^in_arg_\d+$/.test(port.id);
  if (port.direction === 'out') return /^out_ret_\d+$/.test(port.id);
  return false;
}

// -----------------------------------------------------------------------------
// Graph-only commands (unchanged).
// -----------------------------------------------------------------------------

/** Publish (graph-only):
 *  Inputs:
 *    - in_modules: vector<vector<u8>>
 *    - in_deps:    vector<address>
 *  Outputs:
 *    - out_packageId: id
 *    - out_upgradeCap: object<0x2::package::UpgradeCap>
 */
const publishSpec: CommandSpec = {
  label: 'Publish',
  graphOnly: true,
  buildIO() {
    return [
      ioIn('in_modules', {
        dataType: VEC_VEC_U8,
        label: 'modules: vector<vector<u8>>',
      }),
      ioIn('in_deps', { dataType: VEC_ADDR, label: 'deps: vector<address>' }),
      ioOut('out_packageId', { dataType: S('id'), label: 'packageId' }),
      ioOut('out_upgradeCap', {
        dataType: O('0x2::package::UpgradeCap'),
        label: 'upgradeCap',
      }),
    ];
  },
};

/** Upgrade (graph-only):
 *  Inputs:
 *    - in_upgradeCap: object<0x2::package::UpgradeCap>
 *    - in_modules:    vector<vector<u8>>
 *    - in_deps:       vector<address>
 *    - in_policy:     u8
 *  Outputs:
 *    - out_packageId: id
 */
const upgradeSpec: CommandSpec = {
  label: 'Upgrade',
  graphOnly: true,
  buildIO() {
    return [
      ioIn('in_upgradeCap', {
        dataType: O('0x2::package::UpgradeCap'),
        label: 'upgradeCap',
      }),
      ioIn('in_modules', {
        dataType: VEC_VEC_U8,
        label: 'modules: vector<vector<u8>>',
      }),
      ioIn('in_deps', { dataType: VEC_ADDR, label: 'deps: vector<address>' }),
      ioIn('in_policy', { dataType: M('u8'), label: 'policy' }),
      ioOut('out_packageId', { dataType: S('id'), label: 'packageId' }),
    ];
  },
};

const unsupportedSpec: CommandSpec = {
  label: 'Unsupported',
  graphOnly: true,
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
  switch (cmdKind) {
    case 'splitCoins':
      return 'amountsCount';
    case 'mergeCoins':
      return 'sourcesCount';
    case 'transferObjects':
      return 'objectsCount';
    case 'makeMoveVec':
      return 'elemsCount';
    default:
      return undefined;
  }
}

/** Command → Default count (must match registry defaults) */
export function countDefaultOf(cmdKind?: string): number | undefined {
  switch (cmdKind) {
    case 'splitCoins':
      return 2;
    case 'mergeCoins':
      return 2;
    case 'transferObjects':
      return 2;
    case 'makeMoveVec':
      return 2;
    default:
      return undefined;
  }
}
