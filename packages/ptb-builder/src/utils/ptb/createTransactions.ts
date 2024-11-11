import { ProgrammableTransaction, SuiTransaction } from '@mysten/sui/client';
import { Edge, Node } from '@xyflow/react';

import { makeMoveVec } from './transactions/makeMoveVec';
import { mergeCoins } from './transactions/mergeCoins';
import { moveCall } from './transactions/moveCall';
import { splitCoins } from './transactions/splitCoins';
import { transferObjects } from './transactions/transferObjects';

export const createTransactions = (
  index: number,
  ptb: ProgrammableTransaction,
): {
  tx: Node;
  inputs: Node[];
  edges: Edge[];
} => {
  const id = `tx-${index}`;
  const suiTx: SuiTransaction = ptb.transactions[index];
  const edges: Edge[] = [];
  const inputs: Node[] = [];
  let type = '';

  if ('SplitCoins' in suiTx) {
    type = 'SplitCoins';
    const res = splitCoins(index, ptb, suiTx, id);
    edges.push(...res.edges);
    inputs.push(...res.inputs);
  }
  if ('TransferObjects' in suiTx) {
    type = 'TransferObjects';
    const res = transferObjects(index, ptb, suiTx, id);
    edges.push(...res.edges);
    inputs.push(...res.inputs);
  }
  if ('MakeMoveVec' in suiTx) {
    type = 'MakeMoveVec';
    const res = makeMoveVec(index, ptb, suiTx, id);
    edges.push(...res.edges);
    inputs.push(...res.inputs);
  }
  if ('MergeCoins' in suiTx) {
    type = 'MergeCoins';
    const res = mergeCoins(index, ptb, suiTx, id);
    edges.push(...res.edges);
    inputs.push(...res.inputs);
  }
  if ('Publish' in suiTx) {
    type = 'Publish';
  }
  if ('MoveCall' in suiTx) {
    type = 'MoveCall';
    const res = moveCall(index, ptb, suiTx, id);
    edges.push(...res.edges);
    inputs.push(...res.inputs);
    return {
      tx: {
        id,
        position: { x: 0, y: 0 },
        type,
        data: {
          label: type,
          package: res.package,
          module: res.module,
          function: res.function,
          handles: res.handles,
        },
      },
      inputs,
      edges,
    };
  }

  return {
    tx: {
      id,
      position: { x: 0, y: 0 },
      type,
      data: {
        label: type,
      },
    },
    inputs,
    edges,
  };
};
