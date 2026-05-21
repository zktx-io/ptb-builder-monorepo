import { describe, expect, it } from 'vitest';

import type { PTBType } from '../src/ptb/graph/types';
import {
  formatVectorPreviewItem,
  parseVectorDraftText,
  splitVectorDraftLines,
  summarizeVectorValue,
  vectorValueToDraftText,
} from '../src/ui/nodes/vars/vectorValue';

const boolType: PTBType = { kind: 'scalar', name: 'bool' };
const stringType: PTBType = { kind: 'scalar', name: 'string' };

describe('vector value UI helpers', () => {
  it('summarizes long vectors with front items and count', () => {
    const summary = summarizeVectorValue([1, 2, 3, 4, 5, 6], {
      maxItems: 3,
    });

    expect(summary).toMatchObject({
      count: 6,
      preview: '[1, 2, 3, …]',
      remaining: 3,
      state: 'items',
    });
  });

  it('distinguishes unset and empty vector values', () => {
    expect(summarizeVectorValue(undefined)).toMatchObject({
      count: undefined,
      preview: 'unset',
      remaining: 0,
      state: 'unset',
    });
    expect(summarizeVectorValue([])).toMatchObject({
      count: 0,
      preview: '[]',
      remaining: 0,
      state: 'empty',
    });
  });

  it('middle-truncates only individual long items', () => {
    expect(formatVectorPreviewItem('0x1234567890abcdef', 4, 4)).toBe(
      '0x12…cdef',
    );
  });

  it('keeps one user-entered blank item when the user presses Enter twice', () => {
    expect(splitVectorDraftLines('a\n')).toEqual(['a']);
    expect(splitVectorDraftLines('a\n\n')).toEqual(['a', '']);
    expect(splitVectorDraftLines('\n\n')).toEqual(['']);
  });

  it('round-trips non-bool vectors through line-separated draft text', () => {
    const text = vectorValueToDraftText(['one', '', 'three']);

    expect(text).toBe('one\n\nthree');
    expect(parseVectorDraftText(text, stringType)).toEqual({
      ok: true,
      value: ['one', '', 'three'],
    });
  });

  it('parses bool vectors as booleans and rejects invalid lines', () => {
    expect(parseVectorDraftText('true\nfalse\n', boolType)).toEqual({
      ok: true,
      value: [true, false],
    });
    expect(parseVectorDraftText('true\nunset', boolType)).toEqual({
      ok: false,
      error: 'Line 2 must be true or false.',
    });
  });
});
