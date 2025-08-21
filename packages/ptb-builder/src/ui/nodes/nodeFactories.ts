// src/editor/nodeFactories.ts
// Factory for PTB nodes (Start/End/Variables/Commands).
// - Display command names (e.g., "SplitCoins") are normalized to canonical CommandKind (e.g., "splitCoins").
// - Command ports are always materialized from a single source of truth (registry).

import { materializeCommandPorts } from './cmds/BaseCommand/registry';
import type {
  CommandKind,
  PTBNode,
  PTBScalar,
  PTBType,
  VariableNode,
} from '../../ptb/graph/types';

let seq = 0;
const nid = (p: string) => `${p}-${Date.now()}-${seq++}`;

/* ----------------------------- PTBType helpers ----------------------------- */
// Short aliases to keep call sites concise.
const S = (name: PTBScalar): PTBType => ({ kind: 'scalar', name }); // scalar
const V = (elem: PTBType): PTBType => ({ kind: 'vector', elem }); // vector
const O = (typeTag?: string): PTBType => ({ kind: 'object', typeTag }); // object (new schema)

/* -------------------- Display → canonical command mapping ------------------- */
// Single map to avoid repeating union types in many places.
const DISPLAY_TO_KIND = {
  MakeMoveVec: 'makeMoveVec',
  MergeCoins: 'mergeCoins',
  SplitCoins: 'splitCoins',
  MoveCall: 'moveCall',
  Publish: 'publish',
  TransferObjects: 'transferObjects',
  Upgrade: 'publish', // If "Upgrade" is intended to alias "publish"
} as const;

// Literal type of display command names derived from the map keys.
type DisplayCommand = keyof typeof DISPLAY_TO_KIND;

// Type guard for runtime checks (defensive).
function isDisplayCommand(x: unknown): x is DisplayCommand {
  return typeof x === 'string' && x in DISPLAY_TO_KIND;
}

// Normalize any incoming "kind" to the canonical CommandKind.
function normalizeCommandKind(kind: CommandKind | DisplayCommand): CommandKind {
  return isDisplayCommand(kind) ? DISPLAY_TO_KIND[kind] : kind;
}

