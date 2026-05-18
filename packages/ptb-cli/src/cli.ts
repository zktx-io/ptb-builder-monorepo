import { fromHex } from '@mysten/bcs';
import { Transaction } from '@mysten/sui/transactions';
import {
  rawTransactionToIR,
  type TransactionDiagnostic,
  transactionIRToMermaid,
} from '@zktx.io/ptb-model';

import { normalizeCliError, PtbCliError } from './errors.js';
import type { CliErrorCause } from './errors.js';
import type { PtbCliNetwork, PtbCliTransport } from './network.js';
import {
  DEFAULT_NETWORK_TIMEOUT_MS,
  fetchRawTransactionByDigest,
  isPtbCliNetwork,
  isPtbCliTransport,
} from './network.js';

type CliJsonCommand = 'help' | 'mermaid' | 'unknown';

interface HelpCliOptions {
  command: 'help';
  json: boolean;
}

interface MermaidCliOptions {
  command: 'mermaid';
  input:
    | { kind: 'digest'; digest: string; network: PtbCliNetwork }
    | { kind: 'transactionData'; value: string };
  json: boolean;
  network: {
    grpcUrl?: string;
    graphqlUrl?: string;
    timeoutMs: number;
    transport?: PtbCliTransport;
  };
}

type ParsedCliOptions = HelpCliOptions | MermaidCliOptions;

interface SuccessOutput {
  ok: true;
  command: 'mermaid';
  diagnostics: readonly TransactionDiagnostic[];
  mermaid: string;
  summary: {
    commands: number;
    diagnosticCount: number;
    inputs: number;
  };
}

interface HelpOutput {
  ok: true;
  command: 'help';
  usage: string;
}

interface ErrorOutput {
  ok: false;
  command: CliJsonCommand;
  diagnostics?: readonly TransactionDiagnostic[];
  error: {
    cause?: CliErrorCause;
    code: string;
    message: string;
  };
}

type JsonOutput = ErrorOutput | HelpOutput | SuccessOutput;

interface WriteResult {
  error?: unknown;
  ok: boolean;
}

export interface CliRuntime {
  stdout?: { write(chunk: string): unknown };
  stderr?: { write(chunk: string): unknown };
}

const USAGE = `Usage:
  ptb mermaid <transaction-data-hex>
  ptb mermaid <mainnet|testnet|devnet> <transaction-digest>

Options:
  --json                    Emit a machine-readable JSON envelope.
  --transport <grpc|graphql> Read-only digest lookup transport. Default: grpc.
  --grpc-url <url>          Override the network gRPC endpoint.
  --graphql-url <url>       Override the network GraphQL endpoint.
  --timeout-ms <ms>         Network digest lookup timeout. Default: 30000.
  --help                    Show this help.
`;

function requireValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new PtbCliError({
      code: 'usage.value',
      message: `${flag} requires a value.`,
      exitCode: 2,
    });
  }
  return value;
}

function parseHttpUrl(value: string, flag: string, code: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new PtbCliError({
      code,
      message: `${flag} must be a valid URL.`,
      exitCode: 2,
    });
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new PtbCliError({
      code,
      message: `${flag} must use http or https.`,
      exitCode: 2,
    });
  }
  return value;
}

function parseTimeoutMs(value: string): number {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new PtbCliError({
      code: 'usage.timeout',
      message: '--timeout-ms must be a positive safe integer.',
      exitCode: 2,
    });
  }
  const timeoutMs = Number(value);
  if (!Number.isSafeInteger(timeoutMs)) {
    throw new PtbCliError({
      code: 'usage.timeout',
      message: '--timeout-ms must be a positive safe integer.',
      exitCode: 2,
    });
  }
  return timeoutMs;
}

