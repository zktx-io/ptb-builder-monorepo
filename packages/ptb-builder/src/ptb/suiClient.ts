import type { ClientWithCoreApi, SuiClientTypes } from '@mysten/sui/client';
import { SuiGraphQLClient } from '@mysten/sui/graphql';
import { SuiGrpcClient } from '@mysten/sui/grpc';

import type { Chain } from '../types';

export type PtbCoreClientTransport = 'grpc' | 'graphql';
export const PTB_SUI_NETWORKS = ['mainnet', 'testnet', 'devnet'] as const;
export type PtbSuiNetwork = (typeof PTB_SUI_NETWORKS)[number];

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

export type PtbLoadedTransaction = Pick<
  SuiClientTypes.Transaction<PtbTransactionLoadInclude>,
  'digest' | 'status' | 'transaction'
>;

export type PtbLoadedTransactionResult =
  | {
      $kind: 'Transaction';
      Transaction: PtbLoadedTransaction;
      FailedTransaction?: never;
    }
  | {
      $kind: 'FailedTransaction';
      Transaction?: never;
      FailedTransaction: PtbLoadedTransaction;
    };

export type PtbRawProgrammableTransactionInput = {
  inputs: unknown[];
  commands: unknown[];
};

function chainToSupportedNetwork(chain: Chain): PtbSuiNetwork {
  const network = chain.slice('sui:'.length) as PtbSuiNetwork;
  if (!PTB_SUI_NETWORKS.includes(network)) {
    throw new Error(`Unsupported Sui network for PTB Builder: ${chain}`);
  }
  return network;
}

export function suiNetworkToChain(network: PtbSuiNetwork): Chain {
  return `sui:${network}` as Chain;
}

export function supportedNetworksForTransport(
  transport: PtbCoreClientTransport = 'grpc',
): readonly PtbSuiNetwork[] {
  return PTB_SUI_NETWORKS.filter((network) =>
    supportsNetworkForTransport(network, transport),
  );
}

export function supportsNetworkForTransport(
  network: PtbSuiNetwork,
  transport: PtbCoreClientTransport = 'grpc',
): boolean {
  const chain = suiNetworkToChain(network);
  return transport === 'graphql'
    ? Boolean(GRAPHQL_URLS[chain])
    : Boolean(GRPC_URLS[chain]);
}

export function createPtbCoreClient(
  chain: Chain,
  options: { transport?: PtbCoreClientTransport } = {},
): PtbCoreClient {
  const transport = options.transport ?? 'grpc';
  const network = chainToSupportedNetwork(chain);
  if (!supportsNetworkForTransport(network, transport)) {
    const label = transport === 'graphql' ? 'GraphQL' : 'gRPC';
    throw new Error(
      `No verified Sui ${label} endpoint for ${chain}. Use supportedNetworksForTransport('${transport}') to discover supported networks.`,
    );
  }

  if (transport === 'graphql') {
    return new SuiGraphQLClient({
      network,
      url: GRAPHQL_URLS[chain]!,
    });
  }

  return new SuiGrpcClient({
    network,
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
): PtbLoadedTransaction {
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
