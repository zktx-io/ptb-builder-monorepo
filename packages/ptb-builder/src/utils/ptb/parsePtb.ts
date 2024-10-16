import {
  ProgrammableTransaction,
  TransactionBlockData,
} from '@mysten/sui/client';
import { Edge, Node } from '@xyflow/react';

import { createInputs } from './createInputs';
import { createTransactions } from './createTransactions';

export const parsePtb = (data: TransactionBlockData) => {
  const txs: Node[] = [];
  const inputs: Node[] = [];
  const edges: Edge[] = [];

  if (data.transaction.kind === 'ProgrammableTransaction') {
    const ptb = data.transaction as ProgrammableTransaction;

    txs.push({
      id: '@start',
      position: { x: 0, y: 0 },
      type: 'Start',
      data: {
        label: 'Start',
      },
    });

    txs.push({
      id: '@end',
      position: { x: 0, y: 0 },
      type: 'End',
      data: {
        label: 'End',
      },
    });

    inputs.push({
      id: '@gasCoin',
      position: { x: 0, y: 0 },
      type: 'SuiObjectGas',
      data: {
        label: 'SuiObjectGas',
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
        inputs: datas,
        edges: subEdges,
      } = createTransactions(index, ptb);
      txs.push(tx);
      inputs.push(...datas);
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
  }

  const usedInputIds = new Set(edges.map((edge) => edge.source));
  const filteredInputs = inputs.filter((input) => usedInputIds.has(input.id));

  return { nodes: [...txs, ...filteredInputs], edges };
};
