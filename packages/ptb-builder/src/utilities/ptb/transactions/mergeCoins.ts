import { ProgrammableTransaction, SuiTransaction } from '@mysten/sui/client';

import { enqueueToast } from '../../../Provider/toastManager';
import { PTBEdge, PTBNode, PTBNodeType } from '../../../PTBFlow/nodes';

export const mergeCoins = (
  index: number,
  ptb: ProgrammableTransaction,
  suiTx: SuiTransaction,
  id: string,
): { edges: PTBEdge[]; inputs: PTBNode[] } => {
  const edges: PTBEdge[] = [];
  const inputs: PTBNode[] = [];

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
      enqueueToast(`not support - ${JSON.stringify(destination)}`, {
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
          enqueueToast(`not support (1) - ${JSON.stringify(source[0])}`, {
            variant: 'warning',
          });
        }
      } else {
        // TODO
        enqueueToast(`not support (2) - ${JSON.stringify(source[0])}`, {
          variant: 'warning',
        });
      }
    } else {
      // TODO
      const items: string[] = [];
      const nestedItems: [number, number][] = [];

      source.forEach((item) => {
        if (typeof item !== 'string') {
          if ('Input' in item) {
            const temp = ptb.inputs[item.Input];
            if (temp.type === 'object') {
              items.push(temp.objectId);
            } else {
              enqueueToast(`not support (3) - ${JSON.stringify(item)}`, {
                variant: 'warning',
              });
            }
          } else if ('NestedResult' in item) {
            nestedItems.push(item.NestedResult as [number, number]);
          } else {
            enqueueToast(`not support (4) - ${JSON.stringify(item)}`, {
              variant: 'warning',
            });
          }
        }
      });

      if (nestedItems.length === 0 && items.length > 0) {
        inputs.push({
          id: `input-${index}-1`,
          position: { x: 0, y: 0 },
          type: PTBNodeType.ObjectArray,
          data: {
            label: 'object[]',
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
      } else if (nestedItems.length > 0) {
        // TODO
        const temp = nestedItems[0][0];
        edges.push({
          id: `sub-${index}-1`,
          type: 'Data',
          source: `tx-${temp}`,
          sourceHandle: 'result:object[]',
          target: id,
          targetHandle: 'source:object[]',
        });
      }
    }
  }

  return {
    edges,
    inputs,
  };
};
