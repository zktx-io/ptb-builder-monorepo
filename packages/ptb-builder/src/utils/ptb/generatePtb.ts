import { Transaction } from '@mysten/sui/transactions';
import { Edge, Node } from '@xyflow/react';

export const generatePtb = async (
  nodes: Node[],
  edges: Edge[],
): Promise<Transaction | undefined> => {
  let tx = new Transaction();
  const results: { id: string; value: any }[] = [];

  const excutable = nodes.filter((item) => !!item.data.excute);

  for (const item of excutable) {
    const params: { source: Node; target: string }[] = edges
      .filter(
        (edge) =>
          edge.target === item.id &&
          edge.source !== '@start' &&
          !!edge.targetHandle &&
          edge.targetHandle !== 'tgt:process',
      )
      .map((edge) => {
        const node = nodes.find((node) => node.id === edge.source);
        return { source: node!, target: edge.targetHandle! };
      });
    if (tx) {
      const res: { transaction: Transaction; result: any } = (
        item.data as any
      ).excute(tx, params, results);
      if (res && res.transaction) {
        results.push({ id: item.id, value: res.result });
        tx = res.transaction;
      } else {
        return undefined;
      }
    }
  }

  return tx;
};
