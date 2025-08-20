// src/editor/nodeFactories.ts
import type {
  CommandKind,
  PTBNode,
  PTBScalar,
  PTBType,
  VariableNode,
} from '../../ptb/graph/types';

let seq = 0;
const nid = (p: string) => `${p}-${Date.now()}-${seq++}`;

// --- PTBType helpers ---
const scalar = (name: PTBScalar): PTBType => ({ kind: 'scalar', name });
const vector = (elem: PTBType): PTBType => ({ kind: 'vector', elem });
const object = (
  name: 'object' | 'coin' | 'objectRef',
  typeArgs?: string[],
): PTBType => ({ kind: 'object', name, typeArgs });

// --- Node factories ---
export const NodeFactories = {
  // Start node
  start(): PTBNode {
    return {
      id: nid('start'),
      kind: 'Start',
      label: 'Start',
      ports: [{ id: 'next', role: 'flow', direction: 'out' }],
      position: { x: 0, y: 0 },
    };
  },

  // End node
  end(): PTBNode {
    return {
      id: nid('end'),
      kind: 'End',
      label: 'End',
      ports: [{ id: 'prev', role: 'flow', direction: 'in' }],
      position: { x: 0, y: 0 },
    };
  },

  // Commands
  command(
    kind:
      | CommandKind
      | 'MakeMoveVec'
      | 'MergeCoins'
      | 'SplitCoins'
      | 'MoveCall'
      | 'Publish'
      | 'TransferObjects'
      | 'Upgrade',
  ): PTBNode {
    const mapped: CommandKind =
      kind === 'MakeMoveVec'
        ? 'makeMoveVec'
        : kind === 'MergeCoins'
          ? 'mergeCoins'
          : kind === 'SplitCoins'
            ? 'splitCoins'
            : kind === 'MoveCall'
              ? 'moveCall'
              : kind === 'Publish'
                ? 'publish'
                : kind === 'TransferObjects'
                  ? 'transferObjects'
                  : kind === 'Upgrade'
                    ? 'publish'
                    : (kind as CommandKind);

    return {
      id: nid(`cmd-${mapped}`),
      kind: 'Command',
      label: mapped,
      command: mapped,
      ports: [
        { id: 'prev', role: 'flow', direction: 'in' },
        { id: 'next', role: 'flow', direction: 'out' },
      ],
      position: { x: 0, y: 0 },
    };
  },

  // Address
  address(): VariableNode {
    const t = scalar('address');
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
    const t = vector(scalar('address'));
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
    const t = vector(scalar('address'));
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
    const t = scalar('address');
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
    const t = scalar('bool');
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
    const t = vector(scalar('bool'));
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
    const t = vector(scalar('bool'));
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
    const t = scalar('number');
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
    const t = vector(scalar('number'));
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
    const t = vector(scalar('number'));
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
    const t = scalar('string');
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
    const t = vector(scalar('string'));
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
    const t = vector(scalar('string'));
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
    const t = scalar('string');
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

  // Object
  object(): VariableNode {
    const t = object('object');
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
    const t = vector(object('object'));
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
    const t = vector(object('object'));
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

  // Object helpers
  objectClock(): VariableNode {
    const t = object('object');
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
    const t = object('object');
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
    const t = object('coin');
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
    const t = object('object');
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
    const t = object('object');
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
    const t = object('object');
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
    const t = object('object');
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
