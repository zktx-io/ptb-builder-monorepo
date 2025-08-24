// src/editor/nodeFactories.ts
// Factory for PTB nodes (Start/End/Variables/Commands).
// - CommandKind is canonical (camelCase) across the app.
// - UI display names can differ (e.g., "SplitCoins"), but actions must use CommandKind.
// - Command ports are always materialized from a single source of truth (registry).
// - Default UI params are injected HERE (single choke point).

import { materializeCommandPorts } from './cmds/BaseCommand/registry';
import type {
  CommandKind,
  CommandNode,
  Port,
  PTBNode,
  PTBScalar,
  PTBType,
  VariableNode,
} from '../../ptb/graph/types';
import { FLOW_NEXT, FLOW_PREV, VAR_OUT } from '../../ptb/portTemplates';

let seq = 0;
const nid = (p: string) => `${p}-${Date.now()}-${seq++}`;

/* ----------------------------- PTBType helpers ----------------------------- */
const S = (name: PTBScalar): PTBType => ({ kind: 'scalar', name });
const V = (elem: PTBType): PTBType => ({ kind: 'vector', elem });
const O = (typeTag?: string): PTBType => ({ kind: 'object', typeTag });

/* ------------------------ Small helpers (reduce dup) ------------------------ */
function outPort(dataType: PTBType): Port {
  return { id: VAR_OUT, role: 'io', direction: 'out', dataType };
}

/* --------------------------- UI defaults injector --------------------------- */
/** Apply per-command UI defaults (idempotent). */
function withUIDefaults(
  kind: CommandKind,
  ui: Record<string, unknown> = {},
): Record<string, unknown> {
  switch (kind) {
    case 'splitCoins':
      // Expanded → N individual outputs (defaults N=2)
      ui.amountsExpanded ??= false;
      ui.amountsCount ??= 2;
      break;
    case 'mergeCoins':
      ui.sourcesExpanded ??= false;
      ui.sourcesCount ??= 2;
      break;
    case 'transferObjects':
      ui.objectsExpanded ??= false;
      ui.objectsCount ??= 2;
      break;
    case 'makeMoveVec':
      ui.elemsExpanded ??= false;
      ui.elemsCount ??= 2;
      // elemType is optional; registry will default to object if not set
      break;
    default:
      // other commands: no UI defaults
      break;
  }
  return ui;
}

