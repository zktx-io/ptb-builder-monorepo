import { toHex } from '@mysten/bcs';
import { Transaction } from '@mysten/sui/transactions';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TEST_DIGEST = 'vQMG8nrGirX14JLfyzy15DrYD3gwRC1eUmBmBzYUsgh';

export async function sampleTransactionKindHex(): Promise<string> {
  const tx = new Transaction();
  tx.splitCoins(tx.gas, [tx.pure.u64(1)]);
  const bytes = await tx.build({ onlyTransactionKind: true });
  return toHex(bytes);
}

export async function sampleTransactionDataHex(): Promise<string> {
  const tx = new Transaction();
  tx.setSender('0x1');
  tx.setGasBudget(1000);
  tx.setGasPrice(1);
  tx.setGasPayment([
    {
      digest: TEST_DIGEST,
      objectId: '0x2',
      version: '1',
    },
  ]);
  tx.splitCoins(tx.gas, [tx.pure.u64(1)]);
  const bytes = await tx.build();
  return toHex(bytes);
}

export async function sampleMoveCallTransactionDataHex(): Promise<string> {
  const tx = new Transaction();
  tx.setSender('0x1');
  tx.setGasBudget(1000);
  tx.setGasPrice(1);
  tx.setGasPayment([
    {
      digest: TEST_DIGEST,
      objectId: '0x2',
      version: '1',
    },
  ]);
  tx.moveCall({
    target: '0x2::coin::zero',
    typeArguments: ['0x2::sui::SUI'],
  });
  const bytes = await tx.build();
  return toHex(bytes);
}

export function memoryRuntime() {
  let stdout = '';
  let stderr = '';
  return {
    runtime: {
      stderr: {
        write(chunk: string) {
          stderr += chunk;
        },
      },
      stdout: {
        write(chunk: string) {
          stdout += chunk;
        },
      },
    },
    stderr: () => stderr,
    stdout: () => stdout,
  };
}

export async function withTempFile<T>(
  content: string | Uint8Array,
  fn: (path: string) => Promise<T>,
): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'ptb-cli-'));
  const file = join(dir, 'input');
  try {
    await writeFile(file, content);
    return await fn(file);
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
}
