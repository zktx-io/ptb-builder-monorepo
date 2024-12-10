import { ProgrammableTransaction, SuiTransaction } from '@mysten/sui/client';
import { Edge } from '@xyflow/react';

import { enqueueToast } from '../../../Provider/toastManager';
import { PTBNode } from '../../../PTBFlow/nodes';

export const splitCoins = (
  index: number,
  ptb: ProgrammableTransaction,
  suiTx: SuiTransaction,
  id: string,
): { edges: Edge[]; inputs: PTBNode[] } => {
  const edges: Edge[] = [];
  const inputs: PTBNode[] = [];

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
      enqueueToast(`not support - ${JSON.stringify(coin)}`, {
        variant: 'warning',
      });
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
        label: 'number[]',
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
