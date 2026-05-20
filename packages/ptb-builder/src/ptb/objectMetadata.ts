import { NULL_VALUE, parseObjectId } from '@zktx.io/ptb-model';

export type ObjectMetadataInfo = {
  objectId: string;
  typeTag: string;
};

export type ObjectMetadataLookupResult =
  | { ok: true; object: ObjectMetadataInfo }
  | { ok: false; error: string };

export function objectMetadataFromCoreObject(
  value: unknown,
): ObjectMetadataLookupResult {
  if (!isRecord(value)) {
    return { ok: false, error: 'Object lookup returned an invalid object.' };
  }

  const objectId =
    typeof value.objectId === 'string'
      ? parseObjectId(value.objectId)
      : undefined;
  const typeTag = typeof value.type === 'string' ? value.type : undefined;
  if (!objectId || !typeTag) {
    return {
      ok: false,
      error: 'Object lookup did not return a valid object id and type.',
    };
  }

  return {
    ok: true,
    object: {
      objectId,
      typeTag,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' && value !== NULL_VALUE && !Array.isArray(value)
  );
}
