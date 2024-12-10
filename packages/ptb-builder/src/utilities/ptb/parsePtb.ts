import {
  ProgrammableTransaction,
  TransactionBlockData,
} from '@mysten/sui/client';
import { Edge } from '@xyflow/react';

import { createInputs } from './createInputs';
import { createTransactions } from './createTransactions';
import { PTB } from '../../Components/Menu.data';
import { enqueueToast } from '../../Provider/toastManager';
import { PTBNode } from '../../PTBFlow/nodes';

export const parsePtb = (data: TransactionBlockData) => {
  const txs: PTBNode[] = [];
  const inputs: PTBNode[] = [];
  const edges: Edge[] = [];

  if (data.transaction.kind === 'ProgrammableTransaction') {
    const ptb = data.transaction as ProgrammableTransaction;

    txs.push({
      id: '@start',
      position: { x: 0, y: 0 },
      type: PTB.Start.Type,
      data: {
        label: PTB.Start.Name,
      },
    });

    txs.push({
      id: '@end',
      position: { x: 0, y: 0 },
      type: PTB.End.Type,
      data: {
        label: PTB.End.Name,
      },
    });

    inputs.push({
      id: '@gasCoin',
      position: { x: 0, y: 0 },
      type: PTB.ObjectGas.Type,
      data: {
        label: PTB.ObjectGas.Name,
      },
    });

    ptb.inputs.forEach((item, index) => {
      const result = createInputs(index, item);
      inputs.push(...result.nodes);
      edges.push(...result.edges);
    });

    ptb.transactions.forEach((_, index) => {
      const {
        tx,
        inputs: nds,
        edges: subEdges,
      } = createTransactions(index, ptb);
      txs.push(tx);
      inputs.push(...nds);
      edges.push({
        id: `path-${index}`,
        type: 'Path',
        source: index === 0 ? '@start' : txs[txs.length - 2].id,
        sourceHandle: 'src:process',
        target: tx.id,
        targetHandle: 'tgt:process',
      });
      edges.push(...subEdges);
    });

    edges.push({
      id: `path-${edges.length + 1}`,
      type: 'Path',
      source: txs[txs.length - 1].id,
      sourceHandle: 'src:process',
      target: '@end',
      targetHandle: 'tgt:process',
    });
  } else {
    enqueueToast(`not support transaction: ${data.transaction.kind}`, {
      variant: 'warning',
    });
  }

  const usedInputIds = new Set(edges.map((edge) => edge.source));
  const filteredInputs = inputs.filter((input) => usedInputIds.has(input.id));

  return { nodes: [...txs, ...filteredInputs], edges };
};
