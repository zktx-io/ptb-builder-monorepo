// src/codegen/types.ts

import type { Chain } from '../types';

/** A value literal or reference that can appear in variables & arguments */
export type PValue =
  | { kind: 'scalar'; value: string | number | boolean } // strings, booleans, or address literal sentinel 'myAddress'
  | { kind: 'move_numeric'; value: number | string | bigint } // Move numeric types (e.g. u64); builder wraps with tx.pure.u64
  | {
      kind: 'object';
      special?: 'gas' | 'system' | 'clock' | 'random'; // special Sui objects
      id?: string; // object ID
    }
  | { kind: 'vector'; items: PValue[] } // vector of PValues
  | { kind: 'ref'; name: string }; // reference to a previously-emitted symbol

/** A declared variable with its initialization value */
export type PVar = { name: string; init: PValue };

/** SplitCoins output modes */
export type POutVector = { mode: 'vector'; name: string };
export type POutDestructure = { mode: 'destructure'; names: string[] };

/** SplitCoins operation */
export type PSplitCoins = {
  kind: 'splitCoins';
  coin: PValue; // reference or tx helper
  amounts: PValue[]; // refs or literals; if a single vector, use as-is
  out: POutVector | POutDestructure;
};

/** MergeCoins operation */
export type PMergeCoins = {
  kind: 'mergeCoins';
  destination: PValue; // destination coin
  sources: PValue[]; // list of source coins
};

/** TransferObjects operation */
export type PTransferObjects = {
  kind: 'transferObjects';
  objects: PValue[]; // objects to transfer
  recipient: PValue; // recipient, allows 'myAddress' sentinel
};

/** MakeMoveVec operation */
export type PMakeMoveVec = {
  kind: 'makeMoveVec';
  elements: PValue[]; // elements of the vector
  out: string; // output variable name
  elemType?: {
    kind: 'scalar' | 'move_numeric' | 'object'; // element type
    name?: string; // optional name
    width?: string; // numeric width (e.g., u64)
    typeTag?: string; // raw type tag
  };
};

/** MoveCall operation */
export type PMoveCall = {
  kind: 'moveCall';
  target: string; // fully qualified function e.g., '0x...::module::func'
  typeArgs: PValue[]; // type arguments (string literal or ref)
  args: PValue[]; // positional arguments
};

/** All possible operation kinds */
export type POp =
  | PSplitCoins
  | PMergeCoins
  | PTransferObjects
  | PMakeMoveVec
  | PMoveCall;

/** A full PTB program representation */
export type Program = {
  chain: Chain;
  header: { usedMyAddress: boolean; usedSuiTypeConst: boolean }; // usage metadata
  vars: PVar[]; // declared variables
  ops: POp[]; // sequence of operations
};

/** Options for transaction execution */
export type ExecOptions = {
  myAddress?: string; // optional address sentinel
  gasBudget?: number; // optional gas budget
};
