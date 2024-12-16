import { Transaction } from '@mysten/sui/transactions';
import { Edge, Node } from '@xyflow/react';

export const NumericTypes = new Set([
  'u8',
  'u16',
  'u32',
  'u64',
  'u128',
  'u256',
]);

export type TYPE_PARAMS =
  | 'address'
  | 'string'
  | 'number'
  | 'u8'
  | 'u16'
  | 'u32'
  | 'u64'
  | 'u128'
  | 'u256'
  | 'bool'
  | 'object';

export type TYPE_ARRAY =
  | 'address[]'
  | 'number[]'
  | 'u8[]'
  | 'u16[]'
  | 'u32[]'
  | 'u64[]'
  | 'u128[]'
  | 'u256[]'
  | 'bool[]'
  | 'object[]';

export type TYPE_VECTOR =
  | 'vector<address>'
  | 'vector<u8>'
  | 'vector<u16>'
  | 'vector<u32>'
  | 'vector<u64>'
  | 'vector<u128>'
  | 'vector<u256>'
  | 'vector<bool>'
  | 'vector<object>';

export type TYPE =
  | TYPE_PARAMS
  | TYPE_ARRAY
  | TYPE_VECTOR
  | 'moveCall'
  | 'process';

export enum PTBNodeType {
  Address = 'SuiAddress',
  AddressArray = 'SuiAddressArray',
  AddressVector = 'SuiAddressVector',
  AddressWallet = 'SuiAddressWallet',

  Bool = 'SuiBool',
  BoolArray = 'SuiBoolArray',
  BoolVector = 'SuiBoolVector',

  Number = 'SuiNumber',
  NumberArray = 'SuiNumberArray',
  NumberVector = 'SuiNumberVector',

  ObjectGas = 'SuiObjectGas',
  Object = 'SuiObject',
  ObjectArray = 'SuiObjectArray',
  ObjectVector = 'SuiObjectVector',

  String = 'SuiString',

  MergeCoins = 'MergeCoins',
  SplitCoins = 'SplitCoins',
  TransferObjects = 'TransferObjects',
  MakeMoveVec = 'MakeMoveVec',
  MoveCall = 'MoveCall',
  Publish = 'Publish',

  Start = 'Start',
  End = 'End',
}

export interface PTBNode extends Node {
  data: PTBNodeData;
}

export interface PTBEdge extends Edge {
  type: 'Data' | 'Path';
}

export interface PTBNodeData {
  [key: string]: unknown;
  label: string;
  value?: string | string[] | number | number[];
  code?: (dictionary: Record<string, string>, edges: PTBEdge[]) => string;
  excute?: (
    transaction: Transaction,
    params: { source: PTBNode; target: string }[],
    results: { id: string; value: any }[],
  ) => { transaction: Transaction; result: any } | undefined;
}

export interface PTBNodeProp {
  id: string;
  data: PTBNodeData;
}
