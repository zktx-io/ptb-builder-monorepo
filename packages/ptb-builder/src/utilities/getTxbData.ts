import {
  getFullnodeUrl,
  SuiClient,
  SuiTransactionBlock,
} from '@mysten/sui/client';

import { NETWORK } from '../provider';

export const getTxbData = async (
  network: NETWORK,
  txHash: string,
): Promise<SuiTransactionBlock> => {
  try {
    const client = new SuiClient({
      url: getFullnodeUrl(network),
    });
    const res = await client.getTransactionBlock({
      digest: txHash!,
      options: {
        showInput: true,
        showObjectChanges: true,
      },
    });
    if (res.transaction) {
      return res.transaction;
    } else {
      throw new Error('No transaction found');
    }
  } catch (error) {
    throw new Error(`Failed to get transaction data: ${error}`);
  }
};
