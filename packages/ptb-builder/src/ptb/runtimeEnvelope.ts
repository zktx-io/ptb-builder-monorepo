import { parseJsonU64, parseObjectId } from '@zktx.io/ptb-model';

export type RuntimeGasBudget = number | bigint | string;

export type RuntimeEnvelope = {
  sender?: string;
  gasBudget?: RuntimeGasBudget;
};

export type NormalizedRuntimeEnvelope = {
  sender?: string;
  gasBudget?: string;
};

export function normalizeRuntimeEnvelope(
  envelope: RuntimeEnvelope = {},
): NormalizedRuntimeEnvelope {
  const sender = normalizeRuntimeSender(envelope.sender);
  const gasBudget = normalizeRuntimeGasBudget(envelope.gasBudget);
  return {
    ...(sender ? { sender } : {}),
    ...(gasBudget !== undefined ? { gasBudget } : {}),
  };
}

function normalizeRuntimeSender(value: string | undefined): string | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const sender = parseObjectId(value);
  if (sender !== undefined && sender === value) return sender;
  throw new Error('Runtime sender must be a canonical Sui address.');
}

function normalizeRuntimeGasBudget(
  value: RuntimeGasBudget | undefined,
): string | undefined {
  if (value === undefined) return undefined;
  const input = typeof value === 'bigint' ? value.toString() : value;
  const gasBudget = parseJsonU64(input);
  if (gasBudget !== undefined) return gasBudget;
  throw new Error('Runtime gasBudget must be a canonical unsigned u64 value.');
}
