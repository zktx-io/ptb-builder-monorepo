import { describe, expect, it } from 'vitest';

import type { ObjectAuthoringInfo } from '../src/ptb/objectAuthoring';
import {
  activeObjectAuthoringInfo,
  canSelectObjectRawUsage,
  createObjectAuthoringState,
  displayObjectAuthoringInfo,
  objectAuthoringInputChanged,
  objectAuthoringLookupStarted,
  objectAuthoringLookupSucceeded,
} from '../src/ui/objectAuthoringState';

const TEST_DIGEST_A = 'vQMG8nrGirX14JLfyzy15DrYD3gwRC1eUmBmBzYUsgh';
const TEST_DIGEST_B = '7msXn7aieHy73WkRxh3Xdqh9PEoPYBmJW59iE4TVvz62';

const OBJECT_A: ObjectAuthoringInfo = {
  objectId: '0x1',
  version: '7',
  digest: TEST_DIGEST_A,
  typeTag: '0x2::coin::Coin<0x2::sui::SUI>',
  ownerKind: 'AddressOwner',
};

const OBJECT_B: ObjectAuthoringInfo = {
  ...OBJECT_A,
  objectId: '0x2',
  digest: TEST_DIGEST_B,
};

describe('object authoring UI state', () => {
  it('settles loading and keeps stale facts display-only when the input changes', () => {
    const resolved = objectAuthoringLookupSucceeded(
      objectAuthoringLookupStarted(createObjectAuthoringState('0x1'), '0x1', 1),
      1,
      OBJECT_A,
    );

    const dirty = objectAuthoringInputChanged(resolved, '0x2', 2);

    expect(dirty.status).toBe('dirty');
    expect(activeObjectAuthoringInfo(dirty)).toBeUndefined();
    expect(displayObjectAuthoringInfo(dirty)).toBe(OBJECT_A);
    expect(canSelectObjectRawUsage(dirty)).toBe(false);
  });

  it('ignores stale lookup successes after a newer edit invalidates the token', () => {
    const loading = objectAuthoringLookupStarted(
      createObjectAuthoringState('0x1'),
      '0x1',
      1,
    );
    const dirty = objectAuthoringInputChanged(loading, '0x2', 2);

    const afterStaleSuccess = objectAuthoringLookupSucceeded(
      dirty,
      1,
      OBJECT_A,
    );

    expect(afterStaleSuccess).toBe(dirty);
    expect(activeObjectAuthoringInfo(afterStaleSuccess)).toBeUndefined();
  });

  it('enables usage selection only for facts resolved for the visible object id', () => {
    const resolved = objectAuthoringLookupSucceeded(
      objectAuthoringLookupStarted(createObjectAuthoringState('0x2'), '0x2', 3),
      3,
      OBJECT_B,
    );

    expect(activeObjectAuthoringInfo(resolved)).toBe(OBJECT_B);
    expect(canSelectObjectRawUsage(resolved)).toBe(true);
  });

  it('keeps stale facts visible when the input is cleared', () => {
    const resolved = objectAuthoringLookupSucceeded(
      objectAuthoringLookupStarted(createObjectAuthoringState('0x1'), '0x1', 1),
      1,
      OBJECT_A,
    );

    const empty = objectAuthoringInputChanged(resolved, '', 2);

    expect(empty.status).toBe('idle');
    expect(activeObjectAuthoringInfo(empty)).toBeUndefined();
    expect(displayObjectAuthoringInfo(empty)).toBe(OBJECT_A);
    expect(canSelectObjectRawUsage(empty)).toBe(false);
  });
});
