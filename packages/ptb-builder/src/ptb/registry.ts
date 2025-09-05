// src/ptb/registry.ts
// -----------------------------------------------------------------------------
// Single source of truth for command IO port specifications.
// Flow ports are NOT defined here (they come from PORTS.commandBase()).
// This file only defines IO ports per command according to the latest policy.
//
// Policy (core commands):
// - No “expanded” toggle. Only the count stepper per command controls multiplicity.
// - SplitCoins
//     inputs : in_coin (object, single), in_amount_0..N-1 (scalar u64, expanded)
//     outputs: out_coin_0..N-1 (object, expanded)
// - MergeCoins
//     inputs : in_dest (object, single), in_source_0..N-1 (object, expanded)
//     outputs: none
// - TransferObjects
//     inputs : in_object_0..N-1 (object, expanded), in_recipient (address, single)
//     outputs: none
// - MakeMoveVec
//     inputs : in_elem_0..N-1 (T, expanded)
//     outputs: out_vec (vector<T>, single)
//   * elemType comes from UI (defaults to object when absent).
//
// Notes:
// - MoveCall generics are SSOT via ui._fnTParams: string[] (length-only for port count).
// - MoveCall ins/outs come from normalized ABI (_fnIns/_fnOuts).
// -----------------------------------------------------------------------------

import { M, O, S, V } from './graph/typeHelpers';
import {
  type CommandKind,
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
  /** Build IO ports based on UI params (e.g., counts/types). */
  buildIO(ui?: CommandUIParams): Port[];
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
 *    - in_object_0..N-1: object (expanded, count = objectsCount, default 1)
 *  outputs: none
 */
const transferObjectsSpec: CommandSpec = {
  label: 'TransferObjects',
  buildIO(ui) {
    const count = Math.max(1, Math.floor(ui?.objectsCount ?? 1));
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

const makeMoveVecSpec: CommandSpec = {
  label: 'MakeMoveVec',
  buildIO(ui) {
    const count = Math.max(1, Math.floor(ui?.elemsCount ?? 2));
    const elemT: PTBType = ui?.elemType ?? O();
    const ports: Port[] = [];
    for (let i = 0; i < count; i++) {
      ports.push(
        ioIn(`in_elem_${i}`, { dataType: elemT, label: `in_elem_${i}` }),
      );
    }
    ports.push(ioOut('out_vec', { dataType: V(elemT), label: 'out_vec' }));
    return ports;
  },
};

/** MoveCall (ABI-driven):
 * - Generics: SSOT via ui._fnTParams: string[] (we only need length to make handles).
 * - Inputs/Outputs: from ui._fnIns / ui._fnOuts (PTBType[]), normalized from ABI.
 */
const moveCallSpec: CommandSpec = {
  label: 'MoveCall',
  buildIO(ui) {
    const ports: Port[] = [];

    // 1) Type-argument inputs (T0..Tn-1) as scalar<string>
    const tparams: string[] = Array.isArray((ui as any)?._fnTParams)
      ? ((ui as any)._fnTParams as string[])
      : [];
    const tcount = tparams.length;

    for (let i = 0; i < tcount; i++) {
      ports.push(
        ioIn(`in_targ_${i}`, { dataType: S('string'), label: `T${i}` }),
      );
    }

    // 2) Normal inputs (arg0..)
    const ins: PTBType[] = Array.isArray((ui as any)?._fnIns)
      ? (ui as any)._fnIns
      : [];
    for (let i = 0; i < ins.length; i++) {
      const t = ins[i]!;
      ports.push({
        id: `in_arg_${i}`,
        role: 'io',
        direction: 'in',
        dataType: t,
        typeStr: serializePTBType ? serializePTBType(t) : undefined,
        label: `arg${i}`,
      });
    }

    // 3) Outputs (ret0..)
    const outs: PTBType[] = Array.isArray((ui as any)?._fnOuts)
      ? (ui as any)._fnOuts
      : [];
    for (let i = 0; i < outs.length; i++) {
      const t = outs[i]!;
      ports.push({
        id: `out_ret_${i}`,
        role: 'io',
        direction: 'out',
        dataType: t,
        typeStr: serializePTBType ? serializePTBType(t) : undefined,
        label: `ret${i}`,
      });
    }

    return ports;
  },
};

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
};

/** Returns the default label for a command. */
export function defaultLabelOf(kind: CommandKind): string {
  return REGISTRY[kind]?.label ?? kind;
}

/** True if the command is graph-only (decode/visualize only). */
export function isGraphOnly(kind: CommandKind): boolean {
  return !!REGISTRY[kind]?.graphOnly;
}

/** Build complete port list for a command (flow + IO). */
export function buildCommandPorts(
  kind: CommandKind,
  ui?: CommandUIParams,
): Port[] {
  const flow = PORTS.commandBase();
  const io = REGISTRY[kind]?.buildIO(ui) ?? [];
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
      return 1;
    case 'makeMoveVec':
      return 2;
    default:
      return undefined;
  }
}
