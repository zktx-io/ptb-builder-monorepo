import type { ClientWithCoreApi, SuiClientTypes } from '@mysten/sui/client';
import { SuiGraphQLClient } from '@mysten/sui/graphql';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { parseObjectId } from '@zktx.io/ptb-model';

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

const RAW_OBJECT_ARG_KINDS = new Set([
  'ImmOrOwnedObject',
  'SharedObject',
  'Receiving',
]);

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

export function objectIdsFromRawProgrammableTransactionInput(
  programmable: PtbRawProgrammableTransactionInput,
): string[] {
  const ids = new Set<string>();
  for (const input of programmable.inputs) {
    const objectId = objectIdFromRawCallArg(input);
    if (objectId) ids.add(objectId);
  }
  return [...ids];
}

function objectIdFromRawCallArg(value: unknown): string | undefined {
  const input = asRecord(value);
  if (!input) return undefined;
  const object =
    'object' in input
      ? input.object
      : 'Object' in input
        ? input.Object
        : undefined;
  return objectIdFromRawObjectArg(object);
}

function objectIdFromRawObjectArg(value: unknown): string | undefined {
  const payload = rawObjectArgPayload(value);
  if (!payload) return undefined;
  return parseObjectId(payload?.objectId);
}

function rawObjectArgPayload(
  value: unknown,
): Record<string, unknown> | undefined {
  const object = asRecord(value);
  if (!object) return undefined;

  const sdkKind = typeof object.$kind === 'string' ? object.$kind : undefined;
  const modelKind = typeof object.kind === 'string' ? object.kind : undefined;
  if (sdkKind && modelKind && sdkKind !== modelKind) return undefined;

  const explicitKind = sdkKind ?? modelKind;
  if (explicitKind) {
    if (!RAW_OBJECT_ARG_KINDS.has(explicitKind)) return undefined;
    return asRecord(object[explicitKind]) ?? object;
  }

  const variantKeys = Object.keys(object).filter(
    (key) => key !== 'type' && RAW_OBJECT_ARG_KINDS.has(key),
  );
  if (variantKeys.length === 1) {
    return asRecord(object[variantKeys[0]]);
  }

  return object;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined;
}
