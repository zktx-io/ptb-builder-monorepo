import type { ClientWithCoreApi, SuiClientTypes } from '@mysten/sui/client';
import { SuiGraphQLClient } from '@mysten/sui/graphql';
import { SuiGrpcClient } from '@mysten/sui/grpc';

import type { Chain } from '../types';

export type PtbCoreClientTransport = 'grpc' | 'graphql';
export type PtbSuiNetwork = 'mainnet' | 'testnet' | 'devnet';

const GRPC_URLS: Record<Chain, string> = {
  'sui:mainnet': 'https://fullnode.mainnet.sui.io:443',
  'sui:testnet': 'https://fullnode.testnet.sui.io:443',
  'sui:devnet': 'https://fullnode.devnet.sui.io:443',
};

const GRAPHQL_URLS: Partial<Record<Chain, string>> = {
  'sui:mainnet': 'https://sui-mainnet.mystenlabs.com/graphql',
  'sui:testnet': 'https://graphql.testnet.sui.io/graphql',
};

export type PtbCoreClient = ClientWithCoreApi;

export type PtbTransactionLoadInclude = { transaction: true; effects: true };

export const PTB_TRANSACTION_LOAD_INCLUDE: PtbTransactionLoadInclude = {
  transaction: true,
  effects: true,
};

export type PtbLoadedTransactionResult =
  SuiClientTypes.TransactionResult<PtbTransactionLoadInclude>;

export type PtbRawProgrammableTransactionInput = {
  inputs: unknown[];
  commands: unknown[];
};

export function chainToSuiNetwork(chain: Chain): SuiClientTypes.Network {
  return chain.slice('sui:'.length) as SuiClientTypes.Network;
}

export function suiNetworkToChain(network: PtbSuiNetwork): Chain {
  return `sui:${network}` as Chain;
}

export function createPtbCoreClient(
  chain: Chain,
  options: { transport?: PtbCoreClientTransport } = {},
): PtbCoreClient {
  if (options.transport === 'graphql') {
    const url = GRAPHQL_URLS[chain];
    if (!url) {
      throw new Error(`No verified Sui GraphQL endpoint for ${chain}`);
    }

    return new SuiGraphQLClient({
      network: chainToSuiNetwork(chain),
      url,
    });
  }

  return new SuiGrpcClient({
    network: chainToSuiNetwork(chain),
    baseUrl: GRPC_URLS[chain],
  });
}

export function createPtbCoreClientForNetwork(
  network: PtbSuiNetwork,
  options: { transport?: PtbCoreClientTransport } = {},
): PtbCoreClient {
  return createPtbCoreClient(suiNetworkToChain(network), options);
}

export function selectCoreTransactionResult(
  result: PtbLoadedTransactionResult,
): SuiClientTypes.Transaction<PtbTransactionLoadInclude> {
  return result.$kind === 'Transaction'
    ? result.Transaction
    : result.FailedTransaction;
}

export function coreTransactionResultToRawProgrammableTransactionInput(
  result: PtbLoadedTransactionResult,
): PtbRawProgrammableTransactionInput | undefined {
  const transaction = selectCoreTransactionResult(result).transaction;
  if (
    !transaction ||
    !Array.isArray(transaction.inputs) ||
    !Array.isArray(transaction.commands)
  ) {
    return undefined;
  }
  return {
    inputs: transaction.inputs,
    commands: transaction.commands,
  };
}
