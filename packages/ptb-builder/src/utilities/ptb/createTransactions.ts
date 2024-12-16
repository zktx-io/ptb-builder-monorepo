import { ProgrammableTransaction, SuiTransaction } from '@mysten/sui/client';

import { makeMoveVec } from './transactions/makeMoveVec';
import { mergeCoins } from './transactions/mergeCoins';
import { moveCall } from './transactions/moveCall';
import { splitCoins } from './transactions/splitCoins';
import { transferObjects } from './transactions/transferObjects';
import { PTB } from '../../_Components/Menu.data';
import { PTBEdge, PTBNode, PTBNodeType } from '../../PTBFlow/nodes';

const create = (
  id: string,
  type: PTBNodeType,
  label: string,
  edges: PTBEdge[],
  inputs: PTBNode[],
) => {
  return {
    tx: {
      id,
      position: { x: 0, y: 0 },
      type,
      data: {
        label,
      },
    },
    inputs,
    edges,
  };
};

export const createTransactions = (
  index: number,
  ptb: ProgrammableTransaction,
): {
  tx: PTBNode;
  inputs: PTBNode[];
  edges: PTBEdge[];
} => {
  const id = `tx-${index}`;
  const suiTx: SuiTransaction = ptb.transactions[index];

  if ('SplitCoins' in suiTx) {
    const res = splitCoins(index, ptb, suiTx, id);
    return create(
      id,
      PTB.SplitCoins.Type,
      PTB.SplitCoins.Name,
      res.edges,
      res.inputs,
    );
  }
  if ('TransferObjects' in suiTx) {
    const res = transferObjects(index, ptb, suiTx, id);
    return create(
      id,
      PTB.TransferObjects.Type,
      PTB.TransferObjects.Name,
      res.edges,
      res.inputs,
    );
  }
  if ('MakeMoveVec' in suiTx) {
    const res = makeMoveVec(index, ptb, suiTx, id);
    return create(
      id,
      PTBNodeType.MakeMoveVec,
      'vector<object>', // TODO
      res.edges,
      res.inputs,
    );
  }
  if ('MergeCoins' in suiTx) {
    const res = mergeCoins(index, ptb, suiTx, id);
    return create(
      id,
      PTB.MergeCoins.Type,
      PTB.MergeCoins.Name,
      res.edges,
      res.inputs,
    );
  }
  if ('Publish' in suiTx) {
    return create(id, PTB.Publish.Type, PTB.Publish.Name, [], []);
  }
  if ('MoveCall' in suiTx) {
    const res = moveCall(index, ptb, suiTx, id);
    return {
      tx: {
        id,
        position: { x: 0, y: 0 },
        type: PTB.MoveCall.Type,
        data: {
          label: PTB.MoveCall.Name,
          package: res.package,
          module: res.module,
          function: res.function,
          inputs: res.handles,
        },
      },
      inputs: res.inputs,
      edges: res.edges,
    };
  }

  return {
    tx: {
      id,
      position: { x: 0, y: 0 },
      type: undefined,
      data: {
        label: 'undefined',
      },
    },
    inputs: [],
    edges: [],
  };
};
