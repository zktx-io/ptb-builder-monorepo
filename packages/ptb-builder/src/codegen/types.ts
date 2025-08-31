// src/codegen/types.ts
// Minimal IR + exec options used by both codegen and runtime builder.

import type { PTBType } from '../ptb/graph/types';
import type { Network } from '../types';

export type ExecOptions = {
  myAddress?: string;
  gasBudget?: number;
};

export type IRHeader = {
  usedMyAddress: boolean;
  usedSuiTypeConst: boolean;
};

export type IRScalarInit = {
  kind: 'scalar';
  value: string | number | boolean;
};

export type IRMoveNumericInit = {
  kind: 'move_numeric';
  value: number | string | bigint; // will be wrapped via tx.pure.u64(...)
};

export type IRObjectInit = {
  kind: 'object';
  /** special helpers map to tx.object.* or tx.gas */
  special?: 'gas' | 'system' | 'clock' | 'random';
  /** concrete object id when not a special helper */
  id?: string;
};

export type IRVectorInit = {
  kind: 'vector';
  items: IRInit[];
};

export type IRInit =
  | IRScalarInit
  | IRMoveNumericInit
  | IRObjectInit
  | IRVectorInit;

export type IRVar = {
  name: string; // symbol used in ops
  init: IRInit;
};

export type IROutVector = { mode: 'vector'; name: string };
export type IROutDestructure = { mode: 'destructure'; names: string[] };

export type IROpSplitCoins = {
  kind: 'splitCoins';
  coin: string; // symbol
  amounts: string[]; // list of symbols; may contain a single vector symbol
  out: IROutVector | IROutDestructure;
};

export type IROpMergeCoins = {
  kind: 'mergeCoins';
  destination: string; // symbol (single coin)
  sources: string[]; // list; may contain a single vector symbol
};

export type IROpTransferObjects = {
  kind: 'transferObjects';
  objects: string[]; // list; may contain a single vector symbol
  recipient: string; // symbol or 'myAddress' sentinel; address literal allowed at runtime
};

export type IROpMakeMoveVec = {
  kind: 'makeMoveVec';
  elements: string[]; // list; may contain a single vector symbol
  out: string; // symbol for produced vector
  elemType?: PTBType; // for codegen only
};

export type IROpMoveCall = {
  kind: 'moveCall';
  target: string;
  typeArgs: string[];
  args: string[]; // positional symbols (no flatten)
};

export type IROp =
  | IROpSplitCoins
  | IROpMergeCoins
  | IROpTransferObjects
  | IROpMakeMoveVec
  | IROpMoveCall;

export type IR = {
  network: Network;
  header: IRHeader;
  vars: IRVar[];
  ops: IROp[];
};