function parseCliArgs(args: string[]): ParsedCliOptions {
  const json = args.includes('--json');
  if (args.includes('--help') || args.includes('-h')) {
    return { command: 'help', json };
  }
  if (args[0] !== 'mermaid') {
    throw new PtbCliError({
      code: 'usage.command',
      message: USAGE,
      exitCode: 2,
    });
  }

  let grpcUrl: string | undefined;
  let graphqlUrl: string | undefined;
  let timeoutMs = DEFAULT_NETWORK_TIMEOUT_MS;
  let transport: PtbCliTransport | undefined;
  const positional: string[] = [];

  for (let i = 1; i < args.length; i += 1) {
    const arg = args[i];
    switch (arg) {
      case '--json':
        break;
      case '--stdin':
        throw unsupportedInputError();
      case '--grpc-url':
        grpcUrl = parseHttpUrl(
          requireValue(args, i, arg),
          arg,
          'usage.grpcUrl',
        );
        i += 1;
        break;
      case '--graphql-url':
        graphqlUrl = parseHttpUrl(
          requireValue(args, i, arg),
          arg,
          'usage.graphqlUrl',
        );
        i += 1;
        break;
      case '--timeout-ms':
        timeoutMs = parseTimeoutMs(requireValue(args, i, arg));
        i += 1;
        break;
      case '--transport':
        transport = requireValue(args, i, arg) as PtbCliTransport;
        if (!isPtbCliTransport(transport)) {
          throw new PtbCliError({
            code: 'usage.transport',
            message: '--transport must be grpc or graphql.',
            exitCode: 2,
          });
        }
        i += 1;
        break;
      default:
        if (arg.startsWith('--')) {
          throw new PtbCliError({
            code: 'usage.unknown',
            message: `Unknown option: ${arg}`,
            exitCode: 2,
          });
        }
        positional.push(arg);
    }
  }

  if (grpcUrl !== undefined && graphqlUrl !== undefined) {
    throw new PtbCliError({
      code: 'usage.transport',
      message: 'Use only one endpoint override: --grpc-url or --graphql-url.',
      exitCode: 2,
    });
  }
  if (transport === 'grpc' && graphqlUrl !== undefined) {
    throw new PtbCliError({
      code: 'usage.graphqlUrl',
      message: '--graphql-url requires --transport graphql.',
      exitCode: 2,
    });
  }
  if (transport === 'graphql' && grpcUrl !== undefined) {
    throw new PtbCliError({
      code: 'usage.grpcUrl',
      message: '--grpc-url requires --transport grpc.',
      exitCode: 2,
    });
  }
  if (graphqlUrl !== undefined) {
    transport = 'graphql';
  }

  let input: MermaidCliOptions['input'];
  if (positional.length === 1 && isPtbCliNetwork(positional[0])) {
    throw new PtbCliError({
      code: 'input.network',
      message: 'Network digest lookup requires <network> <transaction-digest>.',
      exitCode: 2,
    });
  } else if (positional.length === 1) {
    const value = positional[0];
    if (isRawJsonInput(value)) {
      throw unsupportedInputError();
    }
    input = { kind: 'transactionData', value };
  } else if (positional.length === 2 && isPtbCliNetwork(positional[0])) {
    input = { kind: 'digest', network: positional[0], digest: positional[1] };
  } else if (positional.length === 2) {
    throw new PtbCliError({
      code: 'usage.network',
      message: 'Network must be mainnet, testnet, or devnet.',
      exitCode: 2,
    });
  } else {
    throw new PtbCliError({
      code: positional.length === 0 ? 'input.missing' : 'usage.input',
      message: USAGE,
      exitCode: 2,
    });
  }

  const isNetworkInput = input.kind === 'digest';
  if ((grpcUrl || graphqlUrl || transport) && !isNetworkInput) {
    throw new PtbCliError({
      code: 'usage.transport',
      message:
        'Network transport options require <network> <transaction-digest>.',
      exitCode: 2,
    });
  }

  return {
    command: 'mermaid',
    input,
    json,
    network: { grpcUrl, graphqlUrl, timeoutMs, transport },
  };
}

function unsupportedInputError(): PtbCliError {
  return new PtbCliError({
    code: 'input.unsupported',
    message:
      'Only hex-encoded Sui TransactionData or <network> <transaction-digest> input is supported.',
    exitCode: 2,
  });
}

function isRawJsonInput(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
}

function isPathLikeInput(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed.startsWith('./') ||
    trimmed.startsWith('../') ||
    trimmed.startsWith('/') ||
    /\.(bcs|bin|bytes|json|txt)$/iu.test(trimmed)
  );
}

function decodeTransactionDataHex(data: string): unknown {
  if (isPathLikeInput(data)) {
    throw unsupportedInputError();
  }

  let bytes: Uint8Array;
  try {
    bytes = fromHex(data);
  } catch (decodeError) {
    throw new PtbCliError({
      cause:
        decodeError instanceof Error
          ? { kind: 'sdk', message: decodeError.message }
          : undefined,
      code: 'decode.transaction',
      message: 'Unable to deserialize Sui TransactionData hex.',
    });
  }

  try {
    return Transaction.from(bytes).getData();
  } catch (transactionError) {
    let transactionKindDecoded = false;
    try {
      Transaction.fromKind(bytes);
      transactionKindDecoded = true;
    } catch {
      // Ignore; this check only classifies TransactionKind bytes.
    }
    if (transactionKindDecoded) {
      throw unsupportedInputError();
    }
    throw new PtbCliError({
      cause:
        transactionError instanceof Error
          ? { kind: 'sdk', message: transactionError.message }
          : undefined,
      code: 'decode.transaction',
      message: 'Unable to deserialize Sui TransactionData hex.',
    });
  }
}

