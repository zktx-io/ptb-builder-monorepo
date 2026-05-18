import { describe, expect, it } from 'vitest';

import {
  buildObjectRawInputForUsage,
  defaultObjectRawUsage,
  objectAuthoringInfoFromCoreObject,
} from '../src/ptb/objectAuthoring';

const OBJECT_ID =
  '0x0000000000000000000000000000000000000000000000000000000000000001';
const PARENT_ID =
  '0x0000000000000000000000000000000000000000000000000000000000000002';
const TEST_DIGEST = 'vQMG8nrGirX14JLfyzy15DrYD3gwRC1eUmBmBzYUsgh';

function coreObject(owner: unknown) {
  return {
    objectId: OBJECT_ID,
    version: '7',
    digest: TEST_DIGEST,
    type: '0x2::coin::Coin<0x2::sui::SUI>',
    owner,
  };
}

describe('object authoring boundary', () => {
  it('stores model-canonical object ids and versions from valid SDK-like values', () => {
    const parsed = objectAuthoringInfoFromCoreObject({
      ...coreObject({ $kind: 'AddressOwner', AddressOwner: PARENT_ID }),
      objectId: '0x1',
      version: 7,
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.object.objectId).toBe(OBJECT_ID);
    expect(parsed.object.version).toBe('7');
  });

  it('preserves SDK object refs for address-owned objects without guessing owner metadata', () => {
    const parsed = objectAuthoringInfoFromCoreObject(
      coreObject({ $kind: 'AddressOwner', AddressOwner: PARENT_ID }),
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.object.ownerKind).toBe('AddressOwner');
    expect(defaultObjectRawUsage(parsed.object)).toBe('object-ref');

    const rawInput = buildObjectRawInputForUsage(parsed.object, 'object-ref');
    expect(rawInput.ok).toBe(true);
    expect(rawInput.rawInput).toEqual({
      kind: 'Object',
      object: {
        kind: 'ImmOrOwnedObject',
        objectId: OBJECT_ID,
        version: '7',
        digest: TEST_DIGEST,
      },
    });
  });

  it('keeps owner kind and receiving usage as separate decisions', () => {
    const parsed = objectAuthoringInfoFromCoreObject(
      coreObject({ $kind: 'ObjectOwner', ObjectOwner: PARENT_ID }),
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.object.ownerKind).toBe('ObjectOwner');
    expect(defaultObjectRawUsage(parsed.object)).toBe('object-ref');

    const receiving = buildObjectRawInputForUsage(parsed.object, 'receiving');
    expect(receiving.ok).toBe(true);
    expect(receiving.rawInput).toEqual({
      kind: 'Object',
      object: {
        kind: 'Receiving',
        objectId: OBJECT_ID,
        version: '7',
        digest: TEST_DIGEST,
      },
    });
  });

  it('requires explicit shared mutability and SDK Shared owner metadata', () => {
    const parsed = objectAuthoringInfoFromCoreObject(
      coreObject({
        $kind: 'Shared',
        Shared: { initialSharedVersion: '3' },
      }),
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(defaultObjectRawUsage(parsed.object)).toBeUndefined();

    const readonly = buildObjectRawInputForUsage(
      parsed.object,
      'shared-readonly',
    );
    const mutable = buildObjectRawInputForUsage(
      parsed.object,
      'shared-mutable',
    );
    expect(readonly.rawInput).toMatchObject({
      kind: 'Object',
      object: {
        kind: 'SharedObject',
        initialSharedVersion: '3',
        mutable: false,
      },
    });
    expect(mutable.rawInput).toMatchObject({
      kind: 'Object',
      object: {
        kind: 'SharedObject',
        initialSharedVersion: '3',
        mutable: true,
      },
    });
  });

  it('does not map ConsensusAddressOwner or UnknownOwner to raw object inputs', () => {
    const consensus = objectAuthoringInfoFromCoreObject(
      coreObject({
        $kind: 'ConsensusAddressOwner',
        ConsensusAddressOwner: { startVersion: '9', owner: PARENT_ID },
      }),
    );
    const unknown = objectAuthoringInfoFromCoreObject(
      coreObject({ $kind: 'Unknown' }),
    );

    expect(consensus.ok).toBe(true);
    expect(unknown.ok).toBe(true);
    if (!consensus.ok || !unknown.ok) return;

    expect(defaultObjectRawUsage(consensus.object)).toBeUndefined();
    expect(defaultObjectRawUsage(unknown.object)).toBeUndefined();
    expect(
      buildObjectRawInputForUsage(consensus.object, 'shared-readonly').ok,
    ).toBe(false);
    expect(buildObjectRawInputForUsage(unknown.object, 'object-ref').ok).toBe(
      false,
    );
  });
});
