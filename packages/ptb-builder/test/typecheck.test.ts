import { describe, expect, it } from 'vitest';

import { canConnectIO, inferCastTarget } from '../src/ptb/graph/typecheck';
import type { Port, PTBType } from '../src/ptb/graph/types';

const scalar = (
  name: 'address' | 'bool' | 'id' | 'number' | 'string',
): PTBType => ({
  kind: 'scalar',
  name,
});

const moveNumeric = (
  width: 'u8' | 'u16' | 'u32' | 'u64' | 'u128' | 'u256',
): PTBType => ({ kind: 'move_numeric', width });

const object = (typeTag?: string): PTBType => ({ kind: 'object', typeTag });
const option = (elem: PTBType): PTBType => ({ kind: 'option', elem });
const vector = (elem: PTBType): PTBType => ({ kind: 'vector', elem });
const canonicalSui =
  '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI';

function out(dataType: PTBType): Port {
  return { id: 'out', role: 'io', direction: 'out', dataType };
}

function input(dataType: PTBType): Port {
  return { id: 'in', role: 'io', direction: 'in', dataType };
}

describe('canConnectIO', () => {
  it.each([
    [scalar('number'), scalar('number'), true],
    [scalar('number'), moveNumeric('u64'), true],
    [moveNumeric('u64'), moveNumeric('u64'), true],
    [moveNumeric('u8'), moveNumeric('u64'), false],
    [object(), object('0x2::sui::SUI'), true],
    [object('0x2::sui::SUI'), object(canonicalSui), true],
    [object('0x2::sui::SUI'), object('0x2::sui::SUI'), true],
    [object('0x2::sui::SUI'), object('0x2::coin::Coin'), false],
    [object('u8'), object('u8'), false],
    [object(), object('u8'), false],
    [object('u8'), object(), false],
    [option(scalar('bool')), scalar('bool'), false],
    [option(scalar('number')), option(moveNumeric('u64')), false],
    [vector(scalar('number')), vector(moveNumeric('u64')), false],
    [{ kind: 'unknown' } satisfies PTBType, scalar('bool'), false],
  ])('checks %o -> %o as %s', (sourceType, targetType, expected) => {
    expect(canConnectIO(out(sourceType), input(targetType))).toBe(expected);
  });

  it('requires IO output-to-input direction', () => {
    expect(
      canConnectIO(input(scalar('address')), input(scalar('address'))),
    ).toBe(false);
    expect(
      canConnectIO(
        { id: 'next', role: 'flow', direction: 'out' },
        input(scalar('address')),
      ),
    ).toBe(false);
  });

  it('infers casts only for top-level abstract number sources', () => {
    expect(inferCastTarget(scalar('number'), moveNumeric('u64'))).toEqual({
      to: 'u64',
    });
    expect(inferCastTarget(moveNumeric('u64'), scalar('number'))).toBe(
      undefined,
    );
    expect(
      inferCastTarget(option(scalar('number')), option(moveNumeric('u64'))),
    ).toBe(undefined);
    expect(
      inferCastTarget(vector(scalar('number')), vector(moveNumeric('u64'))),
    ).toBe(undefined);
  });
});