async function rawForOptions(options: MermaidCliOptions): Promise<unknown> {
  switch (options.input.kind) {
    case 'digest':
      return fetchRawTransactionByDigest(
        options.input.network,
        options.input.digest,
        options.network,
      );
    case 'transactionData':
      return decodeTransactionDataHex(options.input.value);
  }
}

function commandForArgs(args: string[]): CliJsonCommand {
  if (args.includes('--help') || args.includes('-h')) return 'help';
  return args[0] === 'mermaid' ? 'mermaid' : 'unknown';
}

function formatJson(output: JsonOutput): string {
  return `${JSON.stringify(
    output,
    (_key, value) => (typeof value === 'bigint' ? value.toString() : value),
    2,
  )}\n`;
}

function formatTextError(error: PtbCliError): string {
  return `error [${error.code}]: ${error.message}\n`;
}

function outputWriteError(error: unknown): PtbCliError {
  return new PtbCliError({
    cause:
      error instanceof Error
        ? { kind: 'system', message: error.message }
        : undefined,
    code: 'output.write',
    message: 'Failed to write CLI output.',
  });
}

function outputSerializeError(error: unknown): PtbCliError {
  return new PtbCliError({
    cause:
      error instanceof Error
        ? { kind: 'system', message: error.message }
        : undefined,
    code: 'output.serialize',
    message: 'Failed to serialize CLI JSON output.',
  });
}

function tryWrite(
  stream: { write(chunk: string): unknown } | undefined,
  text: string,
): WriteResult {
  try {
    stream?.write(text);
    return { ok: true };
  } catch (error) {
    return { error, ok: false };
  }
}

function emitOutputError(
  stdout: { write(chunk: string): unknown },
  stderr: { write(chunk: string): unknown },
  error: PtbCliError,
): number {
  const text = formatTextError(error);
  const stderrResult = tryWrite(stderr, text);
  if (!stderrResult.ok) {
    tryWrite(stdout, text);
  }
  return error.exitCode;
}

function emitCliError(
  args: string[],
  stdout: { write(chunk: string): unknown },
  stderr: { write(chunk: string): unknown },
  error: PtbCliError,
): number {
  const json = args.includes('--json');
  let jsonText: string | undefined;
  if (json) {
    try {
      jsonText = formatJson({
        ok: false,
        command: commandForArgs(args),
        diagnostics: error.diagnostics,
        error: {
          cause: error.causeDetail,
          code: error.code,
          message: error.message,
        },
      });
    } catch (serializeError) {
      jsonText = formatJson({
        ok: false,
        command: commandForArgs(args),
        error: {
          cause: outputSerializeError(serializeError).causeDetail,
          code: 'output.serialize',
          message: 'Failed to serialize CLI JSON output.',
        },
      });
    }
  }
  const result = json
    ? tryWrite(stdout, jsonText ?? '')
    : tryWrite(stderr, formatTextError(error));

  if (result.ok) return error.exitCode;
  return emitOutputError(stdout, stderr, outputWriteError(result.error));
}

function emitSuccess(
  stdout: { write(chunk: string): unknown },
  stderr: { write(chunk: string): unknown },
  text: string,
): number {
  const result = tryWrite(stdout, text);
  if (result.ok) return 0;
  return emitOutputError(stdout, stderr, outputWriteError(result.error));
}

export async function runCli(
  args: string[],
  runtime: CliRuntime = {},
): Promise<number> {
  const stdout = runtime.stdout ?? process.stdout;
  const stderr = runtime.stderr ?? process.stderr;

  try {
    const options = parseCliArgs(args);
    if (options.command === 'help') {
      return emitSuccess(
        stdout,
        stderr,
        options.json
          ? formatJson({ ok: true, command: 'help', usage: USAGE })
          : USAGE,
      );
    }

    const ir = rawTransactionToIR(await rawForOptions(options));
    const mermaid = transactionIRToMermaid(ir, {
      direction: 'LR',
      theme: 'semantic',
    });

    if (options.json) {
      return emitSuccess(
        stdout,
        stderr,
        formatJson({
          ok: true,
          command: 'mermaid',
          diagnostics: ir.diagnostics,
          mermaid,
          summary: {
            commands: ir.commands.length,
            diagnosticCount: ir.diagnostics.length,
            inputs: ir.inputs.length,
          },
        }),
      );
    }
    return emitSuccess(stdout, stderr, `${mermaid}\n`);
  } catch (error) {
    return emitCliError(args, stdout, stderr, normalizeCliError(error));
  }
}
