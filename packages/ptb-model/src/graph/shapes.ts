import type { NumericWidth, PTBType } from '../ptbType.js';
import type { RawCallArg } from '../raw/types.js';
import { NULL_VALUE } from '../utils.js';

export type PortDirection = 'in' | 'out';
export type PortRole = 'flow' | 'io' | 'type';

export interface Port {
  id: string;
  direction: PortDirection;
  role: PortRole;
  dataType?: PTBType;
  typeStr?: string;
  label?: string;
}

export interface NodeBase {
  id: string;
  kind: 'Start' | 'End' | 'Command' | 'Variable' | 'TypeArgument';
  label?: string;
  ports: Port[];
  position?: { x: number; y: number };
}

export type CommandKind =
  | 'splitCoins'
  | 'mergeCoins'
  | 'transferObjects'
  | 'moveCall'
  | 'makeMoveVec'
  | 'publish'
  | 'upgrade'
  | 'unsupported';

export interface CommandRuntimeParams {
  target?: string;
  resultCount?: number;
  type?: string | typeof NULL_VALUE;
  modules?: string[];
  dependencies?: string[];
  package?: string;
  sourceKind?: string;
  value?: unknown;
}

export interface StartNode extends NodeBase {
  kind: 'Start';
}

export interface EndNode extends NodeBase {
  kind: 'End';
}

export interface CommandNode extends NodeBase {
  kind: 'Command';
  command: CommandKind;
  params?: {
    runtime?: CommandRuntimeParams;
  };
}

export interface VariableNode extends NodeBase {
  kind: 'Variable';
  varType: PTBType;
  name: string;
  value?: unknown;
  rawInput?: RawCallArg;
  semantic?:
    | { kind: 'GasCoin' }
    | { kind: 'UnsupportedInput'; sourceKind: string };
}

export interface TypeArgumentNode extends NodeBase {
  kind: 'TypeArgument';
  value: string;
}

export type PTBNode =
  | StartNode
  | EndNode
  | CommandNode
  | VariableNode
  | TypeArgumentNode;

export type EdgeKind = 'flow' | 'io' | 'type';

export interface PTBEdge {
  id: string;
  kind: EdgeKind;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
  cast?: { to: NumericWidth };
}

export interface PTBGraph {
  nodes: PTBNode[];
  edges: PTBEdge[];
}
