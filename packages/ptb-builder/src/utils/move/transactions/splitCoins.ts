import { ProgrammableTransaction, SuiTransaction } from '@mysten/sui/client';
import { Edge, Node } from '@xyflow/react';

export const splitCoins = (
  index: number,
  ptb: ProgrammableTransaction,
  suiTx: SuiTransaction,
  id: string,
): { edges: Edge[]; inputs: Node[] } => {
  const edges: Edge[] = [];
  const inputs: Node[] = [];

  if ('SplitCoins' in suiTx) {
    const [coin, amounts] = suiTx.SplitCoins;

    if (coin === 'GasCoin') {
      edges.push({
        id: `sub-${index}-0`,
        type: 'Data',
        source: '@gasCoin',
        sourceHandle: 'inputs:object',
        target: id,
        targetHandle: 'coin:object',
      });
    } else if ('Input' in coin) {
      edges.push({
        id: `sub-${index}-0`,
        type: 'Data',
        source: `input-${coin.Input}`,
        sourceHandle: 'inputs:object',
        target: id,
        targetHandle: 'coin:object',
      });
    } else {
      // TODO
    }

    const arg1: number[] = [];
    amounts.forEach((item) => {
      if (typeof item !== 'string' && 'Input' in item) {
        ptb.inputs[item.Input].type === 'pure' &&
          arg1.push((ptb.inputs[item.Input] as any).value);
      }
    });
    inputs.push({
      id: `input-${index}-1`,
      position: { x: 0, y: 0 },
      type: 'SuiNumberArray',
      data: {
        value: arg1,
      },
    });
    edges.push({
      id: `sub-${index}-1`,
      type: 'Data',
      source: `input-${index}-1`,
      sourceHandle: 'inputs:number[]',
      target: id,
      targetHandle: 'amounts:number[]',
    });
  }

  return {
    edges,
    inputs,
  };
};
