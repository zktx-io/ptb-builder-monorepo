import { ProgrammableTransaction, SuiTransaction } from '@mysten/sui/client';
import { Edge, Node } from '@xyflow/react';

export const mergeCoins = (
  index: number,
  ptb: ProgrammableTransaction,
  suiTx: SuiTransaction,
  id: string,
): { edges: Edge[]; inputs: Node[] } => {
  const edges: Edge[] = [];
  const inputs: Node[] = [];

  if ('MergeCoins' in suiTx) {
    const [destination, source] = suiTx.MergeCoins;

    if (destination === 'GasCoin') {
      edges.push({
        id: `sub-${index}-0`,
        type: 'Data',
        source: '@gasCoin',
        sourceHandle: 'inputs:object',
        target: id,
        targetHandle: 'destination:object',
      });
    } else if ('Input' in destination) {
      edges.push({
        id: `sub-${index}-0`,
        type: 'Data',
        source: `input-${destination.Input}`,
        sourceHandle: 'inputs:object',
        target: id,
        targetHandle: 'destination:object',
      });
    } else {
      // TODO
    }
  }

  return {
    edges,
    inputs,
  };
};
