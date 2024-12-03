import { ProgrammableTransaction, SuiTransaction } from '@mysten/sui/client';
import { Edge, Node } from '@xyflow/react';
import { enqueueSnackbar } from 'notistack';

export const makeMoveVec = (
  index: number,
  ptb: ProgrammableTransaction,
  suiTx: SuiTransaction,
  id: string,
): { edges: Edge[]; inputs: Node[] } => {
  const edges: Edge[] = [];
  const inputs: Node[] = [];

  if ('MakeMoveVec' in suiTx) {
    //
  }

  return {
    edges,
    inputs,
  };
};
