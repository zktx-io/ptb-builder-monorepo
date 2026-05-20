import type { ClientWithCoreApi, SuiClientTypes } from '@mysten/sui/client';
import { isSuiGraphQLClient, SuiGraphQLClient } from '@mysten/sui/graphql';
import { GrpcTypes, isSuiGrpcClient, SuiGrpcClient } from '@mysten/sui/grpc';

import type { Chain } from '../types';
import { sortMovePackageFunctionIndex } from './movePackageIndex';
import type {
  MovePackageFunctionEntry,
  MovePackageFunctionIndex,
  MovePackageFunctionVisibility,
} from './movePackageIndex';

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
const GRAPHQL_PAGE_SIZE = 100;
const GRAPHQL_FUNCTION_FETCH_CONCURRENCY = 6;

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

export type PtbMovePackageFunctionIndex = {
  packageId: string;
  modules: MovePackageFunctionIndex;
};

type GraphQLPageInfo = {
  hasNextPage: boolean;
  endCursor?: string;
};

type GraphQLOpenMoveTypeSignature = {
  ref?: string | null;
};

type GraphQLMoveFunctionNode = {
  name?: string | null;
  visibility?: string | null;
  isEntry?: boolean | null;
  return?: Array<{ signature?: GraphQLOpenMoveTypeSignature | null } | null>;
};

