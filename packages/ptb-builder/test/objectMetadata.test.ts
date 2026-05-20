import { describe, expect, it } from 'vitest';

import { objectMetadataFromCoreObject } from '../src/ptb/objectMetadata';

const OBJECT_ID =
  '0x0000000000000000000000000000000000000000000000000000000000000001';
const TEST_DIGEST = 'vQMG8nrGirX14JLfyzy15DrYD3gwRC1eUmBmBzYUsgh';

function coreObject(overrides: Record<string, unknown> = {}) {
  return {
    objectId: OBJECT_ID,
    version: '7',
    digest: TEST_DIGEST,
    type: '0x2::coin::Coin<0x2::sui::SUI>',
    owner: { $kind: 'AddressOwner', AddressOwner: OBJECT_ID },
    ...overrides,
  };
}

describe('object metadata boundary', () => {
  it('normalizes object metadata to the authoring facts the builder owns', () => {
    const parsed = objectMetadataFromCoreObject({
      ...coreObject(),
      objectId: '0x1',
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.object).toEqual({
      objectId: OBJECT_ID,
      typeTag: '0x2::coin::Coin<0x2::sui::SUI>',
    });
  });

  it('does not expose owner, version, or digest as authoring choices', () => {
    const parsed = objectMetadataFromCoreObject(coreObject());

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.object).not.toHaveProperty('owner');
    expect(parsed.object).not.toHaveProperty('version');
    expect(parsed.object).not.toHaveProperty('digest');
  });

  it('rejects lookup results without a canonical object id and type tag', () => {
    expect(
      objectMetadataFromCoreObject(coreObject({ objectId: 'bad' })),
    ).toEqual({
      ok: false,
      error: 'Object lookup did not return a valid object id and type.',
    });
    expect(
      objectMetadataFromCoreObject(coreObject({ type: undefined })),
    ).toEqual({
      ok: false,
      error: 'Object lookup did not return a valid object id and type.',
    });
  });
});