/* ------------------------------- Node factory ------------------------------ */
export const NodeFactories = {
  /* Start node */
  start(): PTBNode {
    return {
      id: nid('start'),
      kind: 'Start',
      label: 'Start',
      ports: [{ id: 'next', role: 'flow', direction: 'out' }],
      position: { x: 0, y: 0 },
    };
  },

  /* End node */
  end(): PTBNode {
    return {
      id: nid('end'),
      kind: 'End',
      label: 'End',
      ports: [{ id: 'prev', role: 'flow', direction: 'in' }],
      position: { x: 0, y: 0 },
    };
  },

  /* Command node (ports come from registry = SSOT) */
  command(kind: CommandKind | DisplayCommand): PTBNode {
    const mapped = normalizeCommandKind(kind);
    return {
      id: nid(`cmd-${mapped}`),
      kind: 'Command',
      label: mapped, // UI label; can be prettified elsewhere if desired
      command: mapped, // canonical key used across domain
      ports: materializeCommandPorts(mapped), // ← Ports from registry (single source of truth)
      position: { x: 0, y: 0 },
    };
  },

  /* ---------------------------- Variable nodes ---------------------------- */

  // Address
  address(): VariableNode {
    const t = S('address');
    return {
      id: nid('addr'),
      kind: 'Variable',
      label: 'address',
      name: 'addr',
      varType: t,
      ports: [{ id: 'out_0', role: 'io', direction: 'out', dataType: t }],
      position: { x: 0, y: 0 },
    };
  },
  addressArray(): VariableNode {
    const t = V(S('address'));
    return {
      id: nid('addr-arr'),
      kind: 'Variable',
      label: 'address[]',
      name: 'addrs',
      varType: t,
      ports: [{ id: 'out_0', role: 'io', direction: 'out', dataType: t }],
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
      ports: [{ id: 'out_0', role: 'io', direction: 'out', dataType: t }],
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
      ports: [{ id: 'out_0', role: 'io', direction: 'out', dataType: t }],
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
      ports: [{ id: 'out_0', role: 'io', direction: 'out', dataType: t }],
      position: { x: 0, y: 0 },
    };
  },
  boolArray(): VariableNode {
    const t = V(S('bool'));
    return {
      id: nid('bool-arr'),
      kind: 'Variable',
      label: 'bool[]',
      name: 'flags',
      varType: t,
      ports: [{ id: 'out_0', role: 'io', direction: 'out', dataType: t }],
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
      ports: [{ id: 'out_0', role: 'io', direction: 'out', dataType: t }],
      position: { x: 0, y: 0 },
    };
  },

  // Number
  number(): VariableNode {
    const t = S('number');
    return {
      id: nid('var-number'),
      kind: 'Variable',
      label: 'number',
      name: 'num',
      varType: t,
      ports: [{ id: 'out_0', role: 'io', direction: 'out', dataType: t }],
      position: { x: 0, y: 0 },
    };
  },
  numberArray(): VariableNode {
    const t = V(S('number'));
    return {
      id: nid('var-number[]'),
      kind: 'Variable',
      label: 'number[]',
      name: 'numbers',
      varType: t,
      ports: [{ id: 'out_0', role: 'io', direction: 'out', dataType: t }],
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
      ports: [{ id: 'out_0', role: 'io', direction: 'out', dataType: t }],
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
      ports: [{ id: 'out_0', role: 'io', direction: 'out', dataType: t }],
      position: { x: 0, y: 0 },
    };
  },
  stringArray(): VariableNode {
    const t = V(S('string'));
    return {
      id: nid('str-arr'),
      kind: 'Variable',
      label: 'string[]',
      name: 'texts',
      varType: t,
      ports: [{ id: 'out_0', role: 'io', direction: 'out', dataType: t }],
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
      ports: [{ id: 'out_0', role: 'io', direction: 'out', dataType: t }],
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
      ports: [{ id: 'out_0', role: 'io', direction: 'out', dataType: t }],
      position: { x: 0, y: 0 },
    };
  },

  // Object (new schema uses typeTag; leave undefined for generic object)
  object(): VariableNode {
    const t = O(); // generic object (no concrete typeTag)
    return {
      id: nid('obj'),
      kind: 'Variable',
      label: 'object',
      name: 'obj',
      varType: t,
      ports: [{ id: 'out_0', role: 'io', direction: 'out', dataType: t }],
      position: { x: 0, y: 0 },
    };
  },
  objectArray(): VariableNode {
    const t = V(O());
    return {
      id: nid('obj-arr'),
      kind: 'Variable',
      label: 'object[]',
      name: 'objs',
      varType: t,
      ports: [{ id: 'out_0', role: 'io', direction: 'out', dataType: t }],
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
      ports: [{ id: 'out_0', role: 'io', direction: 'out', dataType: t }],
      position: { x: 0, y: 0 },
    };
  },

  // Object helpers (all generic objects unless you want to provide concrete type tags)
  objectClock(): VariableNode {
    const t = O();
    return {
      id: nid('clock'),
      kind: 'Variable',
      label: 'clock',
      name: 'clock',
      varType: t,
      ports: [{ id: 'out_0', role: 'io', direction: 'out', dataType: t }],
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
      ports: [{ id: 'out_0', role: 'io', direction: 'out', dataType: t }],
      position: { x: 0, y: 0 },
    };
  },
  objectCoinWithBalance(): VariableNode {
    const t = O(); // if you know the concrete typeTag, set it here
    return {
      id: nid('coin-bal'),
      kind: 'Variable',
      label: 'coinWithBalance',
      name: 'coinWithBalance',
      varType: t,
      ports: [{ id: 'out_0', role: 'io', direction: 'out', dataType: t }],
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
      ports: [{ id: 'out_0', role: 'io', direction: 'out', dataType: t }],
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
      ports: [{ id: 'out_0', role: 'io', direction: 'out', dataType: t }],
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
      ports: [{ id: 'out_0', role: 'io', direction: 'out', dataType: t }],
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
      ports: [{ id: 'out_0', role: 'io', direction: 'out', dataType: t }],
      position: { x: 0, y: 0 },
    };
  },
};