/* -------------------------------- Factories -------------------------------- */
export const NodeFactories = {
  /* Start node */
  start(): PTBNode {
    const flowOut: Port = { id: FLOW_NEXT, role: 'flow', direction: 'out' };
    return {
      id: nid('start'),
      kind: 'Start',
      label: 'Start',
      ports: [flowOut],
      position: { x: 0, y: 0 },
    };
  },

  /* End node */
  end(): PTBNode {
    const flowIn: Port = { id: FLOW_PREV, role: 'flow', direction: 'in' };
    return {
      id: nid('end'),
      kind: 'End',
      label: 'End',
      ports: [flowIn],
      position: { x: 0, y: 0 },
    };
  },

  /* Command node — canonical CommandKind
   * - Inject default UI params here
   * - Materialize ports from registry using the node (so UI affects ports immediately)
   */
  command(
    kind: CommandKind,
    opts?: {
      label?: string;
      ui?: Record<string, unknown>;
      runtime?: Record<string, unknown>;
      position?: { x: number; y: number };
    },
  ): CommandNode {
    const id = nid(`cmd-${kind}`);
    const label = opts?.label ?? kind;

    // Merge defaults + user overrides
    const ui = withUIDefaults(kind, { ...(opts?.ui ?? {}) });
    const runtime = { ...(opts?.runtime ?? {}) };

    // Build a minimal node to let registry compute ports based on UI
    const draftNode: CommandNode = {
      id,
      kind: 'Command',
      label,
      command: kind,
      params: { ui, runtime },
      ports: [], // will be materialized next
      position: opts?.position ?? { x: 0, y: 0 },
    };

    // Materialize ports from the single source of truth (registry)
    const ports = materializeCommandPorts(draftNode);

    // Return finalized command node
    return { ...draftNode, ports };
  },

  // ---------------------------- Variable nodes ----------------------------

  // Address
  address(): VariableNode {
    const t = S('address');
    return {
      id: nid('addr'),
      kind: 'Variable',
      label: 'address',
      name: 'addr',
      varType: t,
      ports: [outPort(t)],
      position: { x: 0, y: 0 },
    };
  },
  addressVector(): VariableNode {
    const t = V(S('address'));
    return {
      id: nid('addr-vec'),
      kind: 'Variable',
      label: 'vector<address>',
      name: 'v_address',
      varType: t,
      ports: [outPort(t)],
      position: { x: 0, y: 0 },
    };
  },
  addressWallet(): VariableNode {
    const t = S('address');
    return {
      id: nid('wallet'),
      kind: 'Variable',
      label: 'my wallet',
      name: 'sender',
      varType: t,
      ports: [outPort(t)],
      position: { x: 0, y: 0 },
    };
  },

  // Bool
  bool(): VariableNode {
    const t = S('bool');
    return {
      id: nid('bool'),
      kind: 'Variable',
      label: 'bool',
      name: 'flag',
      varType: t,
      ports: [outPort(t)],
      position: { x: 0, y: 0 },
    };
  },
  boolVector(): VariableNode {
    const t = V(S('bool'));
    return {
      id: nid('bool-vec'),
      kind: 'Variable',
      label: 'vector<bool>',
      name: 'v_bool',
      varType: t,
      ports: [outPort(t)],
      position: { x: 0, y: 0 },
    };
  },

  // Number (UI-unified)
  number(): VariableNode {
    const t = S('number');
    return {
      id: nid('var-number'),
      kind: 'Variable',
      label: 'number',
      name: 'num',
      varType: t,
      ports: [outPort(t)],
      position: { x: 0, y: 0 },
    };
  },
  numberVector(): VariableNode {
    const t = V(S('number'));
    return {
      id: nid('var-number-vec'),
      kind: 'Variable',
      label: 'vector<number>',
      name: 'nums',
      varType: t,
      ports: [outPort(t)],
      position: { x: 0, y: 0 },
    };
  },

  // String
  string(): VariableNode {
    const t = S('string');
    return {
      id: nid('str'),
      kind: 'Variable',
      label: 'string',
      name: 'text',
      varType: t,
      ports: [outPort(t)],
      position: { x: 0, y: 0 },
    };
  },
  stringVector(): VariableNode {
    const t = V(S('string'));
    return {
      id: nid('str-vec'),
      kind: 'Variable',
      label: 'vector<string>',
      name: 'v_string',
      varType: t,
      ports: [outPort(t)],
      position: { x: 0, y: 0 },
    };
  },
  string0x2suiSui(): VariableNode {
    const t = S('string');
    return {
      id: nid('sui-str'),
      kind: 'Variable',
      label: '0x2::sui::SUI',
      name: 'sui',
      value: '0x2::sui::SUI',
      varType: t,
      ports: [outPort(t)],
      position: { x: 0, y: 0 },
    };
  },

  // Object (generic)
  object(): VariableNode {
    const t = O();
    return {
      id: nid('obj'),
      kind: 'Variable',
      label: 'object',
      name: 'obj',
      varType: t,
      ports: [outPort(t)],
      position: { x: 0, y: 0 },
    };
  },
  objectVector(): VariableNode {
    const t = V(O());
    return {
      id: nid('obj-vec'),
      kind: 'Variable',
      label: 'vector<object>',
      name: 'v_object',
      varType: t,
      ports: [outPort(t)],
      position: { x: 0, y: 0 },
    };
  },

  // Object helpers
  objectClock(): VariableNode {
    const t = O();
    return {
      id: nid('clock'),
      kind: 'Variable',
      label: 'clock',
      name: 'clock',
      varType: t,
      ports: [outPort(t)],
      position: { x: 0, y: 0 },
    };
  },
  objectGas(): VariableNode {
    const t = O();
    return {
      id: nid('gas'),
      kind: 'Variable',
      label: 'gas',
      name: 'gas',
      varType: t,
      ports: [outPort(t)],
      position: { x: 0, y: 0 },
    };
  },
  objectCoinWithBalance(): VariableNode {
    const t = O();
    return {
      id: nid('coin-bal'),
      kind: 'Variable',
      label: 'coinWithBalance',
      name: 'coinWithBalance',
      varType: t,
      ports: [outPort(t)],
      position: { x: 0, y: 0 },
    };
  },
  objectDenyList(): VariableNode {
    const t = O();
    return {
      id: nid('deny'),
      kind: 'Variable',
      label: 'denyList',
      name: 'denyList',
      varType: t,
      ports: [outPort(t)],
      position: { x: 0, y: 0 },
    };
  },
  objectOption(): VariableNode {
    const t = O();
    return {
      id: nid('opt'),
      kind: 'Variable',
      label: 'option',
      name: 'option',
      varType: t,
      ports: [outPort(t)],
      position: { x: 0, y: 0 },
    };
  },
  objectRandom(): VariableNode {
    const t = O();
    return {
      id: nid('rand'),
      kind: 'Variable',
      label: 'random',
      name: 'random',
      varType: t,
      ports: [outPort(t)],
      position: { x: 0, y: 0 },
    };
  },
  objectSystem(): VariableNode {
    const t = O();
    return {
      id: nid('sys'),
      kind: 'Variable',
      label: 'system',
      name: 'system',
      varType: t,
      ports: [outPort(t)],
      position: { x: 0, y: 0 },
    };
  },
};

export { withUIDefaults }; // (optional) if you want to reuse in normalizer/migrations
