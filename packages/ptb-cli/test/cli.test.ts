import { PTBModelError } from '@zktx.io/ptb-model';
import { describe, expect, it } from 'vitest';

import {
  memoryRuntime,
  sampleTransactionDataHex,
  sampleTransactionKindHex,
  withTempFile,
} from './helpers.js';
import { runCli } from '../src/cli.js';
import { normalizeCliError } from '../src/errors.js';

describe('ptb cli mermaid', () => {
  it('renders only full TransactionData hex as a local transaction input', async () => {
    const hex = await sampleTransactionDataHex();
    const io = memoryRuntime();

    const code = await runCli(['mermaid', hex, '--json'], io.runtime);

    expect(code).toBe(0);
    expect(io.stderr()).toBe('');
    const output = JSON.parse(io.stdout());
    expect(output).toMatchObject({
      ok: true,
      command: 'mermaid',
      summary: { commands: 1, diagnosticCount: 0 },
    });
    expect(Object.keys(output).sort()).toEqual([
      'command',
      'diagnostics',
      'mermaid',
      'ok',
      'summary',
    ]);
    expect(output.mermaid).toContain('SplitCoins');
  });

  it('rejects local input variants other than TransactionData hex', async () => {
    const kindHex = await sampleTransactionKindHex();
    const kindIo = memoryRuntime();

    const kindCode = await runCli(
      ['mermaid', kindHex, '--json'],
      kindIo.runtime,
    );

    expect(kindCode).toBe(2);
    expect(JSON.parse(kindIo.stdout()).error.code).toBe('input.unsupported');

    const jsonIo = memoryRuntime();
    const jsonCode = await runCli(
      ['mermaid', '{"commands":[],"inputs":[]}', '--json'],
      jsonIo.runtime,
    );

    expect(jsonCode).toBe(2);
    expect(JSON.parse(jsonIo.stdout()).error.code).toBe('input.unsupported');

    const txHex = await sampleTransactionDataHex();
    await withTempFile(txHex, async (file) => {
      const fileIo = memoryRuntime();

      const fileCode = await runCli(['mermaid', file, '--json'], fileIo.runtime);

      expect(fileCode).toBe(2);
      expect(JSON.parse(fileIo.stdout()).error.code).toBe('input.unsupported');
    });

    const stdinIo = memoryRuntime();
    const stdinCode = await runCli(
      ['mermaid', '--stdin', '--json'],
      stdinIo.runtime,
    );

    expect(stdinCode).toBe(2);
    expect(JSON.parse(stdinIo.stdout()).error.code).toBe('input.unsupported');
  });

  it('prints text help and JSON help without requiring input', async () => {
    const textIo = memoryRuntime();
    const textCode = await runCli(['mermaid', '--help'], textIo.runtime);

    expect(textCode).toBe(0);
    expect(textIo.stdout()).toContain('ptb mermaid <transaction-data-hex>');
    expect(textIo.stdout()).not.toContain('--stdin');
    expect(textIo.stderr()).toBe('');

    const jsonIo = memoryRuntime();
    const jsonCode = await runCli(
      ['mermaid', '--help', '--json'],
      jsonIo.runtime,
    );

    expect(jsonCode).toBe(0);
    const output = JSON.parse(jsonIo.stdout());
    expect(output).toMatchObject({ ok: true, command: 'help' });
    expect(output.usage).toContain('Usage:');
  });

  it('keeps package root imports free of CLI side effects', async () => {
    const api = await import('../src/index.js');

    expect(Object.keys(api).sort()).toEqual(['runCli']);
    expect(api.runCli).toBe(runCli);
  });

  it('reports usage errors with stable JSON command names', async () => {
    const unknownCommandIo = memoryRuntime();
    const unknownCommandCode = await runCli(
      ['unknown', '--json'],
      unknownCommandIo.runtime,
    );

    expect(unknownCommandCode).toBe(2);
    expect(JSON.parse(unknownCommandIo.stdout())).toMatchObject({
      ok: false,
      command: 'unknown',
      error: { code: 'usage.command' },
    });

    const unknownOptionIo = memoryRuntime();
    const unknownOptionCode = await runCli(
      ['mermaid', '--nope', '--json'],
      unknownOptionIo.runtime,
    );

    expect(unknownOptionCode).toBe(2);
    expect(JSON.parse(unknownOptionIo.stdout())).toMatchObject({
      ok: false,
      command: 'mermaid',
      error: { code: 'usage.unknown' },
    });

    const missingInputIo = memoryRuntime();
    const missingInputCode = await runCli(
      ['mermaid', '--json'],
      missingInputIo.runtime,
    );

    expect(missingInputCode).toBe(2);
    expect(JSON.parse(missingInputIo.stdout()).error.code).toBe(
      'input.missing',
    );

    const missingValueIo = memoryRuntime();
    const missingValueCode = await runCli(
      ['mermaid', 'mainnet', 'fake-digest', '--timeout-ms', '--json'],
      missingValueIo.runtime,
    );

    expect(missingValueCode).toBe(2);
    expect(JSON.parse(missingValueIo.stdout()).error.code).toBe('usage.value');

    const textIo = memoryRuntime();
    const textCode = await runCli(['mermaid', '--nope'], textIo.runtime);

    expect(textCode).toBe(2);
    expect(textIo.stderr()).toContain('error [usage.unknown]:');
  });

  it('reports invalid TransactionData hex with stable messages and causes', async () => {
    const decodeIo = memoryRuntime();
    const decodeCode = await runCli(
      ['mermaid', 'not-hex', '--json'],
      decodeIo.runtime,
    );

    const decodeOutput = JSON.parse(decodeIo.stdout());
    expect(decodeCode).toBe(1);
    expect(decodeOutput.error.code).toBe('decode.transaction');
    expect(decodeOutput.error.message).toBe(
      'Unable to deserialize Sui TransactionData hex.',
    );
    expect(decodeOutput.error.cause.kind).toBe('sdk');
  });

  it('reports output write failures instead of rejecting silently', async () => {
    const hex = await sampleTransactionDataHex();
    let stderr = '';

    const successCode = await runCli(['mermaid', hex], {
      stderr: {
        write(chunk: string) {
          stderr += chunk;
        },
      },
      stdout: {
        write() {
          throw new Error('closed stdout');
        },
      },
    });

    expect(successCode).toBe(1);
    expect(stderr).toContain(
      'error [output.write]: Failed to write CLI output.',
    );

    let jsonFallbackStderr = '';
    const jsonCode = await runCli(['mermaid', 'not-hex', '--json'], {
      stderr: {
        write(chunk: string) {
          jsonFallbackStderr += chunk;
        },
      },
      stdout: {
        write() {
          throw new Error('closed stdout');
        },
      },
    });

    expect(jsonCode).toBe(1);
    expect(jsonFallbackStderr).toContain(
      'error [output.write]: Failed to write CLI output.',
    );

    let textFallbackStdout = '';
    const textCode = await runCli(['mermaid', 'not-hex'], {
      stderr: {
        write() {
          throw new Error('closed stderr');
        },
      },
      stdout: {
        write(chunk: string) {
          textFallbackStdout += chunk;
        },
      },
    });

    expect(textCode).toBe(1);
    expect(textFallbackStdout).toContain(
      'error [output.write]: Failed to write CLI output.',
    );
  });

  it('normalizes model errors', () => {
    const normalized = normalizeCliError(
      new PTBModelError('model exploded', [
        { code: 'x.test', message: 'test diagnostic' },
      ]),
    );

    expect(normalized.code).toBe('model.failed');
    expect(normalized.diagnostics).toHaveLength(1);
  });

  it('rejects invalid network input and endpoint flags', async () => {
    const missingDigestIo = memoryRuntime();
    const missingDigestCode = await runCli(
      ['mermaid', 'mainnet', '--json'],
      missingDigestIo.runtime,
    );

    expect(missingDigestCode).toBe(2);
    expect(JSON.parse(missingDigestIo.stdout()).error.code).toBe(
      'input.network',
    );

    const invalidNetworkIo = memoryRuntime();
    const invalidNetworkCode = await runCli(
      ['mermaid', 'badnet', 'fake-digest', '--json'],
      invalidNetworkIo.runtime,
    );

    expect(invalidNetworkCode).toBe(2);
    expect(JSON.parse(invalidNetworkIo.stdout()).error.code).toBe(
      'usage.network',
    );

    const invalidUrlIo = memoryRuntime();
    const invalidUrlCode = await runCli(
      [
        'mermaid',
        'mainnet',
        'fake-digest',
        '--grpc-url',
        'ftp://example.com',
        '--json',
      ],
      invalidUrlIo.runtime,
    );

    expect(invalidUrlCode).toBe(2);
    expect(JSON.parse(invalidUrlIo.stdout()).error.code).toBe('usage.grpcUrl');

    const invalidGraphQLUrlIo = memoryRuntime();
    const invalidGraphQLUrlCode = await runCli(
      [
        'mermaid',
        'mainnet',
        'fake-digest',
        '--transport',
        'graphql',
        '--graphql-url',
        'ftp://example.com',
        '--json',
      ],
      invalidGraphQLUrlIo.runtime,
    );

    expect(invalidGraphQLUrlCode).toBe(2);
    expect(JSON.parse(invalidGraphQLUrlIo.stdout()).error.code).toBe(
      'usage.graphqlUrl',
    );

    const hex = await sampleTransactionDataHex();
    const strayTransportIo = memoryRuntime();
    const strayTransportCode = await runCli(
      ['mermaid', hex, '--transport', 'graphql', '--json'],
      strayTransportIo.runtime,
    );

    expect(strayTransportCode).toBe(2);
    expect(JSON.parse(strayTransportIo.stdout()).error.code).toBe(
      'usage.transport',
    );

    const mismatchedTransportIo = memoryRuntime();
    const mismatchedTransportCode = await runCli(
      [
        'mermaid',
        'mainnet',
        'fake-digest',
        '--transport',
        'graphql',
        '--grpc-url',
        'https://example.com/grpc',
        '--json',
      ],
      mismatchedTransportIo.runtime,
    );

    expect(mismatchedTransportCode).toBe(2);
    expect(JSON.parse(mismatchedTransportIo.stdout()).error.code).toBe(
      'usage.grpcUrl',
    );
  });

  it('passes abort signals through the default gRPC transport', async () => {
    const originalFetch = globalThis.fetch;
    const io = memoryRuntime();
    let seenSignal: AbortSignal | undefined;
    globalThis.fetch = (async (_input, init) => {
      seenSignal =
        init?.signal instanceof AbortSignal ? init.signal : undefined;
      return await new Promise<Response>((_resolve, reject) => {
        const fallback = setTimeout(
          () => reject(new Error('fetch did not receive abort signal')),
          50,
        );
        seenSignal?.addEventListener(
          'abort',
          () => {
            clearTimeout(fallback);
            reject(new Error('aborted'));
          },
          { once: true },
        );
      });
    }) as typeof fetch;

    try {
      const code = await runCli(
        ['mermaid', 'mainnet', 'fake-digest', '--timeout-ms', '1', '--json'],
        io.runtime,
      );

      const output = JSON.parse(io.stdout());
      expect(code).toBe(1);
      expect(output.error.code).toBe('network.timeout');
      expect(seenSignal).toBeInstanceOf(AbortSignal);
      expect(seenSignal?.aborted).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('passes abort signals through the default GraphQL transport', async () => {
    const originalFetch = globalThis.fetch;
    const io = memoryRuntime();
    let seenInput: Parameters<typeof fetch>[0] | undefined;
    let seenSignal: AbortSignal | undefined;
    globalThis.fetch = (async (input, init) => {
      seenInput = input;
      seenSignal =
        init?.signal instanceof AbortSignal ? init.signal : undefined;
      return await new Promise<Response>((_resolve, reject) => {
        const fallback = setTimeout(
          () => reject(new Error('fetch did not receive abort signal')),
          50,
        );
        seenSignal?.addEventListener(
          'abort',
          () => {
            clearTimeout(fallback);
            reject(new Error('aborted'));
          },
          { once: true },
        );
      });
    }) as typeof fetch;

    try {
      const code = await runCli(
        [
          'mermaid',
          'mainnet',
          'fake-digest',
          '--transport',
          'graphql',
          '--graphql-url',
          'https://example.com/graphql',
          '--timeout-ms',
          '1',
          '--json',
        ],
        io.runtime,
      );

      const output = JSON.parse(io.stdout());
      expect(code).toBe(1);
      expect(output.error.code).toBe('network.timeout');
      expect(String(seenInput)).toBe('https://example.com/graphql');
      expect(seenSignal).toBeInstanceOf(AbortSignal);
      expect(seenSignal?.aborted).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('rejects invalid timeout values', async () => {
    const io = memoryRuntime();

    const code = await runCli(
      ['mermaid', 'mainnet', 'fake-digest', '--timeout-ms', '0', '--json'],
      io.runtime,
    );

    expect(code).toBe(2);
    expect(JSON.parse(io.stdout()).error.code).toBe('usage.timeout');
  });
});
