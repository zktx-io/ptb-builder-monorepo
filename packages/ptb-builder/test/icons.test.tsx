import React from 'react';

import { describe, expect, it } from 'vitest';

import { iconOfVar } from '../src/ui/nodes/icons';
import { IconSui } from '../src/ui/nodes/icons/IconSui';

describe('node icons', () => {
  it('recognizes SUI labels through canonical Move type tags', () => {
    const short = iconOfVar(undefined, '0x2::sui::SUI');
    const long = iconOfVar(
      undefined,
      '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI',
    );

    expect(React.isValidElement(short) ? short.type : undefined).toBe(IconSui);
    expect(React.isValidElement(long) ? long.type : undefined).toBe(IconSui);
  });
});
