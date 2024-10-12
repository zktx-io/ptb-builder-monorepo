import { Transaction } from '@mysten/sui/transactions';
import { Node } from '@xyflow/react';

export interface CodeParam {
  name: string;
  sourceHandle: string;
  targetHandle: string;
}

export interface NodeProp {
  id: string;
  data: {
    label: string;
    value: string | string[] | object;
    code: (params: CodeParam[]) => string;
    excute: (
      transaction: Transaction,
      params: { source: Node; target: string }[],
      results: { id: string; value: any }[],
    ) => { transaction: Transaction; result: any } | undefined;
  };
}
