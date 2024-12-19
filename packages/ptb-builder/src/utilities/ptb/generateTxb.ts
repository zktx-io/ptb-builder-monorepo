import { Transaction } from '@mysten/sui/transactions';

import { enqueueToast } from '../../provider';
import { PTBEdge, PTBNode } from '../../ptbFlow/nodes';
import { PTBNestedResult } from '../../ptbFlow/nodes/types';

export const generateTxb = async (
  nodes: PTBNode[],
  edges: PTBEdge[],
): Promise<Transaction | undefined> => {
  let tx = new Transaction();
  const results: { [key: string]: PTBNestedResult[] } = {};
  const excutable = nodes.filter((item) => !!item.data.excute);

  excutable.forEach((item) => {
    try {
      const params: { [key: string]: { node: PTBNode; edge: PTBEdge } } = {};
      edges
        .filter((edge) => edge.type === 'Data' && edge.target === item.id)
        .forEach((edge) => {
          if (edge.targetHandle && !params[edge.targetHandle]) {
            params[edge.targetHandle] = {
              node: nodes.find((node) => node.id === edge.source)!,
              edge,
            };
          }
        });
      const result = item.data.excute!(tx, params, results);
      if (result && result.transaction) {
        if (result.results) {
          results[item.id] = result.results;
        }
        tx = result.transaction;
      }
    } catch (error) {
      enqueueToast(`${error}`, { variant: 'error' });
    }
  });

  return tx;
};
