import React from 'react';

import { Box, Fuel } from 'lucide-react';
import { describe, expect, it } from 'vitest';

import { iconOfVar } from '../src/ui/nodes/icons';

describe('node icons', () => {
  it('does not infer SUI semantics from canonical Move type tags in labels', () => {
    const short = iconOfVar({
      name: 'asset',
      label: '0x2::sui::SUI',
      varType: { kind: 'object' },
    } as any);
    const long = iconOfVar({
      name: 'asset',
      label:
        '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI',
      varType: { kind: 'object' },
    } as any);

    expect(React.isValidElement(short) ? short.type : undefined).toBe(Box);
    expect(React.isValidElement(long) ? long.type : undefined).toBe(Box);
  });

  it('uses explicit GasCoin semantics instead of resource-like names', () => {
    const gas = iconOfVar({
      name: 'gas',
      varType: { kind: 'object' },
      semantic: { kind: 'GasCoin' },
    } as any);
    const clockNameOnly = iconOfVar({
      name: 'clock',
      varType: { kind: 'object' },
    } as any);

    expect(React.isValidElement(gas) ? gas.type : undefined).toBe(Fuel);
    expect(
      React.isValidElement(clockNameOnly) ? clockNameOnly.type : undefined,
    ).toBe(Box);
  });

  it('does not infer SUI semantics from variable name alone', () => {
    const suiNameOnly = iconOfVar({
      name: 'sui',
      varType: { kind: 'object' },
    } as any);

    expect(
      React.isValidElement(suiNameOnly) ? suiNameOnly.type : undefined,
    ).toBe(Box);
  });
});
