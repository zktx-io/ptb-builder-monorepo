// src/ptb/move/toPTBModuleData.ts

// -----------------------------------------------------------------------------
// Convert SDK Core open signatures into PTB-friendly function metadata.
// PTBFunctionData keeps both resolved PTB port types and the original open
// signatures so generic MoveCall ports can be recomputed after reload.
// TxContext is not modeled by PTB and is dropped from both parameters/returns.
// -----------------------------------------------------------------------------

import {
  isRawOpenSignature,
  isTxContextOpenSignature,
  NULL_VALUE,
  type RawOpenSignature,
  type RawOpenSignatureBody,
  type RawOpenSignatureReference,
  toPTBTypeFromOpenSignature,
} from '@zktx.io/ptb-model';

import type { PTBFunctionData, PTBFunctionOpenSignatures } from '../ptbDoc';

export type PTBMoveFunctionMetadata = {
  typeParameters?: unknown[];
  parameters?: RawOpenSignature[];
  returns?: RawOpenSignature[];
};

export type PTBMoveModuleMetadata = Record<string, PTBMoveFunctionMetadata>;

export type PTBMovePackageMetadata = Record<string, PTBMoveModuleMetadata>;

export function toPTBFunctionOpenSignatures(data: {
  parameters?: RawOpenSignature[];
  returns?: RawOpenSignature[];
}): PTBFunctionOpenSignatures {
  const parameters = normalizeOpenSignatureList(data.parameters);
  const returns = normalizeOpenSignatureList(data.returns);

  return {
    parameters: parameters.filter(
      (signature) => !isTxContextOpenSignature(signature),
    ),
    returns: returns.filter(
      (signature) => !isTxContextOpenSignature(signature),
    ),
  };
}

function normalizeOpenSignatureList(
  signatures: readonly RawOpenSignature[] | undefined,
): RawOpenSignature[] {
  return (signatures ?? []).map(normalizeOpenSignature);
}

function normalizeOpenSignature(signature: RawOpenSignature): RawOpenSignature {
  const normalized: RawOpenSignature = {
    reference: normalizeOpenSignatureReference(signature.reference),
    body: normalizeOpenSignatureBody(signature.body, new WeakSet(), 0),
  };
  return isRawOpenSignature(normalized)
    ? normalized
    : { reference: NULL_VALUE, body: { $kind: 'unknown' } };
}

function normalizeOpenSignatureReference(
  value: RawOpenSignature['reference'],
): RawOpenSignatureReference | null {
  return value === 'mutable' || value === 'immutable' || value === 'unknown'
    ? value
    : NULL_VALUE;
}

function normalizeOpenSignatureBody(
  value: RawOpenSignatureBody,
  seen: WeakSet<object>,
  depth: number,
): RawOpenSignatureBody {
  if (depth > 64 || !isObjectRecord(value)) return { $kind: 'unknown' };
  if (seen.has(value)) return { $kind: 'unknown' };
  seen.add(value);

  const kind = value.$kind;
  let body: RawOpenSignatureBody;
  switch (kind) {
    case 'address':
    case 'bool':
    case 'u8':
    case 'u16':
    case 'u32':
    case 'u64':
    case 'u128':
    case 'u256':
    case 'unknown':
      body = { $kind: kind };
      break;
    case 'vector':
      body = {
        $kind: 'vector',
        vector: normalizeOpenSignatureBody(value.vector, seen, depth + 1),
      };
      break;
    case 'datatype': {
      const datatype = isObjectRecord(value.datatype)
        ? value.datatype
        : undefined;
      const typeName =
        typeof datatype?.typeName === 'string' ? datatype.typeName : '';
      const typeParameters = Array.isArray(datatype?.typeParameters)
        ? datatype.typeParameters.map((item) =>
            normalizeOpenSignatureBody(
              item as RawOpenSignatureBody,
              seen,
              depth + 1,
            ),
          )
        : [];
      body = {
        $kind: 'datatype',
        datatype: { typeName, typeParameters },
      };
      break;
    }
    case 'typeParameter':
      body = {
        $kind: 'typeParameter',
        index:
          Number.isInteger(value.index) && value.index >= 0 ? value.index : 0,
      };
      break;
    default:
      body = { $kind: 'unknown' };
  }

  seen.delete(value);
  return body;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' && value !== NULL_VALUE && !Array.isArray(value)
  );
}

export function toPTBFunctionDataEntry(data: {
  typeParameters?: unknown[];
  parameters?: RawOpenSignature[];
  returns?: RawOpenSignature[];
}): PTBFunctionData[string] {
  const open = toPTBFunctionOpenSignatures(data);

  return {
    tparamCount: Array.isArray(data.typeParameters)
      ? data.typeParameters.length
      : 0,
    ins: open.parameters.map((signature) =>
      toPTBTypeFromOpenSignature(signature),
    ),
    outs: open.returns.map((signature) =>
      toPTBTypeFromOpenSignature(signature),
    ),
    openSignatures: open,
  };
}

export function toPTBModuleData(
  data: PTBMovePackageMetadata,
): Record<string, PTBFunctionData> {
  const modules: Record<string, PTBFunctionData> = {};

  for (const [moduleName, functions] of Object.entries(data)) {
    const moduleFunctions: PTBFunctionData = {};
    for (const [functionName, functionData] of Object.entries(functions).sort(
      ([left], [right]) => left.localeCompare(right),
    )) {
      moduleFunctions[functionName] = toPTBFunctionDataEntry(functionData);
    }
    modules[moduleName] = moduleFunctions;
  }

  return Object.fromEntries(
    Object.entries(modules).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
}
