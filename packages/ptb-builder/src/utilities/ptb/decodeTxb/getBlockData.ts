import {
  ExecutionStatus,
  getFullnodeUrl,
  SuiClient,
  TransactionBlockData,
} from '@mysten/sui/client';

import { NETWORK } from '../../../provider';

export const getBlockData = async (
  network: NETWORK,
  txHash: string,
): Promise<{
  status?: ExecutionStatus;
  data: TransactionBlockData;
}> => {
  try {
    const client = new SuiClient({
      url: getFullnodeUrl(network),
    });
    const res = await client.getTransactionBlock({
      digest: txHash!,
      options: {
        showInput: true,
        showObjectChanges: true,
        showEffects: true,
      },
    });
    if (res.transaction) {
      return {
        status: res.effects ? res.effects.status : undefined,
        data: res.transaction.data,
      };
    } else {
      throw new Error('No transaction found');
    }
  } catch (error) {
    throw new Error(`Failed to get transaction data: ${error}`);
  }
};
