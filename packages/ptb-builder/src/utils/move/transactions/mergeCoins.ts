import { ProgrammableTransaction, SuiTransaction } from '@mysten/sui/client';
import { Edge, Node } from '@xyflow/react';
import { enqueueSnackbar } from 'notistack';

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
      enqueueSnackbar(`not support - ${JSON.stringify(destination)}`, {
        variant: 'warning',
      });
    }

    if (
      source.length === 1 &&
      typeof source[0] !== 'string' &&
      !('Input' in source[0])
    ) {
      if ('Result' in source[0]) {
        const temp = source[0].Result;
        if ('SplitCoins' in ptb.transactions[temp]) {
          edges.push({
            id: `sub-${index}-1`,
            type: 'Data',
            source: `tx-${temp}`,
            sourceHandle: 'result:object[]',
            target: id,
            targetHandle: 'source:object[]',
          });
        }
      } else if ('NestedResult' in source[0]) {
        const temp = source[0].NestedResult[0];
        if ('SplitCoins' in ptb.transactions[temp]) {
          edges.push({
            id: `sub-${index}-1`,
            type: 'Data',
            source: `tx-${temp}`,
            sourceHandle: 'result:object[]',
            target: id,
            targetHandle: 'source:object[]',
          });
        } else {
          // TODO
        }
      } else {
        // TODO
        enqueueSnackbar(`not support - ${JSON.stringify(source[0])}`, {
          variant: 'warning',
        });
      }
    } else {
      const items: string[] = [];
      source.forEach((item) => {
        if (typeof item !== 'string' && 'Input' in item) {
          const temp = ptb.inputs[item.Input];
          if (temp.type === 'object') {
            items.push(temp.objectId);
          }
        }
      });
      inputs.push({
        id: `input-${index}-1`,
        position: { x: 0, y: 0 },
        type: 'SuiObjectArray',
        data: {
          value: items,
        },
      });
      edges.push({
        id: `sub-${index}-1`,
        type: 'Data',
        source: `input-${index}-1`,
        sourceHandle: 'inputs:object[]',
        target: id,
        targetHandle: 'source:object[]',
      });
    }
  }

  return {
    edges,
    inputs,
  };
};
