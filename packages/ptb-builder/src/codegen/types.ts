// src/codegen/types.ts
// -----------------------------------------------------------------------------
// Core IR types for PTB codegen/runtime builders.
// - MoveCall return policy is represented by PMoveCallRets (none/single/destructure).
// - Undefined support: PUndefined explicitly represents "no value provided" and
//   is preserved through preprocess/builders (no nulls allowed).
// -----------------------------------------------------------------------------

import type { Chain } from '../types';

/** Explicit undefined literal */
export type PUndefined = { kind: 'undef' };

/** A value literal or reference that can appear in variables & arguments */
export type PValue =
  | { kind: 'scalar'; value: string | number | boolean } // includes address literal or sentinel 'myAddress'
  | { kind: 'move_numeric'; value: number | string | bigint }
  | {
      kind: 'object';
      special?: 'gas' | 'system' | 'clock' | 'random';
      id?: string;
    }
  | { kind: 'vector'; items: PValue[] }
  | { kind: 'ref'; name: string }
  | PUndefined;

/** A declared variable with its initialization value */
export type PVar = { name: string; init: PValue };

/** SplitCoins output: always destructure into N names */
export type POutDestructure = { mode: 'destructure'; names: string[] };

/** SplitCoins operation */
export type PSplitCoins = {
  kind: 'splitCoins';
  coin: PValue; // handle or undefined
  amounts: PValue[]; // scalars/undef only; no vectors
  out: POutDestructure; // N names for N amounts
};

/** MergeCoins operation */
export type PMergeCoins = {
  kind: 'mergeCoins';
  destination: PValue; // handle or undefined (no gas default)
  sources: PValue[]; // handles or undefined placeholders
};

/** TransferObjects operation */
export type PTransferObjects = {
  kind: 'transferObjects';
  objects: PValue[]; // handles or undefined placeholders
  recipient: PValue; // address scalar or undefined; never pure here
};

/** MakeMoveVec operation */
export type PMakeMoveVec = {
  kind: 'makeMoveVec';
  elements: PValue[]; // handles or primitive literals/undef
  out: string;
  elemType?: {
    kind: 'scalar' | 'move_numeric' | 'object';
    name?: string;
    width?: string;
    typeTag?: string;
  };
};

/** MoveCall param kind (drives pure policy at runtime/codegen) */
export type ParamKind =
  | 'txarg' // handle/ref
  | 'addr' // Sui address
  | 'num' // u64-like number/bigint/decstr
  | 'bool' // boolean
  | 'array-prim' // array of primitives (rare; if UI exposes)
  | 'other'; // fallback (no pure)

/** MoveCall return binding policy */
export type PMoveCallRets =
  | { mode: 'none' }
  | { mode: 'single'; name: string }
  | { mode: 'destructure'; names: string[] };

/** MoveCall operation */
export type PMoveCall = {
  kind: 'moveCall';
  target: string;
  typeArgs: PValue[];
  args: PValue[];
  /** param kinds aligned with args length */
  paramKinds: ParamKind[];
  /** return binding policy derived from OUT ports (0/1/N) */
  rets: PMoveCallRets;
};

/** All operations */
export type POp =
  | PSplitCoins
  | PMergeCoins
  | PTransferObjects
  | PMakeMoveVec
  | PMoveCall;

/** Full program IR */
export type Program = {
  chain: Chain;
  header: { usedMyAddress: boolean; usedSuiTypeConst: boolean };
  vars: PVar[];
  ops: POp[];
};

/** Options for execution/codegen */
export type ExecOptions = {
  myAddress?: string;
  gasBudget?: number;
};
