import { ProgrammableTransaction, SuiTransaction } from '@mysten/sui/client';

import { PTBEdge, PTBNode } from '../../../ptbFlow/nodes';

export const makeMoveVec = (
  index: number,
  ptb: ProgrammableTransaction,
  suiTx: SuiTransaction,
  id: string,
): { edges: PTBEdge[]; inputs: PTBNode[] } => {
  const edges: PTBEdge[] = [];
  const inputs: PTBNode[] = [];

  if ('MakeMoveVec' in suiTx) {
    const emelment: any[] = [];
    // suiTx.MakeMoveVec[0] // type
    suiTx.MakeMoveVec[1].forEach((item) => {
      if (typeof item === 'object' && 'NestedResult' in item) {
        const [tx, arg] = item.NestedResult;
        if ('SplitCoins' in ptb.transactions[tx]) {
          edges.push({
            id: `sub-${index}-${tx}`,
            type: 'Data',
            source: `tx-${tx}`,
            sourceHandle: 'result:object[]',
            target: id,
            targetHandle: 'source:object[]',
          });
        } else {
          // TODO
        }
      } else {
        // TODO
      }
    });
  }

  return {
    edges,
    inputs,
  };
};
