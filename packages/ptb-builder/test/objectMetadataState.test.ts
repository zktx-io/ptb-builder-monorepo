import { describe, expect, it } from 'vitest';

import type { ObjectMetadataInfo } from '../src/ptb/objectMetadata';
import {
  activeObjectMetadataInfo,
  createObjectMetadataState,
  displayObjectMetadataInfo,
  objectMetadataInputChanged,
  objectMetadataLookupStarted,
  objectMetadataLookupSucceeded,
} from '../src/ui/objectMetadataState';

const OBJECT_A: ObjectMetadataInfo = {
  objectId: '0x1',
  typeTag: '0x2::coin::Coin<0x2::sui::SUI>',
};

const OBJECT_B: ObjectMetadataInfo = {
  ...OBJECT_A,
  objectId: '0x2',
};

describe('object metadata UI state', () => {
  it('settles loading and keeps stale metadata display-only when the input changes', () => {
    const resolved = objectMetadataLookupSucceeded(
      objectMetadataLookupStarted(createObjectMetadataState('0x1'), '0x1', 1),
      1,
      OBJECT_A,
    );

    const dirty = objectMetadataInputChanged(resolved, '0x2', 2);

    expect(dirty.status).toBe('dirty');
    expect(activeObjectMetadataInfo(dirty)).toBeUndefined();
    expect(displayObjectMetadataInfo(dirty)).toBe(OBJECT_A);
  });

  it('ignores stale lookup successes after a newer edit invalidates the token', () => {
    const loading = objectMetadataLookupStarted(
      createObjectMetadataState('0x1'),
      '0x1',
      1,
    );
    const dirty = objectMetadataInputChanged(loading, '0x2', 2);

    const afterStaleSuccess = objectMetadataLookupSucceeded(dirty, 1, OBJECT_A);

    expect(afterStaleSuccess).toBe(dirty);
    expect(activeObjectMetadataInfo(afterStaleSuccess)).toBeUndefined();
  });

  it('activates metadata only for the visible object id', () => {
    const resolved = objectMetadataLookupSucceeded(
      objectMetadataLookupStarted(createObjectMetadataState('0x2'), '0x2', 3),
      3,
      OBJECT_B,
    );

    expect(activeObjectMetadataInfo(resolved)).toBe(OBJECT_B);
  });

  it('keeps stale metadata visible when the input is cleared', () => {
    const resolved = objectMetadataLookupSucceeded(
      objectMetadataLookupStarted(createObjectMetadataState('0x1'), '0x1', 1),
      1,
      OBJECT_A,
    );

    const empty = objectMetadataInputChanged(resolved, '', 2);

    expect(empty.status).toBe('idle');
    expect(activeObjectMetadataInfo(empty)).toBeUndefined();
    expect(displayObjectMetadataInfo(empty)).toBe(OBJECT_A);
  });
});
