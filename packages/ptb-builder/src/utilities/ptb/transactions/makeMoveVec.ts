import { ProgrammableTransaction, SuiTransaction } from '@mysten/sui/client';
import { Edge } from '@xyflow/react';

import { PTBNode } from '../../../PTBFlow/nodes';

export const makeMoveVec = (
  index: number,
  ptb: ProgrammableTransaction,
  suiTx: SuiTransaction,
  id: string,
): { edges: Edge[]; inputs: PTBNode[] } => {
  const edges: Edge[] = [];
  const inputs: PTBNode[] = [];

  if ('MakeMoveVec' in suiTx) {
    //
  }

  return {
    edges,
    inputs,
  };
};
