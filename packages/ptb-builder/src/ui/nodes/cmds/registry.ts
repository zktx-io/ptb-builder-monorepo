// src/ui/nodes/cmds/BaseCommand/registry.ts
import { isNestedVector } from '../../../ptb/graph/typecheck';
import { M, O, S, V } from '../../../ptb/graph/typeHelpers';
import type {
  CommandKind,
  CommandNode,
  CommandUIParams,
  Port,
  PTBType,
} from '../../../ptb/graph/types';
import { ioIn, ioOut, PORTS } from '../../../ptb/portTemplates';

/** Safely read UI params from a node (falls back to empty object). */
function uiOf(node?: CommandNode): CommandUIParams {
  return (node?.params?.ui ?? {}) as CommandUIParams;
}

/** Coerce an unknown value into a positive integer (with min & fallback). */
function posInt(n: unknown, min = 1, fallback = 1): number {
  const x =
    typeof n === 'number' ? Math.floor(n) : parseInt(String(n ?? ''), 10);
  return Number.isFinite(x) && x >= min ? x : fallback;
}

/** Build N labeled input ports named "<base>_i". */
function manyInputs(baseId: string, count: number, t: PTBType): Port[] {
  return Array.from({ length: count }, (_v, i) =>
    ioIn(`${baseId}_${i}`, { dataType: t, label: `${baseId}[${i}]` }),
  );
}

/** Build N labeled output ports named "<base>_i". */
function manyOutputs(baseId: string, count: number, t: PTBType): Port[] {
  return Array.from({ length: count }, (_v, i) =>
    ioOut(`${baseId}_${i}`, { dataType: t, label: `${baseId}[${i}]` }),
  );
}

/** ---- Command spec shape ---- */
type PortsBuilder = (node?: CommandNode) => Port[];
type CmdSpec = {
  label: string;
  ports: PortsBuilder;
};

/** Public helpers used by UI */
export function expandedKeyOf(
  kind?: string,
):
  | 'amountsExpanded'
  | 'sourcesExpanded'
  | 'objectsExpanded'
  | 'elemsExpanded'
  | undefined {
  switch (kind) {
    case 'splitCoins':
      return 'amountsExpanded';
    case 'mergeCoins':
      return 'sourcesExpanded';
    case 'transferObjects':
      return 'objectsExpanded';
    case 'makeMoveVec':
      return 'elemsExpanded';
    default:
      return undefined;
  }
}

