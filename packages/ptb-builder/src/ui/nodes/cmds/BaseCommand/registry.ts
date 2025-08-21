// src/ui/nodes/cmds/BaseCommand/registry.ts
import type {
  CommandKind,
  Port,
  PTBScalar,
  PTBType,
} from '../../../../ptb/graph/types';
import { ioIn, ioOut, PORTS } from '../../../../ptb/portTemplates';

/** Command spec shape */
type CmdSpec = {
  /** Human-readable label shown on the node */
  label: string;
  /** Ports materializer (SSOT for this command's IO) */
  ports: () => Port[];
};

/** ---- PTBType helpers (UI-level) ---- */
const S = (name: PTBScalar): PTBType => ({ kind: 'scalar', name });
const V = (elem: PTBType): PTBType => ({ kind: 'vector', elem });

/**
 * Object type (unified).
 * - `typeTag` is optional and can carry a full Move type string, e.g.
 *   "0x2::coin::Coin<0x2::sui::SUI>".
 * - If omitted, it represents a generic object.
 */
const O = (typeTag?: string): PTBType =>
  typeTag ? { kind: 'object', typeTag } : { kind: 'object' };

/** Registry: single source of truth for command IO */
const Registry: Record<CommandKind, CmdSpec> = {
  // SplitCoins: coin + numbers[] -> coins[]
  // (Use generic object for coin; plug real typeTag later if desired.)
  splitCoins: {
    label: 'SplitCoins',
    ports: () => [
      ...PORTS.commandBase(),
      ioIn('in_coin', O()), // e.g. O('0x2::coin::Coin<...>')
      ioIn('in_amounts', V(S('number'))),
      ioOut('out_coins', V(O())), // vector<object>
    ],
  },

  // MergeCoins: coin + coins[] -> coin
  mergeCoins: {
    label: 'MergeCoins',
    ports: () => [
      ...PORTS.commandBase(),
      ioIn('in_coin', O()),
      ioIn('in_list', V(O())),
      ioOut('out_coin', O()),
    ],
  },

  // TransferObjects: objects[] + address -> ()
  transferObjects: {
    label: 'TransferObjects',
    ports: () => [
      ...PORTS.commandBase(),
      ioIn('in_objects', V(O())),
      ioIn('in_recipient', S('address')),
      // no IO outputs (side-effect)
    ],
  },

  // MakeMoveVec: T[] -> vector<T> (example uses object for T)
  makeMoveVec: {
    label: 'MakeMoveVec',
    ports: () => [
      ...PORTS.commandBase(),
      ioIn('in_elems', V(O())),
      ioOut('out_vec', V(O())),
    ],
  },

  // MoveCall: special-case (dedicated node later) — placeholder for now
  moveCall: {
    label: 'MoveCall',
    ports: () => [...PORTS.commandBase()],
  },

  // Publish / Upgrade: to be implemented later
  publish: {
    label: 'Publish',
    ports: () => [...PORTS.commandBase()],
  },
  upgrade: {
    label: 'Upgrade',
    ports: () => [...PORTS.commandBase()],
  },
};

/** Lookup a command spec */
export function getCommandSpec(
  kind?: CommandKind | string,
): CmdSpec | undefined {
  if (!kind) return;
  const key = String(kind) as keyof typeof Registry;
  return Registry[key];
}

/** Materialize ports from command spec (fallback: base flow only) */
export function materializeCommandPorts(command?: string): Port[] {
  return getCommandSpec(command)?.ports() ?? PORTS.commandBase();
}

/** UI label resolver */
export function commandLabel(command?: string, fallback?: string): string {
  return getCommandSpec(command)?.label ?? fallback ?? 'Command';
}