type GraphQLMoveModuleNode = {
  name?: string | null;
  functions?: {
    nodes?: Array<GraphQLMoveFunctionNode | null | undefined>;
    pageInfo?: {
      hasNextPage?: boolean;
      endCursor?: string;
    };
  } | null;
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

export async function listMovePackageFunctionIndex(
  client: PtbCoreClient,
  packageId: string,
): Promise<PtbMovePackageFunctionIndex> {
  if (isSuiGrpcClient(client)) {
    return listGrpcMovePackageFunctionIndex(client, packageId);
  }
  if (isSuiGraphQLClient(client)) {
    return listGraphQLMovePackageFunctionIndex(client, packageId);
  }
  throw new Error(
    'Move package discovery requires a PTB Builder gRPC or GraphQL client.',
  );
}

async function listGrpcMovePackageFunctionIndex(
  client: SuiGrpcClient,
  packageId: string,
): Promise<PtbMovePackageFunctionIndex> {
  const resolvedPackageId = (
    await client.core.mvr.resolvePackage({
      package: packageId,
    })
  ).package;
  const { response } = await client.movePackageService.getPackage({
    packageId: resolvedPackageId,
  });
  const pkg = response.package;
  if (!pkg) {
    throw new Error(`Move package ${packageId} was not found.`);
  }

  const modules: MovePackageFunctionIndex = {};
  for (const module of pkg.modules) {
    if (!module.name) continue;
    const functions = module.functions
      .map(grpcMovePackageFunctionEntry)
      .filter(
        (entry): entry is MovePackageFunctionEntry => entry !== undefined,
      );
    if (functions.length > 0) {
      modules[module.name] = functions;
    }
  }

  return {
    packageId: pkg.storageId || resolvedPackageId,
    modules: sortMovePackageFunctionIndex(modules),
  };
}

async function listGraphQLMovePackageFunctionIndex(
  client: SuiGraphQLClient,
  packageId: string,
): Promise<PtbMovePackageFunctionIndex> {
  const modules: MovePackageFunctionIndex = {};
  const remainingFunctionPageFetches: Array<() => Promise<void>> = [];
  let after: string | undefined = undefined;

  do {
    const { data, errors } = await client.query<{
      package?: {
        modules?: {
          nodes?: Array<GraphQLMoveModuleNode | null | undefined>;
          pageInfo?: {
            hasNextPage?: boolean;
            endCursor?: string;
          };
        };
      };
    }>({
      query: `
        query PTBMovePackageFunctions(
          $package: SuiAddress!
          $moduleFirst: Int!
          $moduleAfter: String
          $functionFirst: Int!
        ) {
          package(address: $package) {
            modules(first: $moduleFirst, after: $moduleAfter) {
              nodes {
                name
                functions(first: $functionFirst) {
                  nodes {
                    name
                    visibility
                    isEntry
                    return { signature }
                  }
                  pageInfo { hasNextPage endCursor }
                }
              }
              pageInfo { hasNextPage endCursor }
            }
          }
        }
      `,
      variables: {
        package: packageId,
        moduleFirst: GRAPHQL_PAGE_SIZE,
        moduleAfter: after,
        functionFirst: GRAPHQL_PAGE_SIZE,
      },
    });
    if (errors?.length) throw graphQLErrors('Move package discovery', errors);
    const pkg = data?.package;
    if (!pkg) throw new Error(`Move package ${packageId} was not found.`);
    const packageModules = pkg.modules;
    if (!packageModules) break;

    const nodes = Array.isArray(packageModules.nodes)
      ? packageModules.nodes
      : [];
    for (const node of nodes) {
      if (!node) continue;
      const moduleName = node.name;
      if (typeof moduleName !== 'string' || moduleName === '') continue;
      const functions = node.functions;
      appendMovePackageFunctionEntries(
        modules,
        moduleName,
        graphQLMovePackageFunctionEntries(functions?.nodes),
      );

      const functionPageInfo = parseGraphQLPageInfo(functions?.pageInfo);
      if (functionPageInfo.hasNextPage && functionPageInfo.endCursor) {
        remainingFunctionPageFetches.push(async () => {
          const entries = await listGraphQLMoveModuleFunctionEntriesAfter(
            client,
            packageId,
            moduleName,
            functionPageInfo.endCursor!,
          );
          appendMovePackageFunctionEntries(modules, moduleName, entries);
        });
      }
    }

    const pageInfo = parseGraphQLPageInfo(packageModules.pageInfo);
    after = pageInfo.hasNextPage ? pageInfo.endCursor : undefined;
  } while (after);

  await mapWithConcurrency(
    remainingFunctionPageFetches,
    GRAPHQL_FUNCTION_FETCH_CONCURRENCY,
    (fetchPage) => fetchPage(),
  );

  return {
    packageId,
    modules: sortMovePackageFunctionIndex(modules),
  };
}

async function listGraphQLMoveModuleFunctionEntriesAfter(
  client: SuiGraphQLClient,
  packageId: string,
  moduleName: string,
  startAfter: string,
): Promise<MovePackageFunctionEntry[]> {
  const entries: MovePackageFunctionEntry[] = [];
  let after: string | undefined = startAfter;

  do {
    const { data, errors } = await client.query<{
      package?: {
        module?: {
          functions?: {
            nodes?: Array<GraphQLMoveFunctionNode | null | undefined>;
            pageInfo?: {
              hasNextPage?: boolean;
              endCursor?: string;
            };
          };
        };
      };
    }>({
      query: `
        query PTBMoveModuleFunctions(
          $package: SuiAddress!
          $module: String!
          $first: Int!
          $after: String
        ) {
          package(address: $package) {
            module(name: $module) {
              functions(first: $first, after: $after) {
                nodes {
                  name
                  visibility
                  isEntry
                  return { signature }
                }
                pageInfo { hasNextPage endCursor }
              }
            }
          }
        }
      `,
      variables: {
        package: packageId,
        module: moduleName,
        first: GRAPHQL_PAGE_SIZE,
        after,
      },
    });
    if (errors?.length) throw graphQLErrors('Move module discovery', errors);
    const module = data?.package?.module;
    if (!module) return entries;
    const functions = module.functions;
    if (!functions) break;
    entries.push(...graphQLMovePackageFunctionEntries(functions.nodes));
    const pageInfo = parseGraphQLPageInfo(functions.pageInfo);
    after = pageInfo.hasNextPage ? pageInfo.endCursor : undefined;
  } while (after);

  return entries;
}

function grpcMovePackageFunctionEntry(
  fn: GrpcTypes.FunctionDescriptor,
): MovePackageFunctionEntry | undefined {
  if (typeof fn.name !== 'string' || fn.name === '') return undefined;
  const visibility = grpcFunctionVisibility(fn.visibility);
  const hasReferenceReturn = fn.returns.some(grpcOpenSignatureHasReference);
  if (
    !isMovePackageFunctionCallable({
      visibility,
      isEntry: fn.isEntry === true,
      hasReferenceReturn,
    })
  ) {
    return undefined;
  }
  return {
    name: fn.name,
    visibility,
    isEntry: fn.isEntry === true,
  };
}

function graphQLMovePackageFunctionEntries(
  nodes: Array<GraphQLMoveFunctionNode | null | undefined> | undefined,
): MovePackageFunctionEntry[] {
  if (!Array.isArray(nodes)) return [];
  return nodes
    .map(graphQLMovePackageFunctionEntry)
    .filter((entry): entry is MovePackageFunctionEntry => entry !== undefined);
}

function graphQLMovePackageFunctionEntry(
  fn: GraphQLMoveFunctionNode | null | undefined,
): MovePackageFunctionEntry | undefined {
  if (typeof fn?.name !== 'string' || fn.name === '') return undefined;
  const visibility = graphQLFunctionVisibility(fn.visibility);
  const returns = Array.isArray(fn.return) ? fn.return : [];
  const hasReferenceReturn = returns.some((item) =>
    graphQLOpenSignatureHasReference(item?.signature),
  );
  if (
    !isMovePackageFunctionCallable({
      visibility,
      isEntry: fn.isEntry === true,
      hasReferenceReturn,
    })
  ) {
    return undefined;
  }
  return {
    name: fn.name,
    visibility,
    isEntry: fn.isEntry === true,
  };
}

export function isMovePackageFunctionCallable(options: {
  visibility: MovePackageFunctionVisibility;
  isEntry: boolean;
  hasReferenceReturn: boolean;
}): boolean {
  return (
    !options.hasReferenceReturn &&
    (options.visibility === 'public' || options.isEntry)
  );
}

function grpcFunctionVisibility(
  visibility: GrpcTypes.FunctionDescriptor_Visibility | undefined,
): MovePackageFunctionVisibility {
  switch (visibility) {
    case GrpcTypes.FunctionDescriptor_Visibility.PUBLIC:
      return 'public';
    case GrpcTypes.FunctionDescriptor_Visibility.PRIVATE:
      return 'private';
    case GrpcTypes.FunctionDescriptor_Visibility.FRIEND:
      return 'friend';
    default:
      return 'unknown';
  }
}

function graphQLFunctionVisibility(
  visibility: string | null | undefined,
): MovePackageFunctionVisibility {
  switch (visibility) {
    case 'PUBLIC':
    case 'public':
      return 'public';
    case 'PRIVATE':
    case 'private':
      return 'private';
    case 'FRIEND':
    case 'friend':
      return 'friend';
    default:
      return 'unknown';
  }
}

function grpcOpenSignatureHasReference(
  signature: GrpcTypes.OpenSignature,
): boolean {
  return (
    signature.reference === GrpcTypes.OpenSignature_Reference.IMMUTABLE ||
    signature.reference === GrpcTypes.OpenSignature_Reference.MUTABLE
  );
}

function graphQLOpenSignatureHasReference(
  signature: GraphQLOpenMoveTypeSignature | null | undefined,
): boolean {
  return signature?.ref === '&' || signature?.ref === '&mut';
}

function appendMovePackageFunctionEntries(
  modules: MovePackageFunctionIndex,
  moduleName: string,
  entries: readonly MovePackageFunctionEntry[],
): void {
  if (entries.length === 0) return;
  modules[moduleName] = [...(modules[moduleName] ?? []), ...entries];
}

async function mapWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      for (;;) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= items.length) return;
        await mapper(items[index]);
      }
    },
  );
  await Promise.all(workers);
}

function parseGraphQLPageInfo(
  value:
    | {
        hasNextPage?: boolean;
        endCursor?: string;
      }
    | undefined,
): GraphQLPageInfo {
  return {
    hasNextPage: value?.hasNextPage === true,
    endCursor:
      typeof value?.endCursor === 'string' ? value.endCursor : undefined,
  };
}

function graphQLErrors(
  context: string,
  errors: Array<{ message: string }>,
): Error {
  return new Error(
    `${context} failed: ${errors.map((error) => error.message).join(' ')}`,
  );
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
