import {
  graphToTransactionIR,
  hasErrors,
  rawTransactionToIR,
  transactionIRToGraph,
  transactionIRToTsSdkCode,
} from '@zktx.io/ptb-model';
import { describe, expect, it } from 'vitest';

import {
  coreTransactionResultToRawProgrammableTransactionInput,
  createPtbCoreClientForNetwork,
  objectIdsFromRawProgrammableTransactionInput,
  selectCoreTransactionResult,
  supportedNetworksForTransport,
  supportsNetworkForTransport,
} from '../src/ptb/suiClient';
import type {
  PtbLoadedTransaction,
  PtbLoadedTransactionResult,
} from '../src/ptb/suiClient';

const programmableTransaction = {
  inputs: [{ Pure: { bytes: 'AQID' } }],
  commands: [{ MakeMoveVec: { type: '0x2::sui::SUI', elements: [] } }],
};
// eslint-disable-next-line no-restricted-syntax -- SDK Core status fixtures use null in the pinned 2.16.2 shape.
const SDK_NULL = null;

function transactionResult(
  kind: 'Transaction' | 'FailedTransaction',
): PtbLoadedTransactionResult {
  const transaction: PtbLoadedTransaction = {
    digest: kind === 'Transaction' ? '0xsuccess' : '0xfailed',
    status:
      kind === 'Transaction'
        ? { success: true, error: SDK_NULL }
        : {
            success: false,
            error: {
              $kind: 'Unknown',
              message: 'execution failed',
              Unknown: SDK_NULL,
            },
          },
    transaction: programmableTransaction,
  };
  return kind === 'Transaction'
    ? {
        $kind: 'Transaction',
        Transaction: transaction,
      }
    : {
        $kind: 'FailedTransaction',
        FailedTransaction: transaction,
      };
}

describe('SDK Core transaction bridge', () => {
  it('selects both successful and failed transaction envelopes', () => {
    expect(
      selectCoreTransactionResult(transactionResult('Transaction')).digest,
    ).toBe('0xsuccess');
    expect(
      selectCoreTransactionResult(transactionResult('FailedTransaction'))
        .digest,
    ).toBe('0xfailed');
  });

  it('extracts model-accepted raw PTB input from SDK Core transaction data', () => {
    const successful = coreTransactionResultToRawProgrammableTransactionInput(
      transactionResult('Transaction'),
    );
    const failed = coreTransactionResultToRawProgrammableTransactionInput(
      transactionResult('FailedTransaction'),
    );

    expect(successful).toEqual(programmableTransaction);
    expect(failed).toEqual(programmableTransaction);

    const ir = rawTransactionToIR(successful);
    expect(hasErrors(ir.diagnostics)).toBe(false);
    expect(ir.commands[0].kind).toBe('MakeMoveVec');

    const graph = transactionIRToGraph(ir);
    expect(transactionIRToGraph(rawTransactionToIR(successful))).toEqual(graph);
    const roundTripIR = graphToTransactionIR(graph);
    expect(hasErrors(roundTripIR.diagnostics)).toBe(false);
    const code = transactionIRToTsSdkCode(roundTripIR);
    expect(code).toContain(
      "import { Transaction } from '@mysten/sui/transactions';",
    );
    expect(code).toContain('tx.pure(fromBase64("AQID"))');
    expect(code).toContain(
      'tx.makeMoveVec({ type: "0x2::sui::SUI", elements: [] })',
    );
  });

  it('does not invent raw PTB input when Core transaction data is absent', () => {
    expect(
      coreTransactionResultToRawProgrammableTransactionInput({
        $kind: 'Transaction',
        Transaction: {
          digest: '0xempty',
          status: { success: true, error: SDK_NULL },
          transaction: undefined,
        },
      }),
    ).toBeUndefined();
  });

  it('collects object ids from SDK Core and model raw CallArg shapes', () => {
    const ownedId =
      '0x0000000000000000000000000000000000000000000000000000000000000001';
    const sharedId =
      '0x0000000000000000000000000000000000000000000000000000000000000002';
    const receivingId =
      '0x0000000000000000000000000000000000000000000000000000000000000003';
    const modelId =
      '0x0000000000000000000000000000000000000000000000000000000000000004';
    const singleKeyId =
      '0x0000000000000000000000000000000000000000000000000000000000000005';

    expect(
      objectIdsFromRawProgrammableTransactionInput({
        inputs: [
          { Pure: { bytes: 'AQID' } },
          {
            $kind: 'Object',
            Object: {
              $kind: 'ImmOrOwnedObject',
              ImmOrOwnedObject: {
                objectId: ownedId,
                version: '1',
                digest: 'digest',
              },
            },
          },
          {
            $kind: 'Object',
            Object: {
              $kind: 'SharedObject',
              SharedObject: {
                objectId: sharedId,
                initialSharedVersion: '2',
                mutable: false,
              },
            },
          },
          {
            $kind: 'Object',
            Object: {
              $kind: 'Receiving',
              Receiving: {
                objectId: receivingId,
                version: '3',
                digest: 'digest',
              },
            },
          },
          {
            kind: 'Object',
            object: {
              kind: 'ImmOrOwnedObject',
              objectId: modelId,
              version: '4',
              digest: 'digest',
            },
          },
          {
            kind: 'Object',
            object: {
              kind: 'ImmOrOwnedObject',
              objectId: ownedId,
              version: '1',
              digest: 'digest',
            },
          },
          {
            kind: 'Object',
            object: {
              ImmOrOwnedObject: {
                objectId: singleKeyId,
                version: '5',
                digest: 'digest',
              },
            },
          },
          {
            kind: 'Object',
            object: {
              $kind: 'SharedObject',
              kind: 'ImmOrOwnedObject',
              SharedObject: {
                objectId:
                  '0x0000000000000000000000000000000000000000000000000000000000000006',
                initialSharedVersion: '6',
                mutable: false,
              },
              ImmOrOwnedObject: {
                objectId:
                  '0x0000000000000000000000000000000000000000000000000000000000000007',
                version: '7',
                digest: 'digest',
              },
            },
          },
        ],
        commands: [],
      }),
    ).toEqual([ownedId, sharedId, receivingId, modelId, singleKeyId]);
  });

  it('rejects unverified GraphQL networks instead of falling back to JSON-RPC', () => {
    expect(() =>
      createPtbCoreClientForNetwork('devnet', { transport: 'graphql' }),
    ).toThrow(
      "No verified Sui GraphQL endpoint for sui:devnet. Use supportedNetworksForTransport('graphql') to discover supported networks.",
    );
  });

  it('exposes transport-specific network capability without JSON-RPC fallback', () => {
    expect(supportedNetworksForTransport('grpc')).toEqual([
      'mainnet',
      'testnet',
      'devnet',
    ]);
    expect(supportedNetworksForTransport('graphql')).toEqual([
      'mainnet',
      'testnet',
    ]);
    expect(supportsNetworkForTransport('devnet', 'graphql')).toBe(false);
    expect(supportsNetworkForTransport('devnet', 'grpc')).toBe(true);
  });
});
