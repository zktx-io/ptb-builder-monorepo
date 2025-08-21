// src/ui/nodes/cmds/BaseCommand/registry.ts
import type {
  CommandKind,
  CommandNode,
  CommandUIParams,
  Port,
  PTBScalar,
  PTBType,
} from '../../../../ptb/graph/types';
import { ioIn, ioOut, PORTS, UNKNOWN } from '../../../../ptb/portTemplates';

/** --- PTBType helpers (UI-level) --- */
const S = (name: PTBScalar): PTBType => ({ kind: 'scalar', name });
const V = (elem: PTBType): PTBType => ({ kind: 'vector', elem });
const O = (typeTag?: string): PTBType =>
  typeTag ? { kind: 'object', typeTag } : { kind: 'object' };

/** Safely read UI params */
function uiOf(node?: CommandNode): CommandUIParams {
  return (node?.params?.ui ?? {}) as CommandUIParams;
}

/** Safely read runtime params */
function runtimeOf(node?: CommandNode): Record<string, unknown> {
  return (node?.params?.runtime ?? {}) as Record<string, unknown>;
}

/** Coerce to positive integer with a minimum */
function posInt(n: unknown, min = 1, fallback = 1): number {
  const x =
    typeof n === 'number' ? Math.floor(n) : parseInt(String(n ?? ''), 10);
  return Number.isFinite(x) && x >= min ? x : fallback;
}

/** Build N labeled input ports: in_<base>_i */
function manyInputs(baseId: string, count: number, t: PTBType): Port[] {
  return Array.from({ length: count }, (_v, i) =>
    ioIn(`${baseId}_${i}`, { dataType: t, label: `${baseId}[${i}]` }),
  );
}

/** Build N labeled output ports: out_<base>_i */
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

/** ---- Registry (SSOT for command IO) ---- */
const Registry: Record<CommandKind, CmdSpec> = {
  /** SplitCoins:
   * Inputs:
   *  - coin: object
   *  - amounts: number | vector<number> (ui.amountsMode)
   * Outputs:
   *  - if (mode === 'scalar' || !expanded): out_coins: vector<object>
   *  - if (mode === 'vector' && expanded): out_coin_0..N-1 (N from runtime.amountsLength)
   */
  splitCoins: {
    label: 'SplitCoins',
    ports: (node) => {
      const ui = uiOf(node);
      const rt = runtimeOf(node);
      const mode = ui.amountsMode ?? 'vector'; // default vector
      const expanded = !!ui.amountsExpanded;

      const coinIn = ioIn('in_coin', { dataType: O(), label: 'coin' });

      const amountsType = mode === 'scalar' ? S('number') : V(S('number'));
      const amountsIn = ioIn('in_amounts', {
        dataType: amountsType,
        label: 'amounts',
      });

      let outs: Port[];
      if (mode === 'vector' && expanded) {
        // N is ideally computed by upstream evaluation of amounts length.
        const n = posInt(rt.amountsLength, 1, 2);
        outs = manyOutputs('out_coin', n, O());
      } else {
        outs = [ioOut('out_coins', { dataType: V(O()), label: 'coins' })];
      }

      return [...PORTS.commandBase(), coinIn, amountsIn, ...outs];
    },
  },

  /** MergeCoins:
   * Inputs:
   *  - dest coin: object
   *  - sources: vector<object> | expanded many object (ui.sourcesMode/expanded/count)
   * Outputs:
   *  - out_coin: object
   */
  mergeCoins: {
    label: 'MergeCoins',
    ports: (node) => {
      const ui = uiOf(node);
      const mode = ui.sourcesMode ?? 'vector';
      const expanded = !!ui.sourcesExpanded;
      const count = posInt(ui.sourcesCount, 1, 2);

      const dest = ioIn('in_dest', { dataType: O(), label: 'dest' });

      const sources: Port[] =
        mode === 'vector' && !expanded
          ? [ioIn('in_sources', { dataType: V(O()), label: 'sources' })]
          : manyInputs('in_source', count, O());

      const out = ioOut('out_coin', { dataType: O(), label: 'coin' });

      return [...PORTS.commandBase(), dest, ...sources, out];
    },
  },

  /** TransferObjects:
   * Inputs:
   *  - objects: vector<object> | expanded many object (ui.objectsMode/expanded/count)
   *  - recipient: address
   * Outputs:
   *  - none (side-effect)
   */
  transferObjects: {
    label: 'TransferObjects',
    ports: (node) => {
      const ui = uiOf(node);
      const mode = ui.objectsMode ?? 'vector';
      const expanded = !!ui.objectsExpanded;
      const count = posInt(ui.objectsCount, 1, 2);

      const objects: Port[] =
        mode === 'vector' && !expanded
          ? [ioIn('in_objects', { dataType: V(O()), label: 'objects' })]
          : manyInputs('in_object', count, O());

      const recipient = ioIn('in_recipient', {
        dataType: S('address'),
        label: 'recipient',
      });

      return [...PORTS.commandBase(), ...objects, recipient];
    },
  },

  /** MakeMoveVec:
   * Inputs:
   *  - elems: vector<T> | expanded many T (ui.elemsMode/expanded/count/elemType)
   * Outputs:
   *  - out_vec: vector<T>
   */
  makeMoveVec: {
    label: 'MakeMoveVec',
    ports: (node) => {
      const ui = uiOf(node);
      const mode = ui.elemsMode ?? 'vector';
      const expanded = !!ui.elemsExpanded;
      const count = posInt(ui.elemsCount, 1, 2);
      const elemT = ui.elemType ?? O(); // default to object; can be changed by UI

      const inputs: Port[] =
        mode === 'vector' && !expanded
          ? [ioIn('in_elems', { dataType: V(elemT), label: 'elems' })]
          : manyInputs('in_elem', count, elemT);

      const out = ioOut('out_vec', { dataType: V(elemT), label: 'vec' });

      return [...PORTS.commandBase(), ...inputs, out];
    },
  },

  /** MoveCall — placeholder until we implement a dedicated node */
  moveCall: {
    label: 'MoveCall',
    ports: () => [...PORTS.commandBase()],
  },

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

/** Materialize ports from command spec.
 * If node is a CommandNode, ui/runtime params will be consulted.
 */
export function materializeCommandPorts(
  arg?: CommandNode | string | null,
): Port[] {
  // nothing → base flow only
  if (!arg) return PORTS.commandBase();

  // case 1) arg is a string command id
  if (typeof arg === 'string') {
    return getCommandSpec(arg)?.ports(undefined) ?? PORTS.commandBase();
  }

  // case 2) arg is an object (likely CommandNode)
  if (typeof arg === 'object') {
    const cmd = (arg as Partial<CommandNode>).command;
    if (cmd) {
      return (
        getCommandSpec(cmd)?.ports(arg as CommandNode) ?? PORTS.commandBase()
      );
    }
  }

  // fallback
  return PORTS.commandBase();
}

/** Resolve UI label for the command */
export function commandLabel(command?: string, fallback?: string): string {
  return getCommandSpec(command as CommandKind)?.label ?? fallback ?? 'Command';
}
