import { ProgrammableTransaction, SuiTransaction } from '@mysten/sui/client';
import { Edge, Node } from '@xyflow/react';

import { enqueueToast } from '../../../Provider/toastManager';

export const transferObjects = (
  index: number,
  ptb: ProgrammableTransaction,
  suiTx: SuiTransaction,
  id: string,
): { edges: Edge[]; inputs: Node[] } => {
  const edges: Edge[] = [];
  const inputs: Node[] = [];

  if ('TransferObjects' in suiTx) {
    const [objects, address] = suiTx.TransferObjects;

    if (
      objects.length === 1 &&
      typeof objects[0] !== 'string' &&
      !('Input' in objects[0])
    ) {
      if ('Result' in objects[0]) {
        const temp = objects[0].Result;
        if (
          'SplitCoins' in ptb.transactions[temp] ||
          'Publish' in ptb.transactions[temp]
        ) {
          edges.push({
            id: `sub-${index}-0`,
            type: 'Data',
            source: `tx-${temp}`,
            sourceHandle: 'result:object[]',
            target: id,
            targetHandle: 'objects:object[]',
          });
        }
      } else if ('NestedResult' in objects[0]) {
        const temp = objects[0].NestedResult[0];
        if ('SplitCoins' in ptb.transactions[temp]) {
          edges.push({
            id: `sub-${index}-0`,
            type: 'Data',
            source: `tx-${temp}`,
            sourceHandle: 'result:object[]',
            target: id,
            targetHandle: 'objects:object[]',
          });
        } else {
          // TODO
          enqueueToast(`not support (1) - ${JSON.stringify(objects[0])}`, {
            variant: 'warning',
          });
        }
      } else {
        // TODO
        enqueueToast(`not support (2) - ${JSON.stringify(objects[0])}`, {
          variant: 'warning',
        });
      }
    } else {
      const items: string[] = [];
      const nestedItems: [number, number][] = [];

      objects.forEach((item) => {
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
          id: `input-${index}-0`,
          position: { x: 0, y: 0 },
          type: 'SuiObjectArray',
          data: {
            value: items,
          },
        });
        edges.push({
          id: `sub-${index}-0`,
          type: 'Data',
          source: `input-${index}-0`,
          sourceHandle: 'inputs:object[]',
          target: id,
          targetHandle: 'objects:object[]',
        });
      } else if (nestedItems.length > 0) {
        // TODO
        const temp = nestedItems[0][0];
        edges.push({
          id: `sub-${index}-0`,
          type: 'Data',
          source: `tx-${temp}`,
          sourceHandle: 'result:object[]',
          target: id,
          targetHandle: 'objects:object[]',
        });
      }
    }

    if (typeof address !== 'string' && 'Input' in address) {
      edges.push({
        id: `sub-${index}-1`,
        type: 'Data',
        source: `input-${address.Input}`,
        sourceHandle: 'inputs:address',
        target: id,
        targetHandle: 'address:address',
      });
    }
  }

  return {
    edges,
    inputs,
  };
};
