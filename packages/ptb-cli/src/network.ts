import type { SuiClientTypes } from '@mysten/sui/client';
import { SuiGraphQLClient } from '@mysten/sui/graphql';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { GrpcWebFetchTransport } from '@protobuf-ts/grpcweb-transport';

import { PtbCliError } from './errors.js';

const PTB_CLI_NETWORKS = ['mainnet', 'testnet', 'devnet'] as const;
export type PtbCliNetwork = (typeof PTB_CLI_NETWORKS)[number];
const PTB_CLI_TRANSPORTS = ['grpc', 'graphql'] as const;
export type PtbCliTransport = (typeof PTB_CLI_TRANSPORTS)[number];

const GRPC_URLS: Record<PtbCliNetwork, string> = {
  mainnet: 'https://fullnode.mainnet.sui.io:443',
  testnet: 'https://fullnode.testnet.sui.io:443',
  devnet: 'https://fullnode.devnet.sui.io:443',
};

const GRAPHQL_URLS: Record<PtbCliNetwork, string> = {
  mainnet: 'https://graphql.mainnet.sui.io/graphql',
  testnet: 'https://graphql.testnet.sui.io/graphql',
  devnet: 'https://graphql.devnet.sui.io/graphql',
};

export const DEFAULT_NETWORK_TIMEOUT_MS = 30_000;

type TransactionInclude = { transaction: true };
type LoadedTransactionResult = SuiClientTypes.TransactionResult<TransactionInclude>;

interface FetchRawTransactionOptions {
  grpcUrl?: string;
  graphqlUrl?: string;
  timeoutMs?: number;
  transport?: PtbCliTransport;
}

export function isPtbCliNetwork(value: string): value is PtbCliNetwork {
  return PTB_CLI_NETWORKS.includes(value as PtbCliNetwork);
}

export function isPtbCliTransport(value: string): value is PtbCliTransport {
  return PTB_CLI_TRANSPORTS.includes(value as PtbCliTransport);
}

export async function fetchRawTransactionByDigest(
  network: PtbCliNetwork,
  digest: string,
  options: FetchRawTransactionOptions = {},
): Promise<{ inputs: unknown[]; commands: unknown[] }> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_NETWORK_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    throw new PtbCliError({
      code: 'usage.timeout',
      message: '--timeout-ms must be a positive safe integer.',
      exitCode: 2,
    });
  }
  const transport =
    options.transport ?? (options.graphqlUrl ? 'graphql' : 'grpc');
  const abortController = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    abortController.abort();
  }, timeoutMs);
  const fetchWithTimeout: typeof fetch = (input, init) =>
    fetch(input, {
      ...init,
      signal: init?.signal
        ? AbortSignal.any([abortController.signal, init.signal])
        : abortController.signal,
    });
  const client: Pick<SuiClientTypes.TransportMethods, 'getTransaction'> =
    transport === 'graphql'
      ? new SuiGraphQLClient({
          fetch: fetchWithTimeout,
          network,
          url: options.graphqlUrl ?? GRAPHQL_URLS[network],
        }).core
      : new SuiGrpcClient({
          network,
          transport: new GrpcWebFetchTransport({
            baseUrl: options.grpcUrl ?? GRPC_URLS[network],
            fetch: fetchWithTimeout,
          }),
        }).core;
  let result: LoadedTransactionResult;
  try {
    result = await Promise.race([
      client.getTransaction({
        digest,
        include: { transaction: true },
      }),
      new Promise<never>((_resolve, reject) => {
        abortController.signal.addEventListener(
          'abort',
          () => reject(new Error(`${transport} request timed out`)),
          { once: true },
        );
      }),
    ]);
  } catch (error) {
    if (error instanceof PtbCliError) throw error;
    if (timedOut) {
      throw new PtbCliError({
        cause:
          error instanceof Error
            ? { kind: 'network', message: error.message }
            : undefined,
        code: 'network.timeout',
        message: `${transport} request exceeded ${timeoutMs}ms.`,
      });
    }
    throw new PtbCliError({
      cause:
        error instanceof Error
          ? { kind: 'network', message: error.message }
          : undefined,
      code: 'network.fetch',
      message: `Failed to fetch transaction ${digest} through ${transport}.`,
    });
  } finally {
    clearTimeout(timeout);
  }

  const transaction =
    result.$kind === 'Transaction'
      ? result.Transaction.transaction
      : result.$kind === 'FailedTransaction'
        ? result.FailedTransaction.transaction
        : undefined;
  if (
    !transaction ||
    !Array.isArray(transaction.inputs) ||
    !Array.isArray(transaction.commands)
  ) {
    throw new PtbCliError({
      code: 'transaction.unsupported',
      message: 'Only ProgrammableTransaction data is supported.',
    });
  }

  return {
    inputs: transaction.inputs,
    commands: transaction.commands,
  };
}