export function countKeyOf(
  kind?: string,
): 'amountsCount' | 'sourcesCount' | 'objectsCount' | 'elemsCount' | undefined {
  switch (kind) {
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

/** Expansion policy guard (UI uses this to enable/disable the toggle & stepper) */
export function canExpandCommand(kind?: string, ui?: CommandUIParams): boolean {
  if (!kind) return false;
  switch (kind) {
    case 'splitCoins':
      return true; // vector<u64> single-level
    case 'mergeCoins':
      return true; // vector<object>
    case 'transferObjects':
      return true; // vector<object>
    case 'makeMoveVec': {
      // Forbid expansion when T is a vector (nested)
      const elemT = ui?.elemType;
      return !isNestedVector(elemT);
    }
    default:
      return false;
  }
}

/** ---- Registry (single source of truth for command IO) ---- */
const Registry: Record<CommandKind, CmdSpec> = {
  /** SplitCoins */
  splitCoins: {
    label: 'SplitCoins',
    ports: (node) => {
      const ui = uiOf(node);

      const coinIn = ioIn('in_coin', { dataType: O(), label: 'coin' });
      const amountsIn = ioIn('in_amounts', {
        dataType: V(M('u64')),
        label: 'amounts',
      });

      const outs: Port[] = ui.amountsExpanded
        ? manyOutputs('out_coin', posInt(ui.amountsCount, 1, 2), O())
        : [ioOut('out_coins', { dataType: V(O()), label: 'coins' })];

      return [...PORTS.commandBase(), coinIn, amountsIn, ...outs];
    },
  },

  /** MergeCoins (no outputs) */
  mergeCoins: {
    label: 'MergeCoins',
    ports: (node) => {
      const ui = uiOf(node);
      const count = posInt(ui.sourcesCount, 1, 2);

      const dest = ioIn('in_dest', { dataType: O(), label: 'dest' });
      const sources: Port[] = ui.sourcesExpanded
        ? manyInputs('in_source', count, O())
        : [ioIn('in_sources', { dataType: V(O()), label: 'sources' })];

      return [...PORTS.commandBase(), dest, ...sources];
    },
  },

  /** TransferObjects (no outputs) */
  transferObjects: {
    label: 'TransferObjects',
    ports: (node) => {
      const ui = uiOf(node);
      const count = posInt(ui.objectsCount, 1, 2);

      const objects: Port[] = ui.objectsExpanded
        ? manyInputs('in_object', count, O())
        : [ioIn('in_objects', { dataType: V(O()), label: 'objects' })];

      const recipient = ioIn('in_recipient', {
        dataType: S('address'),
        label: 'recipient',
      });

      // Keep recipient first on the left, then variable objects
      return [...PORTS.commandBase(), recipient, ...objects];
    },
  },

  /** MakeMoveVec */
  makeMoveVec: {
    label: 'MakeMoveVec',
    ports: (node) => {
      const ui = uiOf(node);
      const count = posInt(ui.elemsCount, 1, 2);
      const elemT = ui.elemType ?? O(); // default to object

      // Nested vectors are NOT expandable: force vector mode
      const nested = isNestedVector(elemT);
      const inputs: Port[] =
        ui.elemsExpanded && !nested
          ? manyInputs('in_elem', count, elemT)
          : [ioIn('in_elems', { dataType: V(elemT), label: 'elems' })];

      const out = ioOut('out_vec', { dataType: V(elemT), label: 'vec' });

      return [...PORTS.commandBase(), ...inputs, out];
    },
  },

  /** MoveCall (type parameters first, then value parameters; returns on the right) */
  moveCall: {
    label: 'MoveCall',
    ports: (node) => {
      const ui = uiOf(node) as any;

      // Normalized PTBType arrays provided by MoveCallCommand UI
      const tps: PTBType[] = Array.isArray(ui._fnTParams) ? ui._fnTParams : [];
      const ins: PTBType[] = Array.isArray(ui._fnIns) ? ui._fnIns : [];
      const outs: PTBType[] = Array.isArray(ui._fnOuts) ? ui._fnOuts : [];

      // Input ordering: type parameters first (typ[i]), then value parameters (arg[i])
      const tpPorts =
        tps.length > 0
          ? tps.map((t, i) =>
              ioIn(`in_typ_${i}`, { dataType: t, label: `typ[${i}]` }),
            )
          : [];

      const inPorts =
        ins.length > 0
          ? ins.map((t, i) =>
              ioIn(`in_arg_${i}`, { dataType: t, label: `arg[${i}]` }),
            )
          : [];

      // Outputs: results on the right (res[i])
      const outPorts =
        outs.length > 0
          ? outs.map((t, i) =>
              ioOut(`out_res_${i}`, { dataType: t, label: `res[${i}]` }),
            )
          : [];

      return [...PORTS.commandBase(), ...tpPorts, ...inPorts, ...outPorts];
    },
  },

  /** TODO */
  publish: { label: 'Publish', ports: () => [...PORTS.commandBase()] },
  upgrade: { label: 'Upgrade', ports: () => [...PORTS.commandBase()] },
};

/** Lookup a command spec by kind (string is tolerated). */
export function getCommandSpec(
  kind?: CommandKind | string,
): CmdSpec | undefined {
  if (!kind) return;
  const key = String(kind) as keyof typeof Registry;
  return Registry[key];
}

/** Materialize ports from a command spec. */
export function materializeCommandPorts(
  arg?: CommandNode | string | null,
): Port[] {
  if (!arg) return PORTS.commandBase();

  if (typeof arg === 'string') {
    return getCommandSpec(arg)?.ports(undefined) ?? PORTS.commandBase();
  }
  if (typeof arg === 'object') {
    const cmd = (arg as Partial<CommandNode>).command;
    if (cmd) {
      return (
        getCommandSpec(cmd)?.ports(arg as CommandNode) ?? PORTS.commandBase()
      );
    }
  }
  return PORTS.commandBase();
}

/** Resolve user-facing label for a command (with fallback). */
export function commandLabel(command?: string, fallback?: string): string {
  return getCommandSpec(command as CommandKind)?.label ?? fallback ?? 'Command';
}
