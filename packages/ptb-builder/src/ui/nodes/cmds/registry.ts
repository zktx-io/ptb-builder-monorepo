// src/ui/nodes/cmds/registry.ts
// Single source of truth for command port materialization.
// - Ports for each CommandKind are computed here from node.params.ui (policy applied).
// - For MoveCall, **type-parameter inputs come first**, followed by value-parameter inputs,
//   and then results on the right.
// - Important: Type-parameter handles accept **string** inputs only for user clarity,
//   but display their generic name (e.g. "T0") via `typeStr`. This keeps:
//     • wiring constraints: only string variables connect
//     • UX: handles look like generics (T0, T1, ...)

import { isNestedVector } from '../../../ptb/graph/typecheck';
import { M, O, S, V } from '../../../ptb/graph/typeHelpers';
import type {
  CommandKind,
  CommandNode,
  CommandUIParams,
  Port,
  PTBType,
} from '../../../ptb/graph/types';
import { serializePTBType } from '../../../ptb/graph/types';
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

/** Inject UI defaults directly onto the node (single source of truth). */
function applyDefaultUIInPlace(node?: CommandNode) {
  if (!node) return;
  const k = node.command;
  const raw = ((node.params?.ui ?? {}) as CommandUIParams) || {};
  const next: CommandUIParams = { ...raw };

  switch (k) {
    case 'splitCoins': {
      // Policy:
      // - Input amounts: single vector<u64>
      // - Outputs: N * single objects (ALWAYS expanded)
      // - Toggle disabled (handled by canExpandCommand)
      next.amountsExpanded = true;
      if (typeof next.amountsCount !== 'number' || next.amountsCount <= 0) {
        next.amountsCount = 2;
      }
      break;
    }

    case 'mergeCoins': {
      // Default to vector input; allow expansion via toggle.
      if (typeof next.sourcesExpanded !== 'boolean')
        next.sourcesExpanded = false;
      if (typeof next.sourcesCount !== 'number' || next.sourcesCount <= 0) {
        next.sourcesCount = 2;
      }
      break;
    }

    case 'transferObjects': {
      // Default to vector input; allow expansion via toggle.
      if (typeof next.objectsExpanded !== 'boolean')
        next.objectsExpanded = false;
      if (typeof next.objectsCount !== 'number' || next.objectsCount <= 0) {
        next.objectsCount = 1;
      }
      break;
    }

    case 'makeMoveVec': {
      // Default to vector input; allow expansion except when nested vector<T>.
      if (typeof next.elemsExpanded !== 'boolean') next.elemsExpanded = false;
      if (typeof next.elemsCount !== 'number' || next.elemsCount <= 0) {
        next.elemsCount = 2;
      }
      break;
    }
  }

  node.params = { ...(node.params ?? {}), ui: next };
}

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
      // Always expanded outputs; toggle disabled.
      return false;
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

      // Always produce single×N outputs (ignore toggle).
      const outs: Port[] = manyOutputs(
        'out_coin',
        posInt(ui.amountsCount, 1, 2),
        O(),
      );

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

      // Arrays normalized by MoveCall UI:
      //  - _fnTParams: PTBType[] (usually 'typeparam' with names "T0","T1"...)
      //  - _fnIns:     PTBType[] (value params)
      //  - _fnOuts:    PTBType[] (return types)
      const tps: PTBType[] = Array.isArray(ui._fnTParams) ? ui._fnTParams : [];
      const ins: PTBType[] = Array.isArray(ui._fnIns) ? ui._fnIns : [];
      const outs: PTBType[] = Array.isArray(ui._fnOuts) ? ui._fnOuts : [];

      // TYPE PARAMETER PORTS:
      // Accept only string inputs (enforced by dataType = scalar('string')),
      // but display the generic name (e.g., "T0") via typeStr for UI badges.
      const tpPorts =
        tps.length > 0
          ? tps.map((t, i) =>
              ioIn(`in_typ_${i}`, {
                dataType: S('string'),
                typeStr: serializePTBType(t), // shows "T0"/"T1" etc.
                label: `typ[${i}]`,
              }),
            )
          : [];

      // VALUE ARGUMENT PORTS
      const inPorts =
        ins.length > 0
          ? ins.map((t, i) =>
              ioIn(`in_arg_${i}`, { dataType: t, label: `arg[${i}]` }),
            )
          : [];

      // RESULT PORTS
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
    applyDefaultUIInPlace(arg as CommandNode);
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
