import { Transaction } from '@mysten/sui/transactions';
import { Node } from '@xyflow/react';

export interface CodeParam {
  name: string;
  sourceHandle: string;
  targetHandle: string;
}

export interface PTBNode extends Node {
  data: PTBNodeData;
}

export interface PTBNodeData {
  [key: string]: unknown;
  label: string;
  value: string | string[] | object;
  code: (params: CodeParam[]) => string;
  excute: (
    transaction: Transaction,
    params: { source: PTBNode; target: string }[],
    results: { id: string; value: any }[],
  ) => { transaction: Transaction; result: any } | undefined;
}

export interface PTBNodeProp {
  id: string;
  data: PTBNodeData;
}
